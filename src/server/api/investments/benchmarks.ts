// The benchmark catalogue. Shared by the server (which knows how to fetch each
// one) and the client (which labels and colours them), so an id can never mean
// two different things on the two sides. No server-only imports here.

export const BENCHMARK_IDS = ["CDI", "IBOV", "IPCA", "POUPANCA"] as const;
export type BenchmarkId = (typeof BENCHMARK_IDS)[number];

export interface BenchmarkMeta {
  id: BenchmarkId;
  label: string;
  /** Shown in the chart legend tooltip to explain what the line actually is. */
  description: string;
  /** CSS custom property holding this series' validated colour. */
  colorVar: string;
  /**
   * SVG dash pattern. This is the secondary encoding that lets the four
   * benchmarks stay separable when colour alone is not enough (the palette's
   * dark-mode CVD separation sits in the band that requires it). "" = solid.
   */
  dash: string;
}

export const BENCHMARKS: Record<BenchmarkId, BenchmarkMeta> = {
  CDI: {
    id: "CDI",
    label: "CDI",
    description:
      "Taxa DI acumulada sobre os mesmos aportes. A referência da renda fixa pós-fixada.",
    colorVar: "var(--chart-1)",
    dash: "",
  },
  IBOV: {
    id: "IBOV",
    label: "Ibovespa",
    description:
      "Principal índice da bolsa brasileira, como se os aportes tivessem comprado o índice.",
    colorVar: "var(--chart-3)",
    dash: "6 3",
  },
  IPCA: {
    id: "IPCA",
    label: "IPCA",
    description:
      "Inflação oficial. Ficar acima desta linha significa ter ganho poder de compra.",
    colorVar: "var(--chart-2)",
    dash: "10 4",
  },
  POUPANCA: {
    id: "POUPANCA",
    label: "Poupança",
    description: "Rendimento da caderneta de poupança sobre os mesmos aportes.",
    colorVar: "var(--chart-4)",
    dash: "2 3",
  },
};

/** Order the chart draws and lists them in. */
export const BENCHMARK_ORDER: BenchmarkId[] = [
  "CDI",
  "IBOV",
  "IPCA",
  "POUPANCA",
];

/** Enabled on first load — one comparison line, not four. */
export const DEFAULT_BENCHMARKS: BenchmarkId[] = ["CDI"];
