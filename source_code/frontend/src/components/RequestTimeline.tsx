import { cn } from "../lib/cn";
import type { AccessRequest } from "../types";

const STEPS = [
  { key: "SUBMITTED", label: "Submitted" },
  { key: "PENDING_HOD", label: "HOD Review" },
  { key: "PENDING_QA", label: "QA Review" },
  { key: "IT_PENDING", label: "IT Provisioning" },
  { key: "IT_COMPLETED", label: "Access Granted" },
] as const;

function stepState(req: AccessRequest, stepKey: string): "done" | "current" | "upcoming" | "rejected" {
  const order = ["SUBMITTED", "PENDING_HOD", "PENDING_QA", "IT_PENDING", "IT_COMPLETED"];
  const currentIndex =
    req.status === "REJECTED"
      ? order.indexOf(req.rejected_stage === "HOD" ? "PENDING_HOD" : "PENDING_QA")
      : order.indexOf(req.status === "PENDING_HOD" ? "PENDING_HOD" : req.status);

  const stepIndex = order.indexOf(stepKey);

  if (req.status === "REJECTED" && stepIndex === currentIndex) return "rejected";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex && req.status !== "REJECTED") {
    return req.status === "IT_COMPLETED" ? "done" : "current";
  }
  return "upcoming";
}

export function RequestTimeline({ request }: { request: AccessRequest }) {
  return (
    <div className="flex items-center">
      {STEPS.map((step, idx) => {
        const state = stepState(request, step.key);
        return (
          <div key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  state === "done" && "border-emerald-500 bg-emerald-500 text-white",
                  state === "current" && "border-brand-600 bg-brand-600 text-white",
                  state === "rejected" && "border-red-500 bg-red-500 text-white",
                  state === "upcoming" && "border-slate-300 bg-white text-slate-400",
                )}
              >
                {state === "done" ? "✓" : state === "rejected" ? "✕" : idx + 1}
              </div>
              <span className="mt-1.5 w-20 text-center text-[11px] font-medium text-slate-600">
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-0.5 flex-1",
                  state === "done" ? "bg-emerald-500" : "bg-slate-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
