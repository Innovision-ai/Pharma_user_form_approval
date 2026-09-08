import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { AccessRequest } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, FieldLabel, Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

export function ITRequestsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.listItQueue().then(setItems).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openPin = (code: string) => {
    setPendingCode(code);
    setPin("");
    setPinOpen(true);
  };

  const handleComplete = async () => {
    if (!pin.trim() || !pendingCode) {
      showToast("Please enter your PIN.", "error");
      return;
    }
    setBusy(true);
    try {
      await api.completeRequest(pendingCode, pin);
      showToast(`${pendingCode} marked as access completed.`);
      setPinOpen(false);
      setPendingCode(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to complete", "error");
    } finally {
      setBusy(false);
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
                    <Button size="sm" onClick={() => openPin(r.request_code)}>
                      Mark Access Granted
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={pinOpen}
        title="Authentication Required"
        onClose={() => { setPinOpen(false); setPendingCode(null); }}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setPinOpen(false); setPendingCode(null); }}>
              Cancel
            </Button>
            <Button onClick={handleComplete} disabled={busy}>
              {busy ? "Verifying..." : "Confirm"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Enter your 4-digit PIN to confirm marking access as granted.
          </p>
          <Field>
            <FieldLabel>PIN</FieldLabel>
            <Input
              type="password"
              maxLength={10}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
