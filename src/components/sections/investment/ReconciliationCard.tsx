"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type { Reconciliation } from "~/server/api/investments/reconcile";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { formatCurrency, formatSignedCurrency, gainTone } from "./format";

interface ReconciliationCardProps {
  reconciliation: Reconciliation;
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(
    value,
  );
}

function formatPercentOf(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** What the mismatch means, in the terms that decide what to do about it. */
const CAUSE_LABEL: Record<string, string> = {
  quantity: "Quantidade diferente",
  price: "Preço diferente",
  gain: "Rentabilidade diferente",
};

const CAUSE_HINT: Record<string, string> = {
  quantity:
    "O histórico importado não cobre toda a posição — compras anteriores à janela do Open Finance. Lance a diferença à mão ou use a posição inicial na sincronização.",
  price:
    "Mesma quantidade dos dois lados, valores diferentes: a cota ou a cotação usada aqui é de outro dia, ou o banco já desconta o IR provisionado.",
  gain: "Posição e valor batem, mas o ganho não: os preços de compra registrados aqui não são os que o banco tem. Confira as transações desses ativos — o preço médio e a rentabilidade saem errados mesmo com o total certo.",
};

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
}: ReconciliationCardProps) {
  // Nothing the bank reported: no Open Finance connection, or a sync that
  // predates this check. Silence is right — there is nothing to compare.
  if (reconciliation.providerTotal === 0 && reconciliation.appTotal === 0) {
    return null;
  }

  const { mismatches, difference, differencePercent, syncedAt } =
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
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          {agrees
            ? "A carteira bate com o que a instituição informou na última sincronização."
            : `${mismatches.length} ativo${mismatches.length !== 1 ? "s" : ""} não bate${mismatches.length !== 1 ? "m" : ""} com o que a instituição informou.`}
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
      </CardContent>
    </Card>
  );
}
