"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { formatCurrency } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";
import { invalidatePortfolio } from "~/trpc/invalidate";

type FetchResult = RouterOutputs["bank"]["fetchInvestmentTransactions"];
type PreviewResult = RouterOutputs["bank"]["previewInvestmentTransactions"];

/**
 * Sentinel select value meaning "use the type Pluggy classified this asset as",
 * creating it locally on confirmation if it does not exist yet.
 */
const PLUGGY_TYPE_VALUE = "__pluggy__";

interface SyncInvestmentDialogProps {
  connectionId: number | null;
  institution: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Investment sync mirrors the statement importer: Pluggy data is fetched,
 * inspected and deduplicated first; the ledger changes only on confirmation.
 */
/** Quotas run to six decimals; trailing zeros just add noise. */
function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 6,
  }).format(value);
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

function shortfallHint(shortfalls: FetchResult["shortfalls"]): string {
  if (shortfalls.every((shortfall) => shortfall.offered)) {
    return "As cotas que faltam podem entrar como posição inicial na caixa abaixo, pelo valor de aplicação que a instituição informou.";
  }
  if (shortfalls.some((shortfall) => shortfall.offered)) {
    return "Parte delas pode entrar como posição inicial na caixa abaixo; o restante, cuja aplicação a instituição não informa, precisa ser lançado à mão.";
  }
  return "A instituição não informa o valor aplicado nesses ativos, então as compras anteriores ao histórico precisam ser lançadas à mão.";
}

/**
 * The connector serves a fixed window of history. A holding bought before it
 * starts returns only its recent movements, so the imported position is a
 * fraction of the real one — worth saying plainly, since the numbers
 * otherwise look ordinary.
 */
function ShortfallNotice({
  shortfalls,
}: {
  shortfalls: FetchResult["shortfalls"];
}) {
  if (shortfalls.length === 0) return null;
  return (
    <div className="border-destructive text-destructive border-2 p-3 text-sm">
      <p className="font-medium">
        {shortfalls.length === 1
          ? "1 ativo tem posição maior do que o histórico disponível explica:"
          : `${shortfalls.length} ativos têm posição maior do que o histórico disponível explica:`}
      </p>
      {/* Capped: this list runs to a line per holding, and a long one would
          push the import controls off the dialog. */}
      <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto">
        {shortfalls.map((shortfall) => (
          <li key={shortfall.investmentId}>
            {shortfall.assetLabel ?? shortfall.assetName}: o banco informa{" "}
            {formatQuantity(shortfall.reported)} cotas, o histórico cobre{" "}
            {formatQuantity(shortfall.covered)} — faltam{" "}
            {formatQuantity(shortfall.missing)}.
          </li>
        ))}
      </ul>
      <p className="mt-2">{shortfallHint(shortfalls)}</p>
    </div>
  );
}

/**
 * A dropped movement means the imported position is smaller than the one the
 * bank holds, which otherwise shows up only as a quantity that looks
 * inexplicably low.
 */
function DroppedNotice({ fetched }: { fetched: FetchResult }) {
  const { droppedWithoutQuantity, droppedUnusable } = fetched;
  if (droppedWithoutQuantity <= 0 && droppedUnusable <= 0) return null;
  return (
    <p className="text-destructive text-sm">
      {droppedWithoutQuantity > 0 &&
        `${droppedWithoutQuantity} ${plural(
          droppedWithoutQuantity,
          "movimentação veio sem quantidade nem valor de cota e ficou de fora",
          "movimentações vieram sem quantidade nem valor de cota e ficaram de fora",
        )}. `}
      {droppedUnusable > 0 &&
        `${droppedUnusable} ${plural(
          droppedUnusable,
          "movimentação veio sem data ou valor utilizável e ficou de fora",
          "movimentações vieram sem data ou valor utilizável e ficaram de fora",
        )}. `}
      A quantidade desses ativos fica menor que a posição real do banco.
    </p>
  );
}

function FetchSummary({
  fetched,
  newRowCount,
}: {
  fetched: FetchResult;
  newRowCount: number;
}) {
  return (
    <>
      <p className="text-muted-foreground text-sm">
        {newRowCount}{" "}
        {plural(newRowCount, "movimentação nova", "movimentações novas")} de{" "}
        {fetched.holdings} ativo{fetched.holdings !== 1 ? "s" : ""}.
        {fetched.holdingsWithoutCostBasis > 0 &&
          ` ${fetched.holdingsWithoutCostBasis} ativo${fetched.holdingsWithoutCostBasis !== 1 ? "s" : ""} sem histórico e sem valor de aplicação não pôde ser importado.`}
        {fetched.unsupported > 0 &&
          ` ${fetched.unsupported} ${plural(fetched.unsupported, "movimentação sem suporte foi ignorada", "movimentações sem suporte foram ignoradas")}.`}
      </p>
      <ShortfallNotice shortfalls={fetched.shortfalls} />
      <DroppedNotice fetched={fetched} />
    </>
  );
}

