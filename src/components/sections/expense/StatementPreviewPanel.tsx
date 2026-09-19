"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { isSpendingAccount } from "~/lib/account-type";
import { formatCurrency, formatIsoDateBr } from "~/lib/format";
import { cn } from "~/lib/utils";
import { withRenderKeys } from "~/lib/render-keys";
import { api, type RouterOutputs } from "~/trpc/react";
import type { ParsedStatementRow } from "./statement-row";

type PreviewResult = RouterOutputs["expenses"]["importStatementPreview"];

/** Sentinel value of the category select meaning "do not import this row". */
const IGNORE_VALUE = "__ignore__";
/** Accepts the category Pluggy supplied, creating it on confirmation if needed. */
const PLUGGY_CATEGORY_VALUE = "__pluggy__";

interface StatementPreviewPanelProps {
  /** Rows produced by whichever parser ran (OFX, spreadsheet, fatura). */
  rows: ParsedStatementRow[];
  /** Lines the parser could not read at all, reported in the summary. */
  parserIgnoredCount: number;
  /** Bank name, when the source carried one — used to pre-select the account. */
  institution?: string;
  /**
   * Target account, when the caller already knows it. The Open Finance sync
   * does (the provider account is linked to exactly one local account), where
   * a file import can only guess from the institution name.
   */
  initialAccountId?: number | null;
  onImported: () => void;
  onCancel: () => void;
}

type PreviewEntry = PreviewResult["rows"][number];
type Category = RouterOutputs["category"]["getAll"][number];

/** Credits have no hash, so fall back to what the line itself says. */
function previewRowKey(entry: PreviewEntry): string {
  return (
    entry.hash ??
    `${entry.row.date}|${entry.row.description}|${entry.row.amount}`
  );
}

function plural(count: number, suffix = "s"): string {
  return count !== 1 ? suffix : "";
}

function statusLabel(entry: PreviewEntry, isIgnored: boolean): string {
  if (isIgnored) return "Ignorado";
  if (entry.status === "new") return "Novo";
  if (entry.status === "duplicate") return "Duplicado";
  if (entry.status === "ignored") {
    return entry.ignoreReason === "card-bill"
      ? "Fatura do cartão"
      : "Não é despesa";
  }
  return "Entrada";
}

function PreviewError({
  message,
  onRetry,
  onCancel,
}: Readonly<{
  message: string;
  onRetry: () => void;
  onCancel: () => void;
}>) {
  return (
    <div className="border-destructive/50 grid gap-2 border-2 p-3">
      <p className="text-destructive text-sm font-medium">
        Não consegui analisar os lançamentos
      </p>
      <p className="text-muted-foreground font-mono text-xs break-words">
        {message}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Fechar
        </Button>
      </div>
    </div>
  );
}

function PreviewPending({
  rowCount,
  isPreviewing,
  isSlow,
  onRetry,
}: Readonly<{
  rowCount: number;
  isPreviewing: boolean;
  isSlow: boolean;
  onRetry: () => void;
}>) {
  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-sm">
        {isPreviewing
          ? `Analisando ${rowCount} lançamentos...`
          : `${rowCount} lançamentos lidos do arquivo.`}
      </p>
      {(isSlow || !isPreviewing) && (
        <div className="border-foreground bg-highlight/50 grid gap-2 border-2 p-3">
          <p className="text-sm font-bold">
            {isSlow
              ? "Está demorando mais que o normal. O servidor pode não ter respondido."
              : "A análise não foi iniciada."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={onRetry}
          >
            Analisar novamente
          </Button>
        </div>
      )}
    </div>
  );
}

function PreviewSummary({
  newCount,
  counts,
  parserIgnoredCount,
}: Readonly<{
  newCount: number;
  counts: { duplicate: number; credit: number; autoIgnored: number };
  parserIgnoredCount: number;
}>) {
  return (
    <p className="text-muted-foreground text-sm">
      {newCount} lançamento{plural(newCount)} novo{plural(newCount)},{" "}
      {counts.duplicate} duplicado{plural(counts.duplicate)}
      {counts.credit > 0 &&
        `, ${counts.credit} entrada${plural(counts.credit)} ignorada${plural(counts.credit)}`}
      {counts.autoIgnored > 0 && `, ${counts.autoIgnored} não é despesa`}
      {parserIgnoredCount > 0 &&
        `, ${parserIgnoredCount} linha${plural(parserIgnoredCount)} não reconhecida${plural(parserIgnoredCount)}`}
    </p>
  );
}

