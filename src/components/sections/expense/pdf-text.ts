// Text extraction from a credit-card bill PDF, in the browser. pdf.js is
// imported dynamically so its ~1MB bundle only loads when someone actually
// drops a PDF, and so it never runs during SSR.
//
// pdf.js hands back positioned text fragments, not lines. Feeding those to the
// fatura parser in raw order would interleave columns, so fragments are
// regrouped into visual lines by their Y coordinate first — that reconstructs
// "03 jul  IFOOD  R$ 45,90" as a single line, which is what the parser reads
// best.

interface TextFragment {
  str: string;
  x: number;
  y: number;
}

/** Fragments within this many PDF units of each other count as the same line. */
const LINE_TOLERANCE = 3;

function fragmentsToLines(fragments: TextFragment[]): string[] {
  if (fragments.length === 0) return [];

  // Group by Y descending (PDF origin is bottom-left, so higher Y is higher up).
  const sorted = [...fragments].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextFragment[][] = [];
  let current: TextFragment[] = [sorted[0]!];

  for (const fragment of sorted.slice(1)) {
    const reference = current[0]!;
    if (Math.abs(fragment.y - reference.y) <= LINE_TOLERANCE) {
      current.push(fragment);
    } else {
      lines.push(current);
      current = [fragment];
    }
  }
  lines.push(current);

  return lines.map((line) =>
    line
      .sort((a, b) => a.x - b.x)
      .map((fragment) => fragment.str)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  // The worker ships with the package; resolving it relative to this module
  // lets the bundler emit it as an asset.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const loadingTask = pdfjs.getDocument({ data: buffer });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const fragments: TextFragment[] = [];

    for (const item of content.items) {
      if (!("str" in item) || typeof item.str !== "string") continue;
      if (item.str.trim() === "") continue;
      const transform = item.transform as number[];
      fragments.push({
        str: item.str,
        x: transform[4] ?? 0,
        y: transform[5] ?? 0,
      });
    }

    pages.push(fragmentsToLines(fragments).join("\n"));
  }

  await loadingTask.destroy();
  return pages.join("\n");
}
