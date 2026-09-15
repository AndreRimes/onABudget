import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createConnectToken,
  PluggyAuthError,
  PluggyUpstreamError,
} from "~/server/services/pluggy";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { bankOwnerProcedure, isOpenFinanceOwner } from "./owner";
import {
  addConnection,
  DEFAULT_SYNC_DAYS,
  fetchConnectionInvestmentRows,
  fetchLinkedAccountRows,
  linkAccount,
  listConnections,
  listProviderAccounts,
  refreshConnections,
  refreshLinkedBalances,
  removeConnection,
  renameConnection,
  setConnectionInvestmentAccount,
  unlinkAccount,
} from "./sync";
import { provisionConnectionAccounts } from "./provision";
import {
  importPluggyInvestmentRows,
  pluggyInvestmentRowSchema,
  previewPluggyInvestmentRows,
} from "./investment-import";

/**
 * Presents upstream failures as the two things the user can actually act on:
 * fix the credentials, or try again later. Precondition failures in ./sync
 * are already TRPCErrors and pass straight through.
 */
async function withPluggyErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PluggyAuthError) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Credenciais do Pluggy inválidas ou ausentes. Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.",
      });
    }
    if (error instanceof PluggyUpstreamError) {
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "O Pluggy não respondeu. Tente novamente em instantes.",
      });
    }
    // Anything else is a bug or an outage, not something the user can act
    // on: let it surface as INTERNAL_SERVER_ERROR, whose message the error
    // formatter masks in production.
    throw error;
  }
}