type PreviewEntry = PreviewResult[number];

function rowKindLabel(row: PreviewEntry["row"]): string {
  if (row.kind === "position") return "Posição inicial";
  if (row.kind === "income") return "Rendimento";
  return row.side === "BUY" ? "Compra" : "Venda";
}

function statusLabel(entry: PreviewEntry): string {
  if (entry.status === "new") return "Novo";
  return entry.importedElsewhere ? "Já importado da B3" : "Duplicado";
}

function PreviewTable({ rows }: { rows: PreviewEntry[] }) {
  return (
    <div className="max-h-80 overflow-y-auto border-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Ativo</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((entry) => (
            <TableRow key={entry.hash}>
              <TableCell>
                {new Date(`${entry.row.date}T12:00:00`).toLocaleDateString(
                  "pt-BR",
                )}
              </TableCell>
              <TableCell>
                {/* Readable name when the provider sent one; the code below
                    it is what the ledger keys the asset by. */}
                {entry.row.assetLabel ? (
                  <span className="flex flex-col">
                    <span>{entry.row.assetLabel}</span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {entry.row.assetName}
                    </span>
                  </span>
                ) : (
                  entry.row.assetName
                )}
              </TableCell>
              <TableCell>{rowKindLabel(entry.row)}</TableCell>
              <TableCell className="text-right">
                {formatCurrency(entry.row.amount)}
              </TableCell>
              <TableCell className="text-right">
                <Badge
                  variant={entry.status === "new" ? "default" : "secondary"}
                >
                  {statusLabel(entry)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SyncInvestmentDialog({
  connectionId,
  institution,
  onOpenChange,
}: SyncInvestmentDialogProps) {
  const utils = api.useUtils();
  const [fetched, setFetched] = useState<FetchResult | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [assetTypeByAsset, setAssetTypeByAsset] = useState<
    Record<string, string>
  >({});
  // Opening positions are off by default: they are a snapshot of a holding
  // rather than its history, so they should be a deliberate choice.
  const [includePositions, setIncludePositions] = useState(false);
  const requested = useRef<number | null>(null);
  const { data: assetTypes } = api.assetTypes.getAll.useQuery();

  const { mutate: previewRows, isPending: isPreviewing } =
    api.bank.previewInvestmentTransactions.useMutation({
      onSuccess: (result) => {
        setPreview(result);
        // History first (the user already typed this asset once), then the
        // local type Pluggy's classification maps onto, then Pluggy's label as
        // a type to be created. Anything else is left for the user to answer.
        setAssetTypeByAsset(
          Object.fromEntries(
            result
              .filter(
                (entry) =>
                  entry.status === "new" && entry.row.kind !== "income",
              )
              .map((entry) => [
                entry.row.assetName,
                entry.knownAssetTypeId?.toString() ??
                  entry.providerAssetTypeId?.toString() ??
                  (entry.providerAssetType ? PLUGGY_TYPE_VALUE : ""),
              ]),
          ),
        );
      },
      onError: (error) =>
        toast.error("Erro ao analisar investimentos: " + error.message),
    });

  const { mutate: fetchRows, isPending: isFetching } =
    api.bank.fetchInvestmentTransactions.useMutation({
      onSuccess: (result) => {
        setFetched(result);
        previewRows({ rows: [...result.rows, ...result.positions] });
      },
      onError: (error) =>
        toast.error("Erro ao sincronizar investimentos: " + error.message),
    });

  const { mutate: importRows, isPending: isImporting } =
    api.bank.importInvestmentTransactions.useMutation({
      onSuccess: (result) => {
        void utils.investments.getAllFromUser.invalidate();
        void invalidatePortfolio(utils);
        void utils.dividends.getAllFromUser.invalidate();
        toast.success(
          `Importação concluída: ${result.inserted} registro${result.inserted !== 1 ? "s" : ""} novo${result.inserted !== 1 ? "s" : ""}, ${result.skipped} ignorado${result.skipped !== 1 ? "s" : ""}`,
        );
        onOpenChange(false);
      },
      onError: (error) => toast.error("Erro ao importar: " + error.message),
    });

  useEffect(() => {
    if (connectionId == null) {
      requested.current = null;
      setFetched(null);
      setPreview(null);
      setAssetTypeByAsset({});
      setIncludePositions(false);
      return;
    }
    if (requested.current === connectionId) return;
    requested.current = connectionId;
    fetchRows({ connectionId });
  }, [connectionId, fetchRows]);

  // Everything the confirm button would write: movements always, opening
  // positions only while the box is ticked. Every count below is derived from
  // this, so what the dialog says and what it imports cannot disagree.
  const selectedRows = useMemo(
    () =>
      preview?.filter(
        (entry) => includePositions || entry.row.kind !== "position",
      ) ?? [],
    [preview, includePositions],
  );
  const newRows = useMemo(
    () => selectedRows.filter((entry) => entry.status === "new"),
    [selectedRows],
  );
  const newPositionCount = useMemo(
    () =>
      preview?.filter(
        (entry) => entry.row.kind === "position" && entry.status === "new",
      ).length ?? 0,
    [preview],
  );
  const unknownAssets = useMemo(
    () => [
      ...new Set(
        newRows
          .filter(
            (entry) =>
              entry.row.kind !== "income" && entry.knownAssetTypeId == null,
          )
          .map((entry) => entry.row.assetName),
      ),
    ],
    [newRows],
  );
  const missingAssetTypeCount = unknownAssets.filter(
    (asset) => !assetTypeByAsset[asset],
  ).length;
  /** Pluggy's own classification per asset, for the hint and the extra option. */
  const providerTypeByAsset = useMemo(
    () =>
      new Map(
        newRows
          .filter((entry) => entry.providerAssetType)
          .map((entry) => [entry.row.assetName, entry.providerAssetType!]),
      ),
    [newRows],
  );

  const confirm = () => {
    if (!connectionId || !fetched) return;
    if (missingAssetTypeCount) {
      toast.error("Defina o tipo de todos os ativos novos");
      return;
    }
    importRows({
      connectionId,
      assetTypeByAsset: Object.fromEntries(
        Object.entries(assetTypeByAsset)
          .filter(([, typeId]) => typeId && typeId !== PLUGGY_TYPE_VALUE)
          .map(([asset, typeId]) => [asset, parseInt(typeId)]),
      ),
      pluggyTypeAssets: Object.entries(assetTypeByAsset)
        .filter(([, typeId]) => typeId === PLUGGY_TYPE_VALUE)
        .map(([asset]) => asset),
      rows: includePositions
        ? [...fetched.rows, ...fetched.positions]
        : fetched.rows,
    });
  };

  return (
    <Dialog open={connectionId != null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl lg:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Sincronizar investimentos de {institution}</DialogTitle>
          <DialogDescription>
            Movimentações já importadas são identificadas antes da confirmação.
          </DialogDescription>
        </DialogHeader>

        {(isFetching || isPreviewing) && (
          <p className="text-muted-foreground font-mono text-xs uppercase">
            {isFetching
              ? "Buscando investimentos..."
              : "Analisando movimentações..."}
          </p>
        )}

        {!isFetching && !isPreviewing && fetched && preview && (
          <div className="grid gap-4">
            <FetchSummary fetched={fetched} newRowCount={newRows.length} />

            {newPositionCount > 0 && (
              <label className="border-foreground bg-highlight/40 flex cursor-pointer items-start gap-3 border-2 p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={includePositions}
                  onChange={(event) =>
                    setIncludePositions(event.target.checked)
                  }
                />
                <span className="grid gap-1 text-sm">
                  <span className="font-bold">
                    Importar {newPositionCount} posição
                    {newPositionCount !== 1 ? "ões" : ""} inicial
                    {newPositionCount !== 1 ? "is" : ""}
                  </span>
                  <span className="text-muted-foreground">
                    Cada uma entra como uma única compra, pelo valor de
                    aplicação que a instituição informou: ativos sem nenhum
                    histórico no Open Finance, e a parte dos ativos acima que é
                    anterior ao histórico disponível. Se a instituição passar a
                    enviar o histórico completo depois, remova a posição inicial
                    para não contar em dobro.
                  </span>
                </span>
              </label>
            )}

            {unknownAssets.length > 0 && (
              <div className="grid gap-2 border-2 p-3">
                <Label>Tipo dos ativos novos</Label>
                {unknownAssets.map((asset) => (
                  <div
                    key={asset}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="grid">
                      <span className="font-medium">{asset}</span>
                      {providerTypeByAsset.has(asset) && (
                        <span className="text-muted-foreground text-xs">
                          Pluggy: {providerTypeByAsset.get(asset)}
                        </span>
                      )}
                    </div>
                    <Select
                      value={assetTypeByAsset[asset] ?? ""}
                      onValueChange={(value) =>
                        setAssetTypeByAsset((current) => ({
                          ...current,
                          [asset]: value,
                        }))
                      }
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {providerTypeByAsset.has(asset) && (
                          <SelectItem value={PLUGGY_TYPE_VALUE}>
                            Usar tipo Pluggy ({providerTypeByAsset.get(asset)})
                          </SelectItem>
                        )}
                        {assetTypes?.map((type) => (
                          <SelectItem key={type.id} value={type.id.toString()}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            <PreviewTable rows={selectedRows} />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  newRows.length === 0 ||
                  missingAssetTypeCount > 0 ||
                  isImporting
                }
                onClick={confirm}
              >
                {isImporting
                  ? "Importando..."
                  : `Importar ${newRows.length} ${newRows.length === 1 ? "movimentação" : "movimentações"}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
