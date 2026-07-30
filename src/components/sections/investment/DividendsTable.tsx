"use client";

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
import { toDisplayDate } from "./date-input";
import { formatCurrency } from "./format";

type Dividend = RouterOutputs["dividends"]["getByAssetName"][number];

const typeLabels: Record<Dividend["type"], string> = {
  DIVIDEND: "Dividendo",
  JCP: "JCP",
  RENDIMENTO: "Rendimento",
};

export function DividendsTable({ assetName }: { assetName: string }) {
  const [deleting, setDeleting] = useState<Dividend | null>(null);

  const utils = api.useUtils();
  const { data: dividends, isPending } = api.dividends.getByAssetName.useQuery({
    assetName,
  });

  const total =
    dividends?.reduce((sum, dividend) => sum + dividend.amount, 0) ?? 0;

  const { mutate: remove, isPending: isDeleting } =
    api.dividends.delete.useMutation({
      onSuccess: () => {
        void utils.dividends.getByAssetName.invalidate();
        void utils.dividends.getAllFromUser.invalidate();
        void utils.investments.getPortfolioSnapshot.invalidate();
        toast.success("Provento excluído");
        setDeleting(null);
      },
      onError: (error) => {
        toast.error("Erro ao excluir provento: " + error.message);
      },
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Proventos</CardTitle>
            <CardDescription>
              Dividendos, JCP e rendimentos recebidos de {assetName}
            </CardDescription>
          </div>
          {total > 0 && (
            <p className="text-lg font-bold">{formatCurrency(total)}</p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : !dividends?.length ? (
          <p className="py-6 text-center text-muted-foreground">
            Nenhum provento registrado
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data de Pagamento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {dividends.map((dividend) => (
                  <TableRow key={dividend.id}>
                    <TableCell>{toDisplayDate(dividend.paymentDate)}</TableCell>
                    <TableCell>{typeLabels[dividend.type]}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(dividend.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {dividend.source === "B3_IMPORT" ? "B3" : "Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleting(dividend)}
                      >
                        Excluir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir provento?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `${typeLabels[deleting.type]} de ${formatCurrency(
                    deleting.amount,
                  )} pago em ${toDisplayDate(deleting.paymentDate)}. `
                : ""}
              Os totais de proventos e a rentabilidade serão recalculados.
              {deleting?.source === "B3_IMPORT"
                ? " Como este provento veio de um arquivo da B3, ele voltará se você importar o mesmo arquivo novamente."
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
