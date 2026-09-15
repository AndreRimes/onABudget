"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { BankConnectionsSection } from "~/components/sections/bank/BankConnectionsSection";
import { CreateAccountDialog } from "~/components/sections/account/CreateAccountDialog";
import { DeleteAccountDialog } from "~/components/sections/account/DeleteAccount";
import { EditAccountDialog } from "~/components/sections/account/EditAccountDialog";
import { type accounts } from "~/server/db/schema";
import { ACCOUNT_TYPE_LABELS } from "~/lib/account-type";
import { api } from "~/trpc/react";

export type Account = typeof accounts.$inferSelect;

export default function AccountsPage() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="form-label">FORM AC-01 · CONTAS CADASTRADAS</p>
          <h1 className="display mt-1">CONTAS</h1>
        </div>
        <CreateAccountDialog />
      </div>
      <AccountsTable />
      {/* Renders nothing unless the caller is the configured Open Finance owner. */}
      <BankConnectionsSection />
    </div>
  );
}

function AccountsTable() {
  const { data: accounts, isLoading, error } = api.account.getAll.useQuery();
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">Carregando contas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-destructive">Falha ao carregar as contas</p>
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="flex items-center justify-center border-2 py-8">
        <p className="text-muted-foreground">
          Nenhuma conta cadastrada. Crie a primeira!
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium">{account.id}</TableCell>
                <TableCell>{account.name}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      account.accountType === "INVESTMENT"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {ACCOUNT_TYPE_LABELS[account.accountType]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {account.balance.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {account.createdAt
                    ? new Date(account.createdAt).toLocaleDateString("pt-BR")
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditAccount(account)}
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Editar conta</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteAccount(account)}
                    >
                      <Trash2 className="text-destructive h-4 w-4" />
                      <span className="sr-only">Excluir conta</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <EditAccountDialog
        account={editAccount}
        open={!!editAccount}
        onOpenChange={(open) => !open && setEditAccount(null)}
      />

      <DeleteAccountDialog
        account={deleteAccount}
        open={!!deleteAccount}
        onOpenChange={(open) => !open && setDeleteAccount(null)}
      />
    </>
  );
}
