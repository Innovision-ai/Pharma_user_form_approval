import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { X } from "lucide-react";
import { cn } from "../../lib/cn";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  placement?: "center" | "drawer";
  size?: "md" | "lg" | "xl";
}

const SIZE_CLASS = { md: "max-w-md", lg: "max-w-2xl", xl: "max-w-4xl" } as const;

export function Modal({ open, title, onClose, children, footer, placement = "center", size = "md" }: ModalProps) {
  if (!open) return null;
  const drawer = placement === "drawer";
  // Rendered into document.body so it is always centred in the viewport and
  // never clipped by the scrolling layout / sticky header.
  return createPortal(
    <div className={cn("fixed inset-0 z-[100] flex bg-slate-950/40 backdrop-blur-[2px]", drawer ? "justify-end" : "items-center justify-center p-4")}>
      <button aria-label="Close dialog" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className={cn("relative flex max-h-[calc(100vh-2rem)] flex-col bg-white shadow-2xl", drawer ? "h-full w-full max-w-xl animate-[drawer-in_220ms_ease-out]" : cn("w-full rounded-2xl", SIZE_CLASS[size]))}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
