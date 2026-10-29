import { InvestmentsSkeleton } from "~/components/sections/investment/InvestmentsSkeleton";

export default function InvestmentsLoading() {
  return (
    <div role="status" aria-label="Carregando investimentos">
      <InvestmentsSkeleton />
    </div>
  );
}
