"use client";

import { FileUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Input } from "~/components/ui/input";
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    try {
      const parsed = parseB3Workbook(await file.arrayBuffer());
      if (parsed.rows.length === 0) {
        toast.error(
          parsed.reportType === "movimentacao"
            ? "Nenhum provento (rendimento, dividendo ou JCP) encontrado no arquivo"
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
            Baixe o relatório de Negociação (compras e vendas) ou de
            Movimentação (proventos) na Área do Investidor da B3 e envie o
            arquivo .xlsx aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="b3File">Arquivo (.xlsx) *</Label>
            <Input
              id="b3File"
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
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
                    Tipo de ativo para novos códigos:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {unknownTickers.map((ticker) => (
                      <div key={ticker} className="flex items-center gap-2">
                        <span className="w-20 text-sm font-medium">{ticker}</span>
                        <Select
                          value={assetTypeByTicker[ticker] ?? ""}
                          onValueChange={(value) =>
                            setAssetTypeByTicker((current) => ({
                              ...current,
                              [ticker]: value,
                            }))
                          }
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Tipo" />
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
