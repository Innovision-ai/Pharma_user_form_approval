import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { EmptyState } from "./EmptyState";

export interface Column<T> { header: string; render: (row: T) => ReactNode; className?: string; /** hide this column on printed reports */ noPrint?: boolean }
interface DataTableProps<T> {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string | number; emptyMessage?: string;
  /** Scroll inside the table (sticky header, horizontal scrollbar always on screen) up to this
   *  height; "fill" sizes it to the space left below it in the window. */
  maxHeight?: string;
}

export function DataTable<T>({ columns, rows, rowKey, emptyMessage = "No records found.", maxHeight }: DataTableProps<T>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fillHeight, setFillHeight] = useState<number | null>(null);

  useEffect(() => {
    if (maxHeight !== "fill") return;
    const measure = () => {
      const top = wrapRef.current?.getBoundingClientRect().top ?? 0;
      setFillHeight(Math.max(320, window.innerHeight - Math.max(top, 0) - 32));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [maxHeight, rows.length]);

  if (rows.length === 0) return <EmptyState title={emptyMessage} description="Try adjusting your filters or check back later." />;
  const height = maxHeight === "fill" ? (fillHeight ?? undefined) : maxHeight;
  return (
    <div ref={wrapRef} className={maxHeight ? "overflow-auto" : "overflow-x-auto"} style={height ? { maxHeight: height } : undefined}>
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-white/70 backdrop-blur-xl">
          <tr className="border-b border-white/30 text-[10px] uppercase tracking-[0.16em] text-slate-500">
            {columns.map((col) => <th key={col.header} className={`whitespace-nowrap px-6 py-4 font-extrabold${col.noPrint ? " no-print" : ""}`}>{col.header}</th>)}
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
              {columns.map((col) => <td key={col.header} className={`${col.className ?? "px-6 py-4 text-slate-700"}${col.noPrint ? " no-print" : ""}`}>{col.render(row)}</td>)}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

