import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  getDashboardOverview,
  getNetWorthSeries,
  recordBalanceSnapshots,
} from "./net-worth";
import { accountRepository } from "./repository";

export const accountRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        accountType: z.enum(["CHECKING", "INVESTMENT", "CREDIT_CARD"]),
        balance: z.number().optional().default(0),
        name: z.string().max(200).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await accountRepository.create({
        userId: ctx.session.user.id,
        accountType: input.accountType,
        balance: input.balance,
        name: input.name,
      });
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    return await accountRepository.findByUserId(ctx.session.user.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const account = await accountRepository.findById(
        input.id,
        ctx.session.user.id,
      );

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conta não encontrada",
        });
      }

      return account;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        type: z.enum(["CHECKING", "INVESTMENT", "CREDIT_CARD"]).optional(),
        accountType: z
          .enum(["CHECKING", "INVESTMENT", "CREDIT_CARD"])
          .optional(),
        balance: z.number().optional(),
        name: z.string().max(200).min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updatedAccount = await accountRepository.update({
        id: input.id,
        userId: ctx.session.user.id,
        accountType: input.accountType,
        balance: input.balance,
        name: input.name,
      });

      if (!updatedAccount) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conta não encontrada ou sem permissão para editá-la",
        });
      }

      // A balance the user just corrected is the best reading of today's cash
      // there will ever be, so it goes on the record straight away.
      if (input.balance !== undefined) {
        await recordBalanceSnapshots(ctx.session.user.id);
      }

      return updatedAccount;
    }),

  /**
   * Cash plus portfolio value per day. Cash history only exists from the first
   * snapshot onward, which `cashFrom` reports so the chart can say so.
   */
  /**
   * The dashboard's investment figures and its net-worth chart in one call, so
   * the portfolio is replayed once per page load instead of once per widget.
   */
  getDashboardOverview: protectedProcedure
    .input(
      z
        .object({
          chartRange: z
            .enum(["1d", "5d", "1mo", "6mo", "1y", "max"])
            .default("1y"),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return await getDashboardOverview(
        ctx.session.user.id,
        input?.chartRange ?? "1y",
      );
    }),

  getNetWorthSeries: protectedProcedure
    .input(
      z
        .object({
          range: z.enum(["1d", "5d", "1mo", "6mo", "1y", "max"]).default("6mo"),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return await getNetWorthSeries(
        ctx.session.user.id,
        input?.range ?? "6mo",
      );
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const deletedAccount = await accountRepository.delete(
        input.id,
        ctx.session.user.id,
      );

      if (!deletedAccount) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conta não encontrada ou sem permissão para excluí-la",
        });
      }

      return deletedAccount;
    }),
});
