import { TRPCError } from "@trpc/server";
import z from "zod";
import { accountRepository } from "../accounts/repository";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  createRecurring,
  deleteRecurring,
  listRecurring,
  materializeRecurring,
  ownsRecurring,
  updateRecurring,
} from "./recurring";
import {
  createExpense,
  deleteExpense,
  getAllExpensesByAccount,
  getAllExpensesByUser,
  getExpenseById,
  getExpenseMonths,
  ownsExpense,
  updateExpense,
} from "./repository";
import {
  importStatementRows,
  previewStatementRows,
  statementRowSchema,
} from "./statement-import";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

const dateRange = z
  .object({
    startDate: z.string(),
    endDate: z.string(),
  })
  .optional();

/** Throws unless the checking account exists and belongs to the caller. */
async function assertOwnsAccount(userId: string, accountId: number) {
  if (!(await accountRepository.ownsSpendingAccount(userId, accountId))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Conta inválida",
    });
  }
}

/** Throws unless the expense exists and belongs to the caller. */
async function assertOwnsExpense(userId: string, expenseId: number) {
  if (!(await ownsExpense(userId, expenseId))) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Despesa não encontrada",
    });
  }
}

export const expensesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        amount: z.number().min(0.01),
        categoryId: z.number(),
        date: isoDate,
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsAccount(ctx.session.user.id, input.accountId);
      return await createExpense({
        checkingAccountId: input.accountId,
        amount: input.amount,
        categoryId: input.categoryId,
        expenseDate: input.date,
        description: input.description,
      });
    }),

  getAllFromUser: protectedProcedure
    .input(z.object({ dateRange }))
    .query(async ({ ctx, input }) => {
      return await getAllExpensesByUser(ctx.session.user.id, input.dateRange);
    }),

  getAllFromAccount: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        dateRange,
      }),
    )
    .query(async ({ ctx, input }) => {
      return await getAllExpensesByAccount(
        ctx.session.user.id,
        input.accountId,
        input.dateRange,
      );
    }),

  /** Months with spending, for the period picker. Cheap: one grouped scan. */
  getMonths: protectedProcedure
    .input(z.object({ accountId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return await getExpenseMonths(ctx.session.user.id, input?.accountId);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertOwnsExpense(ctx.session.user.id, input.id);
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
        date: isoDate.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsExpense(ctx.session.user.id, input.id);
      // Moving an expense to another account requires owning the target too.
      if (input.accountId !== undefined) {
        await assertOwnsAccount(ctx.session.user.id, input.accountId);
      }
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
    .mutation(async ({ ctx, input }) => {
      await assertOwnsExpense(ctx.session.user.id, input.id);
      return await deleteExpense(input.id);
    }),

  // --- Bank-statement import ------------------------------------------------
  // Preview is a mutation rather than a query because it carries a large body.

  importStatementPreview: protectedProcedure
    .input(
      z.object({
        rows: z.array(statementRowSchema).max(5000),
        institution: z.string().default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await previewStatementRows(
        ctx.session.user.id,
        input.rows,
        input.institution,
      );
    }),

  importStatement: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        categoryByHash: z.record(z.string(), z.number()),
        ignoredHashes: z.array(z.string()).default([]),
        rows: z.array(statementRowSchema).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await importStatementRows({
        userId: ctx.session.user.id,
        ...input,
      });
    }),

  // --- Recurring (fixed) expenses -------------------------------------------

  materializeRecurring: protectedProcedure.mutation(async ({ ctx }) => {
    return await materializeRecurring(ctx.session.user.id);
  }),

  listRecurring: protectedProcedure.query(async ({ ctx }) => {
    return await listRecurring(ctx.session.user.id);
  }),

  createRecurring: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        categoryId: z.number(),
        description: z.string().min(1),
        amount: z.number().min(0.01),
        dayOfMonth: z.number().int().min(1).max(31),
        startMonth: z.string().regex(/^\d{4}-\d{2}$/),
        endMonth: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsAccount(ctx.session.user.id, input.accountId);
      return await createRecurring(ctx.session.user.id, {
        checkingAccountId: input.accountId,
        categoryId: input.categoryId,
        description: input.description,
        amount: input.amount,
        dayOfMonth: input.dayOfMonth,
        startMonth: input.startMonth,
        endMonth: input.endMonth ?? null,
      });
    }),

  updateRecurring: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        accountId: z.number().optional(),
        categoryId: z.number().optional(),
        description: z.string().min(1).optional(),
        amount: z.number().min(0.01).optional(),
        dayOfMonth: z.number().int().min(1).max(31).optional(),
        startMonth: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
        endMonth: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .nullish(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, accountId, ...rest } = input;
      if (!(await ownsRecurring(ctx.session.user.id, id))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Despesa fixa não encontrada",
        });
      }
      if (accountId !== undefined) {
        await assertOwnsAccount(ctx.session.user.id, accountId);
      }
      return await updateRecurring(ctx.session.user.id, id, {
        ...rest,
        ...(accountId !== undefined ? { checkingAccountId: accountId } : {}),
      });
    }),

  deleteRecurring: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await ownsRecurring(ctx.session.user.id, input.id))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Despesa fixa não encontrada",
        });
      }
      return await deleteRecurring(ctx.session.user.id, input.id);
    }),
});
