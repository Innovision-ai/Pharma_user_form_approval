import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { formatDate, formatDateTime } from "../lib/format";
import type { AssetCreationRequest, AuditLog } from "../types";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { StatusBadge, statusLabel } from "../components/StatusBadge";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Field, FieldLabel, Textarea } from "../components/ui/Input";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toast";
import { RequestTypeBadge } from "./AssetRequestsPage";

const OPEN = ["CREATED", "UNDER_REVIEW", "CORRECTION_REQUIRED", "UNDER_IT_REVIEW", "UNDER_APPROVAL"];
const ACTIONABLE = ["CREATED", "UNDER_REVIEW", "UNDER_IT_REVIEW", "UNDER_APPROVAL"];
// Roles that may act on a stage nobody was assigned to (mirrors backend STAGE_ROLES)
const STAGE_ROLES: Record<string, string[]> = {
  CREATED: ["HOD", "ADMIN"],
  UNDER_IT_REVIEW: ["IT", "ADMIN"],
  UNDER_APPROVAL: ["QA", "ADMIN"],
};
const STAGE_NAMES: Record<string, string> = {
  CREATED: "reviewer", UNDER_REVIEW: "reviewer", UNDER_IT_REVIEW: "IT executor", UNDER_APPROVAL: "QA approver",
  CORRECTION_REQUIRED: "initiator correction",
};

