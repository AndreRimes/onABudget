import { accountRouter } from "~/server/api/accounts/route";
import { categoryRouter } from "~/server/api/category/route";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { expensesRouter } from "./expenses/route";
import { investmentsRouter } from "./investments/route";
import { assetTypesRouter } from "./asset-type/route";
import { budgetRouter } from "./budget/route";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  account: accountRouter,
  category: categoryRouter,
  expenses: expensesRouter,
  investments: investmentsRouter,
  assetTypes: assetTypesRouter,
  budget: budgetRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
