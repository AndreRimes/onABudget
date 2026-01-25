"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { CreateAccountDialog } from "~/components/sections/account/CreateAccountDialog"
import { DeleteAccountDialog } from "~/components/sections/account/DeleteAccount"
import { EditAccountDialog } from "~/components/sections/account/EditAccountDialog"
import { accounts } from "~/server/db/schema"
import { api } from "~/trpc/react"

export type Account = typeof accounts.$inferSelect


export default function AccountsPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Accounts</h1>
        <CreateAccountDialog />
      </div>
      <AccountsTable />
    </div>
  )
}


export function AccountsTable() {
  const { data: accounts, isLoading, error } = api.account.getAll.useQuery();
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">Loading accounts...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-destructive">Failed to load accounts</p>
      </div>
    )
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 border rounded-lg">
        <p className="text-muted-foreground">No accounts found. Create your first account!</p>
      </div>
    )
  }

  return (
    <>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium">{account.id}</TableCell>
                <TableCell>{account.name}</TableCell>
                <TableCell>
                  <Badge variant={account.accountType === "CHECKING" ? "outline" : "secondary"}>
                    {account.accountType}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  ${account.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {account.createdAt ? new Date(account.createdAt).toLocaleDateString() : 'N/A'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setEditAccount(account)}>
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Edit account</span>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteAccount(account)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                      <span className="sr-only">Delete account</span>
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
  )
}
