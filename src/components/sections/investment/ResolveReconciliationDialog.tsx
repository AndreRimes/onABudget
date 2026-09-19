"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { ReconciliationEntry } from "~/server/api/investments/reconcile";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { api, type RouterOutputs } from "~/trpc/react";
import { invalidatePortfolio } from "~/trpc/invalidate";
import { plural } from "~/lib/format";
import { formatCurrency, formatSignedCurrency, gainTone } from "./format";
import { CAUSE_HINT, CAUSE_LABEL, formatQuantity } from "./reconciliation-copy";

type Outcome = RouterOutputs["investments"]["resolveReconciliation"];

interface ResolveReconciliationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mismatches: ReconciliationEntry[];
}

/** One side of the comparison: the three figures that can disagree. */
function SideTile({
  title,
  quantity,
  value,
  gain,
  note,
}: {
  title: string;
  quantity: number | null;
  value: number | null;
  gain: number | null;
  note: string;
}) {
  return (
    <div className="border-foreground grid content-start gap-2 border-2 p-3">
      <p className="form-label">{title}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Quantidade</dt>
        <dd className="text-right font-medium tabular-nums">
          {quantity === null ? "—" : formatQuantity(quantity)}
        </dd>
        <dt className="text-muted-foreground">Valor</dt>
        <dd className="text-right text-lg font-black tabular-nums">
          {value === null ? "—" : formatCurrency(value)}
        </dd>
        <dt className="text-muted-foreground">Ganho</dt>
        <dd
          className={`text-right font-medium tabular-nums ${gain === null ? "" : gainTone(gain)}`}
        >
          {gain === null ? "—" : formatSignedCurrency(gain)}
        </dd>
      </dl>
      <p className="text-muted-foreground text-xs">{note}</p>
    </div>
  );
}

/** Whether the ledger has nothing at all for this asset — the trade needs a home. */
function isUnknownToLedger(entry: ReconciliationEntry): boolean {
  return entry.appQuantity === 0 && entry.appValue === 0;
}

/** What "accept the bank" will do for this entry, said before it is done. */
function bankActionNote(entry: ReconciliationEntry): string {
  switch (entry.cause) {
    case "quantity": {
      const provider = entry.providerQuantity ?? 0;
      const missing = provider - entry.appQuantity;
      if (missing > 0) {
        return `Lança uma compra de ${formatQuantity(missing)} no histórico, datada antes do primeiro lançamento do ativo (ou no dia da sincronização). Pode ser apagada depois nas transações.`;
      }
      return `Lança uma venda de ${formatQuantity(-missing)} no histórico, datada hoje, ao preço que o banco informa.`;
    }
    case "price": {
      const unit =
        entry.providerValue !== null && entry.providerQuantity
          ? entry.providerValue / entry.providerQuantity
          : null;
      return `Passa a avaliar o ativo ${unit !== null ? `a ${formatCurrency(unit)} por cota, ` : ""}pelo preço do banco, até a próxima sincronização informar outros números.`;
    }
    case "gain": {
      const cost =
        entry.providerValue !== null && entry.providerGain !== null
          ? entry.providerValue - entry.providerGain
          : null;
      return `Reescreve o preço das compras registradas para o custo total ficar em ${cost !== null ? formatCurrency(cost) : "o custo do banco"}. Não dá para desfazer automaticamente.`;
    }
    default:
      return "";
  }
}

function outcomeLabel(outcome: Outcome): string {
  switch (outcome.action) {
    case "kept":
      return "Mantido como está";
    case "adjusted":
      return `${outcome.side === "BUY" ? "Compra" : "Venda"} de ${formatQuantity(outcome.quantity)} lançada (${formatCurrency(outcome.totalAmount)})`;
    case "price_pinned":
      return `Avaliado a ${formatCurrency(outcome.price)} por cota`;
    case "cost_rescaled":
      return `Custo ajustado para ${formatCurrency(outcome.targetCost)}`;
  }
}

/**
 * Walks the owner through every mismatch, one at a time, asking which side
 * to trust. The list is captured when the dialog opens: each answer changes
 * the reconciliation, and a step counter over a list that shrinks under it
 * would skip entries. The portfolio is refetched once, on close, rather than
 * after every answer — the snapshot costs market fetches.
 */
