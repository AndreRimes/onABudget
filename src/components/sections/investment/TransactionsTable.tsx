"use client";

import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { api, type RouterOutputs } from "~/trpc/react";
import { EditTransactionDialog } from "./EditTransactionDialog";
import { toDisplayDate } from "./date-input";
import { formatCurrency } from "./format";

type Transaction = RouterOutputs["investments"]["getByAssetName"][number];

export function TransactionsTable({ assetName }: { assetName: string }) {
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
        void utils.investments.getPortfolioSnapshot.invalidate();
        toast.success("Transação excluída");
        setDeleting(null);
      },
      onError: (error) => {
        toast.error("Erro ao excluir transação: " + error.message);
      },
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transações</CardTitle>
        <CardDescription>
          Todas as compras e vendas registradas para {assetName}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : !transactions?.length ? (
          <p className="py-6 text-center text-muted-foreground">
            Nenhuma transação registrada
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Preço Unitário</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      {toDisplayDate(transaction.transactionDate)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          transaction.transactionType === "BUY"
                            ? "default"
                            : "destructive"
                        }
                      >
                        {transaction.transactionType === "BUY"
                          ? "Compra"
                          : "Venda"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {transaction.quantity.toLocaleString("pt-BR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 6,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(transaction.pricePerUnit)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(transaction.totalAmount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {accountName(transaction.investmentAccountId)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {transaction.sourceHash ? "B3" : "Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Ações da transação"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setEditing(transaction)}
                          >
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

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
              {deleting
                ? `${
                    deleting.transactionType === "BUY" ? "Compra" : "Venda"
                  } de ${assetName} em ${toDisplayDate(
                    deleting.transactionDate,
                  )} no valor de ${formatCurrency(deleting.totalAmount)}. `
                : ""}
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
