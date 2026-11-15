import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type { UAMSelectors } from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, FieldLabel, Select, Textarea } from "../ui/Input";
import { CredentialsDialog } from "../ui/CredentialsDialog";

type Result = { created_requests: string[]; count: number; skipped: string[] };

/**
 * Self-service bulk deactivation: the signed-in user asks for every user ID
 * they hold to be deactivated (one DEACTIVATE request per system).
 */
export function SelfDeactivateDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [selectors, setSelectors] = useState<UAMSelectors | null>(null);
  const [reason, setReason] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [executor, setExecutor] = useState("");
  const [error, setError] = useState("");
  const [signOpen, setSignOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason(""); setReviewer(""); setExecutor(""); setError(""); setResult(null);
    api.getUAMSelectors().then(setSelectors).catch(() => setSelectors(null));
  }, [open]);

  if (!open) return null;

  const next = () => {
    if (!reason.trim()) return setError("Enter the reason for deactivation.");
    if (!reviewer) return setError("Select a reviewer.");
    setError("");
    setSignOpen(true);
  };

  const sign = async ({ password, reason: authReason }: { password: string; reason: string }) => {
    const res = await api.selfDeactivate({
      reason: reason.trim(), reviewer_id: reviewer, it_executor_id: executor || undefined,
      auth_password: password, auth_reason: authReason,
    });
    setSignOpen(false);
    setResult(res);
    onDone();
  };

  if (result) {
    return (
      <Modal open title="Deactivation requested" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
        <div className="space-y-3 text-sm text-slate-700">
          {result.count === 0 ? (
            <p>No new requests were needed: you hold no active user IDs in this plant, or their deactivation is already in progress.</p>
          ) : (
            <>
              <p>{result.count} deactivation request{result.count > 1 ? "s were" : " was"} raised for review:</p>
              <ul className="flex flex-wrap gap-2">
                {result.created_requests.map((c) => (
                  <li key={c}>
                    <Link onClick={onClose} className="rounded-md bg-brand-50 px-2 py-1 font-mono text-xs font-semibold text-brand-700" to={`/uam/requests/${c}`}>{c}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {result.skipped.length > 0 && (
            <p className="text-slate-500">Skipped (already being deactivated or in another plant): {result.skipped.join(", ")}</p>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        open={!signOpen}
        title="Deactivate all my access"
        onClose={onClose}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="danger" onClick={next}>Continue</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            A deactivation request is raised for every system where you currently hold a user ID. Each request goes through the normal review and IT execution.
          </p>
          <Field>
            <FieldLabel>Reason *</FieldLabel>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Moving to another department / leaving the organisation" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Reviewer *</FieldLabel>
              <Select aria-label="Reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
                <option value="">Select reviewer</option>
                {(selectors?.reviewers ?? []).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}
              </Select>
            </Field>
            <Field>
              <FieldLabel>IT executor (optional)</FieldLabel>
              <Select aria-label="IT executor" value={executor} onChange={(e) => setExecutor(e.target.value)}>
                <option value="">Any IT executor</option>
                {(selectors?.it_executors ?? []).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}
              </Select>
            </Field>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        </div>
      </Modal>
      <CredentialsDialog
        open={signOpen}
        title="E-signature: deactivate all my access"
        description="Confirm your identity to raise the deactivation requests."
        requireReason
        confirmLabel="Sign & raise requests"
        onConfirm={sign}
        onClose={() => setSignOpen(false)}
      />
    </>
  );
}
