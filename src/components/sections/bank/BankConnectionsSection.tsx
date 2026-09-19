"use client";

import {
  ChartNoAxesCombined,
  FolderPlus,
  Link2,
  Link2Off,
  RefreshCw,
  RotateCw,
  Trash2,
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { isSpendingAccount } from "~/lib/account-type";
import { api, type RouterOutputs } from "~/trpc/react";
import { ConnectBankButton } from "./ConnectBankButton";
import { describeProvision } from "./provision-summary";
import { SyncBankAccountDialog } from "./SyncBankAccountDialog";
import { SyncInvestmentDialog } from "./SyncInvestmentDialog";

type Connection = RouterOutputs["bank"]["listConnections"][number];

interface SyncTarget {
  linkId: number;
  accountId: number;
  institution: string;
}

interface InvestmentSyncTarget {
  connectionId: number;
  institution: string;
}

/**
 * Open Finance connections, linking and sync.
 *
 * Rendered only for the configured owner: `bank.isEnabled` is the one bank
 * procedure a non-owner may call, and it answers false for them, so nobody
 * else sees any of this — not even a disabled control.
 */
export function BankConnectionsSection() {
  const { data: enabled } = api.bank.isEnabled.useQuery();
  if (!enabled) return null;
  return <BankConnections />;
}

function BankConnections() {
  const utils = api.useUtils();
  const [syncTarget, setSyncTarget] = useState<SyncTarget | null>(null);
  const [investmentSyncTarget, setInvestmentSyncTarget] =
    useState<InvestmentSyncTarget | null>(null);

  const { data: connections, isLoading } = api.bank.listConnections.useQuery();

  const { mutate: refreshConnections, isPending: isRefreshing } =
    api.bank.refreshConnections.useMutation({
      onSuccess: (result) => {
        void utils.bank.listConnections.invalidate();
        // Wording matters: this re-reads what is already stored, it does not
        // discover connections — the free tier cannot list them.
        toast.success(
          result.length === 0
            ? "Nenhuma conexão cadastrada"
            : `Status atualizado (${result.length})`,
        );
      },
      onError: (error) => toast.error(error.message),
    });

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="form-label">FORM OF-01 · OPEN FINANCE</p>
          <h2 className="display mt-1 text-2xl md:text-3xl">CONEXÕES</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectBankButton />
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshConnections()}
            disabled={isRefreshing}
          >
            <RotateCw className={isRefreshing ? "animate-spin" : undefined} />
            atualizar status
          </Button>
        </div>
      </div>

      {isLoading && (
        <p className="text-muted-foreground font-mono text-xs uppercase">
          Carregando conexões...
        </p>
      )}

      {!isLoading && (!connections || connections.length === 0) && (
        <div className="border-foreground bg-highlight/40 border-2 p-4">
          <p className="text-sm">
            Nenhuma conexão ainda. Conecte seus bancos em{" "}
            <a
              className="font-bold underline underline-offset-4"
              href="https://meu.pluggy.ai"
              target="_blank"
              rel="noreferrer"
            >
              meu.pluggy.ai
            </a>{" "}
            e depois clique em <strong>conectar banco</strong> para autorizar o
            onABudget a ler esses dados.
          </p>
        </div>
      )}

      <div className="grid gap-4">
        {connections?.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            onSync={setSyncTarget}
            onSyncInvestments={setInvestmentSyncTarget}
          />
        ))}
      </div>

      <SyncBankAccountDialog
        linkId={syncTarget?.linkId ?? null}
        accountId={syncTarget?.accountId ?? null}
        institution={syncTarget?.institution ?? ""}
        onOpenChange={(open) => !open && setSyncTarget(null)}
      />
      <SyncInvestmentDialog
        connectionId={investmentSyncTarget?.connectionId ?? null}
        institution={investmentSyncTarget?.institution ?? ""}
        onOpenChange={(open) => !open && setInvestmentSyncTarget(null)}
      />
    </section>
  );
}

