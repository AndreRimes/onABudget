import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { accountRepository } from "./repository";

export const accountRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        accountType: z.enum(["CHECKING", "INVESTMENT"]),
        balance: z.number().optional().default(0),
        name: z.string().min(1),
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
          message: "Account not found",
        });
      }

      return account;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        type: z.enum(["CHECKING", "INVESTMENT"]).optional(),
        accountType: z.enum(["CHECKING", "INVESTMENT"]).optional(),
        balance: z.number().optional(),
        name: z.string().min(1).optional(),
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
          message:
            "Account not found or you don't have permission to update it",
        });
      }

      return updatedAccount;
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
          message:
            "Account not found or you don't have permission to delete it",
        });
      }

      return deletedAccount;
    }),
});
