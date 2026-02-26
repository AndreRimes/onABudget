import z from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { investmentRepository } from "./repository";
import { marketDataService } from "~/server/services/brapi";

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
        transactionDate: z.string().optional(),
        isFixedIncome: z.boolean().optional(),
        fixedIncomeYieldType: z.enum(["CDI_PERCENTAGE", "PREFIXED"]).nullish(),
        fixedIncomeRate: z.number().nullish(),
        fixedIncomeMaturityDate: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await investmentRepository.create({
        investmentAccountId: input.investmentAccountId,
        assetTypeId: input.assetTypeId,
        assetName: input.assetName,
        transactionType: input.transactionType,
        quantity: input.quantity,
        pricePerUnit: input.pricePerUnit,
        totalAmount: input.totalAmount,
        ...(input.transactionDate ? { transactionDate: input.transactionDate } : {}),
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

  getByTransactionType: protectedProcedure
    .input(
      z.object({
        transactionType: z.enum(["BUY", "SELL"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await investmentRepository.findByTransactionType(
        ctx.session.user.id,
        input.transactionType,
      );
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return await investmentRepository.findById(input.id);
    }),

  getPortfolioHoldings: protectedProcedure.query(async ({ ctx }) => {
    return await investmentRepository.getPortfolioHoldings(ctx.session.user.id);
  }),

  getTransactionSummary: protectedProcedure.query(async ({ ctx }) => {
    return await investmentRepository.getTransactionSummary(
      ctx.session.user.id,
    );
  }),

  calculatePortfolioValue: protectedProcedure
    .input(
      z.object({
        currentPrices: z.record(z.string(), z.number()),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await investmentRepository.calculatePortfolioValue(
        ctx.session.user.id,
        input.currentPrices,
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
        transactionDate: z.string().optional(),
        isFixedIncome: z.boolean().optional(),
        fixedIncomeYieldType: z.enum(["CDI_PERCENTAGE", "PREFIXED"]).nullish(),
        fixedIncomeRate: z.number().nullish(),
        fixedIncomeMaturityDate: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;
      return await investmentRepository.update(id, updateData);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return await investmentRepository.delete(input.id);
    }),
  getPortfolioWithMarketData: protectedProcedure
    .input(
      z
        .object({
          range: z
            .enum(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"])
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return await investmentRepository.getPortfolioWithMarketData(
        ctx.session.user.id,
        input?.range,
      );
    }),

  getPortfolioPerformance: protectedProcedure
    .input(
      z.object({
        range: z
          .enum([
            "1d",
            "5d",
            "1mo",
            "3mo",
            "6mo",
            "1y",
            "2y",
            "5y",
            "10y",
            "ytd",
            "max",
          ])
          .default("1y"),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await investmentRepository.getPortfolioPerformance(
        ctx.session.user.id,
        input.range,
      );
    }),

  getStockQuote: protectedProcedure
    .input(z.object({ symbol: z.string() }))
    .query(async ({ ctx, input }) => {
      return await marketDataService.getQuote(input.symbol);
    }),

  searchStocks: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      return await marketDataService.searchStocks(input.query);
    }),

  getAvailableStocks: protectedProcedure.query(async ({ ctx }) => {
    return await marketDataService.getAvailableStocks();
  }),
});
