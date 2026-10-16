import type { ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Yes / Cancel confirmation pop-up (e.g. "Do you want to retire the equipment?"). */
export function ConfirmDialog({
  open, title, message, confirmLabel = "Yes", cancelLabel = "Cancel", danger, busy, onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Please wait..." : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{message}</div>
    </Modal>
  );
}
