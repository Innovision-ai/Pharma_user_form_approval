import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AuditLog } from "../types";
import { Card, CardBody } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Field, FieldLabel, Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

export function AuditTrailPage() {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [requestCode, setRequestCode] = useState("");
  const [user, setUser] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = () => {
    setLoading(true);
    api
      .listAudit({
        request_code: requestCode || undefined,
        user: user || undefined,
        action: action || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
      .then(setItems)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleClear = () => {
    setRequestCode("");
    setUser("");
    setAction("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Audit Trail</h1>
        <p className="text-sm text-slate-500">Complete, append-only log of every action taken in the system.</p>
      </div>

      <Card>
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Field>
              <FieldLabel>Request Code</FieldLabel>
              <Input value={requestCode} onChange={(e) => setRequestCode(e.target.value)} placeholder="REQ-0001" />
            </Field>
            <Field>
              <FieldLabel>User</FieldLabel>
              <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Name contains..." />
            </Field>
            <Field>
              <FieldLabel>Action</FieldLabel>
              <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="APPROVE..." />
            </Field>
            <Field>
              <FieldLabel>From</FieldLabel>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>To</FieldLabel>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={load}>Apply Filters</Button>
            <Button variant="secondary" onClick={handleClear}>
              Clear
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Loading...</p>
        ) : (
          <DataTable
            rows={items}
            rowKey={(r) => `${r.timestamp}-${r.user_employee_id}-${r.action}-${r.request_code ?? "none"}`}
            emptyMessage="No audit entries match these filters."
            columns={[
              { header: "Timestamp", render: (r) => new Date(r.timestamp).toLocaleString() },
              { header: "Request", render: (r) => r.request_code ?? "-" },
              { header: "User", render: (r) => `${r.user_name} (${r.user_employee_id})` },
              { header: "Action", render: (r) => r.action },
              { header: "Details", render: (r) => r.description },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
