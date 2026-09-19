import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Tone = "slate" | "blue" | "amber" | "green" | "red" | "purple";

const toneClasses: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  blue: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/60",
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60",
  red: "bg-red-50 text-red-700 ring-1 ring-red-200/60",
  purple: "bg-violet-50 text-violet-700 ring-1 ring-violet-200/60",
};

const dotClasses: Record<Tone, string> = {
  slate: "bg-slate-400",
  blue: "bg-indigo-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  red: "bg-red-500",
  purple: "bg-violet-500",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export function Badge({ tone = "slate", dot, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotClasses[tone])} />}
      {children}
    </span>
  );
}

