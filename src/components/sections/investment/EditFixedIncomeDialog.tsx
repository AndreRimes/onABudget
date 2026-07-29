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

type YieldType = "CDI_PERCENTAGE" | "PREFIXED";

function formatDateInput(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

function parseDisplayDate(displayDate: string): string {
  if (!displayDate || displayDate.length !== 10) return "";
  const [day, month, year] = displayDate.split("/");
  if (!day || !month || !year) return "";
  return `${year}-${month}-${day}`;
}

/** ISO "YYYY-MM-DD" -> "DD/MM/YYYY" for prefilling the input. */
function isoToDisplayDate(iso: string | null): string {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

export function EditFixedIncomeDialog({
  assetName,
  yieldType,
  rate,
  maturityDate,
}: {
  assetName: string;
  yieldType: YieldType | null;
  rate: number | null;
  maturityDate: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [fixedIncomeYieldType, setFixedIncomeYieldType] = useState<YieldType>(
    yieldType ?? "CDI_PERCENTAGE",
  );
  const [fixedIncomeRate, setFixedIncomeRate] = useState(
    rate != null ? String(rate) : "",
  );
  const [fixedIncomeMaturityDate, setFixedIncomeMaturityDate] = useState(
    isoToDisplayDate(maturityDate),
  );

  // Re-sync the form whenever the dialog is (re)opened for this holding.
  useEffect(() => {
    if (open) {
      setFixedIncomeYieldType(yieldType ?? "CDI_PERCENTAGE");
      setFixedIncomeRate(rate != null ? String(rate) : "");
      setFixedIncomeMaturityDate(isoToDisplayDate(maturityDate));
    }
  }, [open, yieldType, rate, maturityDate]);

  const utils = api.useUtils();
  const { mutate, isPending } = api.investments.setFixedIncomeYield.useMutation({
    onSuccess: (count) => {
      void utils.investments.getPortfolioSnapshot.invalidate();
      void utils.investments.getAllFromUser.invalidate();
      toast.success(
        `Taxa de ${assetName} atualizada (${count} transaç${count === 1 ? "ão" : "ões"})`,
      );
      setOpen(false);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar taxa: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedRate = parseFloat(fixedIncomeRate);
    if (!parsedRate || parsedRate <= 0) {
      toast.error("Informe uma taxa válida");
      return;
    }
    let maturity: string | null = null;
    if (fixedIncomeMaturityDate) {
      maturity = parseDisplayDate(fixedIncomeMaturityDate);
      if (!maturity) {
        toast.error("Data de vencimento inválida. Use o formato DD/MM/AAAA");
        return;
      }
    }
    mutate({
      assetName,
      fixedIncomeYieldType,
      fixedIncomeRate: parsedRate,
      fixedIncomeMaturityDate: maturity,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Taxa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rendimento de {assetName}</DialogTitle>
          <DialogDescription>
            Defina a taxa contratada para que o rendimento seja calculado. Ela é
            aplicada a todas as transações deste ativo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="editYieldType">Tipo de Rendimento *</Label>
                <Select
                  value={fixedIncomeYieldType}
                  onValueChange={(value) =>
                    setFixedIncomeYieldType(value as YieldType)
                  }
                >
                  <SelectTrigger id="editYieldType">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CDI_PERCENTAGE">% do CDI</SelectItem>
                    <SelectItem value="PREFIXED">Prefixado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="editRate">
                  {fixedIncomeYieldType === "CDI_PERCENTAGE"
                    ? "Percentual do CDI (%) *"
                    : "Taxa Prefixada (% a.a.) *"}
                </Label>
                <Input
                  id="editRate"
                  type="number"
                  placeholder={
                    fixedIncomeYieldType === "CDI_PERCENTAGE" ? "Ex: 100" : "Ex: 15"
                  }
                  value={fixedIncomeRate}
                  onChange={(e) => setFixedIncomeRate(e.target.value)}
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="editMaturity">Data de Vencimento</Label>
              <Input
                id="editMaturity"
                type="text"
                placeholder="DD/MM/AAAA"
                value={fixedIncomeMaturityDate}
                onChange={(e) =>
                  setFixedIncomeMaturityDate(formatDateInput(e.target.value))
                }
                maxLength={10}
              />
              <p className="text-xs text-muted-foreground">Opcional</p>
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
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
