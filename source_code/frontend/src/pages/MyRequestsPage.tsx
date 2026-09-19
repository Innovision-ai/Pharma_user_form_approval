import { useEffect, useState } from "react";
import { ArrowRight, ClipboardList, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { AccessRequest } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { PageHeader } from "../components/ui/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";

export function MyRequestsPage() {
  const [items, setItems] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.listMyRequests().then(setItems).finally(() => setLoading(false)); }, []);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Employee workspace" title="My requests" description="Track every equipment access request you have submitted." actions={<Link to="/requests/new"><Button><Plus size={16} /> New request</Button></Link>} />
      <Card>
        {loading ? <div className="space-y-3 p-6">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="skeleton h-12" />)}</div> : items.length === 0 ? <EmptyState icon={ClipboardList} title="No requests yet" description="Start a new request when you need access to a validated asset." action={<Link to="/requests/new"><Button size="sm"><Plus size={15} /> Create request</Button></Link>} /> : <DataTable rows={items} rowKey={(r) => r.request_code} columns={[
          { header: "Request", render: (r) => <Link to={`/requests/${r.request_code}`} className="font-semibold text-brand-600 hover:text-brand-700">{r.request_code}</Link> },
          { header: "Equipment", render: (r) => <div><p className="font-medium text-slate-800">{r.equipment_name}</p><p className="text-xs text-slate-400">{r.equipment_code}</p></div> },
          { header: "Role", render: (r) => r.requested_role },
          { header: "Approvers", render: (r) => <span className="text-xs text-slate-500">{r.hod_name} · {r.qa_name}</span> },
          { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { header: "Submitted", render: (r) => <span className="whitespace-nowrap text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</span> },
          { header: "", render: (r) => <Link to={`/requests/${r.request_code}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">View <ArrowRight size={13} /></Link> },
        ]} />}
      </Card>
    </div>
  );
}
