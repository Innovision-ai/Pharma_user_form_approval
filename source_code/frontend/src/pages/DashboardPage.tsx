import { useEffect, useState } from "react";
import { Activity, CheckCircle2, ClipboardCheck, FlaskConical, Hourglass, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { DashboardSummary } from "../types";
import { Card, CardHeader, CardTitle } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { MetricCard } from "../components/ui/MetricCard";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";

const CARDS = [
  { key: "total_equipment", label: "Total Equipment", tone: "blue" as const, icon: FlaskConical, trend: "Across all registered plants" },
  { key: "active_equipment", label: "Active Equipment", tone: "green" as const, icon: CheckCircle2, trend: "Ready for access requests" },
  { key: "pending_hod", label: "Pending HOD", tone: "amber" as const, icon: Hourglass, trend: "Awaiting review" },
  { key: "pending_qa", label: "Pending QA", tone: "purple" as const, icon: ShieldCheck, trend: "Quality review queue" },
  { key: "it_pending", label: "Pending IT", tone: "blue" as const, icon: Activity, trend: "Ready for provisioning" },
  { key: "approved_requests", label: "Access Completed", tone: "green" as const, icon: ClipboardCheck, trend: "Successfully provisioned" },
];

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.getDashboardSummary().then(setSummary).catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard")); }, []);

  if (error) return <EmptyState title="Dashboard unavailable" description={error} />;
  if (!summary) return <div className="space-y-8"><div className="skeleton h-16 w-72" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-40" />)}</div><div className="skeleton h-80" /></div>;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Overview" title="Dashboard" description="A real-time view of equipment access, approvals, and provisioning activity." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {CARDS.map((card, i) => <MetricCard key={card.key} label={card.label} value={summary[card.key as keyof DashboardSummary] as number} tone={card.tone} icon={card.icon} trend={card.trend} index={i} />)}
      </div>
      <Card>
        <CardHeader className="flex items-center justify-between"><div><CardTitle>Recent requests</CardTitle><p className="mt-1 text-xs text-slate-500">Latest activity across the access workflow</p></div><Link to="/requests/mine" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all requests →</Link></CardHeader>
        {summary.recent_requests.length === 0 ? <EmptyState title="No recent requests" description="New access requests will appear here." /> : <DataTable rows={summary.recent_requests} rowKey={(r) => r.request_code} columns={[
          { header: "Request", render: (r) => <Link to={`/requests/${r.request_code}`} className="font-semibold text-brand-600 hover:text-brand-700">{r.request_code}</Link> },
          { header: "Employee", render: (r) => <div><p className="font-medium text-slate-800">{r.employee_name}</p><p className="text-xs text-slate-400">{r.employee_department}</p></div> },
          { header: "Equipment", render: (r) => r.equipment_name },
          { header: "Requested role", render: (r) => r.requested_role },
          { header: "HOD / QA", render: (r) => <span className="text-xs text-slate-500">{r.hod_name} · {r.qa_name}</span> },
          { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { header: "Created", render: (r) => <span className="whitespace-nowrap text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</span> },
        ]} />}
      </Card>
    </div>
  );
}
