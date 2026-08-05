"use client";

import { CreditCard } from "lucide-react";
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
import { Textarea } from "~/components/ui/textarea";
import {
  useControllableOpen,
  type ControllableOpenProps,
} from "~/lib/use-controllable-open";
import { StatementPreviewPanel } from "./StatementPreviewPanel";
import { parseFaturaText, type FaturaParseResult } from "./fatura-parser";
import type { ParsedStatementRow } from "./statement-row";

interface Parsed {
  rows: ParsedStatementRow[];
  ignoredRows: number;
  unparsedSamples: string[];
  referenceMonth: string | null;
}

export function ImportFaturaDialog(props: ControllableOpenProps = {}) {
  const { isControlled, open, setOpen } = useControllableOpen(props);
  const [pastedText, setPastedText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isReadingPdf, setIsReadingPdf] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  // Bumped on every new parse so the preview panel remounts and re-runs.
  const [runId, setRunId] = useState(0);

  const resetState = () => {
    setPastedText("");
    setFileName(null);
    setIsReadingPdf(false);
    setParsed(null);
  };

  const accept = (result: FaturaParseResult) => {
    if (result.rows.length === 0) {
      toast.error(
        "Nenhum lançamento reconhecido. Confira se o texto colado contém as linhas de compra da fatura.",
      );
      return;
    }
    setParsed(result);
    setRunId((current) => current + 1);
  };

  const handlePdf = async (file: File) => {
    setFileName(file.name);
    setIsReadingPdf(true);
    try {
      const { extractPdfText } = await import("./pdf-text");
      const text = await extractPdfText(await file.arrayBuffer());
      setPastedText(text);
      accept(parseFaturaText(text));
    } catch (error) {
      toast.error(
        "Não consegui ler esse PDF: " +
          (error instanceof Error ? error.message : String(error)) +
          ". Tente copiar o texto da fatura e colar abaixo.",
      );
    } finally {
      setIsReadingPdf(false);
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
            <CreditCard className="mr-2 h-4 w-4" />
            Importar fatura
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar fatura do cartão</DialogTitle>
          <DialogDescription>
            O Inter só disponibiliza a fatura em PDF para pessoa física. Envie o
            PDF aqui, ou abra a fatura, copie o texto e cole abaixo. As compras
            viram despesas na conta do cartão; estornos e o pagamento da fatura
            são ignorados.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="faturaPdf">Arquivo (.pdf)</Label>
            <FileDropzone
              id="faturaPdf"
              accept=".pdf"
              fileName={fileName}
              onFile={(file) => void handlePdf(file)}
              onClear={resetState}
              hint="PDF da fatura baixado no app do Inter"
            />
          </div>

          {isReadingPdf && (
            <p className="text-sm text-muted-foreground">Lendo o PDF...</p>
          )}

          <div className="grid gap-2">
            <Label htmlFor="faturaText">
              ...ou cole o texto da fatura aqui
            </Label>
            <Textarea
              id="faturaText"
              rows={6}
              placeholder={"03 jul   IFOOD *RESTAURANTE      R$ 45,90\n05 jul   NETFLIX.COM 03/12       R$ 55,90"}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              disabled={!pastedText.trim()}
              onClick={() => accept(parseFaturaText(pastedText))}
            >
              Ler lançamentos
            </Button>
          </div>

          {parsed && (
            <>
              {parsed.referenceMonth && (
                <p className="text-xs text-muted-foreground">
                  Fatura reconhecida como referente a {parsed.referenceMonth}.
                  Compras de meses anteriores mantêm a data original.
                </p>
              )}

              {parsed.unparsedSamples.length > 0 && (
                <div className="grid gap-1 rounded-lg border border-amber-500/40 p-3">
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
                    {parsed.unparsedSamples.length} linha
                    {parsed.unparsedSamples.length !== 1 ? "s" : ""} não
                    reconhecida
                    {parsed.unparsedSamples.length !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Se alguma delas for uma compra, me avise para ajustar o
                    leitor:
                  </p>
                  <ul className="font-mono text-xs text-muted-foreground">
                    {parsed.unparsedSamples.map((sample, index) => (
                      <li key={index} className="truncate">
                        {sample}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <StatementPreviewPanel
                key={runId}
                rows={parsed.rows}
                parserIgnoredCount={parsed.ignoredRows}
                onImported={() => {
                  resetState();
                  setOpen(false);
                }}
                onCancel={() => setOpen(false)}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
