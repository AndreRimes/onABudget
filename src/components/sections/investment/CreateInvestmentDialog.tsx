"use client";

import { Plus } from "lucide-react";
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
import { api } from "~/trpc/react";

export function CreateInvestmentDialog() {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [assetTypeId, setAssetTypeId] = useState("");
  const [assetName, setAssetName] = useState("");
  const [transactionType, setTransactionType] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [isFixedIncome, setIsFixedIncome] = useState(false);
  const [fixedIncomeYieldType, setFixedIncomeYieldType] = useState<"CDI_PERCENTAGE" | "PREFIXED">("CDI_PERCENTAGE");
  const [fixedIncomeRate, setFixedIncomeRate] = useState("");
  const [fixedIncomeMaturityDate, setFixedIncomeMaturityDate] = useState("");

  const utils = api.useUtils();

  // Fetch accounts and asset types
  const { data: accounts } = api.account.getAll.useQuery();
  const { data: assetTypes } = api.assetTypes.getAll.useQuery();

  const investmentAccounts =
    accounts?.filter((acc) => acc.accountType === "INVESTMENT") || [];

  // State for fixed income invested amount
  const [investedAmount, setInvestedAmount] = useState("");

  // Calculate total amount
  const totalAmount = isFixedIncome
    ? parseFloat(investedAmount || "0")
    : parseFloat(quantity || "0") * parseFloat(pricePerUnit || "0");

  const { mutate, isPending } = api.investments.create.useMutation({
    onSuccess: () => {
      utils.investments.getAllFromUser.invalidate();
      utils.investments.getPortfolioWithMarketData.invalidate();
      utils.investments.getPortfolioHoldings.invalidate();
      utils.investments.getPortfolioPerformance.invalidate();
      toast.success("Investimento registrado com sucesso!");
      setOpen(false);
      // Reset form
      setAccountId("");
      setAssetTypeId("");
      setAssetName("");
      setTransactionType("BUY");
      setQuantity("");
      setPricePerUnit("");
      setTransactionDate("");
      setIsFixedIncome(false);
      setFixedIncomeYieldType("CDI_PERCENTAGE");
      setFixedIncomeRate("");
      setFixedIncomeMaturityDate("");
      setInvestedAmount("");
    },
    onError: (error) => {
      toast.error("Erro ao registrar investimento: " + error.message);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isFixedIncome) {
      if (!accountId || !assetTypeId || !assetName || !investedAmount || !transactionDate) {
        toast.error("Preencha todos os campos obrigatórios");
        return;
      }
    } else {
      if (!accountId || !assetTypeId || !assetName || !quantity || !pricePerUnit) {
        toast.error("Preencha todos os campos obrigatórios");
        return;
      }
    }

    const qty = isFixedIncome ? 1 : parseFloat(quantity);
    const price = isFixedIncome ? parseFloat(investedAmount) : parseFloat(pricePerUnit);

    mutate({
      investmentAccountId: parseInt(accountId),
      assetTypeId: parseInt(assetTypeId),
      assetName: assetName.toUpperCase().trim(),
      transactionType,
      quantity: qty,
      pricePerUnit: price,
      totalAmount: totalAmount,
      ...(transactionDate ? { transactionDate } : {}),
      isFixedIncome,
      ...(isFixedIncome
        ? {
            fixedIncomeYieldType,
            fixedIncomeRate: fixedIncomeRate ? parseFloat(fixedIncomeRate) : null,
            fixedIncomeMaturityDate: fixedIncomeMaturityDate || null,
          }
        : {
            fixedIncomeYieldType: null,
            fixedIncomeRate: null,
            fixedIncomeMaturityDate: null,
          }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Investimento
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar Investimento</DialogTitle>
          <DialogDescription>
            Registre uma nova transação de compra ou venda de ativos.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Row 1: Conta + Tipo de Ativo */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="accountId">Conta de Investimento *</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="accountId">
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
                <Label htmlFor="assetTypeId">Tipo de Ativo *</Label>
                <Select value={assetTypeId} onValueChange={setAssetTypeId}>
                  <SelectTrigger id="assetTypeId">
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
            </div>

            {/* Row 2: Tipo de Transação + Código do Ativo */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="transactionType">Tipo de Transação *</Label>
                <Select
                  value={transactionType}
                  onValueChange={(value) =>
                    setTransactionType(value as "BUY" | "SELL")
                  }
                >
                  <SelectTrigger id="transactionType">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">Compra</SelectItem>
                    <SelectItem value="SELL">Venda</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="assetName">Código do Ativo *</Label>
                <Input
                  id="assetName"
                  type="text"
                  placeholder="Ex: PETR4, CDB-BANCO..."
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value.toUpperCase())}
                  required
                />
              </div>
            </div>

            {/* Fixed Income Toggle */}
            <div className="flex items-center gap-3">
              <input
                id="isFixedIncome"
                type="checkbox"
                checked={isFixedIncome}
                onChange={(e) => setIsFixedIncome(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="isFixedIncome">Renda Fixa</Label>
            </div>

            {isFixedIncome ? (
              <>
                {/* Row: Tipo de Rendimento + Taxa */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="fixedIncomeYieldType">Tipo de Rendimento *</Label>
                    <Select
                      value={fixedIncomeYieldType}
                      onValueChange={(value) =>
                        setFixedIncomeYieldType(value as "CDI_PERCENTAGE" | "PREFIXED")
                      }
                    >
                      <SelectTrigger id="fixedIncomeYieldType">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CDI_PERCENTAGE">% do CDI</SelectItem>
                        <SelectItem value="PREFIXED">Prefixado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="fixedIncomeRate">
                      {fixedIncomeYieldType === "CDI_PERCENTAGE"
                        ? "Percentual do CDI (%) *"
                        : "Taxa Prefixada (% a.a.) *"}
                    </Label>
                    <Input
                      id="fixedIncomeRate"
                      type="number"
                      placeholder={fixedIncomeYieldType === "CDI_PERCENTAGE" ? "Ex: 100" : "Ex: 15"}
                      value={fixedIncomeRate}
                      onChange={(e) => setFixedIncomeRate(e.target.value)}
                      min="0.01"
                      step="0.01"
                      required={isFixedIncome}
                    />
                    <p className="text-xs text-muted-foreground">
                      {fixedIncomeYieldType === "CDI_PERCENTAGE"
                        ? "100 = 100% do CDI, 110 = 110% do CDI"
                        : "Ex: 15 para 15% ao ano"}
                    </p>
                  </div>
                </div>

                {/* Row: Valor Investido + Data do Investimento */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="investedAmount">Valor Investido *</Label>
                    <Input
                      id="investedAmount"
                      type="number"
                      placeholder="0.00"
                      value={investedAmount}
                      onChange={(e) => setInvestedAmount(e.target.value)}
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="transactionDate">Data do Investimento *</Label>
                    <Input
                      id="transactionDate"
                      type="date"
                      value={transactionDate}
                      onChange={(e) => setTransactionDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Row: Data de Vencimento (half width) */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="fixedIncomeMaturityDate">Data de Vencimento</Label>
                    <Input
                      id="fixedIncomeMaturityDate"
                      type="date"
                      value={fixedIncomeMaturityDate}
                      onChange={(e) => setFixedIncomeMaturityDate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Opcional</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Row: Quantidade + Preço Unitário */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="quantity">Quantidade *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      placeholder="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      min="0.00001"
                      step="any"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="pricePerUnit">Preço Unitário *</Label>
                    <Input
                      id="pricePerUnit"
                      type="number"
                      placeholder="0.00"
                      value={pricePerUnit}
                      onChange={(e) => setPricePerUnit(e.target.value)}
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </div>
                </div>

                {/* Row: Data da Transação (half width) */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="transactionDate">Data da Transação</Label>
                    <Input
                      id="transactionDate"
                      type="date"
                      value={transactionDate}
                      onChange={(e) => setTransactionDate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Opcional. Será estimada se não informada.
                    </p>
                  </div>
                </div>
              </>
            )}

            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Valor Total:</span>
                <span className="text-lg font-bold">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(totalAmount)}
                </span>
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
