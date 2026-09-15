"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { StatementPreviewPanel } from "../expense/StatementPreviewPanel";
import type { ParsedStatementRow } from "../expense/statement-row";

interface SyncBankAccountDialogProps {
  linkId: number | null;
  /** Local account the link points at, so the panel starts on the right one. */
  accountId: number | null;
  institution: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Windows a sync can ask for. Twelve months is the ceiling: Open Finance
 * obliges the bank to serve a year of history and no more, so anything older
 * has to come from a statement file. The default stays at 90 days because it
 * is the common case and the fastest round trip — a first sync of a long-lived
 * account is the reason to reach further back.
 */
const SYNC_WINDOWS = [
  { days: 90, label: "Últimos 90 dias" },
  { days: 180, label: "Últimos 6 meses" },
  { days: 365, label: "Últimos 12 meses" },
] as const;

const DEFAULT_SYNC_DAYS = 90;

/**
 * Pulls one linked account's transactions and hands them to the same preview
 * panel a file import uses — dedup, categorization and the confirm step are
 * all the existing ones. Nothing reaches the ledger until the user confirms.
 */
export function SyncBankAccountDialog({
  linkId,
  accountId,
  institution,
  onOpenChange,
}: SyncBankAccountDialogProps) {
  const [days, setDays] = useState<number>(DEFAULT_SYNC_DAYS);
  const [rows, setRows] = useState<ParsedStatementRow[] | null>(null);
  const [fetched, setFetched] = useState(0);
  // Bumped per fetch so the preview panel remounts and re-runs its preview,
  // the same trick ImportStatementDialog uses per parsed file.
  const [runId, setRunId] = useState(0);

  const { mutate: fetchTransactions, isPending } =
    api.bank.fetchTransactions.useMutation({
      onSuccess: (result) => {
        setFetched(result.fetched);
        setRows(
          result.rows.map((row) => ({
            kind: row.kind,
            date: row.date,
            amount: row.amount,
            description: row.description,
            fitId: row.fitId ?? null,
            acctId: row.acctId ?? null,
            providerCategory: row.providerCategory ?? null,
          })),
        );
        setRunId((current) => current + 1);
        if (result.rows.length === 0) {
          toast.info("Nenhum lançamento novo no período");
        }
      },
      onError: (error) => toast.error("Erro ao sincronizar: " + error.message),
    });

  // One fetch per opening, and one more whenever the window changes. Reset on
  // close so reopening syncs afresh rather than showing a stale window.
  useEffect(() => {
    if (linkId == null) {
      setRows(null);
      setFetched(0);
      // Back to the default too: the next account opened here should not
      // inherit a long window chosen for this one.
      setDays(DEFAULT_SYNC_DAYS);
      return;
    }
    fetchTransactions({ linkId, days });
  }, [linkId, days, fetchTransactions]);

  return (
    <Dialog open={linkId != null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Sincronizar {institution}</DialogTitle>
          <DialogDescription>
            Lançamentos já importados são detectados e ignorados
            automaticamente, então buscar um período maior não duplica nada.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <Label htmlFor="sync-window" className="shrink-0">
            Período
          </Label>
          <Select
            value={String(days)}
            onValueChange={(value) => setDays(Number(value))}
          >
            <SelectTrigger id="sync-window" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SYNC_WINDOWS.map((option) => (
                <SelectItem key={option.days} value={String(option.days)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isPending && (
          <p className="text-muted-foreground font-mono text-xs uppercase">
            Buscando lançamentos no banco...
          </p>
        )}

        {!isPending && rows?.length === 0 && (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-sm">
              O banco não retornou lançamentos nesse período.
            </p>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        )}

        {!isPending && rows && rows.length > 0 && (
          <StatementPreviewPanel
            key={runId}
            rows={rows}
            parserIgnoredCount={Math.max(0, fetched - rows.length)}
            institution={institution}
            initialAccountId={accountId}
            onImported={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
