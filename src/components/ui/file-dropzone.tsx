"use client";

import { FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

interface FileDropzoneProps {
  id: string;
  /** `accept` attribute for the underlying file input, e.g. ".ofx,.csv". */
  accept: string;
  /** Name of the currently selected file, or null to show the drop target. */
  fileName: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
  /** Small caption inside the drop target describing the expected file. */
  hint?: string;
}

/**
 * Click-or-drag file picker: a dashed drop target that swaps for a compact
 * chip once a file is chosen. Shared by the B3 and bank-statement importers.
 */
export function FileDropzone({
  id,
  accept,
  fileName,
  onFile,
  onClear,
  hint,
}: Readonly<FileDropzoneProps>) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (fileName) {
    return (
      <div className="border-foreground bg-muted flex items-center gap-3 border-2 p-3">
        <FileSpreadsheet className="text-primary h-5 w-5 shrink-0" />
        <span className="flex-1 truncate text-sm font-medium">{fileName}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <X className="mr-1 h-4 w-4" />
          Trocar
        </Button>
      </div>
    );
  }

  return (
    <>
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear immediately so picking the same file twice still fires.
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 border-2 border-dashed p-8 text-center font-mono text-xs uppercase transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-foreground hover:bg-muted",
        )}
      >
        <UploadCloud className="text-muted-foreground h-8 w-8" />
        <p className="text-sm">
          <span className="text-foreground font-medium">
            Clique para selecionar
          </span>{" "}
          <span className="text-muted-foreground">
            ou arraste o arquivo aqui
          </span>
        </p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </button>
    </>
  );
}
