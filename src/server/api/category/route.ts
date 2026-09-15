import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { categoryRepository } from "./repository";

export const categoryRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().max(200).min(1, "Informe o nome da categoria"),
        color: z.string().max(200).min(1, "Informe a cor"),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await categoryRepository.findByName(
        ctx.session.user.id,
        input.name,
      );
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Já existe uma categoria com este nome",
        });
      }

      return await categoryRepository.create({
        userId: ctx.session.user.id,
        name: input.name,
        color: input.color,
        description: input.description,
      });
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    return await categoryRepository.findAll(ctx.session.user.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const category = await categoryRepository.findById(
        ctx.session.user.id,
        input.id,
      );

      if (!category) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Categoria não encontrada",
        });
      }

      return category;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z
          .string()
          .max(200)
          .min(1, "Informe o nome da categoria")
          .optional(),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updatedCategory = await categoryRepository.update({
        id: input.id,
        userId: ctx.session.user.id,
        name: input.name,
        description: input.description,
      });

      // NOT_FOUND covers "no such category" and "not yours" alike — telling
      // the two apart would confirm that another user's id exists.
      if (!updatedCategory) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Categoria não encontrada",
        });
      }

      return updatedCategory;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const deletedCategory = await categoryRepository.delete(
        ctx.session.user.id,
        input.id,
      );

      if (!deletedCategory) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Categoria não encontrada",
        });
      }

      return deletedCategory;
    }),
});
