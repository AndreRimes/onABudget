"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CreateAssetTypeDialog } from "~/components/sections/asset-type/CreateAssetTypeDialog";
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
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { invalidatePortfolio } from "~/trpc/invalidate";

export function MoveAssetDialog({
  assetName,
  assetLabel,
  assetTypeId,
}: Readonly<{
  assetName: string;
  assetLabel: string;
  assetTypeId: number;
}>) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(String(assetTypeId));

  const utils = api.useUtils();
  const { data: assetTypes } = api.assetTypes.getAll.useQuery(undefined, {
    enabled: open,
  });
  const { mutate, isPending } = api.investments.moveAsset.useMutation({
    onSuccess: () => {
      void invalidatePortfolio(utils);
      void utils.investments.getAllFromUser.invalidate();
      void utils.assetTypes.getAllWithStats.invalidate();
      const target = assetTypes?.find((type) => String(type.id) === selected);
      toast.success(`${assetLabel} movido para "${target?.name}"`);
      setOpen(false);
    },
    onError: (error) => {
      toast.error("Erro ao mover ativo: " + error.message);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSelected(String(assetTypeId));
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Mover
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mover {assetLabel}</DialogTitle>
          <DialogDescription>
            Escolha a categoria do ativo. Ela vale para todas as transações dele
            e para as próximas importações.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="moveAssetType">Categoria</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="moveAssetType" className="w-full">
              <SelectValue placeholder="Selecione a categoria" />
            </SelectTrigger>
            <SelectContent>
              {assetTypes?.map((type) => (
                <SelectItem key={type.id} value={String(type.id)}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <CreateAssetTypeDialog />
          <Button
            disabled={isPending || selected === String(assetTypeId)}
            onClick={() =>
              mutate({ assetName, assetTypeId: Number.parseInt(selected) })
            }
          >
            {isPending ? "Movendo..." : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
