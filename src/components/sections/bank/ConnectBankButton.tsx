"use client";

import { Plug, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api } from "~/trpc/react";
import { describeProvision } from "./provision-summary";

// The widget renders an iframe and touches window on mount, so it must never
// run during SSR.
const PluggyConnect = dynamic(
  () => import("react-pluggy-connect").then((mod) => mod.PluggyConnect),
  { ssr: false },
);

/**
 * Starts a connection.
 *
 * The free Meu Pluggy tier cannot list items (`GET /items` answers 401), so an
 * item id is only ever learned at the moment consent is given. The widget
 * returns it; the manual field is the escape hatch for an item that was linked
 * straight from the Pluggy dashboard.
 */
export function ConnectBankButton() {
  const utils = api.useUtils();
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [manualId, setManualId] = useState("");
  const [showManual, setShowManual] = useState(false);

  const { mutate: addConnection, isPending: isAdding } =
    api.bank.addConnection.useMutation({
      onSuccess: (result) => {
        void utils.bank.listConnections.invalidate();
        void utils.account.getAll.invalidate();
        setManualId("");
        setShowManual(false);
        // Accounts are created and linked as part of connecting. When that
        // part failed the connection is still stored, so say what is left to
        // do rather than reporting a plain success.
        toast.success(
          result.provisioned
            ? `Conexão adicionada · ${describeProvision(result.provisioned)}`
            : "Conexão adicionada. Use “criar contas” no card para vincular as contas.",
        );
      },
      onError: (error) => toast.error(error.message),
    });

  const { mutate: createToken, isPending: isCreatingToken } =
    api.bank.createConnectToken.useMutation({
      onSuccess: (token) => setConnectToken(token),
      onError: (error) => toast.error(error.message),
    });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => createToken()}
          disabled={isCreatingToken}
        >
          <Plug />
          conectar banco
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowManual((current) => !current)}
        >
          já tenho o item id
        </Button>
      </div>

      {showManual && (
        <div className="border-foreground mt-3 grid gap-2 border-2 border-dashed p-3">
          <Label htmlFor="pluggy-item-id">Item ID (Pluggy)</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="pluggy-item-id"
              value={manualId}
              onChange={(event) => setManualId(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-80"
            />
            <Button
              size="sm"
              disabled={!manualId || isAdding}
              onClick={() => addConnection({ itemId: manualId.trim() })}
            >
              <Plus />
              adicionar
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Em dashboard.pluggy.ai, abra a aplicação demo e copie o id do item
            criado ao conectar o Meu Pluggy.
          </p>
        </div>
      )}

      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={false}
          onSuccess={(payload: { item?: { id?: string } }) => {
            const itemId = payload?.item?.id;
            setConnectToken(null);
            if (itemId) addConnection({ itemId });
            else toast.error("O Pluggy não retornou o id da conexão");
          }}
          onError={() => {
            setConnectToken(null);
            toast.error("Não foi possível concluir a conexão");
          }}
          onClose={() => setConnectToken(null)}
        />
      )}
    </>
  );
}
