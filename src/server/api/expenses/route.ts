import z from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  createExpense,
  deleteExpense,
  getAllExpensesByAccount,
  getAllExpensesByUser,
  getExpenseById,
  updateExpense,
} from "./repository";

export const expensesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        amount: z.number().min(0.01),
        categoryId: z.number(),
        date: z.string(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return await createExpense({
        checkingAccountId: input.accountId,
        amount: input.amount,
        categoryId: input.categoryId,
        expenseDate: input.date,
        description: input.description,
      });
    }),

  getAllFromUser: protectedProcedure
    .input(
      z.object({
        dateRange: z
          .object({
            startDate: z.string(),
            endDate: z.string(),
          })
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await getAllExpensesByUser(ctx.session.user.id, input.dateRange);
    }),

  getAllFromAccount: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        dateRange: z
          .object({
            startDate: z.string(),
            endDate: z.string(),
          })
          .optional(),
      }),
    )
    .query(async ({  input }) => {
      return await getAllExpensesByAccount(input.accountId, input.dateRange);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getExpenseById(input.id);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        accountId: z.number().optional(),
        categoryId: z.number().optional(),
        description: z.string().optional(),
        amount: z.number().min(0.01).optional(),
        date: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return await updateExpense(input.id, {
        checkingAccountId: input.accountId,
        categoryId: input.categoryId,
        description: input.description,
        amount: input.amount,
        expenseDate: input.date,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteExpense(input.id);
    }),
});
