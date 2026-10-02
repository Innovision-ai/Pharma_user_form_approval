import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { AssetCreationRequest } from "../types";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/Button";

export function AssetRequestsPage() {
  const [items, setItems] = useState<AssetCreationRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.listAssetRequests(statusFilter ? { status: statusFilter } : undefined)
      .then(setItems)
      .finally(() => setLoading(false));
  };
  useEffect(load, [statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Asset Creation Requests</h1>
          <p className="text-sm text-slate-500">Register new computerized systems through the review and approval workflow.</p>
        </div>
        <Link to="/asset-requests/new"><Button>New asset request</Button></Link>
      </div>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Request queue</CardTitle>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="CREATED">Created</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="CORRECTION_REQUIRED">Correction Required</option>
            <option value="UNDER_IT_REVIEW">IT Review</option>
            <option value="UNDER_APPROVAL">QA Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </CardHeader>
        <CardBody>
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading...</p> : (
            <DataTable
              rows={items}
              rowKey={r => r.request_code}
              emptyMessage="No asset creation requests found."
              columns={[
                { header: "Request", render: r => <Link className="font-semibold text-brand-600" to={`/asset-requests/${r.request_code}`}>{r.request_code}</Link> },
                { header: "System name", render: r => r.system_name || "—" },
                { header: "System type", render: r => r.system_type || "—" },
                { header: "Make", render: r => r.make || "—" },
                { header: "GAMP", render: r => r.gamp_category ? `Cat. ${r.gamp_category}` : "—" },
                { header: "Initiator", render: r => r.employee_name },
                { header: "Status", render: r => <StatusBadge status={r.status} /> },
                { header: "Created", render: r => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
