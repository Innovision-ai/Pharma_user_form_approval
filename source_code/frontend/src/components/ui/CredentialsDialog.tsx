import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Field, FieldLabel, Input, Textarea } from "./Input";
import { useAuth } from "../../context/AuthContext";

interface CredentialsDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** Ask for a reason as well (submit / review / approve actions). */
  requireReason?: boolean;
  confirmLabel?: string;
  /** Throw to keep the dialog open and show the message. */
  onConfirm: (result: { password: string; reason: string }) => Promise<void> | void;
  onClose: () => void;
}

/**
 * Re-authentication ("e-signature") dialog: asks for the signed-in user's
 * ID (read-only), password and optionally a reason before a sensitive action.
 * The password is verified server-side by the endpoint that receives it.
 */
export function CredentialsDialog({
  open, title, description, requireReason, confirmLabel = "Confirm", onConfirm, onClose,
}: CredentialsDialogProps) {
  const { currentUser } = useAuth();
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setPassword(""); setReason(""); setError(""); setBusy(false); }
  }, [open]);

  const submit = async () => {
    if (!password) return setError("Password is required.");
    if (requireReason && !reason.trim()) return setError("Reason is required.");
    setBusy(true); setError("");
    try {
      await onConfirm({ password, reason: reason.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Verifying..." : confirmLabel}</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {description && <p className="text-sm text-slate-500">{description}</p>}
        <Field><FieldLabel>User ID</FieldLabel><Input value={currentUser?.employee_id ?? ""} readOnly disabled /></Field>
        <Field>
          <FieldLabel>Password *</FieldLabel>
          <Input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
        </Field>
        {requireReason && (
          <Field>
            <FieldLabel>Reason *</FieldLabel>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason / comment for this action" />
          </Field>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
