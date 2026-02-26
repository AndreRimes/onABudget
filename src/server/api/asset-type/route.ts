// src/server/api/routers/asset-types.ts
import z from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { assetTypeRepository } from "./repository";

export const assetTypesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Nome é obrigatório"),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const exists = await assetTypeRepository.exists(input.name);

      if (exists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tipo de ativo já existe",
        });
      }

      return await assetTypeRepository.create({
        name: input.name,
        description: input.description,
      });
    }),

  getAll: protectedProcedure.query(async ({  }) => {
    return await assetTypeRepository.findAll();
  }),

  getAllWithStats: protectedProcedure.query(async ({  }) => {
    return await assetTypeRepository.findAllWithStats();
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const assetType = await assetTypeRepository.findById(input.id);

      if (!assetType) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tipo de ativo não encontrado",
        });
      }

      return assetType;
    }),

  getByName: protectedProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      const assetType = await assetTypeRepository.findByName(input.name);

      if (!assetType) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tipo de ativo não encontrado",
        });
      }

      return assetType;
    }),

  search: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      return await assetTypeRepository.search(input.query);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...updateData } = input;

      // If updating name, check if new name already exists
      if (updateData.name) {
        const existingAssetType = await assetTypeRepository.findByName(
          updateData.name,
        );

        if (existingAssetType && existingAssetType.id !== id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe um tipo de ativo com este nome",
          });
        }
      }

      const updated = await assetTypeRepository.update(id, updateData);

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tipo de ativo não encontrado",
        });
      }

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const deleted = await assetTypeRepository.delete(input.id);

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tipo de ativo não encontrado",
        });
      }

      return { success: true };
    }),

  exists: protectedProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input }) => {
      return await assetTypeRepository.exists(input.name);
    }),
});
