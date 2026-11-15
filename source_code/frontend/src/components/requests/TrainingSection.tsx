import { Field, FieldLabel, Textarea } from "../ui/Input";

export interface TrainingValue {
  completed: "" | "YES" | "NA";
  remark: string;
  file: File | null;
}

export const EMPTY_TRAINING: TrainingValue = { completed: "", remark: "", file: null };

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx";

/** Returns an error message, or null when the answer is complete. */
export function trainingError(t: TrainingValue): string | null {
  if (!t.completed) return "Answer 'Are all required trainings completed?' (Yes or NA).";
  if (t.completed === "NA" && !t.remark.trim()) return "Enter a remark explaining why training is not applicable.";
  if (t.file && t.file.size > MAX_BYTES) return "The training attachment must be 5 MB or smaller.";
  return null;
}

/** "Are all required trainings completed?" — Yes (optional attachment) / NA (remark required). */
export function TrainingSection({ value, onChange }: { value: TrainingValue; onChange: (v: TrainingValue) => void }) {
  const set = (patch: Partial<TrainingValue>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-sm font-semibold text-slate-800">Are all required trainings completed? *</p>
      <div className="flex gap-3" role="radiogroup" aria-label="Are all required trainings completed?">
        {(["YES", "NA"] as const).map((opt) => (
          <label
            key={opt}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${
              value.completed === opt ? "border-brand-400 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name="training-completed"
              value={opt}
              checked={value.completed === opt}
              onChange={() => set({ completed: opt, ...(opt === "NA" ? { file: null } : { remark: "" }) })}
              className="h-4 w-4"
            />
            {opt === "YES" ? "Yes" : "NA"}
          </label>
        ))}
      </div>
      {value.completed === "NA" && (
        <Field>
          <FieldLabel>Remark (why training is not applicable) *</FieldLabel>
          <Textarea rows={2} value={value.remark} onChange={(e) => set({ remark: e.target.value })} placeholder="e.g. Read-only access, no SOP training required" />
        </Field>
      )}
      {value.completed === "YES" && (
        <Field>
          <FieldLabel>Training record (optional)</FieldLabel>
          <input
            type="file"
            accept={ACCEPT}
            aria-label="Training record"
            onChange={(e) => set({ file: e.target.files?.[0] ?? null })}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
          />
          <p className="mt-1 text-xs text-slate-500">PDF, image, Word or Excel, up to 5 MB.</p>
        </Field>
      )}
    </div>
  );
}
