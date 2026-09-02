import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { AccessRequest } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";

export function ITRequestsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.listItQueue().then(setItems).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleComplete = async (code: string) => {
    try {
      await api.completeRequest(code);
      showToast(`${code} marked as access completed.`);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to complete", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">IT Requests</h1>
        <p className="text-sm text-slate-500">Approved requests awaiting provisioning, and recently completed ones.</p>
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
              { header: "Employee", render: (r) => r.employee_name },
              { header: "Equipment", render: (r) => r.equipment_name },
              { header: "Role", render: (r) => r.requested_role },
              { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
              {
                header: "",
                render: (r) =>
                  r.status === "IT_PENDING" ? (
                    <Button size="sm" onClick={() => handleComplete(r.request_code)}>
                      Mark Access Granted
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
