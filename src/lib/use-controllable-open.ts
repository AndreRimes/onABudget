"use client";

import { useState } from "react";

export interface ControllableOpenProps {
  /** Omit to let the component own its state and render its own trigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Lets a dialog be either self-contained (own state + own trigger button) or
 * driven by a parent. Needed to open a dialog from a dropdown-menu item: the
 * menu unmounts on select, so a trigger nested inside it would take the dialog
 * down with it. `isControlled` tells the component to skip its own trigger.
 */
export function useControllableOpen({
  open,
  onOpenChange,
}: ControllableOpenProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = open !== undefined;

  return {
    isControlled,
    open: isControlled ? open : uncontrolledOpen,
    setOpen: (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
  };
}
