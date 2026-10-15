import { beforeEach, describe, expect, it, vi } from "vitest";

const prefetch = vi.hoisted(() => ({
  accounts: vi.fn(),
  budget: vi.fn(),
  overview: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock("~/trpc/server", () => ({
  api: {
    account: {
      getAll: { prefetch: prefetch.accounts },
      getDashboardOverview: { prefetch: prefetch.overview },
    },
    budget: { getLatest: { prefetch: prefetch.budget } },
    investments: { getPortfolioSnapshot: { prefetch: prefetch.snapshot } },
  },
  HydrateClient: () => null,
}));
vi.mock("./DashboardClient", () => ({ DashboardClient: () => null }));
vi.mock("./investments/InvestmentsClient", () => ({
  InvestmentsClient: () => null,
}));

import DashboardPage from "./page";
import InvestmentsPage from "./investments/page";

beforeEach(() => vi.clearAllMocks());

describe("page prefetches", () => {
  it("starts only the dashboard's actual queries without waiting for market data", () => {
    prefetch.overview.mockReturnValueOnce(new Promise(() => undefined));
    const page = DashboardPage();
    expect(page).not.toBeInstanceOf(Promise);
    expect(prefetch.accounts).toHaveBeenCalledOnce();
    expect(prefetch.budget).toHaveBeenCalledOnce();
    expect(prefetch.overview).toHaveBeenCalledExactlyOnceWith({
      chartRange: "1y",
    });
    expect(prefetch.snapshot).not.toHaveBeenCalled();
  });

  it("starts the exact initial investments query without adding default input fields", () => {
    InvestmentsPage();
    expect(prefetch.snapshot).toHaveBeenCalledExactlyOnceWith({ range: "max" });
    expect(prefetch.overview).not.toHaveBeenCalled();
  });
});
