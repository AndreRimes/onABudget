"use client";

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
import { Textarea } from "~/components/ui/textarea";
import { api } from "~/trpc/react";

export interface EditableExpense {
  id: number;
  categoryId: number;
  description: string | null;
  amount: number;
  expenseDate: string; // YYYY-MM-DD
}

interface EditExpenseDialogProps {
  /** The expense being edited, or null to keep the dialog closed. */
  expense: EditableExpense | null;
  onClose: () => void;
}

/**
 * Correcting a single expense. Matters most for recurring rules, which post a
 * fixed amount every month — a bill that came in different needs fixing
 * without deleting and retyping it.
 */
export function EditExpenseDialog({ expense, onClose }: EditExpenseDialogProps) {
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");

  const utils = api.useUtils();
  const { data: categories } = api.category.getAll.useQuery();

  // Reload the form whenever a different expense is opened.
  useEffect(() => {
    if (!expense) return;
    setCategoryId(expense.categoryId.toString());
    setAmount(expense.amount.toString());
    setDate(expense.expenseDate);
    setDescription(expense.description ?? "");
  }, [expense]);

  const { mutate, isPending } = api.expenses.update.useMutation({
    onSuccess: () => {
      void utils.expenses.getAllFromUser.invalidate();
      void utils.expenses.getAllFromAccount.invalidate();
      toast.success("Despesa atualizada!");
      onClose();
    },
    onError: (error) => toast.error("Erro ao atualizar: " + error.message),
  });

  const submit = () => {
    if (!expense) return;
    if (!categoryId || !amount || !date) {
      toast.error("Preencha categoria, valor e data");
      return;
    }
    mutate({
      id: expense.id,
      categoryId: parseInt(categoryId),
      amount: parseFloat(amount),
      date,
      description: description || undefined,
    });
  };

  return (
    <Dialog
      open={expense !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar despesa</DialogTitle>
          <DialogDescription>
            Ajuste os dados deste lançamento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="editCategory">Categoria *</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="editCategory">
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
            <Label htmlFor="editAmount">Valor *</Label>
            <Input
              id="editAmount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="editDate">Data *</Label>
            <Input
              id="editDate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="editDescription">Descrição</Label>
            <Textarea
              id="editDescription"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
