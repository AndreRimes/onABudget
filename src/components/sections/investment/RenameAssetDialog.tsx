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
import { api } from "~/trpc/react";

export function RenameAssetDialog({
  assetName,
  onRenamed,
}: {
  assetName: string;
  /** Fired with the new name — the detail page is keyed by it and must follow. */
  onRenamed?: (newAssetName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(assetName);

  // Re-sync the field whenever the dialog is (re)opened for this holding.
  useEffect(() => {
    if (open) setNewName(assetName);
  }, [open, assetName]);

  const utils = api.useUtils();
  const { mutate, isPending } = api.investments.renameAsset.useMutation({
    onSuccess: (result) => {
      void utils.investments.getPortfolioSnapshot.invalidate();
      void utils.investments.getAllFromUser.invalidate();
      void utils.dividends.getAllFromUser.invalidate();
      toast.success(
        `Renomeado para "${newName.trim()}" (${result.transactionsUpdated} transaç${
          result.transactionsUpdated === 1 ? "ão" : "ões"
        }, ${result.dividendsUpdated} provento${
          result.dividendsUpdated === 1 ? "" : "s"
        })`,
      );
      setOpen(false);
      onRenamed?.(newName.trim());
    },
    onError: (error) => {
      toast.error("Erro ao renomear: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("Informe um nome válido");
      return;
    }
    if (trimmed === assetName) {
      setOpen(false);
      return;
    }
    mutate({ assetName, newAssetName: trimmed });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Renomear
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renomear {assetName}</DialogTitle>
          <DialogDescription>
            Escolha um nome amigável. Ele é aplicado a todas as transações e
            proventos deste ativo. A importação da B3 continua reconhecendo o
            código original, então reimportar não gera duplicatas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-2 py-2">
            <Label htmlFor="renameAsset">Novo nome *</Label>
            <Input
              id="renameAsset"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              required
            />
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
