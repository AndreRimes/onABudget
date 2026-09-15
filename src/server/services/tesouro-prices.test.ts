// The Tesouro Direto CSV is tens of megabytes and is now read as a stream.
// The one thing a streaming line parser gets wrong that a whole-file split
// cannot is a line cut in half by a chunk boundary — so that is what this
// feeds it, and it has to come out identical to reading the file whole.
import { afterEach, describe, expect, it, vi } from "vitest";

import { tesouroTitleKeyFromParts } from "~/server/api/investments/tesouro-title";
import { fetchTesouroPrices } from "./brapi";

const HEADER =
  "Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha";

function row(tipo: string, vencimento: string, dataBase: string, pu: string) {
  return `${tipo};${vencimento};${dataBase};6,50;6,52;1.000,00;${pu};1.000,00`;
}

const CSV = [
  HEADER,
  row("Tesouro IPCA+", "15/05/2035", "10/09/2026", "1.234,56"),
  row("Tesouro IPCA+", "15/05/2035", "11/09/2026", "1.240,10"),
  row("Tesouro Selic", "01/03/2029", "11/09/2026", "15.012,33"),
  row("Tesouro IPCA+", "15/05/2035", "01/01/2020", "800,00"), // before fromDate
  row("Tesouro Prefixado", "01/01/2029", "11/09/2026", "900,00"), // not asked for
].join("\r\n");

/** A Response whose body arrives in chunks cut at the given byte offsets. */
function chunkedResponse(text: string, cuts: number[]): Response {
  const bytes = new TextEncoder().encode(text);
  const bounds = [0, ...cuts, bytes.length];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 1; index < bounds.length; index++) {
        controller.enqueue(bytes.slice(bounds[index - 1], bounds[index]));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchTesouroPrices", () => {
  const titles = new Set([
    tesouroTitleKeyFromParts("Tesouro IPCA+", "2035"),
    tesouroTitleKeyFromParts("Tesouro Selic", "2029"),
  ]);

  it("reads the same prices whether or not chunks split a line in two", async () => {
    // Cuts placed inside a row, inside a number, and right on a line break.
    const positions = [
      [],
      [HEADER.length + 20, HEADER.length + 95, HEADER.length + 130],
      Array.from({ length: 40 }, (_, index) => (index + 1) * 7),
    ];

    const results = [];
    for (const cuts of positions) {
      vi.stubGlobal("fetch", () => Promise.resolve(chunkedResponse(CSV, cuts)));
      results.push(await fetchTesouroPrices(titles, "2026-01-01"));
    }

    expect(results[0]).toEqual([
      {
        titleKey: titles.values().next().value,
        date: "2026-09-10",
        sellPrice: 1234.56,
      },
      {
        titleKey: titles.values().next().value,
        date: "2026-09-11",
        sellPrice: 1240.1,
      },
      {
        titleKey: tesouroTitleKeyFromParts("Tesouro Selic", "2029"),
        date: "2026-09-11",
        sellPrice: 15012.33,
      },
    ]);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it("asks for nothing when no title is held", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await fetchTesouroPrices(new Set(), "2026-01-01")).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
