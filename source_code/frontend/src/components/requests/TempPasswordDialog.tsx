import { useState } from "react";
import { Copy, Check, KeyRound } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

/**
 * Shows the temporary password set by IT, once, to the initiator who just
 * acknowledged the request. It is wiped on the server after this response.
 */
export function TempPasswordDialog({
  password, userId, onClose,
}: { password: string | null; userId?: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!password) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the password stays visible to copy by hand */
    }
  };

  return (
    <Modal
      open
      title="Temporary password set by IT"
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <KeyRound size={18} className="mt-0.5 shrink-0" />
          <p>
            This password is shown <strong>only once</strong> and is not sent by email. Note it now and change it at your first login.
          </p>
        </div>
        {userId && (
          <div>
            <p className="text-xs font-medium text-slate-500">User ID</p>
            <p className="font-mono text-sm font-semibold text-slate-800">{userId}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-medium text-slate-500">Temporary password</p>
          <div className="mt-1 flex items-center gap-2">
            <code data-testid="temp-password" className="flex-1 rounded-lg bg-slate-900 px-4 py-3 font-mono text-base tracking-wide text-white">
              {password}
            </code>
            <Button variant="secondary" size="sm" onClick={copy} aria-label="Copy password">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
