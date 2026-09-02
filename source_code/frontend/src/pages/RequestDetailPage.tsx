import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { AccessRequest, Notification } from "../types";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { StatusBadge } from "../components/StatusBadge";
import { RequestTimeline } from "../components/RequestTimeline";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, FieldLabel, Textarea } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  );
}

export function RequestDetailPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!code) return;
    api.getRequest(code).then(setRequest);
    api.listNotifications(code).then(setNotifications);
  };

  useEffect(load, [code]);

  if (!request || !currentUser) {
    return <p className="text-sm text-slate-500">Loading...</p>;
  }

  const canActOnHod = currentUser.role === "HOD" && currentUser.employee_id === request.hod_id && request.status === "PENDING_HOD";
  const canActOnQa = currentUser.role === "QA" && currentUser.employee_id === request.qa_id && request.status === "PENDING_QA";
  const canApproveOrReject = canActOnHod || canActOnQa;
  const canComplete = currentUser.role === "IT" && request.status === "IT_PENDING";

  const handleApprove = async () => {
    setBusy(true);
    try {
      await api.approveRequest(request.request_code);
      showToast("Request approved.");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Approve failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      showToast("Please provide a rejection reason.", "error");
      return;
    }
    setBusy(true);
    try {
      await api.rejectRequest(request.request_code, rejectReason);
      showToast("Request rejected.");
      setRejectOpen(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Reject failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    setBusy(true);
    try {
      await api.completeRequest(request.request_code);
      showToast("Access marked as granted.");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Complete failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => navigate(-1)} className="text-xs text-slate-500 hover:underline">
            ← Back
          </button>
          <h1 className="text-xl font-bold text-slate-900">{request.request_code}</h1>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <Card>
        <CardBody>
          <RequestTimeline request={request} />
        </CardBody>
      </Card>

      {request.status === "REJECTED" && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Rejected at {request.rejected_stage} stage: {request.rejection_reason}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Request Details</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label="Employee" value={`${request.employee_name} (${request.employee_department})`} />
            <DetailRow label="Equipment" value={`${request.equipment_code} - ${request.equipment_name}`} />
            <DetailRow label="Requested Role" value={request.requested_role} />
            <DetailRow label="HOD" value={request.hod_name} />
            <DetailRow label="QA" value={request.qa_name} />
            <DetailRow label="Submitted" value={new Date(request.created_at).toLocaleString()} />
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-500">Reason for Access</p>
            <p className="text-sm text-slate-800">{request.reason}</p>
          </div>
        </CardBody>
      </Card>

      {(canApproveOrReject || canComplete) && (
        <Card>
          <CardBody className="flex justify-end gap-2">
            {canApproveOrReject && (
              <>
                <Button variant="danger" onClick={() => setRejectOpen(true)} disabled={busy}>
                  Reject
                </Button>
                <Button onClick={handleApprove} disabled={busy}>
                  Approve
                </Button>
              </>
            )}
            {canComplete && (
              <Button onClick={handleComplete} disabled={busy}>
                Mark Access Granted
              </Button>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notification History</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {notifications.length === 0 && <p className="text-sm text-slate-500">No notifications yet.</p>}
          {notifications.map((n) => (
            <div
              key={`${n.created_at}-${n.recipient_email}-${n.subject}`}
              className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <p className="text-xs font-medium text-slate-500">
                To: {n.recipient_name} ({n.recipient_email}) - {new Date(n.created_at).toLocaleString()}
              </p>
              <p className="text-sm font-semibold text-slate-800">{n.subject}</p>
              <p className="text-sm text-slate-600">{n.body}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <Modal
        open={rejectOpen}
        title="Reject Request"
        onClose={() => setRejectOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleReject} disabled={busy}>
              Confirm Rejection
            </Button>
          </>
        }
      >
        <Field>
          <FieldLabel>Reason for Rejection</FieldLabel>
          <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
