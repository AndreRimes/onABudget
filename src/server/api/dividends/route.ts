import z from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { dividendRepository } from "./repository";

export const dividendsRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        investmentAccountId: z.number(),
        assetName: z.string().min(1),
        type: z.enum(["DIVIDEND", "JCP", "RENDIMENTO"]).default("RENDIMENTO"),
        amount: z.number().min(0.01),
        paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .mutation(async ({ input }) => {
      return await dividendRepository.create({
        investmentAccountId: input.investmentAccountId,
        assetName: input.assetName.toUpperCase().trim(),
        type: input.type,
        amount: input.amount,
        paymentDate: input.paymentDate,
        source: "MANUAL",
      });
    }),

  getAllFromUser: protectedProcedure.query(async ({ ctx }) => {
    return await dividendRepository.findByUserId(ctx.session.user.id);
  }),

  getByAssetName: protectedProcedure
    .input(z.object({ assetName: z.string() }))
    .query(async ({ ctx, input }) => {
      return await dividendRepository.findByAssetName(
        ctx.session.user.id,
        input.assetName,
      );
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await dividendRepository.delete(input.id);
    }),
});
