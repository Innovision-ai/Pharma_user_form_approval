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
  const [authUsername, setAuthUsername] = useState("");
  const [pin, setPin] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.listItQueue().then(setItems).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openPin = (code: string) => {
    setPendingCode(code);
    setAuthUsername("");
    setPin("");
    setUserId("");
    setPassword("");
    setNotes("");
    setPinOpen(true);
  };

  const handleGrantAccess = async () => {
    if (!authUsername.trim() || !pin.trim() || !pendingCode || !userId.trim() || !password.trim()) {
      showToast("Please enter Employee ID, PIN, User ID, and Password.", "error");
      return;
    }
    setBusy(true);
    try {
      await api.grantAccess(pendingCode, userId, password, notes, pin);
      showToast(`${pendingCode} credentials submitted. Awaiting user acknowledgement.`);
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
                      Grant Access
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={pinOpen}
        title="Grant Equipment Access"
        onClose={() => { setPinOpen(false); setPendingCode(null); }}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setPinOpen(false); setPendingCode(null); }}>
              Cancel
            </Button>
            <Button onClick={handleGrantAccess} disabled={busy}>
              {busy ? "Submitting..." : "Grant Access"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Create credentials for this user and authenticate to grant access.
          </p>
          <Field>
            <FieldLabel>New User ID *</FieldLabel>
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. USER-123"
            />
          </Field>
          <Field>
            <FieldLabel>Temporary Password *</FieldLabel>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter temporary password"
            />
          </Field>
          <Field>
            <FieldLabel>Notes (Optional)</FieldLabel>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any remarks..."
            />
          </Field>
          <hr className="my-2" />
          <Field>
            <FieldLabel>Your IT Employee ID *</FieldLabel>
            <Input
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
              placeholder="Enter Employee ID"
            />
          </Field>
          <Field>
            <FieldLabel>Your PIN *</FieldLabel>
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
