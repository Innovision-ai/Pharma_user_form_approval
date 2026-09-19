import type { ReactNode } from "react";

import { X } from "lucide-react";
import { cn } from "../../lib/cn";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  placement?: "center" | "drawer";
}

export function Modal({ open, title, onClose, children, footer, placement = "center" }: ModalProps) {
  if (!open) return null;
  const drawer = placement === "drawer";
  return (
    <div className={cn("fixed inset-0 z-50 flex bg-slate-950/35 backdrop-blur-[2px]", drawer ? "justify-end" : "items-center justify-center p-4")}>
      <button aria-label="Close dialog" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className={cn("relative flex max-h-[calc(100vh-2rem)] flex-col bg-white shadow-2xl", drawer ? "h-full w-full max-w-xl animate-[drawer-in_220ms_ease-out]" : "w-full max-w-md rounded-2xl")}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}
