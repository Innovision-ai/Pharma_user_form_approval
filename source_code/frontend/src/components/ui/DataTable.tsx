import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { EmptyState } from "./EmptyState";

export interface Column<T> { header: string; render: (row: T) => ReactNode; className?: string }
interface DataTableProps<T> { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string | number; emptyMessage?: string }

export function DataTable<T>({ columns, rows, rowKey, emptyMessage = "No records found." }: DataTableProps<T>) {
  if (rows.length === 0) return <EmptyState title={emptyMessage} description="Try adjusting your filters or check back later." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-white/70 backdrop-blur-xl">
          <tr className="border-b border-white/30 text-[10px] uppercase tracking-[0.16em] text-slate-500">
            {columns.map((col) => <th key={col.header} className="whitespace-nowrap px-6 py-4 font-extrabold">{col.header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/60">
          {rows.map((row, i) => (
            <motion.tr
              key={rowKey(row)}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04, ease: "easeOut" }}
              className="group transition-colors duration-150 hover:bg-brand-50/50"
            >
              {columns.map((col) => <td key={col.header} className={col.className ?? "px-6 py-4 text-slate-700"}>{col.render(row)}</td>)}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

