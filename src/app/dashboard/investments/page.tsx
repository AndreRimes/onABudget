import { api, HydrateClient } from "~/trpc/server";
import { InvestmentsClient } from "./InvestmentsClient";

export const dynamic = "force-dynamic";

export default function InvestmentsPage() {
  void api.investments.getPortfolioSnapshot.prefetch({ range: "max" });

  return (
    <HydrateClient>
      <InvestmentsClient />
    </HydrateClient>
  );
}
