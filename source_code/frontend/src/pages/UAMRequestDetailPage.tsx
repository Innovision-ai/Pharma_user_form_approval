import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type ESign } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { formatDate, formatDateTime } from "../lib/format";
import type { AuditLog, UAMRequest } from "../types";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { StatusBadge, statusLabel } from "../components/StatusBadge";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Field, FieldLabel, Input, Textarea } from "../components/ui/Input";
import { CredentialsDialog } from "../components/ui/CredentialsDialog";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toast";
import { EquipmentNetworkInfo } from "../components/requests/EquipmentNetworkInfo";
import { ReassignDialog, STAGE_LABELS, currentAssignee, reassignableStages, type ReassignStage } from "../components/requests/ReassignDialog";
import { TempPasswordDialog } from "../components/requests/TempPasswordDialog";
import { TEMPLATE_LABELS } from "./UAMRequestsPage";

type SignedAction = "approve" | "correction" | "reject" | "resubmit" | "execute";

const STAGE_NAMES: Record<string, string> = {
  PENDING_REVIEW: "reviewer",
  PENDING_DEPARTMENT_APPROVAL: "department approver",
  PENDING_QA_APPROVAL: "QA approver",
  PENDING_EXECUTION: "IT executor",
  SUSPENDED: "IT executor",
  PENDING_INITIATOR_ACK: "initiator acknowledgement",
  CORRECTION_REQUIRED: "initiator correction",
};
const CLOSED = ["COMPLETED", "REJECTED", "CANCELLED"];
const APPROVAL_STAGES = ["PENDING_REVIEW", "PENDING_DEPARTMENT_APPROVAL", "PENDING_QA_APPROVAL"];
const EXECUTION_STAGES = ["PENDING_EXECUTION", "SUSPENDED"];
const NEEDS_PASSWORD = ["CREATE", "UNLOCK", "CHANGE_PASSWORD"];

const SIGN_TITLES: Record<SignedAction, string> = {
  approve: "E-signature: approve request",
  correction: "E-signature: send back for correction",
  reject: "E-signature: reject request",
  resubmit: "E-signature: resubmit request",
  execute: "E-signature: complete execution",
};

function stageAssignee(r: UAMRequest): string | null {
  switch (r.status) {
    case "PENDING_REVIEW": return r.reviewer_id;
    case "PENDING_DEPARTMENT_APPROVAL": return r.department_approver_id;
    case "PENDING_QA_APPROVAL": return r.qa_approver_id;
    case "PENDING_EXECUTION":
    case "SUSPENDED": return r.it_executor_id;
    case "PENDING_INITIATOR_ACK":
    case "CORRECTION_REQUIRED": return r.employee_id;
    default: return null;
  }
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value || "—"}</p>
    </div>
  );
}

