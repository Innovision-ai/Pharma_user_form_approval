import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/format";
import type { UAMRequest } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { PageHeader } from "../components/ui/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Input";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ui/Toast";

export const TEMPLATE_LABELS: Record<string, string> = {
  MANUFACTURING: "Manufacturing",
  QC: "QC",
  ERP: "ERP",
  FOLDER_PROJECT: "Folder / Project",
};

const STATUS_OPTIONS: [string, string][] = [
  ["PENDING_REVIEW", "Pending review"],
  ["PENDING_DEPARTMENT_APPROVAL", "Department approval"],
  ["PENDING_QA_APPROVAL", "QA approval"],
  ["PENDING_EXECUTION", "Pending execution"],
  ["PENDING_INITIATOR_ACK", "Awaiting acknowledgement"],
  ["CORRECTION_REQUIRED", "Correction required"],
  ["SUSPENDED", "Suspended"],
  ["COMPLETED", "Completed"],
  ["REJECTED", "Rejected"],
  ["CANCELLED", "Cancelled"],
];

function assetLabel(r: UAMRequest) {
  const name = r.form_data?.asset_name as string | undefined;
  return name ? `${r.asset_code} · ${name}` : r.asset_code;
}

export function UAMRequestsPage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<UAMRequest[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.listUAMRequests(status ? { status } : undefined)
      .then(setItems)
      .catch((err) => showToast(err instanceof Error ? err.message : "Failed to load requests", "error"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [status]);

  const canCreate = currentUser?.role === "EMPLOYEE" || currentUser?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow"
        title="Requests"
        description="User access, software and folder / project requests for the selected plant, with electronic review, approval, execution and acknowledgement."
        actions={canCreate && (
          <Link to="/uam/requests/new"><Button><Plus size={16} /> Create request</Button></Link>
        )}
      />

      <div className="surface flex flex-wrap items-center gap-3 p-4">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-xs">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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
            emptyMessage="No requests found."
            columns={[
              { header: "Request", render: (r) => <Link className="font-semibold text-brand-600 hover:text-brand-700" to={`/uam/requests/${r.request_code}`}>{r.request_code}</Link> },
              { header: "Template", render: (r) => <Badge tone="purple">{TEMPLATE_LABELS[r.template] ?? r.template}</Badge> },
              { header: "Asset", render: (r) => assetLabel(r) },
              { header: "Action", render: (r) => r.action },
              { header: "Role", render: (r) => r.requested_role },
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
