import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { DashboardSummary } from "../types";
import { Card, CardBody } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { StatusBadge } from "../components/StatusBadge";

const CARDS: Array<{ key: keyof DashboardSummary; label: string }> = [
  { key: "total_equipment", label: "Total Equipment" },
  { key: "active_equipment", label: "Active Equipment" },
  { key: "pending_hod", label: "Pending HOD Approval" },
  { key: "pending_qa", label: "Pending QA Approval" },
  { key: "it_pending", label: "Pending IT Provisioning" },
  { key: "approved_requests", label: "Access Completed" },
];

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getDashboardSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!summary) return <p className="text-sm text-slate-500">Loading dashboard...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Live snapshot of equipment access requests.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {CARDS.map((c) => (
          <Card key={c.key}>
            <CardBody>
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{summary[c.key] as number}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-800">Recent Requests</h2>
        </div>
        <DataTable
          rows={summary.recent_requests}
          rowKey={(r) => r.request_code}
          columns={[
            {
              header: "Request",
              render: (r) => (
                <Link to={`/requests/${r.request_code}`} className="font-medium text-brand-600 hover:underline">
                  {r.request_code}
                </Link>
              ),
            },
            { header: "Employee", render: (r) => r.employee_name },
            { header: "Equipment", render: (r) => r.equipment_name },
            { header: "Role", render: (r) => r.requested_role },
            { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      </Card>
    </div>
  );
}
