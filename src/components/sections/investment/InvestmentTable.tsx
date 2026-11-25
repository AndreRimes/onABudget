"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { type Key, type ReactNode, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";

export type InvestmentColumn<Row> = {
  id: string;
  label: string;
  align?: "right";
  width?: string;
  value?: (row: Row) => string | number;
  format?: (row: Row) => string;
  render?: (row: Row) => ReactNode;
};

const collator = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base",
});

function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function useInvestmentTable<Row>(
  columns: InvestmentColumn<Row>[],
  extraSearch?: (row: Row) => string,
) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ column: "", descending: false });

  function selectColumn(column: string) {
    setSort((current) => ({
      column,
      descending: current.column === column && !current.descending,
    }));
  }

  function visibleRows(rows: Row[]) {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    const filtered = terms.length
      ? rows.filter((row) => {
          const text = normalize(
            [
              extraSearch?.(row),
              ...columns.map(
                (column) => column.format?.(row) ?? column.value?.(row),
              ),
            ].join(" "),
          );
          return terms.every((term) => text.includes(term));
        })
      : rows;
    const value = columns.find((column) => column.id === sort.column)?.value;
    if (!value) return filtered;

    return [...filtered].sort((left, right) => {
      const a = value(left);
      const b = value(right);
      const order =
        typeof a === "number" && typeof b === "number"
          ? a - b
          : collator.compare(String(a), String(b));
      return sort.descending ? -order : order;
    });
  }

  return { columns, query, setQuery, sort, selectColumn, visibleRows };
}

type TableView<Row> = ReturnType<typeof useInvestmentTable<Row>>;

export function InvestmentTableControls<Row>({
  view,
  searchLabel,
}: {
  view: TableView<Row>;
  searchLabel: string;
}) {
  const Direction = view.sort.descending ? ArrowDown : ArrowUp;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        aria-label={searchLabel}
        placeholder={searchLabel}
        value={view.query}
        onChange={(event) => view.setQuery(event.target.value)}
        className="flex-1 basis-52"
      />
      <div className="flex min-w-0 items-center gap-2">
        <select
          aria-label="Ordenar por"
          value={view.sort.column}
          onChange={(event) => view.selectColumn(event.target.value)}
          className="border-foreground bg-card focus-visible:bg-highlight/25 focus-visible:shadow-hard h-9 min-w-0 border-2 px-2 font-mono text-sm outline-none"
        >
          <option value="">Ordem original</option>
          {view.columns
            .filter((column) => column.value)
            .map((column) => (
              <option key={column.id} value={column.id}>
                {column.label}
              </option>
            ))}
        </select>
        {view.sort.column && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={
              view.sort.descending
                ? "Mudar para ordem crescente"
                : "Mudar para ordem decrescente"
            }
            onClick={() => view.selectColumn(view.sort.column)}
          >
            <Direction aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function InvestmentTable<Row>({
  rows,
  rowKey,
  view,
  label,
}: {
  rows: Row[];
  rowKey: (row: Row) => Key;
  view: TableView<Row>;
  label: string;
}) {
  const { columns, sort, selectColumn } = view;

  if (!rows.length) {
    return (
      <p role="status" className="text-muted-foreground py-6 text-center">
        Nenhum resultado para a busca.
      </p>
    );
  }

  return (
    <div className="@container">
      <Table role="table" aria-label={label} className="@max-3xl:block">
        <TableHeader role="rowgroup" className="@max-3xl:hidden">
          <TableRow role="row" className="hover:bg-transparent">
            {columns.map((column) => {
              const active = sort.column === column.id;
              const Icon = active
                ? sort.descending
                  ? ArrowDown
                  : ArrowUp
                : ArrowUpDown;

              return (
                <TableHead
                  key={column.id}
                  role="columnheader"
                  scope="col"
                  aria-sort={
                    active
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : undefined
                  }
                  className={cn(
                    "px-2 tracking-normal whitespace-normal",
                    column.align === "right" && "text-right",
                    column.width,
                  )}
                >
                  {column.value ? (
                    <button
                      type="button"
                      className={cn(
                        "focus-visible:outline-highlight/80 inline-flex max-w-full cursor-pointer items-center gap-1 py-2 [overflow-wrap:anywhere] underline-offset-2 hover:underline focus-visible:outline-2",
                        column.align === "right" && "text-right",
                      )}
                      onClick={() => selectColumn(column.id)}
                    >
                      {column.label}
                      <Icon className="size-3 shrink-0" aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="sr-only">{column.label}</span>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody role="rowgroup" className="@max-3xl:block">
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              role="row"
              className="@max-3xl:grid @max-3xl:grid-cols-2 @max-3xl:py-2"
            >
              {columns.map((column, index) => (
                <TableCell
                  key={column.id}
                  role="cell"
                  className={cn(
                    "px-2 [overflow-wrap:anywhere] whitespace-normal tabular-nums",
                    column.align === "right" && "@3xl:text-right",
                    index === 0 && "@max-3xl:col-span-full",
                  )}
                >
                  <span className="text-muted-foreground block text-[11px] @3xl:hidden">
                    {column.label}
                  </span>
                  {column.render?.(row) ??
                    column.format?.(row) ??
                    column.value?.(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
