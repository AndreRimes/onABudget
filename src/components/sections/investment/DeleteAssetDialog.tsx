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
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

export function DeleteAssetDialog({ assetName }: { assetName: string }) {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();

  const { mutate, isPending } = api.investments.deleteAsset.useMutation({
    onSuccess: (result) => {
      void utils.investments.getPortfolioSnapshot.invalidate();
      void utils.investments.getAllFromUser.invalidate();
      void utils.dividends.getAllFromUser.invalidate();
      toast.success(
        `${assetName} excluído (${result.transactionsDeleted} transações, ${result.dividendsDeleted} proventos)`,
      );
      setOpen(false);
    },
    onError: (error) => {
      toast.error("Erro ao excluir ativo: " + error.message);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive">
          Excluir
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {assetName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Todas as transações e proventos registrados para {assetName} serão
            removidos permanentemente. Essa ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              mutate({ assetName });
            }}
          >
            {isPending ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
