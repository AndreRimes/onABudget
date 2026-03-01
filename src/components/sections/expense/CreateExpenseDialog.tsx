"use client";

import { format } from "date-fns";
import { Plus } from "lucide-react";
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
import { Textarea } from "~/components/ui/textarea";
import { api } from "~/trpc/react";

function formatDateInput(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

function parseDisplayDate(displayDate: string): string {
  if (!displayDate || displayDate.length !== 10) return "";
  const parts = displayDate.split("/");
  if (parts.length !== 3) return "";
  const [day, month, year] = parts;
  return `${year}-${month}-${day}`;
}

export function CreateExpenseDialog() {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "dd/MM/yyyy"));
  const [description, setDescription] = useState("");

  const utils = api.useUtils();

  // Fetch accounts and categories
  const { data: accounts } = api.account.getAll.useQuery();
  const { data: categories } = api.category.getAll.useQuery();

  const checkingAccounts = accounts?.filter((acc) => acc.accountType === "CHECKING") || [];

  const { mutate, isPending } = api.expenses.create.useMutation({
    onSuccess: () => {
      utils.expenses.getAllFromUser.invalidate();
      utils.expenses.getAllFromAccount.invalidate();
      toast.success("Despesa criada com sucesso!");
      setOpen(false);
      setAccountId("");
      setCategoryId("");
      setAmount("");
      setDate(format(new Date(), "dd/MM/yyyy"));
      setDescription("");
    },
    onError: (error) => {
      toast.error("Erro ao criar despesa: " + error.message);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accountId || !categoryId || !amount) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    mutate({
      accountId: parseInt(accountId),
      categoryId: parseInt(categoryId),
      amount: parseFloat(amount),
      date: parseDisplayDate(date),
      description: description || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nova Despesa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Nova Despesa</DialogTitle>
          <DialogDescription>Adicione uma nova despesa à sua conta.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="accountId">Conta *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="accountId">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {checkingAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="categoryId">Categoria *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="categoryId">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="amount">Valor *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="date">Data *</Label>
              <Input
                id="date"
                type="text"
                placeholder="DD/MM/YYYY"
                value={date}
                onChange={(e) => setDate(formatDateInput(e.target.value))}
                maxLength={10}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descrição da despesa (opcional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Criando..." : "Criar Despesa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
