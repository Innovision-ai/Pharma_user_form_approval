import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Notification } from "../types";
import { Card, CardBody } from "../components/ui/Card";
import { Field, FieldLabel, Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestCode, setRequestCode] = useState("");

  const load = () => {
    setLoading(true);
    api
      .listNotifications(requestCode || undefined)
      .then(setItems)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Notifications</h1>
        <p className="text-sm text-slate-500">
          Mock notification log — in production these would be sent as real emails.
        </p>
      </div>

      <Card>
        <CardBody>
          <div className="flex items-end gap-4">
            <Field className="flex-1">
              <FieldLabel>Request Code</FieldLabel>
              <Input value={requestCode} onChange={(e) => setRequestCode(e.target.value)} placeholder="REQ-0001" />
            </Field>
            <Button onClick={load}>Filter</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          {loading && <p className="py-10 text-center text-sm text-slate-500">Loading...</p>}
          {!loading && items.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-500">No notifications found.</p>
          )}
          {items.map((n) => (
            <div
              key={`${n.created_at}-${n.recipient_email}-${n.subject}`}
              className="rounded-md border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">
                  {n.request_code ?? "-"} · To: {n.recipient_name} ({n.recipient_email})
                </p>
                <p className="text-xs text-slate-400">{new Date(n.created_at).toLocaleString()}</p>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-800">{n.subject}</p>
              <p className="text-sm text-slate-600">{n.body}</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