function PreviewRow({
  entry,
  categoryValue,
  isIgnored,
  categories,
  onChoose,
}: Readonly<{
  entry: PreviewEntry;
  /** Category chosen for this row's hash, "" or undefined when none yet. */
  categoryValue: string | undefined;
  isIgnored: boolean;
  categories: Category[];
  onChoose: (description: string, value: string) => void;
}>) {
  const isNew = entry.status === "new";
  let selectValue = categoryValue ?? "";
  if (isIgnored) selectValue = IGNORE_VALUE;
  return (
    <TableRow className={cn((!isNew || isIgnored) && "text-muted-foreground")}>
      <TableCell className="whitespace-nowrap">
        {formatIsoDateBr(entry.row.date)}
      </TableCell>
      <TableCell
        className="max-w-[18rem] truncate font-medium"
        title={entry.row.description}
      >
        {entry.row.description}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {formatCurrency(entry.row.amount)}
      </TableCell>
      <TableCell>
        {isNew && entry.hash ? (
          <div className="grid gap-1">
            {entry.providerCategory && (
              <span className="text-muted-foreground text-xs">
                Pluggy: {entry.providerCategory}
              </span>
            )}
            <Select
              value={selectValue}
              onValueChange={(value) => onChoose(entry.row.description, value)}
            >
              <SelectTrigger
                className={cn(
                  "w-44",
                  !categoryValue &&
                    !isIgnored &&
                    "border-foreground bg-highlight/60",
                )}
              >
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {entry.providerCategory && (
                  <SelectItem value={PLUGGY_CATEGORY_VALUE}>
                    Usar categoria Pluggy
                  </SelectItem>
                )}
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id.toString()}>
                    {category.name}
                  </SelectItem>
                ))}
                <SelectItem value={IGNORE_VALUE}>— Não é despesa —</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <span className="text-xs">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Badge
          variant={isNew && !isIgnored ? "default" : "secondary"}
          className="text-xs"
        >
          {statusLabel(entry, isIgnored)}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

/**
 * Everything from "the file has been parsed" to "the rows are in the database":
 * dedup preview, account selection, per-row categorization and the import
 * itself. Shared by the bank-statement and credit-card-bill dialogs, which
 * differ only in how they obtain the rows.
 */
