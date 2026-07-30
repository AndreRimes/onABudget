// Helpers for the masked DD/MM/YYYY text inputs the dialogs use in place of a
// date picker. Previously copy-pasted into each dialog; shared here so the
// create and edit forms can't drift apart on date parsing.

/** Progressively masks raw typing into DD/MM/YYYY. */
export function formatDateInput(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

/** DD/MM/YYYY -> YYYY-MM-DD, or "" when incomplete. */
export function parseDisplayDate(displayDate: string): string {
  if (displayDate?.length !== 10) return "";
  const parts = displayDate.split("/");
  if (parts.length !== 3) return "";
  const [day, month, year] = parts;
  return `${year}-${month}-${day}`;
}

/** YYYY-MM-DD -> DD/MM/YYYY, for loading a stored date back into the mask. */
export function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

export function todayDisplayDate(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${now.getFullYear()}`;
}
