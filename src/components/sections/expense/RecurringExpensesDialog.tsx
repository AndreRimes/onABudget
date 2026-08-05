"use client";

import { format } from "date-fns";
import { Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
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
import { formatCurrency } from "~/lib/format";
import {
  useControllableOpen,
  type ControllableOpenProps,
} from "~/lib/use-controllable-open";
import { isSpendingAccount } from "~/lib/account-type";
import { api } from "~/trpc/react";

const emptyForm = {
  id: null as number | null,
  accountId: "",
  categoryId: "",
  description: "",
  amount: "",
  dayOfMonth: "1",
  startMonth: format(new Date(), "yyyy-MM"),
  endMonth: "",
};

export function RecurringExpensesDialog(props: ControllableOpenProps = {}) {
  const { isControlled, open, setOpen } = useControllableOpen(props);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const utils = api.useUtils();
  const { data: accounts } = api.account.getAll.useQuery();
  const { data: categories } = api.category.getAll.useQuery();
  const { data: rules } = api.expenses.listRecurring.useQuery();
  const spendingAccounts = accounts?.filter(isSpendingAccount) ?? [];

  const refresh = () => {
    void utils.expenses.listRecurring.invalidate();
    void utils.expenses.getAllFromUser.invalidate();
    void utils.expenses.getAllFromAccount.invalidate();
  };

  const resetForm = () => {
    setForm(emptyForm);
    setShowForm(false);
  };

  const { mutate: create, isPending: isCreating } =
    api.expenses.createRecurring.useMutation({
      onSuccess: () => {
        toast.success("Despesa fixa criada!");
        refresh();
        resetForm();
      },
      onError: (error) => toast.error("Erro ao criar: " + error.message),
    });

  const { mutate: update, isPending: isUpdating } =
    api.expenses.updateRecurring.useMutation({
      onSuccess: () => {
        toast.success("Despesa fixa atualizada!");
        refresh();
        resetForm();
      },
      onError: (error) => toast.error("Erro ao atualizar: " + error.message),
    });

  const { mutate: remove } = api.expenses.deleteRecurring.useMutation({
    onSuccess: () => {
      toast.success("Despesa fixa removida.");
      refresh();
    },
    onError: (error) => toast.error("Erro ao remover: " + error.message),
  });

  const startEdit = (rule: NonNullable<typeof rules>[number]) => {
    setForm({
      id: rule.id,
      accountId: rule.checkingAccountId.toString(),
      categoryId: rule.categoryId.toString(),
      description: rule.description,
      amount: rule.amount.toString(),
      dayOfMonth: rule.dayOfMonth.toString(),
      startMonth: rule.startMonth,
      endMonth: rule.endMonth ?? "",
    });
    setShowForm(true);
  };

  const submit = () => {
    if (!form.accountId || !form.categoryId || !form.description || !form.amount) {
      toast.error("Preencha conta, categoria, descrição e valor");
      return;
    }
    const payload = {
      accountId: parseInt(form.accountId),
      categoryId: parseInt(form.categoryId),
      description: form.description,
      amount: parseFloat(form.amount),
      dayOfMonth: parseInt(form.dayOfMonth),
      startMonth: form.startMonth,
      endMonth: form.endMonth || null,
    };
    if (form.id === null) create(payload);
    else update({ id: form.id, ...payload });
  };

  const categoryName = (categoryId: number) =>
    categories?.find((category) => category.id === categoryId)?.name ??
    "Sem categoria";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <Repeat className="mr-2 h-4 w-4" />
            Despesas fixas
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Despesas fixas</DialogTitle>
          <DialogDescription>
            Cadastre uma vez e o app lança automaticamente todo mês — aluguel,
            streaming, academia. O lançamento aparece assim que o dia do mês
            chega, e você pode editar ou apagar qualquer um depois.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {rules && rules.length > 0 && (
            <div className="grid gap-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {rule.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Todo dia {rule.dayOfMonth} · {categoryName(rule.categoryId)}
                      {rule.endMonth ? ` · até ${rule.endMonth}` : ""}
                    </p>
                  </div>
                  {!rule.active && (
                    <Badge variant="secondary" className="text-xs">
                      Pausada
                    </Badge>
                  )}
                  <span className="text-sm font-semibold whitespace-nowrap">
                    {formatCurrency(rule.amount)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(rule)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove({ id: rule.id })}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {rules?.length === 0 && !showForm && (
            <p className="text-sm text-muted-foreground">
              Nenhuma despesa fixa cadastrada ainda.
            </p>
          )}

          {showForm ? (
            <div className="grid gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {form.id === null ? "Nova despesa fixa" : "Editar despesa fixa"}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Conta *</Label>
                  <Select
                    value={form.accountId}
                    onValueChange={(value) =>
                      setForm((current) => ({ ...current, accountId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {spendingAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id.toString()}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label>Categoria *</Label>
                  <Select
                    value={form.categoryId}
                    onValueChange={(value) =>
                      setForm((current) => ({ ...current, categoryId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((category) => (
                        <SelectItem
                          key={category.id}
                          value={category.id.toString()}
                        >
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="recurringDescription">Descrição *</Label>
                  <Input
                    id="recurringDescription"
                    placeholder="Aluguel, Netflix, academia..."
                    value={form.description}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="recurringAmount">Valor *</Label>
                  <Input
                    id="recurringAmount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        amount: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="recurringDay">Dia do mês *</Label>
                  <Input
                    id="recurringDay"
                    type="number"
                    min="1"
                    max="31"
                    value={form.dayOfMonth}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        dayOfMonth: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="recurringStart">Começa em *</Label>
                  <Input
                    id="recurringStart"
                    type="month"
                    value={form.startMonth}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        startMonth: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="recurringEnd">Termina em</Label>
                  <Input
                    id="recurringEnd"
                    type="month"
                    value={form.endMonth}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        endMonth: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <Button
                type="button"
                onClick={submit}
                disabled={isCreating || isUpdating}
                className="justify-self-start"
              >
                {isCreating || isUpdating
                  ? "Salvando..."
                  : form.id === null
                    ? "Criar despesa fixa"
                    : "Salvar alterações"}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowForm(true)}
              className="justify-self-start"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova despesa fixa
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
