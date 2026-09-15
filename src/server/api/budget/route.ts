import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { budgetRepository } from "./repository";

export const budgetRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        amount: z.number().min(0.01, "O valor do orçamento deve ser positivo"),
        startPeriod: z.string().max(32),
        endPeriod: z.string().max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await budgetRepository.create({
        userId: ctx.session.user.id,
        amount: input.amount,
        startPeriod: input.startPeriod,
        endPeriod: input.endPeriod,
      });
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    return await budgetRepository.findByUserId(ctx.session.user.id);
  }),

  getLatest: protectedProcedure.query(async ({ ctx }) => {
    return await budgetRepository.findLatest(ctx.session.user.id);
  }),

  getActiveForDate: protectedProcedure
    .input(z.object({ date: z.string().max(32) }))
    .query(async ({ ctx, input }) => {
      return await budgetRepository.findActiveForDate(
        ctx.session.user.id,
        input.date,
      );
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        amount: z.number().min(0.01).optional(),
        startPeriod: z.string().max(32).optional(),
        endPeriod: z.string().max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await budgetRepository.update({
        ...input,
        userId: ctx.session.user.id,
      });

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Orçamento não encontrado",
        });
      }

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await budgetRepository.delete(
        ctx.session.user.id,
        input.id,
      );

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Orçamento não encontrado",
        });
      }

      return deleted;
    }),
});
