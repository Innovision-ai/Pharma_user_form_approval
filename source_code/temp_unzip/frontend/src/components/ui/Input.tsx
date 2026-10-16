import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const baseFieldClasses = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

export function Field({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) { return <label className={cn("block", className)} {...props} />; }
export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) { return <span className={cn("mb-1.5 block text-xs font-semibold text-slate-600", className)} {...props} />; }
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={cn(baseFieldClasses, className)} {...props} />; }
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={cn(baseFieldClasses, className)} {...props} />; }
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { return <select className={cn(baseFieldClasses, className)} {...props} />; }
