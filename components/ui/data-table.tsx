"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange?: (page: number) => void;
  emptyTitle: string;
  emptyBody?: string;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  page,
  pageSize,
  total,
  onPageChange,
  emptyTitle,
  emptyBody,
}: DataTableProps<T>) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="hidden md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-2 text-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-3 py-2 text-start font-semibold">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="border-t border-border hover:bg-surface-2">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2 tabular-nums">
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 p-3 md:hidden">
        {rows.map((row) => (
          <article key={getRowKey(row)} className="rounded-xl border border-border bg-surface p-3">
            {columns.map((column) => (
              <p key={column.key} className="flex justify-between gap-3 py-1 text-sm">
                <span className="text-muted">{column.header}</span>
                <span className="tabular-nums">{column.cell(row)}</span>
              </p>
            ))}
          </article>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-sm text-muted">
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>
            السابق
          </Button>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPageChange?.(page + 1)}>
            التالي
          </Button>
        </div>
      </div>
    </div>
  );
}
