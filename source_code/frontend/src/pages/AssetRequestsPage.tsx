import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/format";
import type { AssetCreationRequest } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { PageHeader } from "../components/ui/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Input";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ui/Toast";

export function RequestTypeBadge({ type }: { type?: string | null }) {
  return type === "RETIRE" ? <Badge tone="red">Retire</Badge> : <Badge tone="green">Create</Badge>;
}

export function AssetRequestsPage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<AssetCreationRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.listAssetRequests({ status: statusFilter || undefined, request_type: typeFilter || undefined })
      .then(setItems)
      .catch((e) => showToast(e instanceof Error ? e.message : "Failed to load asset requests", "error"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [statusFilter, typeFilter]);

  const canCreate = ["EMPLOYEE", "ADMIN", "INVENTORY_REQUESTOR"].includes(currentUser?.role ?? "");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory"
        title="Asset Requests"
        description="Register new computerized systems and retire existing ones through Reviewer → IT → QA approval."
        actions={canCreate && <Link to="/asset-requests/new"><Button><Plus size={16} /> New asset request</Button></Link>}
      />

      <div className="surface flex flex-wrap items-center gap-3 p-4">
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="max-w-[200px]">
          <option value="">All types</option>
          <option value="CREATE">Create</option>
          <option value="RETIRE">Retire</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-xs">
          <option value="">All statuses</option>
          <option value="CREATED">Pending review</option>
          <option value="CORRECTION_REQUIRED">Correction required</option>
          <option value="UNDER_IT_REVIEW">IT review</option>
          <option value="UNDER_APPROVAL">QA approval</option>
          <option value="APPROVED">Approved</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="REJECTED">Rejected</option>
        </Select>
        <Badge tone="blue">{items.length} requests</Badge>
      </div>

      <Card>
        {loading ? (
          <div className="space-y-3 p-6">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
        ) : (
          <DataTable
            rows={items}
            rowKey={(r) => r.request_code}
            emptyMessage="No asset requests found."
            columns={[
              { header: "Request", render: (r) => <Link className="font-semibold text-brand-600 hover:text-brand-700" to={`/asset-requests/${r.request_code}`}>{r.request_code}</Link> },
              { header: "Type", render: (r) => <RequestTypeBadge type={r.request_type} /> },
              { header: "Equipment", render: (r) => r.equipment_code
                ? <Link className="font-mono text-xs text-brand-600 hover:underline" to={`/equipment/${r.equipment_code}`}>{r.equipment_code}</Link>
                : <span className="text-slate-400">—</span> },
              { header: "System name", render: (r) => r.system_name || "—" },
              { header: "System type", render: (r) => r.system_type || "—" },
              { header: "GAMP", render: (r) => (r.gamp_category ? `Cat ${r.gamp_category}` : "—") },
              { header: "Initiator", render: (r) => r.employee_name },
              { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { header: "Created", render: (r) => <span className="whitespace-nowrap">{formatDate(r.created_at)}</span> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
