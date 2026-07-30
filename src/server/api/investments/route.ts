import { TRPCError } from "@trpc/server";
import z from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { accountRepository } from "../accounts/repository";
import { investmentRepository } from "./repository";
import { b3RowSchema, importB3Rows, previewB3Rows } from "./b3-import";
import { searchStocks } from "~/server/services/brapi";

/** Rejects an `investmentAccountId` the caller doesn't own. */
async function assertOwnsAccount(userId: string, accountId: number) {
  if (!(await accountRepository.ownsInvestmentAccount(userId, accountId))) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conta de investimento não encontrada",
    });
  }
}

export const investmentsRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        investmentAccountId: z.number(),
        assetTypeId: z.number(),
        assetName: z.string().min(1),
        transactionType: z.enum(["BUY", "SELL"]),
        quantity: z.number().min(0.00001),
        pricePerUnit: z.number().min(0.01),
        totalAmount: z.number().min(0.01),
        transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        isFixedIncome: z.boolean().optional(),
        fixedIncomeYieldType: z.enum(["CDI_PERCENTAGE", "PREFIXED"]).nullish(),
        fixedIncomeRate: z.number().nullish(),
        fixedIncomeMaturityDate: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsAccount(ctx.session.user.id, input.investmentAccountId);

      return await investmentRepository.create({
        investmentAccountId: input.investmentAccountId,
        assetTypeId: input.assetTypeId,
        assetName: input.assetName,
        transactionType: input.transactionType,
        quantity: input.quantity,
        pricePerUnit: input.pricePerUnit,
        totalAmount: input.totalAmount,
        transactionDate: input.transactionDate,
        isFixedIncome: input.isFixedIncome,
        fixedIncomeYieldType: input.fixedIncomeYieldType,
        fixedIncomeRate: input.fixedIncomeRate,
        fixedIncomeMaturityDate: input.fixedIncomeMaturityDate,
      });
    }),

  getAllFromUser: protectedProcedure
    .input(
      z
        .object({
          dateRange: z
            .object({
              startDate: z.string(),
              endDate: z.string(),
            })
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      if (input?.dateRange) {
        return await investmentRepository.findByDateRange(
          ctx.session.user.id,
          input.dateRange.startDate,
          input.dateRange.endDate,
        );
      }
      return await investmentRepository.findByUserId(ctx.session.user.id);
    }),

  getByAssetName: protectedProcedure
    .input(
      z.object({
        assetName: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await investmentRepository.findByAssetName(
        ctx.session.user.id,
        input.assetName,
      );
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        investmentAccountId: z.number().optional(),
        assetTypeId: z.number().optional(),
        assetName: z.string().min(1).optional(),
        transactionType: z.enum(["BUY", "SELL"]).optional(),
        quantity: z.number().min(0.00001).optional(),
        pricePerUnit: z.number().min(0.01).optional(),
        totalAmount: z.number().min(0.01).optional(),
        transactionDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        isFixedIncome: z.boolean().optional(),
        fixedIncomeYieldType: z.enum(["CDI_PERCENTAGE", "PREFIXED"]).nullish(),
        fixedIncomeRate: z.number().nullish(),
        fixedIncomeMaturityDate: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;
      // Moving a row to another account is an account write too — validate the
      // destination, or a correctly scoped update could still push a row into
      // someone else's account.
      if (updateData.investmentAccountId !== undefined) {
        await assertOwnsAccount(
          ctx.session.user.id,
          updateData.investmentAccountId,
        );
      }

      const updated = await investmentRepository.update(
        ctx.session.user.id,
        id,
        updateData,
      );
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transação não encontrada",
        });
      }
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await investmentRepository.delete(
        ctx.session.user.id,
        input.id,
      );
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transação não encontrada",
        });
      }
      return deleted;
    }),

  deleteAsset: protectedProcedure
    .input(z.object({ assetName: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return await investmentRepository.deleteByAssetName(
        ctx.session.user.id,
        input.assetName,
      );
    }),

  renameAsset: protectedProcedure
    .input(
      z.object({
        assetName: z.string().min(1),
        newAssetName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await investmentRepository.renameByAssetName(
        ctx.session.user.id,
        input.assetName,
        input.newAssetName.trim(),
      );
    }),

  setFixedIncomeYield: protectedProcedure
    .input(
      z.object({
        assetName: z.string().min(1),
        fixedIncomeYieldType: z.enum(["CDI_PERCENTAGE", "PREFIXED"]),
        fixedIncomeRate: z.number().positive(),
        fixedIncomeMaturityDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await investmentRepository.setFixedIncomeYieldByAssetName(
        ctx.session.user.id,
        input.assetName,
        {
          fixedIncomeYieldType: input.fixedIncomeYieldType,
          fixedIncomeRate: input.fixedIncomeRate,
          fixedIncomeMaturityDate: input.fixedIncomeMaturityDate ?? null,
        },
      );
    }),

  getPortfolioSnapshot: protectedProcedure
    .input(
      z
        .object({
          range: z
            .enum(["1d", "5d", "1mo", "6mo", "1y", "max"])
            .default("max"),
          includeSeries: z.boolean().default(true),
          // Narrows the whole snapshot to a single asset (detail page).
          assetName: z.string().min(1).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return await investmentRepository.getPortfolioSnapshot(
        ctx.session.user.id,
        input?.range ?? "max",
        input?.includeSeries ?? true,
        input?.assetName,
      );
    }),
  searchStocks: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      return await searchStocks(input.query);
    }),

  importB3Preview: protectedProcedure
    .input(z.object({ rows: z.array(b3RowSchema).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      return await previewB3Rows(ctx.session.user.id, input.rows);
    }),

  importB3: protectedProcedure
    .input(
      z.object({
        accountByInstitution: z.record(z.string(), z.number()),
        assetTypeByTicker: z.record(z.string(), z.number()),
        rows: z.array(b3RowSchema).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await importB3Rows({
        userId: ctx.session.user.id,
        accountByInstitution: input.accountByInstitution,
        assetTypeByTicker: input.assetTypeByTicker,
        rows: input.rows,
      });
    }),
});