export function StatementPreviewPanel({
  rows,
  parserIgnoredCount,
  institution = "",
  initialAccountId = null,
  onImported,
  onCancel,
}: Readonly<StatementPreviewPanelProps>) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [accountId, setAccountId] = useState(
    initialAccountId != null ? initialAccountId.toString() : "",
  );
  const [categoryByHash, setCategoryByHash] = useState<Record<string, string>>(
    {},
  );
  const [ignoredHashes, setIgnoredHashes] = useState<Set<string>>(new Set());
  const [previewError, setPreviewError] = useState<string | null>(null);

  const utils = api.useUtils();
  const { data: accounts } = api.account.getAll.useQuery();
  const { data: categories } = api.category.getAll.useQuery();
  const spendingAccounts = accounts?.filter(isSpendingAccount) ?? [];

  const { mutate: runPreview, isPending: isPreviewing } =
    api.expenses.importStatementPreview.useMutation({
      onSuccess: (result) => {
        setPreviewError(null);
        setPreview(result);
        // A known target beats a guess: only fall back to the fuzzy
        // institution match when the caller had nothing better.
        if (initialAccountId != null) {
          setAccountId(initialAccountId.toString());
        } else if (result.suggestedAccountId != null) {
          setAccountId(result.suggestedAccountId.toString());
        }
        // Pluggy's exact local-category match wins; a new Pluggy label is a
        // deliberate selectable suggestion, while file imports keep the
        // existing history/rule behavior.
        setCategoryByHash(
          Object.fromEntries(
            result.rows
              .filter((entry) => entry.status === "new" && entry.hash)
              .map((entry) => [
                entry.hash!,
                entry.suggestedCategoryId?.toString() ??
                  (entry.providerCategory ? PLUGGY_CATEGORY_VALUE : ""),
              ]),
          ),
        );
      },
      onError: (error) => {
        // Surfaced in the panel as well as a toast: a toast disappears, and
        // without it on screen a failed preview is an unexplained dead end.
        console.error("[import] preview failed", error);
        setPreviewError(error.message);
        toast.error("Erro ao analisar arquivo: " + error.message);
      },
    });

  // Ask the server for the dedup/categorization preview once per row set. The
  // panel is remounted (via a key) whenever a new file is parsed, so the ref
  // guard only has to stop a second run within one mount.
  const requestedRef = useRef(false);
  useEffect(() => {
    if (requestedRef.current || rows.length === 0) return;
    requestedRef.current = true;
    runPreview({ rows, institution });
  }, [rows, institution, runPreview]);

  const retryPreview = () => {
    setPreviewError(null);
    runPreview({ rows, institution });
  };

  // A request that never settles would otherwise spin forever with no way out.
  // After a few seconds the spinner admits it and offers a retry.
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    if (!isPreviewing) {
      setIsSlow(false);
      return;
    }
    const timer = setTimeout(() => setIsSlow(true), 6000);
    return () => clearTimeout(timer);
  }, [isPreviewing]);

  const { mutate: runImport, isPending: isImporting } =
    api.expenses.importStatement.useMutation({
      onSuccess: (result) => {
        void utils.expenses.getAllFromUser.invalidate();
        void utils.expenses.getAllFromAccount.invalidate();
        toast.success(
          `Importação concluída: ${result.inserted} lançamentos novos, ${result.skipped} ignorados`,
        );
        onImported();
      },
      onError: (error) => toast.error("Erro ao importar: " + error.message),
    });

  const newRows = useMemo(
    () => preview?.rows.filter((entry) => entry.status === "new") ?? [],
    [preview],
  );
  const counts = useMemo(() => {
    const of = (status: string) =>
      preview?.rows.filter((entry) => entry.status === status).length ?? 0;
    return {
      duplicate: of("duplicate"),
      credit: of("credit"),
      autoIgnored: of("ignored"),
    };
  }, [preview]);

  const missingCategoryCount = newRows.filter(
    (entry) => !categoryByHash[entry.hash!] && !ignoredHashes.has(entry.hash!),
  ).length;
  const importableCount = newRows.filter(
    (entry) => !ignoredHashes.has(entry.hash!),
  ).length;

  /**
   * Applies one choice to every row sharing that description, so picking a
   * category for one IFOOD line covers all of them. IGNORE_VALUE marks the
   * merchant as "not an expense" instead.
   */
  const applyToSameDescription = (description: string, value: string) => {
    const hashes = newRows
      .filter(
        (entry) =>
          entry.row.description === description &&
          entry.hash &&
          (value !== PLUGGY_CATEGORY_VALUE || !!entry.providerCategory),
      )
      .map((entry) => entry.hash!);

    setIgnoredHashes((current) => {
      const next = new Set(current);
      for (const hash of hashes) {
        if (value === IGNORE_VALUE) next.add(hash);
        else next.delete(hash);
      }
      return next;
    });
    setCategoryByHash((current) => {
      const next = { ...current };
      for (const hash of hashes) {
        if (value === IGNORE_VALUE) delete next[hash];
        else next[hash] = value;
      }
      return next;
    });
  };

  const handleImport = () => {
    if (!accountId) {
      toast.error("Selecione a conta");
      return;
    }
    if (missingCategoryCount > 0) {
      toast.error("Defina a categoria de todos os lançamentos");
      return;
    }
    runImport({
      accountId: Number.parseInt(accountId),
      categoryByHash: Object.fromEntries(
        Object.entries(categoryByHash)
          .filter(([, value]) => value && value !== PLUGGY_CATEGORY_VALUE)
          .map(([hash, value]) => [hash, Number.parseInt(value)]),
      ),
      pluggyCategoryHashes: Object.entries(categoryByHash)
        .filter(([, value]) => value === PLUGGY_CATEGORY_VALUE)
        .map(([hash]) => hash),
      ignoredHashes: [...ignoredHashes],
      rows,
    });
  };

  if (previewError) {
    return (
      <PreviewError
        message={previewError}
        onRetry={retryPreview}
        onCancel={onCancel}
      />
    );
  }

  if (isPreviewing || !preview) {
    return (
      <PreviewPending
        rowCount={rows.length}
        isPreviewing={isPreviewing}
        isSlow={isSlow}
        onRetry={retryPreview}
      />
    );
  }

  return (
    <>
      <PreviewSummary
        newCount={newRows.length}
        counts={counts}
        parserIgnoredCount={parserIgnoredCount}
      />

      <div className="grid gap-2">
        <Label htmlFor="previewAccount">Conta *</Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger
            id="previewAccount"
            className={cn(
              "w-full sm:w-72",
              !accountId && "border-foreground bg-highlight/60",
            )}
          >
            <SelectValue placeholder="Selecione a conta" />
          </SelectTrigger>
          <SelectContent>
            {spendingAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id.toString()}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-muted-foreground text-xs">
        O Pluggy sugere categorias quando disponível; seu histórico completa as
        demais. Escolher uma categoria aplica a todos com a mesma descrição, e o
        app memoriza a escolha para as próximas importações.
      </p>

      {missingCategoryCount > 0 && (
        <p className="text-sm font-bold">
          {missingCategoryCount} lançamento
          {missingCategoryCount !== 1 ? "s" : ""} ainda sem categoria.
        </p>
      )}

      <div className="max-h-96 overflow-y-auto border-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withRenderKeys(preview.rows, previewRowKey).map(
              ({ key, item: entry }) => (
                <PreviewRow
                  key={key}
                  entry={entry}
                  categoryValue={
                    entry.hash ? categoryByHash[entry.hash] : undefined
                  }
                  isIgnored={!!entry.hash && ignoredHashes.has(entry.hash)}
                  categories={categories ?? []}
                  onChoose={applyToSameDescription}
                />
              ),
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={importableCount === 0 || isImporting}
          onClick={handleImport}
        >
          {isImporting
            ? "Importando..."
            : `Importar ${importableCount} lançamento${plural(importableCount)}`}
        </Button>
      </div>
    </>
  );
}