export const bankRouter = createTRPCRouter({
  /**
   * The only procedure a non-owner may call, and it only ever answers false
   * for them. The UI hides every Open Finance surface behind this, so nobody
   * else sees a disabled button or an empty state hinting at the feature.
   */
  isEnabled: protectedProcedure.query(({ ctx }) =>
    isOpenFinanceOwner(ctx.session.user.email),
  ),

  listConnections: bankOwnerProcedure.query(({ ctx }) =>
    listConnections(ctx.session.user.id),
  ),

  /**
   * Short-lived token authorising the Connect widget in the browser. The
   * client secret never leaves the server.
   */
  createConnectToken: bankOwnerProcedure.mutation(() =>
    withPluggyErrors(() => createConnectToken()),
  ),

  /**
   * Record a connection the owner just authorised in the widget, or whose id
   * they copied from the Pluggy dashboard. The free tier cannot list items, so
   * this id is the only handle to the connection.
   */
  addConnection: bankOwnerProcedure
    .input(z.object({ itemId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      withPluggyErrors(async () => {
        const userId = ctx.session.user.id;
        const connections = await addConnection(userId, input.itemId);
        const connection = connections.find(
          (candidate) => candidate.itemId === input.itemId,
        );
        if (!connection) return { connections, provisioned: null };

        // A new connection arrives usable: its accounts exist locally and are
        // linked. Provisioning is not allowed to fail the connection itself —
        // the row is already stored, and "criar contas" retries it — so the
        // caller is told it did not happen instead of losing the connection.
        const provisioned = await provisionConnectionAccounts(
          userId,
          connection.id,
        ).catch(() => null);

        return { connections: await listConnections(userId), provisioned };
      }),
    ),

  /** Re-read the status of the connections already recorded. */
  refreshConnections: bankOwnerProcedure.mutation(({ ctx }) =>
    withPluggyErrors(() => refreshConnections(ctx.session.user.id)),
  ),

  /**
   * Forget a connection locally. The Open Finance consent itself lives at
   * meu.pluggy.ai and is not touched here.
   */
  removeConnection: bankOwnerProcedure
    .input(z.object({ connectionId: z.number() }))
    .mutation(({ ctx, input }) =>
      withPluggyErrors(() =>
        removeConnection(ctx.session.user.id, input.connectionId),
      ),
    ),

  renameConnection: bankOwnerProcedure
    .input(
      z.object({
        connectionId: z.number(),
        connectorName: z.string().min(1).max(80),
      }),
    )
    .mutation(({ ctx, input }) =>
      withPluggyErrors(() =>
        renameConnection({ ...input, userId: ctx.session.user.id }),
      ),
    ),

  listProviderAccounts: bankOwnerProcedure
    .input(z.object({ connectionId: z.number() }))
    .query(({ ctx, input }) =>
      withPluggyErrors(() =>
        listProviderAccounts(ctx.session.user.id, input.connectionId),
      ),
    ),

  /**
   * Create the local accounts a connection needs and link them, reusing an
   * account the user already keeps when the name matcher is sure about one.
   * Idempotent: provider accounts that already have a link are left alone.
   */
  provisionAccounts: bankOwnerProcedure
    .input(z.object({ connectionId: z.number() }))
    .mutation(({ ctx, input }) =>
      withPluggyErrors(() =>
        provisionConnectionAccounts(ctx.session.user.id, input.connectionId),
      ),
    ),

  linkAccount: bankOwnerProcedure
    .input(
      z.object({
        connectionId: z.number(),
        providerAccountId: z.string().max(200).min(1),
        accountId: z.number(),
        providerType: z.enum(["BANK", "CREDIT"]),
        providerSubtype: z.string().max(200).nullish(),
        providerName: z.string().max(200).nullish(),
      }),
    )
    .mutation(({ ctx, input }) =>
      withPluggyErrors(() =>
        linkAccount({ ...input, userId: ctx.session.user.id }),
      ),
    ),

  unlinkAccount: bankOwnerProcedure
    .input(z.object({ linkId: z.number() }))
    .mutation(({ ctx, input }) =>
      withPluggyErrors(() => unlinkAccount(ctx.session.user.id, input.linkId)),
    ),

  setInvestmentAccount: bankOwnerProcedure
    .input(
      z.object({
        connectionId: z.number(),
        investmentAccountId: z.number().nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      withPluggyErrors(() =>
        setConnectionInvestmentAccount({
          ...input,
          userId: ctx.session.user.id,
        }),
      ),
    ),

  /**
   * Fetch a linked account's transactions as statement rows. A mutation rather
   * than a query because it calls out to the bank and updates lastSyncedAt —
   * it must never run automatically on render.
   */
  fetchTransactions: bankOwnerProcedure
    .input(
      z.object({
        linkId: z.number(),
        days: z.number().int().min(1).max(365).default(DEFAULT_SYNC_DAYS),
      }),
    )
    .mutation(({ ctx, input }) =>
      withPluggyErrors(() =>
        fetchLinkedAccountRows({
          userId: ctx.session.user.id,
          linkId: input.linkId,
          days: input.days,
        }),
      ),
    ),

  fetchInvestmentTransactions: bankOwnerProcedure
    .input(z.object({ connectionId: z.number() }))
    .mutation(({ ctx, input }) =>
      withPluggyErrors(() =>
        fetchConnectionInvestmentRows({
          userId: ctx.session.user.id,
          connectionId: input.connectionId,
        }),
      ),
    ),

  previewInvestmentTransactions: bankOwnerProcedure
    .input(z.object({ rows: z.array(pluggyInvestmentRowSchema).max(5000) }))
    .mutation(({ ctx, input }) =>
      previewPluggyInvestmentRows(ctx.session.user.id, input.rows),
    ),

  importInvestmentTransactions: bankOwnerProcedure
    .input(
      z.object({
        connectionId: z.number(),
        assetTypeByAsset: z.record(z.string().max(200), z.number()),
        pluggyTypeAssets: z.array(z.string().max(200)).max(5000).default([]),
        rows: z.array(pluggyInvestmentRowSchema).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const connections = await listConnections(ctx.session.user.id);
      const connection = connections.find(
        (item) => item.id === input.connectionId,
      );
      if (!connection?.investmentAccountId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Conta de investimento não configurada",
        });
      }
      return await importPluggyInvestmentRows({
        userId: ctx.session.user.id,
        investmentAccountId: connection.investmentAccountId,
        assetTypeByAsset: input.assetTypeByAsset,
        pluggyTypeAssets: input.pluggyTypeAssets,
        rows: input.rows,
      });
    }),

  refreshBalances: bankOwnerProcedure
    .input(z.object({ connectionId: z.number() }))
    .mutation(({ ctx, input }) =>
      withPluggyErrors(() =>
        refreshLinkedBalances(ctx.session.user.id, input.connectionId),
      ),
    ),
});
