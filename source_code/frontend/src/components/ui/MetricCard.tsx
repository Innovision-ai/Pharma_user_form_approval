import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardBody } from "./Card";
import { cn } from "../../lib/cn";

interface MetricCardProps {
  label: string;
  value: number | string;
  trend?: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "amber" | "purple" | "slate";
  index?: number;
}

const tones = {
  blue: {
    icon: "bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-[0_4px_12px_rgba(99,102,241,0.3)]",
    glow: "from-brand-100/40 to-indigo-100/40",
  },
  green: {
    icon: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_4px_12px_rgba(16,185,129,0.3)]",
    glow: "from-emerald-100/40 to-teal-100/40",
  },
  amber: {
    icon: "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-[0_4px_12px_rgba(245,158,11,0.3)]",
    glow: "from-amber-100/40 to-orange-100/40",
  },
  purple: {
    icon: "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_4px_12px_rgba(139,92,246,0.3)]",
    glow: "from-violet-100/40 to-purple-100/40",
  },
  slate: {
    icon: "bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-[0_4px_12px_rgba(71,85,105,0.3)]",
    glow: "from-slate-100/40 to-slate-200/40",
  },
};

export function MetricCard({ label, value, trend, icon: Icon, tone = "blue", index = 0 }: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="group hover:-translate-y-1 transition-transform duration-300 !p-0 overflow-hidden">
        {/* Gradient glow background */}
        <div className={cn("absolute inset-0 rounded-3xl bg-gradient-to-br opacity-60", tones[tone].glow)} />
        <CardBody className="relative">
          <div className={cn("mb-5 flex h-12 w-12 items-center justify-center rounded-2xl", tones[tone].icon)}>
            <Icon size={22} strokeWidth={1.8} />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-1.5 text-4xl font-extrabold tracking-tight text-slate-900">{value}</p>
          {trend && (
            <p className="mt-2.5 text-xs font-medium text-slate-400">{trend}</p>
          )}
        </CardBody>
      </Card>
    </motion.div>
  );
}

