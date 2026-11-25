"use client";

import { MoreHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Skeleton } from "~/components/ui/skeleton";
import { api, type RouterOutputs } from "~/trpc/react";
import { invalidatePortfolio } from "~/trpc/invalidate";
import { EditTransactionDialog } from "./EditTransactionDialog";
import {
  InvestmentTable,
  InvestmentTableControls,
  useInvestmentTable,
} from "./InvestmentTable";
import { toDisplayDate } from "./date-input";
import { formatCurrency } from "./format";

type Transaction = RouterOutputs["investments"]["getByAssetName"][number];

function sideLabel(transaction: { transactionType: "BUY" | "SELL" }): string {
  return transaction.transactionType === "BUY" ? "Compra" : "Venda";
}

function sourceLabel(transaction: Transaction): string {
  return transaction.sourceHash ? "B3" : "Manual";
}

export function TransactionsTable({
  assetName,
}: Readonly<{ assetName: string }>) {
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  const utils = api.useUtils();
  const { data: transactions, isPending } =
    api.investments.getByAssetName.useQuery({ assetName });
  const { data: accounts } = api.account.getAll.useQuery();

  const accountName = (id: number) =>
    accounts?.find((account) => account.id === id)?.name ?? "—";

  const { mutate: remove, isPending: isDeleting } =
    api.investments.delete.useMutation({
      onSuccess: () => {
        void utils.investments.getByAssetName.invalidate();
        void utils.investments.getAllFromUser.invalidate();
        void invalidatePortfolio(utils);
        toast.success("Transação excluída");
        setDeleting(null);
      },
      onError: (error) => {
        toast.error("Erro ao excluir transação: " + error.message);
      },
    });

  const view = useInvestmentTable<Transaction>([
    {
      id: "date",
      label: "Data",
      value: (transaction) => transaction.transactionDate,
      format: (transaction) => toDisplayDate(transaction.transactionDate),
    },
    {
      id: "type",
      label: "Tipo",
      value: sideLabel,
      render: (transaction) => (
        <Badge
          variant={
            transaction.transactionType === "BUY" ? "default" : "destructive"
          }
        >
          {sideLabel(transaction)}
        </Badge>
      ),
    },
    {
      id: "quantity",
      label: "Quantidade",
      align: "right",
      value: (transaction) => transaction.quantity,
      format: (transaction) =>
        transaction.quantity.toLocaleString("pt-BR", {
          maximumFractionDigits: 6,
        }),
    },
    {
      id: "price",
      label: "Preço unitário",
      align: "right",
      value: (transaction) => transaction.pricePerUnit,
      format: (transaction) => formatCurrency(transaction.pricePerUnit),
    },
    {
      id: "total",
      label: "Valor total",
      align: "right",
      value: (transaction) => transaction.totalAmount,
      format: (transaction) => formatCurrency(transaction.totalAmount),
      render: (transaction) => (
        <strong>{formatCurrency(transaction.totalAmount)}</strong>
      ),
    },
    {
      id: "account",
      label: "Conta",
      value: (transaction) => accountName(transaction.investmentAccountId),
    },
    {
      id: "source",
      label: "Origem",
      value: sourceLabel,
      render: (transaction) => (
        <Badge variant="outline">{sourceLabel(transaction)}</Badge>
      ),
    },
    {
      id: "actions",
      label: "Ações",
      width: "w-12",
      render: (transaction) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Ações da transação"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(transaction)}>
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeleting(transaction)}
            >
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]);

  let content: ReactNode;
  if (isPending) {
    content = (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  } else if (!transactions?.length) {
    content = (
      <p className="text-muted-foreground py-6 text-center">
        Nenhuma transação registrada
      </p>
    );
  } else {
    content = (
      <div className="space-y-3">
        <InvestmentTableControls view={view} searchLabel="Buscar transações" />
        <InvestmentTable
          rows={view.visibleRows(transactions)}
          rowKey={(transaction) => transaction.id}
          view={view}
          label="Transações"
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transações</CardTitle>
        <CardDescription>
          Todas as compras e vendas registradas para {assetName}
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>

      {editing && (
        <EditTransactionDialog
          transaction={editing}
          open
          onOpenChange={(next) => !next && setEditing(null)}
        />
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  {sideLabel(deleting)} de {assetName} em{" "}
                  {toDisplayDate(deleting.transactionDate)} no valor de{" "}
                  {formatCurrency(deleting.totalAmount)}.{" "}
                </>
              )}
              O preço médio e a rentabilidade serão recalculados.
              {deleting?.sourceHash
                ? " Como esta transação veio de um arquivo da B3, ela voltará se você importar o mesmo arquivo novamente."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) remove({ id: deleting.id });
              }}
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
