import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { categoryRepository } from "./repository";

export const categoryRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Category name is required"),
        color: z.string().min(1, "Color is required"),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return await categoryRepository.create({
        name: input.name,
        color: input.color,
        description: input.description,
      });
    }),

  getAll: protectedProcedure.query(async () => {
    return await categoryRepository.findAll();
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const category = await categoryRepository.findById(input.id);

      if (!category) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Category not found",
        });
      }

      return category;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1, "Category name is required").optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const updatedCategory = await categoryRepository.update({
        id: input.id,
        name: input.name,
        description: input.description,
      });

      if (!updatedCategory) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Category not found",
        });
      }

      return updatedCategory;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const deletedCategory = await categoryRepository.delete(input.id);

      if (!deletedCategory) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Category not found",
        });
      }

      return deletedCategory;
    }),
});
