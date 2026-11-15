import { useState, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { formatDateTime } from "../lib/format";

export const COMPANY_NAME = "Air Care Zone";
export const PRODUCT_NAME = "Qualizone";
export const CLIENT_NAME = "Client";
/** Company (vendor) and product logos printed on every report. */
export const COMPANY_LOGO_URL = "/acz-logo.png";
export const PRODUCT_LOGO_URL = "/qualizone-logo.png";
/** Client logo: replace the file (or this path) when the client supplies it. */
export const CLIENT_LOGO_URL = "/logo-client.svg";
/** Document / format number is supplied by the client - replace when received. */
export const DEFAULT_FORMAT_NO = "FMT-XXXX";

interface PrintReportProps {
  title: string;
  formatNo?: string;
  /** Applied filters shown under the title, e.g. { Department: "QC", Type: "" } (empty values are skipped). */
  filters?: Record<string, string | null | undefined>;
  children: ReactNode;
}

/** Logo that disappears instead of showing a broken image. */
function PrintLogo({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="print-logo-slot" />;
  return <img src={src} alt={alt} className="print-logo" onError={() => setFailed(true)} />;
}

/**
 * Wraps report content with a print-only header (company + product logos,
 * client logo, report name, format number, plant, applied filters) and footer
 * (printed by, print date/time, page X of Y). On screen only `children` are
 * visible. Trigger printing / "Save as PDF" with printReport().
 */
export function PrintReport({ title, formatNo = DEFAULT_FORMAT_NO, filters, children }: PrintReportProps) {
  const { currentUser, plant } = useAuth();
  const printedAt = formatDateTime(new Date());
  const applied = Object.entries(filters ?? {}).filter(([, v]) => v != null && String(v).trim() !== "");

  return (
    <div className="print-report">
      <div className="print-only print-header">
        <div className="print-logos">
          <PrintLogo src={COMPANY_LOGO_URL} alt={COMPANY_NAME} />
          <PrintLogo src={PRODUCT_LOGO_URL} alt={PRODUCT_NAME} />
        </div>
        <div className="print-title">
          <p className="print-title-name">{title}</p>
          <p className="print-title-sub">
            Format No: {formatNo}
            {plant && <> &nbsp;·&nbsp; Plant: {plant}</>}
          </p>
        </div>
        <div className="print-logos print-logos-right">
          <PrintLogo src={CLIENT_LOGO_URL} alt={CLIENT_NAME} />
        </div>
      </div>
      <div className="print-only print-meta">
        <span><strong>Filters:</strong> {applied.length ? applied.map(([k, v]) => `${k}: ${v}`).join(" · ") : "None (all records)"}</span>
        <span><strong>Generated:</strong> {printedAt} by {currentUser?.name} ({currentUser?.employee_id})</span>
      </div>
      {children}
      <div className="print-only print-footer">
        <span>{PRODUCT_NAME} · {title}</span>
        <span>Printed by: {currentUser?.name} ({currentUser?.employee_id}) · {printedAt}</span>
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
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
