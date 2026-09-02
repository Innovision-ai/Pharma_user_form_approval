import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { AccessRequest } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/Button";

export function MyRequestsPage() {
  const [items, setItems] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listMyRequests().then(setItems).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Requests</h1>
          <p className="text-sm text-slate-500">Every access request you have submitted.</p>
        </div>
        <Link to="/requests/new">
          <Button>+ New Request</Button>
        </Link>
      </div>

      <Card>
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Loading...</p>
        ) : (
          <DataTable
            rows={items}
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
              { header: "Equipment", render: (r) => r.equipment_name },
              { header: "Role", render: (r) => r.requested_role },
              { header: "HOD", render: (r) => r.hod_name },
              { header: "QA", render: (r) => r.qa_name },
              { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { header: "Submitted", render: (r) => new Date(r.created_at).toLocaleString() },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
