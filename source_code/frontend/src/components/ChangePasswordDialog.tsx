import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Field, FieldLabel, Input } from "./ui/Input";
import { useToast } from "./ui/Toast";

/** Change own password (enforces the server-side password policy). */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refreshUser } = useAuth();
  const { showToast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [policy, setPolicy] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent(""); setNext(""); setConfirm(""); setError("");
    api.getPasswordPolicy().then((p) => setPolicy(p.text)).catch(() => setPolicy(""));
  }, [open]);

  const submit = async () => {
    if (!current || !next) return setError("Enter your current and new password.");
    if (next !== confirm) return setError("New password and confirmation do not match.");
    setBusy(true); setError("");
    try {
      await api.changePassword(current, next);
      await refreshUser();
      showToast("Password changed.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Change password"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving..." : "Change password"}</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {policy && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{policy}</p>}
        <Field><FieldLabel>Current password</FieldLabel><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field><FieldLabel>New password</FieldLabel><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field><FieldLabel>Confirm new password</FieldLabel><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
