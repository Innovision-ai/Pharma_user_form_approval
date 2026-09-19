import type { ButtonHTMLAttributes } from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "size"> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-[0_2px_10px_rgba(79,70,229,0.3)] hover:bg-brand-500 focus-visible:ring-brand-500 hover:shadow-[0_4px_16px_rgba(79,70,229,0.4)]",
  secondary: "border border-slate-200 bg-white/70 backdrop-blur-sm text-slate-700 shadow-sm hover:border-slate-300 hover:bg-white focus-visible:ring-slate-400 hover:shadow-md",
  danger: "bg-red-600 text-white shadow-[0_2px_10px_rgba(220,38,38,0.3)] hover:bg-red-500 focus-visible:ring-red-500 hover:shadow-[0_4px_16px_rgba(220,38,38,0.4)]",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-md",
  md: "px-5 py-2.5 text-sm rounded-lg",
  lg: "px-6 py-3 text-base rounded-xl",
};

export function Button({ variant = "primary", size = "md", className, disabled, ...props }: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled}
      {...props}
    />
  );
}
