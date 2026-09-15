import z from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { assetTypeRepository } from "./repository";

export const assetTypesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().max(200).min(1, "Nome é obrigatório"),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await assetTypeRepository.exists(
        ctx.session.user.id,
        input.name,
      );

      if (exists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tipo de ativo já existe",
        });
      }

      return await assetTypeRepository.create({
        userId: ctx.session.user.id,
        name: input.name,
        description: input.description,
      });
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    return await assetTypeRepository.findAll(ctx.session.user.id);
  }),

  getAllWithStats: protectedProcedure.query(async ({ ctx }) => {
    return await assetTypeRepository.findAllWithStats(ctx.session.user.id);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const assetType = await assetTypeRepository.findById(
        ctx.session.user.id,
        input.id,
      );

      if (!assetType) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tipo de ativo não encontrado",
        });
      }

      return assetType;
    }),

  getByName: protectedProcedure
    .input(z.object({ name: z.string().max(200) }))
    .query(async ({ ctx, input }) => {
      const assetType = await assetTypeRepository.findByName(
        ctx.session.user.id,
        input.name,
      );

      if (!assetType) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tipo de ativo não encontrado",
        });
      }

      return assetType;
    }),

  search: protectedProcedure
    .input(z.object({ query: z.string().max(200).min(1) }))
    .query(async ({ ctx, input }) => {
      return await assetTypeRepository.search(ctx.session.user.id, input.query);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().max(200).min(1).optional(),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;
      const userId = ctx.session.user.id;

      // If updating name, check if new name already exists
      if (updateData.name) {
        const existingAssetType = await assetTypeRepository.findByName(
          userId,
          updateData.name,
        );

        if (existingAssetType && existingAssetType.id !== id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe um tipo de ativo com este nome",
          });
        }
      }

      const updated = await assetTypeRepository.update(userId, id, updateData);

      // NOT_FOUND covers "no such type" and "not yours" alike — telling the
      // two apart would confirm that another user's id exists.
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
    .mutation(async ({ ctx, input }) => {
      const deleted = await assetTypeRepository.delete(
        ctx.session.user.id,
        input.id,
      );

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tipo de ativo não encontrado",
        });
      }

      return { success: true };
    }),

  exists: protectedProcedure
    .input(z.object({ name: z.string().max(200) }))
    .query(async ({ ctx, input }) => {
      return await assetTypeRepository.exists(ctx.session.user.id, input.name);
    }),
});