export function ResolveReconciliationDialog({
  open,
  onOpenChange,
  mismatches,
}: ResolveReconciliationDialogProps) {
  const utils = api.useUtils();
  const [queue, setQueue] = useState<ReconciliationEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<
    Array<{ entry: ReconciliationEntry; label: string }>
  >([]);
  const [assetTypeId, setAssetTypeId] = useState("");
  const [investmentAccountId, setInvestmentAccountId] = useState("");
  const [touched, setTouched] = useState(false);

  const { data: assetTypes } = api.assetTypes.getAll.useQuery(undefined, {
    enabled: open,
  });
  const { data: accounts } = api.account.getAll.useQuery(undefined, {
    enabled: open,
  });
  const investmentAccounts = useMemo(
    () =>
      accounts?.filter((account) => account.accountType === "INVESTMENT") ?? [],
    [accounts],
  );

  useEffect(() => {
    if (!open) return;
    setQueue(mismatches);
    setIndex(0);
    setResults([]);
    setTouched(false);
    // The list is deliberately frozen at open; see the component comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A single investment account needs no choosing.
  useEffect(() => {
    if (investmentAccounts.length === 1 && !investmentAccountId) {
      setInvestmentAccountId(investmentAccounts[0]!.id.toString());
    }
  }, [investmentAccounts, investmentAccountId]);

  const current = queue[index];
  const finished = queue.length > 0 && index >= queue.length;

  const { mutate: resolve, isPending } =
    api.investments.resolveReconciliation.useMutation({
      onSuccess: (outcome) => {
        if (!current) return;
        setResults((done) => [
          ...done,
          { entry: current, label: outcomeLabel(outcome) },
        ]);
        setTouched(true);
        setAssetTypeId("");
        setIndex((step) => step + 1);
      },
      onError: (error) => toast.error("Erro ao resolver: " + error.message),
    });

  const close = () => {
    if (touched) {
      void invalidatePortfolio(utils);
      void utils.investments.getAllFromUser.invalidate();
    }
    onOpenChange(false);
  };

  const needsHome = current ? isUnknownToLedger(current) : false;
  const missingHome = needsHome && (!assetTypeId || !investmentAccountId);

  const choose = (choice: "app" | "bank") => {
    if (!current) return;
    if (choice === "bank" && missingHome) {
      toast.error("Escolha o tipo e a conta do ativo");
      return;
    }
    resolve({
      assetName: current.assetName,
      choice,
      ...(choice === "bank" && needsHome
        ? {
            assetTypeId: Number.parseInt(assetTypeId),
            investmentAccountId: Number.parseInt(investmentAccountId),
          }
        : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className="sm:max-w-2xl">
        {finished || !current ? (
          <>
            <DialogHeader>
              <DialogTitle>Divergências revisadas</DialogTitle>
              <DialogDescription>
                {results.length === 0
                  ? "Nenhuma decisão registrada."
                  : `${results.length} ${plural(results.length, "decisão registrada", "decisões registradas")}. A carteira será recalculada ao fechar.`}
              </DialogDescription>
            </DialogHeader>
            {results.length > 0 && (
              <ul className="grid max-h-80 gap-1 overflow-y-auto text-sm">
                {results.map(({ entry, label }) => (
                  <li
                    key={entry.assetName}
                    className="flex flex-wrap justify-between gap-2 border-b py-1"
                  >
                    <span className="font-medium">
                      {entry.label ?? entry.assetName}
                    </span>
                    <span className="text-muted-foreground">{label}</span>
                  </li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button onClick={close}>Concluir</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                Divergência {index + 1} de {queue.length}
              </DialogTitle>
              <DialogDescription>
                Qual dos dois lados está certo sobre este ativo?
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div>
                <p className="text-lg font-black">
                  {current.label ?? current.assetName}
                </p>
                {current.label && (
                  <p className="text-muted-foreground font-mono text-[11px]">
                    {current.assetName}
                  </p>
                )}
                <p className="mt-1 text-sm">
                  <span className="font-medium">
                    {CAUSE_LABEL[current.cause] ?? current.cause}:
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {CAUSE_HINT[current.cause]}
                  </span>
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SideTile
                  title="onABudget"
                  quantity={current.appQuantity}
                  value={current.appValue}
                  gain={current.appGain}
                  note="Mantém o histórico como está. Some da conferência até o banco informar outros números."
                />
                <SideTile
                  title="Banco"
                  quantity={current.providerQuantity}
                  value={current.providerValue}
                  gain={current.providerGain}
                  note={bankActionNote(current)}
                />
              </div>

              {needsHome && (
                <div className="grid gap-3 border-2 p-3 sm:grid-cols-2">
                  <p className="text-muted-foreground text-sm sm:col-span-2">
                    Este ativo não tem nenhum lançamento aqui. Para aceitar o
                    banco, diga onde ele entra.
                  </p>
                  <div className="grid gap-1">
                    <Label>Tipo do ativo</Label>
                    <Select value={assetTypeId} onValueChange={setAssetTypeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {assetTypes?.map((type) => (
                          <SelectItem key={type.id} value={type.id.toString()}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label>Conta de investimento</Label>
                    <Select
                      value={investmentAccountId}
                      onValueChange={setInvestmentAccountId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {investmentAccounts.map((account) => (
                          <SelectItem
                            key={account.id}
                            value={account.id.toString()}
                          >
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="sm:justify-between">
              <Button
                variant="ghost"
                disabled={isPending}
                onClick={() => setIndex((step) => step + 1)}
              >
                Pular
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={() => choose("app")}
                >
                  Manter onABudget
                </Button>
                <Button
                  disabled={isPending || missingHome}
                  onClick={() => choose("bank")}
                >
                  Aceitar banco
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
