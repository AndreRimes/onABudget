"use client";

import { FileUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { FileDropzone } from "~/components/ui/file-dropzone";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  useControllableOpen,
  type ControllableOpenProps,
} from "~/lib/use-controllable-open";
import { cn } from "~/lib/utils";
import { StatementPreviewPanel } from "./StatementPreviewPanel";
import { parseOfx } from "./ofx-parser";
import {
  parseStatementSpreadsheet,
  type ColumnMapping,
} from "./statement-parser";
import type { StatementParseResult } from "./statement-row";

/** Held while the user maps columns of a spreadsheet we couldn't auto-read. */
interface PendingMapping {

  buffer: ArrayBuffer;
  headers: string[];
  sampleRows: string[][];
}

export function ImportStatementDialog(props: ControllableOpenProps = {}) {
  const { isControlled, open, setOpen } = useControllableOpen(props);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<StatementParseResult | null>(null);
  const [pendingMapping, setPendingMapping] = useState<PendingMapping | null>(
    null,
  );
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  // Bumped on every new parse so the preview panel remounts and re-runs.
  const [runId, setRunId] = useState(0);

  const resetState = () => {
    setFileName(null);
    setParsed(null);
    setPendingMapping(null);
    setMapping({});
  };

  const accept = (result: StatementParseResult, emptyMessage: string) => {
    if (result.rows.length === 0) {
      toast.error(emptyMessage);
      return;
    }
    setParsed(result);
    setRunId((current) => current + 1);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setPendingMapping(null);
    setMapping({});
    try {
      const buffer = await file.arrayBuffer();
      if (file.name.toLowerCase().endsWith(".ofx")) {
        accept(parseOfx(buffer), "Nenhuma transação encontrada.");
        return;
      }
      const result = parseStatementSpreadsheet(buffer);
      if (result.status === "needs-mapping") {
        setPendingMapping({
          buffer,
          headers: result.headers,
          sampleRows: result.sampleRows,
        });
        return;
      }
      accept(result.result, "Nenhum lançamento encontrado na planilha.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const applyMapping = () => {
    if (
      !pendingMapping ||
      !mapping.date ||
      !mapping.amount ||
      !mapping.description
    ) {
      toast.error("Selecione as colunas de data, valor e descrição");
      return;
    }
    try {
      const result = parseStatementSpreadsheet(pendingMapping.buffer, {
        date: mapping.date,
        amount: mapping.amount,
        description: mapping.description,
      });
      if (result.status === "needs-mapping") {
        toast.error("Não foi possível ler a planilha com essas colunas");
        return;
      }
      setPendingMapping(null);
      accept(result.result, "Nenhum lançamento encontrado na planilha.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetState();
      }}
    >
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <FileUp className="mr-2 h-4 w-4" />
            Importar extrato
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar extrato bancário</DialogTitle>
          <DialogDescription>
            No Banco Inter: Internet Banking &gt; Conta Digital &gt; Extrato &gt;
            escolha o período &gt; Exportar &gt; OFX. Planilhas .csv e .xlsx de
            outros bancos também funcionam. Só as saídas viram despesas — as
            entradas são ignoradas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="statementFile">Arquivo (.ofx, .csv, .xlsx) *</Label>
            <FileDropzone
              id="statementFile"
              accept=".ofx,.csv,.xlsx,.xls"
              fileName={fileName}
              onFile={(file) => void handleFile(file)}
              onClear={resetState}
              hint="Extrato em OFX do seu banco, ou planilha CSV/Excel"
            />
          </div>

          {pendingMapping && (
            <div className="grid gap-3 rounded-lg border p-3">
              <p className="text-sm font-medium">
                Não reconhecemos as colunas{" "}
                <span className="font-normal text-muted-foreground">
                  (indique quais usar)
                </span>
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["date", "Data"],
                    ["amount", "Valor"],
                    ["description", "Descrição"],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="grid gap-1.5">
                    <Label>{label}</Label>
                    <Select
                      value={mapping[field] ?? ""}
                      onValueChange={(value) =>
                        setMapping((current) => ({ ...current, [field]: value }))
                      }
                    >
                      <SelectTrigger
                        className={cn(
                          "w-full",
                          !mapping[field] && "border-amber-500/60",
                        )}
                      >
                        <SelectValue placeholder="Selecione a coluna" />
                      </SelectTrigger>
                      <SelectContent>
                        {pendingMapping.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="max-h-40 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {pendingMapping.headers.map((header) => (
                        <TableHead key={header}>{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingMapping.sampleRows.map((row, index) => (
                      <TableRow key={index}>
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex}>{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button type="button" onClick={applyMapping} className="justify-self-start">
                Usar estas colunas
              </Button>
            </div>
          )}

          {parsed && (
            <StatementPreviewPanel
              key={runId}
              rows={parsed.rows}
              parserIgnoredCount={parsed.ignoredRows}
              institution={parsed.institution}
              onImported={() => {
                resetState();
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
