"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import type { Reconciliation } from "~/server/api/investments/reconcile";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { api } from "~/trpc/react";
import { invalidatePortfolio } from "~/trpc/invalidate";
import { plural } from "~/lib/format";
import { formatCurrency, formatSignedCurrency, gainTone } from "./format";
import { CAUSE_HINT, CAUSE_LABEL, formatQuantity } from "./reconciliation-copy";
import { ResolveReconciliationDialog } from "./ResolveReconciliationDialog";

interface ReconciliationCardProps {
  reconciliation: Reconciliation;
}

function formatPercentOf(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Checks the portfolio against the institution's own numbers, side by side.
 *
 * The two figures are built differently — the app prices the ledger's quantity
 * with a market source, the bank reports whatever it holds — so the card's job
 * is not to assert they are equal but to show where they are not, and name why,
 * which is what turns a wrong total into something actionable.
 */
export function ReconciliationCard({
  reconciliation,
}: Readonly<ReconciliationCardProps>) {
  const [resolving, setResolving] = useState(false);

  // Nothing the bank reported: no Open Finance connection, or a sync that
  // predates this check. Silence is right — there is nothing to compare.
  if (reconciliation.providerTotal === 0 && reconciliation.appTotal === 0) {
    return null;
  }

  const { mismatches, accepted, difference, differencePercent, syncedAt } =
    reconciliation;
  const agrees = mismatches.length === 0;

  return (
    <Card className={agrees ? undefined : "border-destructive"}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {agrees ? (
            <CheckCircle2 className="text-profit h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="text-destructive h-5 w-5 shrink-0" />
          )}
          Conferência com o banco
          {!agrees && (
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => setResolving(true)}
            >
              Resolver divergências
            </Button>
          )}
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          {agrees
            ? "A carteira bate com o que a instituição informou na última sincronização."
            : `${mismatches.length} ${plural(mismatches.length, "ativo não bate", "ativos não batem")} com o que a instituição informou.`}
          {syncedAt
            ? ` Números do banco de ${new Date(syncedAt).toLocaleDateString("pt-BR")}.`
            : ""}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="border-foreground border-2 p-3">
            <p className="form-label">onABudget</p>
            <p className="mt-1 text-lg font-black tabular-nums">
              {formatCurrency(reconciliation.appTotal)}
            </p>
          </div>
          <div className="border-foreground border-2 p-3">
            <p className="form-label">Banco</p>
            <p className="mt-1 text-lg font-black tabular-nums">
              {formatCurrency(reconciliation.providerTotal)}
            </p>
          </div>
          <div className="border-foreground border-2 p-3">
            <p className="form-label">Diferença</p>
            <p
              className={`mt-1 text-lg font-black tabular-nums ${
                agrees ? "" : gainTone(difference)
              }`}
            >
              {formatSignedCurrency(difference)}
            </p>
            <p className="text-muted-foreground font-mono text-[11px]">
              {formatPercentOf(differencePercent)}
            </p>
          </div>
        </div>

        {reconciliation.unreported > 0 && (
          <p className="text-muted-foreground text-sm">
            {reconciliation.unreported} ativo
            {reconciliation.unreported !== 1 ? "s" : ""} fora da comparação: a
            instituição não os informa (lançamento manual ou outra corretora).
          </p>
        )}

        {mismatches.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Qtd. aqui</TableHead>
                  <TableHead className="text-right">Qtd. no banco</TableHead>
                  <TableHead className="text-right">Valor aqui</TableHead>
                  <TableHead className="text-right">Valor no banco</TableHead>
                  <TableHead className="text-right">Ganho aqui</TableHead>
                  <TableHead className="text-right">Ganho no banco</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mismatches.map((entry) => (
                  <TableRow key={entry.assetName}>
                    <TableCell className="font-medium">
                      {entry.label ?? entry.assetName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(entry.appQuantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.providerQuantity === null
                        ? "—"
                        : formatQuantity(entry.providerQuantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(entry.appValue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.providerValue === null
                        ? "—"
                        : formatCurrency(entry.providerValue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatSignedCurrency(entry.appGain)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.providerGain === null
                        ? "—"
                        : formatSignedCurrency(entry.providerGain)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${gainTone(entry.difference ?? 0)}`}
                    >
                      {entry.difference === null
                        ? "—"
                        : formatSignedCurrency(entry.difference)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {CAUSE_LABEL[entry.cause] ?? entry.cause}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="text-muted-foreground grid gap-1 text-sm">
              {[...new Set(mismatches.map((entry) => entry.cause))].map(
                (cause) =>
                  CAUSE_HINT[cause] ? (
                    <p key={cause}>
                      <span className="text-foreground font-medium">
                        {CAUSE_LABEL[cause]}:
                      </span>{" "}
                      {CAUSE_HINT[cause]}
                    </p>
                  ) : null,
              )}
            </div>
          </>
        )}

        {accepted.length > 0 && <AcceptedList entries={accepted} />}
      </CardContent>

      <ResolveReconciliationDialog
        open={resolving}
        onOpenChange={setResolving}
        mismatches={mismatches}
      />
    </Card>
  );
}

/**
 * Mismatches the owner has looked at and chosen to keep. Still listed, so a
 * decision is never invisible, and undoable in place.
 */
function AcceptedList({
  entries,
}: Readonly<{ entries: Reconciliation["accepted"] }>) {
  const utils = api.useUtils();
  const { mutate: undo, isPending } =
    api.investments.undoReconciliationDecision.useMutation({
      onSuccess: () => void invalidatePortfolio(utils),
      onError: (error) => toast.error("Erro ao desfazer: " + error.message),
    });

  return (
    <div className="grid gap-1 text-sm">
      <p className="text-muted-foreground">
        {entries.length} divergência{entries.length !== 1 ? "s" : ""} aceita
        {entries.length !== 1 ? "s" : ""} como est
        {entries.length !== 1 ? "ão" : "á"}: o banco informa outro número e você
        preferiu manter o de cá.
      </p>
      <ul className="grid gap-1">
        {entries.map((entry) => (
          <li
            key={entry.assetName}
            className="flex flex-wrap items-center justify-between gap-2 border-b py-1"
          >
            <span className="font-medium">
              {entry.label ?? entry.assetName}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {formatCurrency(entry.appValue)} aqui ·{" "}
              {entry.providerValue === null
                ? "—"
                : formatCurrency(entry.providerValue)}{" "}
              no banco
            </span>
            <Button
              size="xs"
              variant="outline"
              disabled={isPending}
              onClick={() => undo({ assetName: entry.assetName })}
            >
              Desfazer
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
