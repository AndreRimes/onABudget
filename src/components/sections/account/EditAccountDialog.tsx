"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { Account } from "~/app/dashboard/accounts/page"
import { api } from "~/trpc/react"



interface EditAccountDialogProps {
  account: Account | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditAccountDialog({ account, open, onOpenChange }: EditAccountDialogProps) {
  const [accountType, setAccountType] = useState<"CHECKING" | "INVESTMENT">("CHECKING")
  const [balance, setBalance] = useState("")
  const [name, setName] = useState("")
  const utils = api.useUtils()

  const {mutate, isPending} = api.account.update.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      utils.account.getAll.invalidate();
    },
    onError: (error) => {
      toast.error("Error updating account: " + error.message);
    }
  })

  useEffect(() => {
    if (account) {
      setAccountType(account.accountType)
      setBalance(account.balance.toString())
    }
  }, [account])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account) return
    mutate({
      id: account.id,
      accountType,
      balance: parseFloat(balance),
      name,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
          <DialogDescription>Update account details for Account #{account?.id}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-accountType">Account Type</Label>
              <Select value={accountType} onValueChange={(v) => setAccountType(v as "CHECKING" | "INVESTMENT")}>
                <SelectTrigger id="edit-accountType">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHECKING">Checking</SelectItem>
                  <SelectItem value="INVESTMENT">Investment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-accountName">Account Name</Label>
              <Input
                id="edit-accountName"
                type="text"
                placeholder="Account Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-balance">Balance</Label>
              <Input
                id="edit-balance"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
