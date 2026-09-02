import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { AccessRequest } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { StatusBadge } from "../components/StatusBadge";

export function ApprovalsPage() {
  const [items, setItems] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listApprovals().then(setItems).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Approvals</h1>
        <p className="text-sm text-slate-500">Requests waiting on your review, assigned specifically to you.</p>
      </div>

      <Card>
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Loading...</p>
        ) : (
          <DataTable
            rows={items}
            rowKey={(r) => r.request_code}
            emptyMessage="Nothing awaiting your approval right now."
            columns={[
              {
                header: "Request",
                render: (r) => (
                  <Link to={`/requests/${r.request_code}`} className="font-medium text-brand-600 hover:underline">
                    {r.request_code}
                  </Link>
                ),
              },
              { header: "Employee", render: (r) => `${r.employee_name} (${r.employee_department})` },
              { header: "Equipment", render: (r) => r.equipment_name },
              { header: "Role", render: (r) => r.requested_role },
              { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { header: "Submitted", render: (r) => new Date(r.created_at).toLocaleString() },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
