"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api, type RouterOutputs } from "~/trpc/react";
import { formatDateInput, parseDisplayDate, toDisplayDate } from "./date-input";
import { formatCurrency } from "./format";

type Transaction =
  RouterOutputs["investments"]["getByAssetName"][number];

export function EditTransactionDialog({
  transaction,
  open,
  onOpenChange,
}: {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isFixedIncome = transaction.isFixedIncome ?? false;

  const [accountId, setAccountId] = useState(
    String(transaction.investmentAccountId),
  );
  const [transactionType, setTransactionType] = useState<"BUY" | "SELL">(
    transaction.transactionType,
  );
  const [quantity, setQuantity] = useState(String(transaction.quantity));
  const [pricePerUnit, setPricePerUnit] = useState(
    String(transaction.pricePerUnit),
  );
  const [investedAmount, setInvestedAmount] = useState(
    String(transaction.totalAmount),
  );
  const [transactionDate, setTransactionDate] = useState(
    toDisplayDate(transaction.transactionDate),
  );

  // The dialog instance is reused across rows, so reset the form whenever a
  // different transaction is opened.
  useEffect(() => {
    setAccountId(String(transaction.investmentAccountId));
    setTransactionType(transaction.transactionType);
    setQuantity(String(transaction.quantity));
    setPricePerUnit(String(transaction.pricePerUnit));
    setInvestedAmount(String(transaction.totalAmount));
    setTransactionDate(toDisplayDate(transaction.transactionDate));
  }, [transaction]);

  const utils = api.useUtils();
  const { data: accounts } = api.account.getAll.useQuery();
  const investmentAccounts =
    accounts?.filter((account) => account.accountType === "INVESTMENT") ?? [];

  const totalAmount = isFixedIncome
    ? parseFloat(investedAmount || "0")
    : parseFloat(quantity || "0") * parseFloat(pricePerUnit || "0");

  const { mutate, isPending } = api.investments.update.useMutation({
    onSuccess: () => {
      void utils.investments.getByAssetName.invalidate();
      void utils.investments.getAllFromUser.invalidate();
      void utils.investments.getPortfolioSnapshot.invalidate();
      toast.success("Transação atualizada!");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar transação: " + error.message);
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!accountId || !transactionDate) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (isFixedIncome ? !investedAmount : !quantity || !pricePerUnit) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const parsedDate = parseDisplayDate(transactionDate);
    if (!parsedDate) {
      toast.error("Data da transação inválida. Use o formato DD/MM/AAAA");
      return;
    }
    if (!(totalAmount > 0)) {
      toast.error("O valor total precisa ser maior que zero");
      return;
    }

    mutate({
      id: transaction.id,
      investmentAccountId: parseInt(accountId),
      transactionType,
      quantity: isFixedIncome ? transaction.quantity : parseFloat(quantity),
      pricePerUnit: isFixedIncome
        ? parseFloat(investedAmount)
        : parseFloat(pricePerUnit),
      totalAmount,
      transactionDate: parsedDate,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar transação</DialogTitle>
          <DialogDescription>
            {transaction.assetName} ·{" "}
            {transaction.sourceHash
              ? "Importada da B3. A edição não afeta a deduplicação de futuras importações."
              : "Registro manual."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-account">Conta de Investimento *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="edit-account">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {investmentAccounts.map((account) => (
                    <SelectItem key={account.id} value={String(account.id)}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-type">Tipo de Transação *</Label>
                <Select
                  value={transactionType}
                  onValueChange={(value) =>
                    setTransactionType(value as "BUY" | "SELL")
                  }
                >
                  <SelectTrigger id="edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">Compra</SelectItem>
                    <SelectItem value="SELL">Venda</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-date">Data *</Label>
                <Input
                  id="edit-date"
                  type="text"
                  placeholder="DD/MM/AAAA"
                  value={transactionDate}
                  onChange={(event) =>
                    setTransactionDate(formatDateInput(event.target.value))
                  }
                  maxLength={10}
                  required
                />
              </div>
            </div>

            {isFixedIncome ? (
              <div className="grid gap-2">
                <Label htmlFor="edit-invested">Valor *</Label>
                <Input
                  id="edit-invested"
                  type="number"
                  value={investedAmount}
                  onChange={(event) => setInvestedAmount(event.target.value)}
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-quantity">Quantidade *</Label>
                  <Input
                    id="edit-quantity"
                    type="number"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    min="0.00001"
                    step="any"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-price">Preço Unitário *</Label>
                  <Input
                    id="edit-price"
                    type="number"
                    value={pricePerUnit}
                    onChange={(event) => setPricePerUnit(event.target.value)}
                    min="0.01"
                    step="0.01"
                    required
                  />
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Valor Total:
                </span>
                <span className="text-lg font-bold">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