export function UAMRequestDetailPage() {
  const { code } = useParams<{ code: string }>();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [request, setRequest] = useState<UAMRequest | null>(null);
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [comment, setComment] = useState("");
  const [userId, setUserId] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [signing, setSigning] = useState<SignedAction | null>(null);
  const [confirm, setConfirm] = useState<"acknowledge" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const [reassignStage, setReassignStage] = useState<ReassignStage | null>(null);
  const [revealed, setRevealed] = useState<{ password: string; userId?: string | null } | null>(null);

  const load = useCallback(() => {
    if (!code) return;
    api.getUAMRequest(code).then(setRequest).catch((e) => showToast(e instanceof Error ? e.message : "Failed to load", "error"));
    api.listAudit({ request_code: code }).then(setHistory).catch(() => setHistory([]));
  }, [code, showToast]);
  useEffect(load, [load]);

  if (!request) return <p className="text-sm text-slate-500">Loading request...</p>;

  const uid = currentUser?.employee_id;
  const s = request.status;
  const assignee = stageAssignee(request);
  const isExecution = EXECUTION_STAGES.includes(s);
  const isMyStage = !CLOSED.includes(s) && (
    assignee ? assignee === uid : isExecution && (currentUser?.role === "IT" || currentUser?.role === "ADMIN")
  );
  const isInitiator = request.employee_id === uid;
  const canCancel = !CLOSED.includes(s) && (isInitiator || currentUser?.role === "ADMIN");
  const folderPath = request.form_data?.folder_path as string | undefined;
  const assetName = request.form_data?.asset_name as string | undefined;
  const loginId = request.form_data?.user_login_id as string | undefined;
  const autoFrom = request.form_data?.auto_generated_from as string | undefined;
  const fd = request.form_data as Record<string, unknown>;
  // New account requested for someone else: IT shares the password verbally
  const verbalPassword = !!request.for_others && request.action === "CREATE";
  const passwordNeeded = NEEDS_PASSWORD.includes(request.action) && !verbalPassword;
  const canReassign = !CLOSED.includes(s) && (isInitiator || currentUser?.role === "ADMIN");
  const stages = canReassign ? reassignableStages(request) : [];

  const openSign = (a: SignedAction) => {
    if (a === "correction" && !comment.trim()) return showToast("A comment is required to send back for correction.", "error");
    if (a === "execute") {
      if (!userId.trim()) return showToast("Enter the user ID created on the system.", "error");
      if (passwordNeeded && !tempPassword) return showToast("Enter the temporary password.", "error");
    }
    setSigning(a);
  };

  const doSigned = async ({ password, reason }: { password: string; reason: string }) => {
    if (!signing) return;
    const sig: ESign = { auth_password: password, auth_reason: reason };
    const c = comment.trim() || undefined;
    const rc = request.request_code;
    const calls: Record<SignedAction, () => Promise<UAMRequest>> = {
      approve: () => api.approveUAMRequest(rc, sig, c),
      correction: () => api.requestUAMCorrection(rc, sig, comment.trim()),
      reject: () => api.rejectUAMRequest(rc, sig, c),
      resubmit: () => api.resubmitUAMRequest(rc, sig, c),
      execute: () => api.executeUAMRequest(rc, sig, userId.trim(), passwordNeeded ? tempPassword || undefined : undefined, c),
    };
    await calls[signing]();
    showToast({ approve: "Request approved.", correction: "Sent back for correction.", reject: "Request rejected.", resubmit: "Request resubmitted.", execute: "Execution recorded." }[signing]);
    setSigning(null); setComment(""); setUserId(""); setTempPassword("");
    load();
  };

  const doConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === "acknowledge") {
        const ack = await api.acknowledgeUAMRequest(request.request_code, comment.trim() || undefined);
        if (ack.temporary_password) {
          setRevealed({ password: ack.temporary_password, userId: (ack.form_data?.user_login_id as string | undefined) ?? loginId });
        }
      } else {
        await api.cancelUAMRequest(request.request_code, comment.trim() || undefined);
      }
      showToast(confirm === "acknowledge" ? "Request acknowledged and closed." : "Request cancelled.");
      setConfirm(null); setComment(""); load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Action failed", "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/uam/requests" className="text-sm font-medium text-brand-600 hover:underline">&larr; Requests</Link>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Request</p>
          <h1 className="text-xl font-bold text-slate-900">{request.request_code}</h1>
        </div>
        <StatusBadge status={s} />
      </div>

      {autoFrom && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          Raised automatically by the system: the temporary login from{" "}
          <Link className="font-semibold underline" to={`/uam/requests/${autoFrom}`}>{autoFrom}</Link> expired.
        </div>
      )}
      {request.auto_deactivation_code && request.auto_deactivation_code !== "N/A" && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          Temporary login expired — deactivation request{" "}
          <Link className="font-semibold underline" to={`/uam/requests/${request.auto_deactivation_code}`}>{request.auto_deactivation_code}</Link> was raised automatically.
        </div>
      )}
      {s === "PENDING_INITIATOR_ACK" && request.has_temp_password && isInitiator && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          IT has set a temporary password. It is not sent by email — it will be shown to you once when you acknowledge this request.
        </div>
      )}
      {request.rejection_reason && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">{s === "REJECTED" ? "Rejection reason: " : "Correction required: "}</span>
          {request.rejection_reason}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Request summary</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Template" value={TEMPLATE_LABELS[request.template] ?? request.template} />
            <Info label={request.asset_type === "FOLDER" ? "Folder / Project" : "Asset"} value={assetName ? `${request.asset_code} · ${assetName}` : request.asset_code} />
            {folderPath && <Info label="Folder path" value={folderPath} />}
            <Info label="Action" value={request.action} />
            <Info label={request.asset_type === "FOLDER" ? "Permission" : "Requested role"} value={request.requested_role} />
            <Info label="Plant" value={request.plant} />
            <Info label="Initiator" value={`${request.employee_name} (${request.employee_id})`} />
            <Info label="Reviewer" value={request.reviewer_id} />
            <Info label="Department approver" value={request.department_approver_id} />
            <Info label="QA approver" value={request.qa_approver_id} />
            <Info label="IT executor" value={request.it_executor_id ?? "Any IT executor"} />
            <Info label="Created" value={formatDateTime(request.created_at)} />
            {loginId && <Info label="User ID created" value={loginId} />}
            {request.auth_reason && <Info label="Last e-signature reason" value={request.auth_reason} />}
            {request.for_others && (
              <Info
                label="Requested for"
                value={`${request.beneficiary_name ?? ""} (${request.beneficiary_employee_id ?? ""})${request.beneficiary_department ? ` · ${request.beneficiary_department}` : ""}`}
              />
            )}
            {request.for_others && request.beneficiary_email && <Info label="Email" value={request.beneficiary_email} />}
            {request.temporary_login && (
              <Info
                label="Temporary login"
                value={request.access_expires_on
                  ? `${request.temporary_days} days — expires ${formatDate(request.access_expires_on)}`
                  : `${request.temporary_days} days (from acknowledgement)`}
              />
            )}
          </div>
          {request.asset_type !== "FOLDER" && (fd.computer_system_id || fd.hostname || fd.ip_address) ? (
            <div className="mt-4">
              <EquipmentNetworkInfo
                csid={fd.computer_system_id as string | null}
                hostname={fd.hostname as string | null}
                ip={fd.ip_address as string | null}
              />
            </div>
          ) : null}
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-500">Reason</p>
            <p className="text-sm text-slate-800">{request.reason}</p>
          </div>
          {request.training_completed && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm">
              <span className="text-slate-600">All required trainings completed:</span>
              <Badge tone={request.training_completed === "YES" ? "green" : "amber"}>{request.training_completed === "YES" ? "Yes" : "NA"}</Badge>
              {request.training_remark && <span className="text-slate-700">— {request.training_remark}</span>}
              {request.training_attachment_id != null && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => api.downloadAttachment(request.training_attachment_id as number, "training-record")
                    .catch((e) => showToast(e instanceof Error ? e.message : "Download failed", "error"))}
                >
                  Download training record
                </Button>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {isMyStage ? (
        <Card>
          <CardHeader><CardTitle>Workflow action</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <Field>
              <FieldLabel>Comment{s !== "PENDING_INITIATOR_ACK" ? " (required to send back)" : ""}</FieldLabel>
              <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a note for this step..." />
            </Field>
            {isExecution && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>User ID *</FieldLabel>
                  <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="ID created on the system" />
                </Field>
                {verbalPassword ? (
                  <div className="self-end rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-700">
                    New user requested by someone else: <strong>password will be shared verbally</strong>.
                  </div>
                ) : (
                  <Field>
                    <FieldLabel>Temporary password{passwordNeeded ? " *" : " (not required)"}</FieldLabel>
                    <Input type="password" autoComplete="new-password" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} disabled={!passwordNeeded} />
                    {passwordNeeded && <p className="mt-1 text-xs text-slate-500">Not emailed — shown once to the initiator at acknowledgement.</p>}
                  </Field>
                )}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {APPROVAL_STAGES.includes(s) && (
                <>
                  <Button variant="secondary" onClick={() => openSign("correction")}>Send back for correction</Button>
                  <Button variant="danger" onClick={() => openSign("reject")}>Reject</Button>
                  <Button onClick={() => openSign("approve")}>Approve</Button>
                </>
              )}
              {isExecution && (
                <>
                  <Button variant="secondary" onClick={() => openSign("correction")}>Send back for correction</Button>
                  <Button onClick={() => openSign("execute")}>Complete execution</Button>
                </>
              )}
              {s === "CORRECTION_REQUIRED" && <Button onClick={() => openSign("resubmit")}>Resubmit</Button>}
              {s === "PENDING_INITIATOR_ACK" && <Button onClick={() => setConfirm("acknowledge")}>Acknowledge & close</Button>}
              {canCancel && <Button variant="danger" onClick={() => setConfirm("cancel")}>Cancel request</Button>}
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span>
            {CLOSED.includes(s)
              ? `This request is closed (${statusLabel(s)}).`
              : `Waiting on ${STAGE_NAMES[s] ?? s}${assignee ? ` (${assignee})` : ""}. Only the assigned user can act on this step.`}
          </span>
          {canCancel && <Button variant="danger" size="sm" onClick={() => setConfirm("cancel")}>Cancel request</Button>}
        </div>
      )}

      {stages.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Assigned users</CardTitle></CardHeader>
          <CardBody>
            <p className="mb-3 text-sm text-slate-600">If an assigned user is absent you can hand the step to someone else. Changes are recorded in the audit trail.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {stages.map((st) => (
                <div key={st} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">{STAGE_LABELS[st]}</p>
                    <p className="text-sm font-semibold text-slate-800">{currentAssignee(request, st) ?? "Not assigned"}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setReassignStage(st)}>Change assigned user</Button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardBody>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">No history recorded.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((h, i) => (
                <li key={`${h.timestamp}-${i}`} className="border-l-2 border-brand-200 pl-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono">{formatDateTime(h.timestamp)}</span>
                    <span>·</span>
                    <span className="font-semibold text-slate-700">{h.user_name} ({h.user_employee_id})</span>
                    <Badge tone="blue">{h.action}</Badge>
                    {h.new_value && <span>{h.old_value ? `${statusLabel(h.old_value)} → ` : ""}{statusLabel(h.new_value)}</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{h.description}</p>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <CredentialsDialog
        open={signing !== null}
        title={signing ? SIGN_TITLES[signing] : ""}
        description="Enter your password and a reason to sign this step."
        requireReason
        confirmLabel="Sign"
        onConfirm={doSigned}
        onClose={() => setSigning(null)}
      />
      <ReassignDialog
        request={request}
        stage={reassignStage}
        onClose={() => setReassignStage(null)}
        onDone={() => { setReassignStage(null); showToast("Assigned user changed."); load(); }}
      />
      <TempPasswordDialog password={revealed?.password ?? null} userId={revealed?.userId} onClose={() => setRevealed(null)} />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "acknowledge" ? "Acknowledge request?" : "Cancel request?"}
        message={confirm === "acknowledge"
          ? "Confirm you have received the access / credentials. The request will be closed."
          : "Do you want to cancel this request? This cannot be undone."}
        confirmLabel={confirm === "acknowledge" ? "Yes, acknowledge" : "Yes, cancel"}
        danger={confirm === "cancel"}
        busy={busy}
        onConfirm={doConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
