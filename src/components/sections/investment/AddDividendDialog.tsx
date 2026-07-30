"use client";

import { HandCoins } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  useControllableOpen,
  type ControllableOpenProps,
} from "~/lib/use-controllable-open";
import { api } from "~/trpc/react";

function formatDateInput(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

function parseDisplayDate(displayDate: string): string {
  if (displayDate.length !== 10) return "";
  const parts = displayDate.split("/");
  if (parts.length !== 3) return "";
  const [day, month, year] = parts;
  return `${year}-${month}-${day}`;
}

function todayDisplayDate(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${now.getFullYear()}`;
}

const dividendTypeLabels = {
  RENDIMENTO: "Rendimento",
  DIVIDEND: "Dividendo",
  JCP: "Juros Sobre Capital Próprio",
} as const;

type DividendType = keyof typeof dividendTypeLabels;

export function AddDividendDialog(props: ControllableOpenProps = {}) {
  const { isControlled, open, setOpen } = useControllableOpen(props);
  const [accountId, setAccountId] = useState("");
  const [assetName, setAssetName] = useState("");
  const [type, setType] = useState<DividendType>("RENDIMENTO");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayDisplayDate());

  const utils = api.useUtils();
  const { data: accounts } = api.account.getAll.useQuery();
  const investmentAccounts =
    accounts?.filter((account) => account.accountType === "INVESTMENT") ?? [];

  const { mutate, isPending } = api.dividends.create.useMutation({
    onSuccess: () => {
      void utils.investments.getPortfolioSnapshot.invalidate();
      void utils.dividends.getAllFromUser.invalidate();
      toast.success("Provento registrado com sucesso!");
      setOpen(false);
      setAssetName("");
      setType("RENDIMENTO");
      setAmount("");
      setPaymentDate(todayDisplayDate());
    },
    onError: (error) => {
      toast.error("Erro ao registrar provento: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!accountId || !assetName || !amount || !paymentDate) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const parsedDate = parseDisplayDate(paymentDate);
    if (!parsedDate) {
      toast.error("Data de pagamento inválida. Use o formato DD/MM/AAAA");
      return;
    }

    mutate({
      investmentAccountId: parseInt(accountId),
      assetName: assetName.toUpperCase().trim(),
      type,
      amount: parseFloat(amount),
      paymentDate: parsedDate,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <HandCoins className="mr-2 h-4 w-4" />
            Provento
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar Provento</DialogTitle>
          <DialogDescription>
            Registre rendimentos, dividendos ou JCP recebidos de um ativo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dividendAccountId">Conta *</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="dividendAccountId">
                    <SelectValue placeholder="Selecione a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {investmentAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id.toString()}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="dividendAssetName">Código do Ativo *</Label>
                <Input
                  id="dividendAssetName"
                  type="text"
                  placeholder="Ex: HGLG11, PETR4..."
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value.toUpperCase())}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dividendType">Tipo *</Label>
                <Select
                  value={type}
                  onValueChange={(value) => setType(value as DividendType)}
                >
                  <SelectTrigger id="dividendType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(dividendTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="dividendAmount">Valor Recebido *</Label>
                <Input
                  id="dividendAmount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="dividendPaymentDate">Data *</Label>
                <Input
                  id="dividendPaymentDate"
                  type="text"
                  placeholder="DD/MM/YYYY"
                  value={paymentDate}
                  onChange={(e) =>
                    setPaymentDate(formatDateInput(e.target.value))
                  }
                  maxLength={10}
                  required
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