function ConnectionCard({
  connection,
  onSync,
  onSyncInvestments,
}: Readonly<{
  connection: Connection;
  onSync: (target: SyncTarget) => void;
  onSyncInvestments: (target: InvestmentSyncTarget) => void;
}>) {
  const utils = api.useUtils();
  const [managing, setManaging] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  const { data: accounts } = api.account.getAll.useQuery();
  const spendingAccounts = accounts?.filter(isSpendingAccount) ?? [];
  const investmentAccounts =
    accounts?.filter((account) => account.accountType === "INVESTMENT") ?? [];

  // Only hits the provider once the user asks to manage links, so opening the
  // page never fans out a request per connection.
  const { data: providerAccounts, isLoading: isLoadingProviderAccounts } =
    api.bank.listProviderAccounts.useQuery(
      { connectionId: connection.id },
      { enabled: managing },
    );

  const { mutate: linkAccount } = api.bank.linkAccount.useMutation({
    onSuccess: () => {
      void utils.bank.listConnections.invalidate();
      void utils.bank.listProviderAccounts.invalidate();
      toast.success("Conta vinculada");
    },
    onError: (error) => toast.error(error.message),
  });

  const { mutate: unlinkAccount } = api.bank.unlinkAccount.useMutation({
    onSuccess: () => {
      void utils.bank.listConnections.invalidate();
      void utils.bank.listProviderAccounts.invalidate();
      toast.success("Vínculo removido");
    },
    onError: (error) => toast.error(error.message),
  });

  const { mutate: setInvestmentAccount, isPending: isSavingInvestmentAccount } =
    api.bank.setInvestmentAccount.useMutation({
      onSuccess: () => {
        void utils.bank.listConnections.invalidate();
        toast.success("Conta de investimento vinculada");
      },
      onError: (error) => toast.error(error.message),
    });

  const { mutate: provisionAccounts, isPending: isProvisioning } =
    api.bank.provisionAccounts.useMutation({
      onSuccess: (result) => {
        void utils.bank.listConnections.invalidate();
        void utils.bank.listProviderAccounts.invalidate();
        void utils.account.getAll.invalidate();
        toast.success(describeProvision(result));
      },
      onError: (error) => toast.error(error.message),
    });

  const { mutate: removeConnection, isPending: isRemoving } =
    api.bank.removeConnection.useMutation({
      onSuccess: () => {
        void utils.bank.listConnections.invalidate();
        setConfirmingRemoval(false);
        toast.success("Conexão removida");
      },
      onError: (error) => toast.error(error.message),
    });

  const { mutate: refreshBalances, isPending: isRefreshingBalances } =
    api.bank.refreshBalances.useMutation({
      onSuccess: (result) => {
        void utils.account.getAll.invalidate();
        toast.success(
          result.updated === 0
            ? "Nenhum saldo para atualizar"
            : `${result.updated} saldo(s) atualizado(s)`,
        );
      },
      onError: (error) => toast.error(error.message),
    });

  const consentExpiresSoon = (() => {
    if (!connection.consentExpiresAt) return false;
    const expiry = new Date(connection.consentExpiresAt).getTime();
    const daysLeft = (expiry - Date.now()) / 86_400_000;
    return daysLeft <= 30;
  })();

  const link = (
    providerAccount: {
      providerAccountId: string;
      type: "BANK" | "CREDIT";
      subtype: string | null;
      name: string;
    },
    accountId: number,
  ) =>
    linkAccount({
      connectionId: connection.id,
      providerAccountId: providerAccount.providerAccountId,
      accountId,
      providerType: providerAccount.type,
      providerSubtype: providerAccount.subtype,
      providerName: providerAccount.name,
    });

  const accountName = (accountId: number) =>
    accounts?.find((account) => account.id === accountId)?.name ??
    `Conta #${accountId}`;

  return (
    <article className="border-foreground border-2 shadow-[6px_6px_0_0_var(--hard)]">
      <AlertDialog open={confirmingRemoval} onOpenChange={setConfirmingRemoval}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remover a conexão {connection.connectorName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              As contas, despesas e investimentos já importados permanecem — só
              o vínculo com o Open Finance é apagado, e novas sincronizações
              deixam de ser possíveis. O consentimento em si continua ativo no
              meu.pluggy.ai até que você o revogue por lá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeConnection({ connectionId: connection.id })}
              disabled={isRemoving}
            >
              {isRemoving ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="strip flex flex-wrap items-center justify-between gap-2">
        <span>{connection.connectorName}</span>
        <span className="font-normal tracking-[0.2em]">
          {connection.status ?? "—"}
        </span>
      </div>

      <div className="bg-card grid gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <p className="form-label">
              ÚLTIMA SINCRONIZAÇÃO ·{" "}
              {connection.lastSyncedAt
                ? new Date(connection.lastSyncedAt).toLocaleString("pt-BR")
                : "NUNCA"}
            </p>
            {connection.consentExpiresAt && (
              <p
                className={
                  consentExpiresSoon
                    ? "bg-highlight border-foreground border-2 px-2 py-1 font-mono text-xs font-bold uppercase"
                    : "form-label"
                }
              >
                CONSENTIMENTO EXPIRA EM{" "}
                {new Date(connection.consentExpiresAt).toLocaleDateString(
                  "pt-BR",
                )}
                {/* An expired consent stops the sync silently — the data just
                    stops arriving — so the last month of it is called out. */}
                {consentExpiresSoon && " · RENOVE EM MEU.PLUGGY.AI"}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshBalances({ connectionId: connection.id })}
              disabled={isRefreshingBalances}
            >
              <RefreshCw
                className={isRefreshingBalances ? "animate-spin" : undefined}
              />
              saldos
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => provisionAccounts({ connectionId: connection.id })}
              disabled={isProvisioning}
            >
              <FolderPlus />
              {isProvisioning ? "criando..." : "criar contas"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManaging((current) => !current)}
            >
              <Link2 />
              {managing ? "ocultar contas" : "vincular contas"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmingRemoval(true)}
              disabled={isRemoving}
            >
              <Trash2 />
              remover
            </Button>
          </div>
        </div>

        <div className="border-foreground flex flex-wrap items-center justify-between gap-3 border-2 border-dashed p-3">
          <div className="grid gap-1">
            <p className="font-mono text-xs font-bold uppercase">
              Investimentos
            </p>
            <p className="form-label">
              Escolha a conta local que receberá os ativos desta conexão
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={connection.investmentAccountId?.toString() ?? "__none__"}
              onValueChange={(value) =>
                setInvestmentAccount({
                  connectionId: connection.id,
                  investmentAccountId:
                    value === "__none__" ? null : Number.parseInt(value),
                })
              }
              disabled={isSavingInvestmentAccount}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Conta de investimento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Não vincular</SelectItem>
                {investmentAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={!connection.investmentAccountId}
              onClick={() =>
                onSyncInvestments({
                  connectionId: connection.id,
                  institution: connection.connectorName,
                })
              }
            >
              <ChartNoAxesCombined />
              sincronizar ativos
            </Button>
          </div>
        </div>

        {/* Already-linked accounts: the everyday path. */}
        {connection.links.length > 0 && (
          <div className="grid gap-2">
            {connection.links.map((link) => (
              <div
                key={link.id}
                className="border-foreground flex flex-wrap items-center justify-between gap-2 border-2 p-3"
              >
                <div className="grid gap-1">
                  <p className="font-mono text-xs font-bold uppercase">
                    {link.providerName ?? "Conta"} →{" "}
                    {accountName(link.accountId)}
                  </p>
                  <p className="form-label">
                    {link.providerType === "CREDIT" ? "CARTÃO" : "CONTA"}
                    {link.lastSyncedAt
                      ? ` · SINCRONIZADA ${new Date(link.lastSyncedAt).toLocaleDateString("pt-BR")}`
                      : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      onSync({
                        linkId: link.id,
                        accountId: link.accountId,
                        institution: connection.connectorName,
                      })
                    }
                  >
                    <RefreshCw />
                    sincronizar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => unlinkAccount({ linkId: link.id })}
                  >
                    <Link2Off className="text-destructive" />
                    <span className="sr-only">Remover vínculo</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Linking panel, opened on demand. */}
        {managing && (
          <div className="border-foreground grid gap-2 border-2 border-dashed p-3">
            {isLoadingProviderAccounts && (
              <p className="text-muted-foreground font-mono text-xs uppercase">
                Buscando contas no banco...
              </p>
            )}

            {providerAccounts?.map((providerAccount) => (
              <div
                key={providerAccount.providerAccountId}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <div className="grid gap-1">
                  <p className="font-mono text-xs font-bold uppercase">
                    {providerAccount.name}
                    {providerAccount.number
                      ? ` ····${providerAccount.number}`
                      : ""}
                  </p>
                  <Badge variant="outline">
                    {providerAccount.type === "CREDIT" ? "cartão" : "conta"}
                  </Badge>
                </div>

                {providerAccount.linkId ? (
                  <p className="form-label">
                    VINCULADA A {accountName(providerAccount.linkedAccountId!)}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* The suggestion is a button, not a pre-selected value:
                        a select that already displays the suggested account
                        fires no change event when it is picked, so the one
                        account the matcher got right would be the one
                        impossible to link. */}
                    {providerAccount.suggestedAccountId !== null && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          link(
                            providerAccount,
                            providerAccount.suggestedAccountId!,
                          )
                        }
                      >
                        <Link2 />
                        vincular a{" "}
                        {accountName(providerAccount.suggestedAccountId)}
                      </Button>
                    )}
                    <Select
                      onValueChange={(value) =>
                        link(providerAccount, Number.parseInt(value))
                      }
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Vincular a..." />
                      </SelectTrigger>
                      <SelectContent>
                        {spendingAccounts.map((account) => (
                          <SelectItem
                            key={account.id}
                            value={account.id.toString()}
                          >
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}

            {providerAccounts?.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Essa conexão não retornou contas.
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
