import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

export interface Column<T> { header: string; render: (row: T) => ReactNode; className?: string }
interface DataTableProps<T> { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string | number; emptyMessage?: string }

export function DataTable<T>({ columns, rows, rowKey, emptyMessage = "No records found." }: DataTableProps<T>) {
  if (rows.length === 0) return <EmptyState title={emptyMessage} description="Try adjusting your filters or check back later." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
          <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.14em] text-slate-500">
            {columns.map((col) => <th key={col.header} className="whitespace-nowrap px-5 py-3.5 font-bold">{col.header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="group transition-colors hover:bg-brand-50/40">
              {columns.map((col) => <td key={col.header} className={col.className ?? "px-5 py-4 text-slate-700"}>{col.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
