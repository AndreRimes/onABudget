"use client";

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
import { Skeleton } from "~/components/ui/skeleton";
import { api, type RouterOutputs } from "~/trpc/react";
import { invalidatePortfolio } from "~/trpc/invalidate";
import {
  InvestmentTable,
  InvestmentTableControls,
  useInvestmentTable,
} from "./InvestmentTable";
import { toDisplayDate } from "./date-input";
import { formatCurrency } from "./format";

type Dividend = RouterOutputs["dividends"]["getByAssetName"][number];

const typeLabels: Record<Dividend["type"], string> = {
  DIVIDEND: "Dividendo",
  JCP: "JCP",
  RENDIMENTO: "Rendimento",
};

function sourceLabel(dividend: Dividend): string {
  return dividend.source === "B3_IMPORT" ? "B3" : "Manual";
}

export function DividendsTable({ assetName }: Readonly<{ assetName: string }>) {
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
        void invalidatePortfolio(utils);
        toast.success("Provento excluído");
        setDeleting(null);
      },
      onError: (error) => {
        toast.error("Erro ao excluir provento: " + error.message);
      },
    });

  const view = useInvestmentTable<Dividend>([
    {
      id: "date",
      label: "Data de pagamento",
      value: (dividend) => dividend.paymentDate,
      format: (dividend) => toDisplayDate(dividend.paymentDate),
    },
    {
      id: "type",
      label: "Tipo",
      value: (dividend) => typeLabels[dividend.type],
    },
    {
      id: "amount",
      label: "Valor",
      align: "right",
      value: (dividend) => dividend.amount,
      format: (dividend) => formatCurrency(dividend.amount),
      render: (dividend) => <strong>{formatCurrency(dividend.amount)}</strong>,
    },
    {
      id: "source",
      label: "Origem",
      value: sourceLabel,
      render: (dividend) => (
        <Badge variant="outline">{sourceLabel(dividend)}</Badge>
      ),
    },
    {
      id: "actions",
      label: "Ações",
      width: "w-20",
      render: (dividend) => (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleting(dividend)}
        >
          Excluir
        </Button>
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
  } else if (!dividends?.length) {
    content = (
      <p className="text-muted-foreground py-6 text-center">
        Nenhum provento registrado
      </p>
    );
  } else {
    content = (
      <div className="space-y-3">
        <InvestmentTableControls view={view} searchLabel="Buscar proventos" />
        <InvestmentTable
          rows={view.visibleRows(dividends)}
          rowKey={(dividend) => dividend.id}
          view={view}
          label="Proventos"
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
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
      <CardContent>{content}</CardContent>

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
