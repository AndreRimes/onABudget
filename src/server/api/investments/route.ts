import z from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { investmentRepository } from "./repository";
import { b3RowSchema, importB3Rows, previewB3Rows } from "./b3-import";
import { searchStocks } from "~/server/services/brapi";

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
    .mutation(async ({ input }) => {
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
    .mutation(async ({ input }) => {
      const { id, ...updateData } = input;
      return await investmentRepository.update(id, updateData);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await investmentRepository.delete(input.id);
    }),

  deleteAsset: protectedProcedure
    .input(z.object({ assetName: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return await investmentRepository.deleteByAssetName(
        ctx.session.user.id,
        input.assetName,
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
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return await investmentRepository.getPortfolioSnapshot(
        ctx.session.user.id,
        input?.range ?? "max",
        input?.includeSeries ?? true,
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
