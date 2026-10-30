import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { formatDateTime } from "../lib/format";

export const COMPANY_NAME = "Air Care Zone";
export const CLIENT_NAME = "Client";
/** Document / format number is supplied by the client - replace when received. */
export const DEFAULT_FORMAT_NO = "FMT-XXXX";

interface PrintReportProps {
  title: string;
  formatNo?: string;
  children: ReactNode;
}

/**
 * Wraps report content with a print-only header (company logo, client logo,
 * report name, format number) and footer (printed by, print date/time,
 * page numbering). On screen only `children` are visible.
 * Trigger printing / "Save as PDF" with `window.print()` (see printReport()).
 */
export function PrintReport({ title, formatNo = DEFAULT_FORMAT_NO, children }: PrintReportProps) {
  const { currentUser } = useAuth();
  const printedAt = formatDateTime(new Date());
  return (
    <div className="print-report">
      <div className="print-only print-header">
        <img src="/acz-logo.png" alt={COMPANY_NAME} className="print-logo" />
        <div className="print-title">
          <p className="print-title-name">{title}</p>
          <p className="print-title-sub">Format No: {formatNo}</p>
        </div>
        <img src="/logo-client.svg" alt={CLIENT_NAME} className="print-logo" />
      </div>
      {children}
      <div className="print-only print-footer">
        <span>Printed by: {currentUser?.name} ({currentUser?.employee_id})</span>
        <span>Printed on: {printedAt}</span>
        <span className="print-page-number" />
      </div>
    </div>
  );
}

export function printReport() {
  window.print();
}

/** Download rows as CSV (used by report "Export" buttons). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
