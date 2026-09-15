import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchFundQuotas, isCnpj, normalizeCnpj } from "./cvm-funds";

const HEADER =
  "TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;ID_SUBCLASSE;DT_COMPTC;VL_TOTAL;VL_QUOTA;VL_PATRIM_LIQ;CAPTC_DIA;RESG_DIA;NR_COTST";

function row(input: {
  cnpj: string;
  date: string;
  quota: number;
  subclass?: string;
  netAssets?: number;
}): string {
  return [
    "CLASSES - FIF",
    input.cnpj,
    input.subclass ?? "",
    input.date,
    "1000.00",
    input.quota.toFixed(12),
    (input.netAssets ?? 1000).toFixed(2),
    "0.00",
    "0.00",
    "10",
  ].join(";");
}

/**
 * A one-entry ZIP holding `csv`, built by hand.
 *
 * The parser reads the archive through its central directory, so the fixture
 * has to be a real archive rather than a bare deflate stream — that structure
 * is exactly what these tests are guarding.
 */
function zipOf(csv: string, name = "inf_diario_fi_202601.csv"): Buffer {
  const nameBytes = Buffer.from(name, "latin1");
  const raw = Buffer.from(csv, "latin1");
  const deflated = deflateRawSync(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(8, 8); // method: deflate
  local.writeUInt32LE(0, 14); // crc, unchecked by the reader
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);

  const localOffset = 0;
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(deflated.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(localOffset, 42);

  const centralOffset = 30 + nameBytes.length + deflated.length;
  const centralSize = 46 + nameBytes.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8); // entries on this disk
  eocd.writeUInt16LE(1, 10); // entries total
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, nameBytes, deflated, central, nameBytes, eocd]);
}

function serveZip(csv: string, status = 200) {
  const body = zipOf(csv);
  const fetchMock = vi.fn(
    async () =>
      new Response(status === 200 ? new Uint8Array(body) : null, { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeCnpj", () => {
  it("strips punctuation and recognises a CNPJ either way", () => {
    expect(normalizeCnpj("28.947.266/0001-65")).toBe("28947266000165");
    expect(isCnpj("28.947.266/0001-65")).toBe(true);
    expect(isCnpj("28947266000165")).toBe(true);
    expect(isCnpj("PETR4")).toBe(false);
  });
});

describe("fetchFundQuotas", () => {
  const CNPJ = "28.947.266/0001-65";
  const KEY = "28947266000165";

  it("returns the requested fund's series and ignores every other fund", async () => {
    serveZip(
      [
        HEADER,
        row({ cnpj: CNPJ, date: "2026-01-02", quota: 2.1 }),
        row({ cnpj: CNPJ, date: "2026-01-03", quota: 2.2 }),
        row({ cnpj: "00.000.000/0001-00", date: "2026-01-02", quota: 9.9 }),
      ].join("\n"),
    );

    const points = await fetchFundQuotas({
      cnpjs: new Set([KEY]),
      month: "2026-01",
      fromDate: "2026-01-01",
    });

    expect(points).toEqual([
      { cnpj: KEY, date: "2026-01-02", quota: 2.1 },
      { cnpj: KEY, date: "2026-01-03", quota: 2.2 },
    ]);
  });

  it("drops days before the requested start", async () => {
    serveZip(
      [
        HEADER,
        row({ cnpj: CNPJ, date: "2026-01-02", quota: 2.1 }),
        row({ cnpj: CNPJ, date: "2026-01-20", quota: 2.5 }),
      ].join("\n"),
    );

    const points = await fetchFundQuotas({
      cnpjs: new Set([KEY]),
      month: "2026-01",
      fromDate: "2026-01-15",
    });

    expect(points.map((point) => point.date)).toEqual(["2026-01-20"]);
  });

  it("picks the subclass whose quota matches the one the provider reported", async () => {
    const csv = [
      HEADER,
      row({ cnpj: CNPJ, date: "2026-01-02", quota: 2.9, subclass: "A" }),
      row({ cnpj: CNPJ, date: "2026-01-02", quota: 3.4, subclass: "B" }),
      row({ cnpj: CNPJ, date: "2026-01-03", quota: 2.95, subclass: "A" }),
      row({ cnpj: CNPJ, date: "2026-01-03", quota: 3.45, subclass: "B" }),
    ].join("\n");

    serveZip(csv);
    const matched = await fetchFundQuotas({
      cnpjs: new Set([KEY]),
      month: "2026-01",
      fromDate: "2026-01-01",
      referenceQuotas: new Map([[KEY, 3.45]]),
    });
    // One subclass for the whole series — never a mix of both.
    expect(matched.map((point) => point.quota)).toEqual([3.4, 3.45]);

    serveZip(csv);
    const other = await fetchFundQuotas({
      cnpjs: new Set([KEY]),
      month: "2026-01",
      fromDate: "2026-01-01",
      referenceQuotas: new Map([[KEY, 2.94]]),
    });
    expect(other.map((point) => point.quota)).toEqual([2.9, 2.95]);
  });

  it("falls back to the largest subclass when no reference is known", async () => {
    serveZip(
      [
        HEADER,
        row({
          cnpj: CNPJ,
          date: "2026-01-02",
          quota: 2.9,
          subclass: "A",
          netAssets: 500,
        }),
        row({
          cnpj: CNPJ,
          date: "2026-01-02",
          quota: 3.4,
          subclass: "B",
          netAssets: 10,
        }),
      ].join("\n"),
    );

    const points = await fetchFundQuotas({
      cnpjs: new Set([KEY]),
      month: "2026-01",
      fromDate: "2026-01-01",
    });

    expect(points.map((point) => point.quota)).toEqual([2.9]);
  });

  it("reads the older CVM layout, which names the columns differently", async () => {
    serveZip(
      [
        "TP_FUNDO;CNPJ_FUNDO;DT_COMPTC;VL_TOTAL;VL_QUOTA;VL_PATRIM_LIQ;CAPTC_DIA;RESG_DIA;NR_COTST",
        `FI;${CNPJ};2026-01-02;1000.00;2.100000;1000.00;0.00;0.00;10`,
      ].join("\n"),
    );

    const points = await fetchFundQuotas({
      cnpjs: new Set([KEY]),
      month: "2026-01",
      fromDate: "2026-01-01",
    });

    expect(points).toEqual([{ cnpj: KEY, date: "2026-01-02", quota: 2.1 }]);
  });

  it("treats an unpublished month as empty rather than as a failure", async () => {
    serveZip("", 404);

    await expect(
      fetchFundQuotas({
        cnpjs: new Set([KEY]),
        month: "2030-01",
        fromDate: "2030-01-01",
      }),
    ).resolves.toEqual([]);
  });

  it("does not call the provider when no fund is held", async () => {
    const fetchMock = serveZip(HEADER);

    await expect(
      fetchFundQuotas({
        cnpjs: new Set(),
        month: "2026-01",
        fromDate: "2026-01-01",
      }),
    ).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
