"use client";

import { ChevronDown, FileUp, HandCoins, Plus } from "lucide-react";
import { type ComponentType, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import type { ControllableOpenProps } from "~/lib/use-controllable-open";

const actions = {
  importB3: {
    label: "Importar B3",
    icon: FileUp,
    load: () => import("./ImportB3Dialog").then((m) => m.ImportB3Dialog),
  },
  dividend: {
    label: "Registrar provento",
    icon: HandCoins,
    load: () => import("./AddDividendDialog").then((m) => m.AddDividendDialog),
  },
  assetType: {
    label: "Novo tipo de ativo",
    icon: Plus,
    load: () =>
      import("../asset-type/CreateAssetTypeDialog").then(
        (m) => m.CreateAssetTypeDialog,
      ),
  },
};

type Action = keyof typeof actions;

export function InvestmentActions() {
  const [open, setOpen] = useState<Action | null>(null);
  const [failed, setFailed] = useState<Action | null>(null);
  const [loaded, setLoaded] = useState<
    Partial<Record<Action, ComponentType<ControllableOpenProps>>>
  >({});

  const show = async (action: Action) => {
    setOpen(action);
    setFailed(null);
    if (loaded[action]) return;
    try {
      const component = await actions[action].load();
      setLoaded((current) => ({ ...current, [action]: component }));
    } catch {
      setFailed(action);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            Mais ações
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(Object.keys(actions) as Action[]).map((action) => {
            const { label, icon: Icon } = actions[action];
            return (
              <DropdownMenuItem key={action} onSelect={() => void show(action)}>
                <Icon className="mr-2 h-4 w-4" />
                {label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {open && !loaded[open] && (
        <Dialog open onOpenChange={(next) => !next && setOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{actions[open].label}</DialogTitle>
              <DialogDescription role={failed === open ? "alert" : "status"}>
                {failed === open
                  ? "Não foi possível carregar o formulário. Tente novamente."
                  : "Carregando formulário..."}
              </DialogDescription>
            </DialogHeader>
            {failed === open && (
              <Button onClick={() => void show(open)}>Tentar novamente</Button>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Keep visited forms mounted so closing a dialog preserves its draft. */}
      {(Object.keys(loaded) as Action[]).map((action) => {
        const Component = loaded[action]!;
        return (
          <Component
            key={action}
            open={open === action}
            onOpenChange={(next) => setOpen(next ? action : null)}
          />
        );
      })}
    </>
  );
}
