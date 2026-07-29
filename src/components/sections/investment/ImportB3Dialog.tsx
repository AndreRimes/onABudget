"use client";

import { FileSpreadsheet, FileUp, UploadCloud, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
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
import { api, type RouterOutputs } from "~/trpc/react";
import { parseB3Workbook, type ParsedB3Row } from "./b3-parser";
import { formatCurrency } from "./format";

type PreviewResult = RouterOutputs["investments"]["importB3Preview"];

const incomeTypeLabels = {
  RENDIMENTO: "Rendimento",
  DIVIDEND: "Dividendo",
  JCP: "JCP",
} as const;

const institutionLabel = (institution: string) =>
  institution || "(Sem instituição)";

export function ImportB3Dialog() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [ignoredRows, setIgnoredRows] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [assetTypeByTicker, setAssetTypeByTicker] = useState<
    Record<string, string>
  >({});
  // Maps a B3 "Instituição" string to the chosen account id (as string).
  const [accountByInstitution, setAccountByInstitution] = useState<
    Record<string, string>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = api.useUtils();
  const { data: accounts } = api.account.getAll.useQuery();
  const { data: assetTypes } = api.assetTypes.getAll.useQuery();
  const investmentAccounts =
    accounts?.filter((account) => account.accountType === "INVESTMENT") ?? [];

  const { mutate: previewRows, isPending: isPreviewing } =
    api.investments.importB3Preview.useMutation({
      onSuccess: (result) => {
        setPreview(result);
        // Pre-fill the account for each institution from the server's match.
        setAccountByInstitution(
          Object.fromEntries(
            result.institutions.map((entry) => [
              entry.institution,
              entry.suggestedAccountId != null
                ? entry.suggestedAccountId.toString()
                : "",
            ]),
          ),
        );
      },
      onError: (error) =>
        toast.error("Erro ao analisar arquivo: " + error.message),
    });

  const { mutate: importRows, isPending: isImporting } =
    api.investments.importB3.useMutation({
      onSuccess: (result) => {
        void utils.investments.getPortfolioSnapshot.invalidate();
        void utils.investments.getAllFromUser.invalidate();
        void utils.dividends.getAllFromUser.invalidate();
        toast.success(
          `Importação concluída: ${result.inserted} registros novos, ${result.skipped} ignorados`,
        );
        resetState();
        setOpen(false);
      },
      onError: (error) => toast.error("Erro ao importar: " + error.message),
    });

  const resetState = () => {
    setPreview(null);
    setIgnoredRows(0);
    setAssetTypeByTicker({});
    setAccountByInstitution({});
    setFileName(null);
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const parsed = parseB3Workbook(await file.arrayBuffer());
      if (parsed.rows.length === 0) {
        toast.error(
          parsed.reportType === "movimentacao"
            ? "Nenhum provento ou aplicação de renda fixa/tesouro encontrado no arquivo"
            : "Nenhuma negociação encontrada no arquivo",
        );
        return;
      }
      setIgnoredRows(parsed.ignoredRows);
      previewRows({ rows: parsed.rows });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const newRows = useMemo(
    () => preview?.rows.filter((entry) => entry.status === "new") ?? [],
    [preview],
  );
  const unknownTickers = useMemo(() => {
    const tickers = new Set<string>();
    for (const entry of newRows) {
      if (entry.row.kind === "trade" && !entry.knownTicker) {
        tickers.add(entry.row.ticker);
      }
    }
    return [...tickers].sort();
  }, [newRows]);

  // Only institutions that actually have new rows still need assigning.
  const institutionsToAssign = useMemo(() => {
    const present = new Set(newRows.map((entry) => entry.row.institution));
    return (preview?.institutions ?? []).filter((entry) =>
      present.has(entry.institution),
    );
  }, [preview, newRows]);

  const missingTypeCount = unknownTickers.filter(
    (ticker) => !assetTypeByTicker[ticker],
  ).length;
  const missingAccountCount = institutionsToAssign.filter(
    (entry) => !accountByInstitution[entry.institution],
  ).length;

  const handleImport = () => {
    if (missingAccountCount > 0) {
      toast.error("Defina a conta para todas as instituições");
      return;
    }
    if (missingTypeCount > 0) {
      toast.error("Defina o tipo de ativo para todos os novos códigos");
      return;
    }
    importRows({
      accountByInstitution: Object.fromEntries(
        Object.entries(accountByInstitution)
          .filter(([, accountId]) => accountId)
          .map(([institution, accountId]) => [institution, parseInt(accountId)]),
      ),
      assetTypeByTicker: Object.fromEntries(
        Object.entries(assetTypeByTicker).map(([ticker, typeId]) => [
          ticker,
          parseInt(typeId),
        ]),
      ),
      rows: newRows.map((entry) => entry.row as ParsedB3Row),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileUp className="mr-2 h-4 w-4" />
          Importar B3
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar relatório da B3</DialogTitle>
          <DialogDescription>
            Baixe o relatório de Negociação (compras e vendas de renda variável)
            ou de Movimentação (proventos e aplicações em renda fixa e tesouro
            direto) na Área do Investidor da B3 e envie o arquivo .xlsx aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="b3File">Arquivo (.xlsx) *</Label>
            <input
              id="b3File"
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            {fileName ? (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" />
                <span className="flex-1 truncate text-sm font-medium">
                  {fileName}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetState();
                  }}
                >
                  <X className="mr-1 h-4 w-4" />
                  Trocar
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleFile(file);
                }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30",
                )}
              >
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm">
                  <span className="font-medium text-foreground">
                    Clique para selecionar
                  </span>{" "}
                  <span className="text-muted-foreground">
                    ou arraste o arquivo aqui
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Relatório .xlsx da Área do Investidor da B3
                </p>
              </button>
            )}
          </div>

          {isPreviewing && (
            <p className="text-sm text-muted-foreground">Analisando arquivo...</p>
          )}

          {preview && (
            <>
              <p className="text-sm text-muted-foreground">
                {newRows.length} registro{newRows.length !== 1 ? "s" : ""} novo
                {newRows.length !== 1 ? "s" : ""},{" "}
                {preview.rows.length - newRows.length} duplicado
                {preview.rows.length - newRows.length !== 1 ? "s" : ""}
                {ignoredRows > 0 && `, ${ignoredRows} linhas ignoradas`}
              </p>

              {institutionsToAssign.length > 0 && (
                <div className="grid gap-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    Conta por instituição{" "}
                    <span className="font-normal text-muted-foreground">
                      (atribuída automaticamente — ajuste se necessário)
                    </span>
                  </p>
                  <div className="grid gap-3">
                    {institutionsToAssign.map((entry) => (
                      <div
                        key={entry.institution}
                        className="flex items-center gap-2"
                      >
                        <span className="flex-1 truncate text-sm font-medium">
                          {institutionLabel(entry.institution)}
                        </span>
                        <Select
                          value={accountByInstitution[entry.institution] ?? ""}
                          onValueChange={(value) =>
                            setAccountByInstitution((current) => ({
                              ...current,
                              [entry.institution]: value,
                            }))
                          }
                        >
                          <SelectTrigger className="w-56">
                            <SelectValue placeholder="Selecione a conta" />
                          </SelectTrigger>
                          <SelectContent>
                            {investmentAccounts.map((account) => (
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
                    ))}
                  </div>
                </div>
              )}

              {unknownTickers.length > 0 && (
                <div className="grid gap-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    Tipo de ativo para novos códigos{" "}
                    <span className="font-normal text-muted-foreground">
                      (defina o tipo de cada código novo)
                    </span>
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {unknownTickers.map((ticker) => (
                      <div
                        key={ticker}
                        className="grid gap-1.5 rounded-md border bg-muted/30 p-2"
                      >
                        <span
                          className="truncate text-sm font-medium"
                          title={ticker}
                        >
                          {ticker}
                        </span>
                        <Select
                          value={assetTypeByTicker[ticker] ?? ""}
                          onValueChange={(value) =>
                            setAssetTypeByTicker((current) => ({
                              ...current,
                              [ticker]: value,
                            }))
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              "w-full",
                              !assetTypeByTicker[ticker] &&
                                "border-amber-500/60",
                            )}
                          >
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            {assetTypes?.map((type) => (
                              <SelectItem
                                key={type.id}
                                value={type.id.toString()}
                              >
                                {type.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="max-h-72 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Ativo</TableHead>
                      <TableHead>Operação</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((entry, index) => (
                      <TableRow key={index}>
                        <TableCell>{entry.row.date}</TableCell>
                        <TableCell className="font-medium">
                          {entry.row.ticker}
                        </TableCell>
                        <TableCell>
                          {entry.row.kind === "trade"
                            ? `${entry.row.side === "BUY" ? "Compra" : "Venda"} de ${entry.row.quantity}`
                            : incomeTypeLabels[entry.row.type]}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(entry.row.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={
                              entry.status === "new" ? "default" : "secondary"
                            }
                            className="text-xs"
                          >
                            {entry.status === "new" ? "Novo" : "Duplicado"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={
              !preview || newRows.length === 0 || isImporting || isPreviewing
            }
            onClick={handleImport}
          >
            {isImporting
              ? "Importando..."
              : `Importar ${newRows.length} registro${newRows.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
