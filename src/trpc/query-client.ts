import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
        // Every figure on screen changes only when the user acts — an import,
        // an edit, a sync — and each of those invalidates what it touched.
        // Refetching on focus therefore re-ran the portfolio replay (and the
        // balance-snapshot write it carries) every time the tab came back
        // after 30 s, for numbers that could not have moved.
        refetchOnWindowFocus: false,
        // Keep pages warm across navigation: dashboard → investments → back
        // should show the numbers it already had, not a skeleton.
        gcTime: 10 * 60 * 1000,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
