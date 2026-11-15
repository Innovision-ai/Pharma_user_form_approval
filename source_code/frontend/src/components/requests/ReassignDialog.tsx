import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { UAMRequest, UAMSelectors } from "../../types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, FieldLabel, Select } from "../ui/Input";
import { CredentialsDialog } from "../ui/CredentialsDialog";

export type ReassignStage = "reviewer" | "department_approver" | "qa_approver" | "it_executor";

export const STAGE_LABELS: Record<ReassignStage, string> = {
  reviewer: "Reviewer",
  department_approver: "Department approver",
  qa_approver: "QA approver",
  it_executor: "IT executor",
};

const FIELD: Record<ReassignStage, keyof UAMRequest> = {
  reviewer: "reviewer_id",
  department_approver: "department_approver_id",
  qa_approver: "qa_approver_id",
  it_executor: "it_executor_id",
};

const LIST: Record<ReassignStage, keyof UAMSelectors> = {
  reviewer: "reviewers",
  department_approver: "department_approvers",
  qa_approver: "qa_approvers",
  it_executor: "it_executors",
};

/** Stages the initiator may still reassign (mirrors the backend's STAGE_FIELDS). */
export function reassignableStages(r: UAMRequest): ReassignStage[] {
  const s = r.status;
  const out: ReassignStage[] = [];
  if (s === "PENDING_REVIEW") out.push("reviewer");
  if (r.template !== "MANUFACTURING" && (s === "PENDING_REVIEW" || s === "PENDING_DEPARTMENT_APPROVAL")) out.push("department_approver");
  if (["PENDING_REVIEW", "PENDING_DEPARTMENT_APPROVAL", "PENDING_QA_APPROVAL"].includes(s)) out.push("qa_approver");
  if (["PENDING_REVIEW", "PENDING_DEPARTMENT_APPROVAL", "PENDING_QA_APPROVAL", "PENDING_EXECUTION", "SUSPENDED"].includes(s)) out.push("it_executor");
  return out;
}

export function currentAssignee(r: UAMRequest, stage: ReassignStage): string | null {
  return (r[FIELD[stage]] as string | null | undefined) ?? null;
}

/**
 * Proxy user: the initiator replaces an assigned user (absent, on leave...).
 * Choose the new user, then e-sign with a reason; the change is audited.
 */
export function ReassignDialog({
  request, stage, onClose, onDone,
}: { request: UAMRequest; stage: ReassignStage | null; onClose: () => void; onDone: () => void }) {
  const [selectors, setSelectors] = useState<UAMSelectors | null>(null);
  const [newUser, setNewUser] = useState("");
  const [signOpen, setSignOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!stage) return;
    setNewUser(""); setError("");
    api.getUAMSelectors().then(setSelectors).catch(() => setSelectors(null));
  }, [stage]);

  if (!stage) return null;
  const current = currentAssignee(request, stage);
  const candidates = (selectors?.[LIST[stage]] ?? []).filter((u) => u.id !== current && u.id !== request.employee_id);

  const sign = async ({ password, reason }: { password: string; reason: string }) => {
    await api.reassignUAMRequest(request.request_code, stage, newUser, { auth_password: password, auth_reason: reason });
    setSignOpen(false);
    onDone();
  };

  return (
    <>
      <Modal
        open={!signOpen}
        title={`Change ${STAGE_LABELS[stage].toLowerCase()}`}
        onClose={onClose}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => (newUser ? setSignOpen(true) : setError("Select the new user."))}
              disabled={!newUser}
            >
              Continue
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Currently assigned: <span className="font-semibold text-slate-800">{current ?? "nobody (any eligible user)"}</span>.
            Choose who should act instead, for example because the assigned user is absent. The change is recorded in the audit trail.
          </p>
          <Field>
            <FieldLabel>New {STAGE_LABELS[stage].toLowerCase()} *</FieldLabel>
            <Select aria-label="New assignee" value={newUser} onChange={(e) => { setNewUser(e.target.value); setError(""); }}>
              <option value="">{candidates.length ? "Select user" : "No other eligible users"}</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.id}){u.department ? ` · ${u.department}` : ""}</option>
              ))}
            </Select>
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        </div>
      </Modal>
      <CredentialsDialog
        open={signOpen}
        title={`E-signature: change ${STAGE_LABELS[stage].toLowerCase()}`}
        description={`Reassign from ${current ?? "unassigned"} to ${newUser}. Give the reason (e.g. user absent).`}
        requireReason
        confirmLabel="Sign & reassign"
        onConfirm={sign}
        onClose={() => setSignOpen(false)}
      />
    </>
  );
}
