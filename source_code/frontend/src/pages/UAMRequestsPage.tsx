import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { UAMRequest } from "../types";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/Button";

export function UAMRequestsPage() {
  const [items, setItems] = useState<UAMRequest[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); api.listUAMRequests(status ? { status } : undefined).then(setItems).finally(() => setLoading(false)); };
  useEffect(load, [status]);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-slate-900">UAM Requests</h1><p className="text-sm text-slate-500">Plant-scoped electronic review, execution, and acknowledgement.</p></div><Link to="/uam/requests/new"><Button>Create user request</Button></Link></div>
    <Card><CardHeader className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Request queue</CardTitle><select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="PENDING_REVIEW">Pending review</option><option value="PENDING_DEPARTMENT_APPROVAL">Department approval</option><option value="PENDING_QA_APPROVAL">QA approval</option><option value="PENDING_EXECUTION">Pending execution</option><option value="PENDING_INITIATOR_ACK">Awaiting acknowledgement</option><option value="CORRECTION_REQUIRED">Correction required</option><option value="COMPLETED">Completed</option></select></CardHeader><CardBody>{loading ? <p className="py-8 text-center text-sm text-slate-500">Loading...</p> : <DataTable rows={items} rowKey={r => r.request_code} emptyMessage="No UAM requests found." columns={[{ header: "Request", render: r => <Link className="font-semibold text-brand-600" to={`/uam/requests/${r.request_code}`}>{r.request_code}</Link> }, { header: "Asset", render: r => `${r.asset_code} · ${r.asset_type}` }, { header: "Template", render: r => r.template }, { header: "Action", render: r => r.action }, { header: "Initiator", render: r => r.employee_name }, { header: "Status", render: r => <StatusBadge status={r.status} /> }, { header: "Created", render: r => new Date(r.created_at).toLocaleDateString() }]} />}</CardBody></Card>
  </div>;
}