function stageAssignee(r: AssetCreationRequest): string | null | undefined {
  switch (r.status) {
    case "CREATED":
    case "UNDER_REVIEW": return r.reviewer_id;
    case "UNDER_IT_REVIEW": return r.it_executor_id;
    case "UNDER_APPROVAL": return r.qa_approver_id;
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

type Action = "review" | "it" | "qa" | "correction" | "reject" | "resubmit" | "cancel";

export function AssetRequestDetailPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [request, setRequest] = useState<AssetCreationRequest | null>(null);
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [openRetire, setOpenRetire] = useState<AssetCreationRequest | null>(null);
  const [comment, setComment] = useState("");
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!code) return;
    api.getAssetRequest(code)
      .then((r) => {
        setRequest(r);
        if (r.request_type !== "RETIRE" && r.status === "APPROVED" && r.equipment_code) {
          api.listAssetRequests({ equipment_code: r.equipment_code, request_type: "RETIRE" })
            .then((list) => setOpenRetire(list.find((x) => OPEN.includes(x.status) || x.status === "APPROVED") ?? null))
            .catch(() => setOpenRetire(null));
        }
      })
      .catch((e) => showToast(e instanceof Error ? e.message : "Failed to load", "error"));
    api.listAudit({ request_code: code }).then(setHistory).catch(() => setHistory([]));
  }, [code, showToast]);
  useEffect(load, [load]);

  if (!request) return <p className="text-sm text-slate-500">Loading request...</p>;

  const uid = currentUser?.employee_id;
  const role = currentUser?.role ?? "";
  const s = request.status;
  const assignee = stageAssignee(request);
  const isStageActor = ACTIONABLE.includes(s) && (assignee ? assignee === uid : (STAGE_ROLES[s] ?? ["ADMIN"]).includes(role));
  const isInitiator = request.employee_id === uid;
  const canCancel = OPEN.includes(s) && (isInitiator || role === "ADMIN");
  const isRetire = request.request_type === "RETIRE";
  const canRaiseRetire = !isRetire && s === "APPROVED" && !!request.equipment_code && ["EMPLOYEE", "ADMIN", "INVENTORY_REQUESTOR"].includes(role);

  const LABELS: Record<Action, { title: string; message: string; label: string; done: string; danger?: boolean }> = {
    review: { title: "Complete review?", message: "Forward this request to IT review.", label: "Yes, complete review", done: "Review completed." },
    it: { title: "Complete IT review?", message: "Forward this request to QA approval.", label: "Yes, complete IT review", done: "IT review completed." },
    qa: {
      title: "QA approve?",
      message: isRetire
        ? `Approving retires equipment ${request.equipment_code}; it will be removed from PM, backup and periodic review.`
        : "Approve this asset request. A new system is registered in Equipment Master (Under validation).",
      label: "Yes, approve", done: "Approved.",
    },
    correction: { title: "Send back for correction?", message: "The initiator must correct and resubmit.", label: "Yes, send back", done: "Correction requested." },
    reject: { title: "Reject request?", message: "This closes the request.", label: "Yes, reject", done: "Rejected.", danger: true },
    resubmit: { title: "Resubmit request?", message: "The request returns to review.", label: "Yes, resubmit", done: "Resubmitted." },
    cancel: { title: "Cancel request?", message: "This cannot be undone.", label: "Yes, cancel", done: "Cancelled.", danger: true },
  };

  const open = (a: Action) => {
    if (a === "correction" && !comment.trim()) return showToast("A comment is required to send back for correction.", "error");
    setConfirm(a);
  };

  const run = async () => {
    if (!confirm) return;
    const rc = request.request_code;
    const c = comment.trim() || undefined;
    const calls: Record<Action, () => Promise<AssetCreationRequest>> = {
      review: () => api.assetReviewComplete(rc, c),
      it: () => api.assetITReviewComplete(rc, c),
      qa: () => api.assetQAApprove(rc, c),
      correction: () => api.assetCorrection(rc, comment.trim()),
      reject: () => api.assetReject(rc, c),
      resubmit: () => api.assetResubmit(rc, c),
      cancel: () => api.assetCancel(rc, c),
    };
    setBusy(true);
    try {
      await calls[confirm]();
      showToast(LABELS[confirm].done);
      setConfirm(null); setComment(""); load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Action failed", "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/asset-requests" className="text-sm font-medium text-brand-600 hover:underline">&larr; Asset Requests</Link>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Asset {isRetire ? "retire" : "creation"} request</p>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{request.request_code}</h1>
            <RequestTypeBadge type={request.request_type} />
          </div>
        </div>
        <StatusBadge status={s} />
      </div>

      {request.rejection_reason && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">{s === "REJECTED" ? "Rejection reason: " : "Correction required: "}</span>
          {request.rejection_reason}
        </div>
      )}

      {s === "APPROVED" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>
            {isRetire
              ? `Equipment retired: ${request.equipment_code} is now Retired.`
              : `Approved. Equipment ${request.equipment_code ?? ""} can now be marked Validated in Equipment Master.`}
          </span>
          {canRaiseRetire && (openRetire ? (
            <span>
              Retire request <Link className="font-semibold underline" to={`/asset-requests/${openRetire.request_code}`}>{openRetire.request_code}</Link> ({statusLabel(openRetire.status)})
            </span>
          ) : (
            <Button size="sm" variant="danger" onClick={() => navigate(`/asset-requests/new?retire=${request.equipment_code}`)}>Raise retire request</Button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>System details</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Linked equipment</p>
              {request.equipment_code
                ? <Link to={`/equipment/${request.equipment_code}`} className="text-sm font-semibold text-brand-600 hover:underline">{request.equipment_code}</Link>
                : <p className="text-sm font-semibold text-slate-800">— (created on approval)</p>}
            </div>
            <Info label="System name" value={request.system_name} />
            <Info label="System ID" value={request.system_id} />
            <Info label="System type" value={request.system_type} />
            <Info label="Make" value={request.make} />
            <Info label="Model" value={request.model_name} />
            <Info label="Application" value={request.application_name} />
            <Info label="GAMP category" value={request.gamp_category ? `Category ${request.gamp_category}` : null} />
            <Info label="USP classification" value={request.usp_classification} />
            <Info label="Department" value={request.department} />
            <Info label="Location" value={request.location} />
            <Info label="DB server" value={request.db_server_name} />
            <Info label="Computer System ID" value={request.computer_name} />
            <Info label="Validation report no." value={request.validation_summary_report_no} />
            <Info label="Approval date" value={request.approval_date ? formatDate(request.approval_date) : null} />
            <Info label="Change control no." value={request.change_control_no} />
            <Info label="Plant" value={request.plant} />
            <Info label="Initiator" value={`${request.employee_name} (${request.employee_id})`} />
            <Info label="Reviewer" value={request.reviewer_id ?? "Any reviewer"} />
            <Info label="IT executor" value={request.it_executor_id ?? "Any IT executor"} />
            <Info label="QA approver" value={request.qa_approver_id ?? "Any QA approver"} />
            <Info label="Created" value={formatDateTime(request.created_at)} />
          </div>
          {request.primary_function && (
            <div className="mt-4">
              <p className="text-xs font-medium text-slate-500">{isRetire ? "Reason for retirement" : "Primary function"}</p>
              <p className="text-sm text-slate-800">{request.primary_function}</p>
            </div>
          )}
        </CardBody>
      </Card>

      {isStageActor || (s === "CORRECTION_REQUIRED" && isInitiator) ? (
        <Card>
          <CardHeader><CardTitle>Workflow action</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <Field>
              <FieldLabel>Comment (required to send back)</FieldLabel>
              <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment or correction note..." />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              {isStageActor && (
                <>
                  <Button variant="secondary" onClick={() => open("correction")}>Send back for correction</Button>
                  <Button variant="danger" onClick={() => open("reject")}>Reject</Button>
                  {s === "CREATED" &&<Button onClick={() => open("review")}>Complete review</Button>}
                  {s === "UNDER_IT_REVIEW" && <Button onClick={() => open("it")}>Complete IT review</Button>}
                  {s === "UNDER_APPROVAL" && <Button onClick={() => open("qa")}>QA approve</Button>}
                </>
              )}
              {s === "CORRECTION_REQUIRED" && isInitiator && <Button onClick={() => open("resubmit")}>Resubmit</Button>}
              {canCancel && <Button variant="danger" onClick={() => open("cancel")}>Cancel request</Button>}
            </div>
          </CardBody>
        </Card>
      ) : OPEN.includes(s) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span>Waiting on {STAGE_NAMES[s] ?? s}{assignee ? ` (${assignee})` : ""}. Only the assigned user can act on this step.</span>
          {canCancel && <Button variant="danger" size="sm" onClick={() => open("cancel")}>Cancel request</Button>}
        </div>
      ) : null}

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

      <ConfirmDialog
        open={confirm !== null}
        title={confirm ? LABELS[confirm].title : ""}
        message={confirm ? LABELS[confirm].message : ""}
        confirmLabel={confirm ? LABELS[confirm].label : "Yes"}
        danger={confirm ? LABELS[confirm].danger : false}
        busy={busy}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
