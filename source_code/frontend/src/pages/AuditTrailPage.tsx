import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AuditLog } from "../types";
import { Card, CardBody } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Field, FieldLabel, Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { PageHeader } from "../components/ui/PageHeader";
import { formatDateTime } from "../lib/format";

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
      <PageHeader
        eyebrow="Compliance"
        title="Audit Trail"
        description="Complete, append-only log of every action taken in the system."
      />

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
            <Button variant="secondary" onClick={handleClear}>Clear</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        {loading ? (
          <div className="space-y-3 p-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10" />)}</div>
        ) : (
          <DataTable
            rows={items}
            rowKey={(r) => `${r.timestamp}-${r.user_employee_id}-${r.action}-${r.request_code ?? "none"}`}
            emptyMessage="No audit entries match these filters."
            maxHeight="fill"
            columns={[
              { header: "Timestamp", render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.timestamp)}</span> },
              { header: "Request", render: (r) => r.request_code ? <Badge>{r.request_code}</Badge> : <span className="text-slate-400">—</span> },
              { header: "Entity", render: (r) => r.entity ? <span className="text-sm">{r.entity}</span> : <span className="text-slate-400">—</span> },
              { header: "User", render: (r) => <span className="whitespace-nowrap">{r.user_name} <span className="text-slate-400">({r.user_employee_id})</span></span> },
              { header: "Action", render: (r) => <Badge tone="blue">{r.action}</Badge> },
              { header: "Field", render: (r) => r.field_name ?? <span className="text-slate-400">—</span> },
              {
                header: "Old Value",
                render: (r) => r.old_value
                  ? <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700 font-mono">{r.old_value}</span>
                  : <span className="text-slate-400">—</span>,
              },
              {
                header: "New Value",
                render: (r) => r.new_value
                  ? <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700 font-mono">{r.new_value}</span>
                  : <span className="text-slate-400">—</span>,
              },
              { header: "Details", className: "px-6 py-4 min-w-[280px] max-w-[420px] whitespace-normal", render: (r) => <span className="text-sm text-slate-600">{r.description}</span> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
