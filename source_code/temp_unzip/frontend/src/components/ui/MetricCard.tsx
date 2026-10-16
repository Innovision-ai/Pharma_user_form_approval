import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Card, CardBody } from "./Card";
import { cn } from "../../lib/cn";

interface MetricCardProps {
  label: string;
  value: number | string;
  trend?: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "amber" | "purple" | "slate";
}

const tones = {
  blue: "bg-brand-50 text-brand-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  purple: "bg-violet-50 text-violet-600",
  slate: "bg-slate-100 text-slate-600",
};

export function MetricCard({ label, value, trend, icon: Icon, tone = "blue" }: MetricCardProps) {
  return (
    <Card className="group transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <CardBody className="relative overflow-hidden">
        <div className={cn("mb-5 flex h-10 w-10 items-center justify-center rounded-xl", tones[tone])}>
          <Icon size={19} strokeWidth={1.8} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
        {trend && (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-slate-500">
            <ArrowUpRight size={13} className="text-emerald-600" /> {trend}
          </p>
        )}
        <div className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-slate-50 transition group-hover:scale-125" />
      </CardBody>
    </Card>
  );
}
