import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { AssetCreationRequest } from "../types";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/Button";
import { Field, FieldLabel, Textarea } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div><p className="text-xs font-medium text-slate-500">{label}</p><p className="text-sm font-semibold text-slate-800">{value || "—"}</p></div>;
}

export function AssetRequestDetailPage() {
  const { code } = useParams<{ code: string }>();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [request, setRequest] = useState<AssetCreationRequest | null>(null);
  const [comment, setComment] = useState("");

  const load = () => { if (code) api.getAssetRequest(code).then(setRequest).catch(e => showToast(e.message, "error")); };
  useEffect(load, [code]);

  if (!request) return <p className="text-sm text-slate-500">Loading request...</p>;

  const uid = currentUser?.employee_id;
  const role = currentUser?.role;
  const s = request.status;

  const act = async (fn: () => Promise<AssetCreationRequest>, msg: string) => {
    try { await fn(); showToast(msg); setComment(""); load(); }
    catch (e) { showToast(e instanceof Error ? e.message : "Action failed", "error"); }
  };

  const isReviewer = request.reviewer_id === uid;
  const isIT = request.it_executor_id === uid || role === "IT";
  const isQA = request.qa_approver_id === uid || role === "QA";
  const isInitiator = request.employee_id === uid;
  const isAdmin = role === "ADMIN";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Asset creation request</p>
          <h1 className="text-xl font-bold text-slate-900">{request.request_code}</h1>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {request.rejection_reason && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {request.rejection_reason}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>System details</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <Info label="Computer name" value={request.computer_name} />
            <Info label="Validation report no." value={request.validation_summary_report_no} />
            <Info label="Approval date" value={request.approval_date} />
            <Info label="Change control no." value={request.change_control_no} />
            <Info label="Plant" value={request.plant} />
            <Info label="Initiator" value={`${request.employee_name} (${request.employee_id})`} />
            <Info label="Created" value={new Date(request.created_at).toLocaleString()} />
          </div>
          {request.primary_function && (
            <div className="mt-4">
              <p className="text-xs font-medium text-slate-500">Primary function</p>
              <p className="text-sm text-slate-800">{request.primary_function}</p>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Workflow action</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <Field><FieldLabel>Comment</FieldLabel><Textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment or correction note..." /></Field>
          <div className="flex flex-wrap justify-end gap-2">
            {s === "CREATED" && (isReviewer || isAdmin) && (
              <Button onClick={() => act(() => api.assetReviewComplete(request.request_code, comment), "Review completed.")}>Complete review</Button>
            )}
            {s === "UNDER_IT_REVIEW" && (isIT || isAdmin) && (
              <Button onClick={() => act(() => api.assetITReviewComplete(request.request_code, comment), "IT review completed.")}>Complete IT review</Button>
            )}
            {s === "UNDER_APPROVAL" && (isQA || isAdmin) && (
              <Button onClick={() => act(() => api.assetQAApprove(request.request_code, comment), "Approved.")}>QA Approve</Button>
            )}
            {["CREATED", "UNDER_REVIEW", "UNDER_IT_REVIEW", "UNDER_APPROVAL"].includes(s) && (isReviewer || isIT || isQA || isAdmin) && (
              <>
                <Button variant="secondary" onClick={() => act(() => api.assetCorrection(request.request_code, comment || "Please correct and resubmit."), "Correction requested.")}>Request correction</Button>
                <Button variant="danger" onClick={() => act(() => api.assetReject(request.request_code, comment), "Rejected.")}>Reject</Button>
              </>
            )}
            {s === "CORRECTION_REQUIRED" && isInitiator && (
              <Button onClick={() => act(() => api.assetResubmit(request.request_code, comment), "Resubmitted.")}>Resubmit</Button>
            )}
            {!["APPROVED", "REJECTED", "CANCELLED"].includes(s) && (isInitiator || isAdmin) && (
              <Button variant="danger" onClick={() => act(() => api.assetCancel(request.request_code, comment), "Cancelled.")}>Cancel</Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
