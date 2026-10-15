import { dehydrate, hydrate, QueryObserver } from "@tanstack/react-query";
import { getQueryKey, createTRPCReact } from "@trpc/react-query";
import { describe, expect, it, vi } from "vitest";
import type { AppRouter } from "~/server/api/root";
import { createQueryClient } from "./query-client";

const api = createTRPCReact<AppRouter>();
const keys = [
  getQueryKey(api.account.getDashboardOverview, { chartRange: "1y" }, "query"),
  getQueryKey(api.investments.getPortfolioSnapshot, { range: "max" }, "query"),
];

describe.each(keys.map((queryKey) => ({ queryKey })))(
  "hydration of $queryKey",
  ({ queryKey }) => {
    it.each([true, false])(
      "reuses the server request (pending: %s) and refetches after invalidation",
      async (pending) => {
        const server = createQueryClient();
        const client = createQueryClient();
        const data = {
          value: 100,
          updatedAt: new Date("2026-10-15T12:00:00Z"),
        };
        let resolve!: (value: typeof data) => void;
        const result = new Promise<typeof data>((done) => {
          resolve = done;
        });
        const serverFetch = server.prefetchQuery({
          queryKey,
          queryFn: () => result,
        });
        if (!pending) {
          resolve(data);
          await serverFetch;
        }
        hydrate(client, dehydrate(server));
        const fetch = vi.fn(async () => ({ ...data, value: 200 }));
        const observer = new QueryObserver(client, {
          queryKey,
          queryFn: fetch,
          staleTime: 5 * 60 * 1000,
        });
        const unsubscribe = observer.subscribe(() => undefined);
        try {
          resolve(data);
          await serverFetch;
          await vi.waitFor(() =>
            expect(observer.getCurrentResult().data).toEqual(data),
          );
          expect(fetch).not.toHaveBeenCalled();
          await client.invalidateQueries({ queryKey });
          expect(fetch).toHaveBeenCalledOnce();
          expect(observer.getCurrentResult().data?.value).toBe(200);
        } finally {
          unsubscribe();
          server.clear();
          client.clear();
        }
      },
    );
  },
);
