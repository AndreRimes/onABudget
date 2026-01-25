"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import type { Account } from "~/app/dashboard/accounts/page"
import { api } from "~/trpc/react"


interface DeleteAccountDialogProps {
  account: Account | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteAccountDialog({ account, open, onOpenChange }: DeleteAccountDialogProps) {
    const utils = api.useUtils()
    const { mutate, isPending} = api.account.delete.useMutation({
        onSuccess: () => {
            onOpenChange(false);
            utils.account.getAll.invalidate();
        },
        onError: (error) => {
            toast.error("Error deleting account: " + error.message);
        }
    })


  const handleDelete = async () => {
    if (!account) return
    mutate({ id: account.id }); 
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Account</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete Account #{account?.id}? This action cannot be undone and all associated data
            will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
