// The one row shape both statement parsers (OFX and spreadsheet) produce, so
// the import dialog and the server take a single type regardless of what the
// bank handed over.

export interface ParsedStatementRow {
  /**
   * Direction of the money. Only debits become expenses; credits (salary, PIX
   * received, refunds) are carried through to the preview so the user can see
   * they were recognised and deliberately skipped, never written.
   */
  kind: "debit" | "credit";
  date: string; // YYYY-MM-DD
  amount: number; // always positive; `kind` carries the direction
  description: string;
  /**
   * OFX `<FITID>` — the bank's own unique id for the transaction. When present
   * it makes dedup exact instead of heuristic. Null for spreadsheet imports.
   */
  fitId: string | null;
  /** OFX `<ACCTID>`, used to namespace the FITID (only unique per account). */
  acctId: string | null;
}

export interface StatementParseResult {
  rows: ParsedStatementRow[];
  /** Rows present in the file that could not be understood at all. */
  ignoredRows: number;
  /** Bank/institution name when the format carries one (OFX `<ORG>`). */
  institution: string;
}
