import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

interface StepperProps { steps: string[]; current: number }

export function Stepper({ steps, current }: StepperProps) {
  return (
    <div className="flex items-start">
      {steps.map((step, index) => {
        const complete = index < current;
        const active = index === current;
        return (
          <div key={step} className="flex min-w-0 flex-1 items-start last:flex-none">
            <div className="flex min-w-0 flex-col items-center">
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition", complete && "border-brand-600 bg-brand-600 text-white", active && "border-brand-600 bg-brand-50 text-brand-700", !complete && !active && "border-slate-200 bg-white text-slate-400")}>
                {complete ? <Check size={16} /> : index + 1}
              </div>
              <span className={cn("mt-2 text-center text-[11px] font-semibold", active ? "text-brand-700" : "text-slate-500")}>{step}</span>
            </div>
            {index < steps.length - 1 && <div className={cn("mx-2 mt-4 h-0.5 flex-1", index < current ? "bg-brand-600" : "bg-slate-200")} />}
          </div>
        );
      })}
    </div>
  );
}
