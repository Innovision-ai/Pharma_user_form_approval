import { useState } from "react";
import { AlertTriangle, Download, Paperclip, X } from "lucide-react";
import { api, type OverdueDetails } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { Field, FieldLabel, Input, Textarea } from "../ui/Input";

/** Local calendar date as YYYY-MM-DD (date inputs use local time, not UTC). */
export function todayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True when a YYYY-MM-DD due date is before today. */
export function isPastDue(due?: string | null) {
  return !!due && due < todayLocal();
}

export interface OverdueState {
  breakdown_details: string;
  deviation_no: string;
  attachment: { id: number; filename: string } | null;
}

export const emptyOverdue = (): OverdueState => ({ breakdown_details: "", deviation_no: "", attachment: null });

/** Client-side check mirroring the backend rule; returns an error or null. */
export function overdueError(state: OverdueState): string | null {
  if (!state.breakdown_details.trim()) return "Enter the Breakdown / QMS details for this overdue task.";
  if (!state.deviation_no.trim()) return "Enter the deviation number for this overdue task.";
  return null;
}

export function toOverdueDetails(state: OverdueState): OverdueDetails {
  return {
    breakdown_details: state.breakdown_details.trim(),
    deviation_no: state.deviation_no.trim(),
    attachment_id: state.attachment?.id,
  };
}

/**
 * Shown in the update modal when the task is past its due date: the backend
 * only accepts completion with Breakdown / QMS details and a deviation number.
 */
export function OverdueFields({ due, value, onChange }: { due: string; value: OverdueState; onChange: (v: OverdueState) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true); setUploadError("");
    try {
      const info = await api.uploadAttachment(file, "deviation");
      onChange({ ...value, attachment: { id: info.id, filename: info.filename } });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  };

  return (
    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-4">
      <p className="flex items-start gap-2 text-sm font-semibold text-red-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        Overdue — this task was due on {formatDate(due)}. Enter the breakdown / QMS details and deviation number to complete it.
      </p>
      <Field>
        <FieldLabel>Breakdown / QMS details *</FieldLabel>
        <Textarea rows={3} value={value.breakdown_details} onChange={(e) => onChange({ ...value, breakdown_details: e.target.value })} placeholder="Reason for the delay, breakdown or QMS reference..." />
      </Field>
      <Field>
        <FieldLabel>Deviation number *</FieldLabel>
        <Input value={value.deviation_no} onChange={(e) => onChange({ ...value, deviation_no: e.target.value })} placeholder="e.g. DEV-2026-0042" />
      </Field>
      <div>
        <FieldLabel>Attachment (optional)</FieldLabel>
        {value.attachment ? (
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Paperclip size={14} /> {value.attachment.filename}
            <button type="button" aria-label="Remove attachment" onClick={() => onChange({ ...value, attachment: null })} className="rounded p-1 text-slate-400 hover:text-red-600"><X size={14} /></button>
          </div>
        ) : (
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
            disabled={uploading}
            onChange={(e) => void upload(e.target.files?.[0])}
            className="block text-sm"
          />
        )}
        {uploading && <p className="mt-1 text-xs text-slate-500">Uploading...</p>}
        {uploadError && <p className="mt-1 text-xs font-medium text-red-700">{uploadError}</p>}
        <p className="mt-1 text-xs text-slate-500">PDF, image, Word or Excel, up to 5 MB.</p>
      </div>
    </div>
  );
}

/** Overdue information in history tables. */
export function OverdueInfo({ row }: { row: { overdue?: boolean; due_date?: string | null; deviation_no?: string | null; breakdown_details?: string | null; attachment_id?: number | null } }) {
  if (!row.overdue) return <span className="text-xs text-slate-400">On time</span>;
  return (
    <div className="space-y-1 text-xs">
      <Badge tone="red">Overdue{row.due_date ? ` (due ${formatDate(row.due_date)})` : ""}</Badge>
      {row.deviation_no && <p><span className="font-semibold">Deviation:</span> {row.deviation_no}</p>}
      {row.breakdown_details && <p className="max-w-xs whitespace-normal text-slate-600">{row.breakdown_details}</p>}
      {row.attachment_id != null && (
        <button
          type="button"
          onClick={() => void api.downloadAttachment(row.attachment_id as number)}
          className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline"
        >
          <Download size={12} /> Attachment
        </button>
      )}
    </div>
  );
}
