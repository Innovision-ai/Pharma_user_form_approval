import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { UAMEquipmentOption, UAMSelectors } from "../types";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Field, FieldLabel, Input, Select, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { CredentialsDialog } from "../components/ui/CredentialsDialog";
import { useToast } from "../components/ui/Toast";
import { TEMPLATE_LABELS } from "./UAMRequestsPage";

const ACTIONS = ["CREATE", "MODIFY", "DEACTIVATE", "ACTIVATE", "UNLOCK", "CHANGE_PASSWORD"];
const DEFAULT_TEMPLATES = [
  { code: "MANUFACTURING", asset_types: ["EQUIPMENT"], requires_qa: true },
  { code: "QC", asset_types: ["SOFTWARE"], requires_qa: false },
  { code: "ERP", asset_types: ["SOFTWARE"], requires_qa: false },
  { code: "FOLDER_PROJECT", asset_types: ["FOLDER"], requires_qa: false },
];

export function CreateUAMRequestPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const plant = currentUser?.selected_plant ?? currentUser?.plant ?? "P1";

  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [folderPermissions, setFolderPermissions] = useState<string[]>(["Read", "Write", "Modify", "Full Control"]);
  const [options, setOptions] = useState<UAMEquipmentOption[]>([]);
  const [selectors, setSelectors] = useState<UAMSelectors | null>(null);

  const [template, setTemplate] = useState("MANUFACTURING");
  const [assetCode, setAssetCode] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [role, setRole] = useState("");
  const [action, setAction] = useState("CREATE");
  const [reason, setReason] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [deptApprover, setDeptApprover] = useState("");
  const [qaApprover, setQaApprover] = useState("");
  const [executor, setExecutor] = useState("");
  const [signOpen, setSignOpen] = useState(false);

  useEffect(() => {
    api.listUAMTemplates()
      .then((t) => { setTemplates(t.templates); if (t.folder_permissions?.length) setFolderPermissions(t.folder_permissions); })
      .catch(() => undefined);
    api.getUAMEquipmentOptions().then(setOptions).catch((e) => showToast(e instanceof Error ? e.message : "Failed to load equipment", "error"));
    api.getUAMSelectors().then(setSelectors).catch((e) => showToast(e instanceof Error ? e.message : "Failed to load approvers", "error"));
  }, [showToast]);

  const isFolder = template === "FOLDER_PROJECT";
  const isManufacturing = template === "MANUFACTURING";
  const assetType = templates.find((t) => t.code === template)?.asset_types[0] ?? "EQUIPMENT";

  const visibleOptions = useMemo(
    () => options.filter((o) => (isManufacturing ? o.type !== "Software" : o.type === "Software")),
    [options, isManufacturing],
  );
  const selected = visibleOptions.find((o) => o.equipment_code === assetCode);

  // Reset asset/role when the template changes; auto-pick a single role.
  useEffect(() => { setAssetCode(""); setRole(""); }, [template]);
  useEffect(() => {
    if (isFolder) return;
    if (selected && selected.allowed_roles.length === 1) setRole(selected.allowed_roles[0]);
    else if (!selected || !selected.allowed_roles.includes(role)) setRole("");
  }, [selected, isFolder]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isFolder && !folderPermissions.includes(role)) setRole(""); }, [isFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  const missingUserId = !isFolder && !!selected && action !== "CREATE" && !selected.has_user_id;

  const validationError = (): string | null => {
    if (isFolder) {
      if (!folderName.trim()) return "Enter the folder / project name.";
      if (!folderPath.trim()) return "Enter the folder / project path.";
      if (!role) return "Select the permission level.";
    } else {
      if (!assetCode) return "Select the equipment / software.";
      if (!role) return "Select the requested role.";
    }
    if (missingUserId) return "Your user ID does not exist on this equipment — raise a CREATE request first.";
    if (!reason.trim()) return "Enter the reason / remarks.";
    if (!reviewer) return "Select a reviewer.";
    if (isManufacturing && !qaApprover) return "A QA approver is required for Manufacturing requests.";
    return null;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const err = validationError();
    if (err) return showToast(err, "error");
    setSignOpen(true);
  };

  const submit = async ({ password, reason: authReason }: { password: string; reason: string }) => {
    const req = await api.createUAMRequest({
      template,
      asset_type: assetType,
      asset_code: isFolder ? folderName.trim() : assetCode,
      requested_role: role,
      action,
      reason: reason.trim(),
      plant,
      reviewer_id: reviewer,
      department_approver_id: !isManufacturing && deptApprover ? deptApprover : undefined,
      qa_approver_id: qaApprover || undefined,
      it_executor_id: executor || undefined,
      form_data: isFolder ? { folder_path: folderPath.trim(), template } : { template },
      auth_password: password,
      auth_reason: authReason,
    });
    setSignOpen(false);
    showToast(`${req.request_code} submitted for review.`);
    navigate(`/uam/requests/${req.request_code}`);
  };

  const userSelect = (value: string, onChange: (v: string) => void, list: { id: string; name: string; department?: string }[] | undefined, placeholder: string) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {(list ?? []).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.id}){u.department ? ` · ${u.department}` : ""}</option>)}
    </Select>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Requests"
        title="Create Request"
        description="Select a template and action. The request is routed through review, approval, IT execution and your acknowledgement."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Request details</CardTitle></CardHeader>
          <CardBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Template *</FieldLabel>
                <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
                  {templates.map((t) => <option key={t.code} value={t.code}>{TEMPLATE_LABELS[t.code] ?? t.code}</option>)}
                </Select>
              </Field>
              <Field>
                <FieldLabel>Plant</FieldLabel>
                <Input value={plant} readOnly disabled />
              </Field>
            </div>

            {isFolder ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Folder / Project name *</FieldLabel>
                  <Input maxLength={40} value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="e.g. QC Shared Drive" />
                </Field>
                <Field>
                  <FieldLabel>Permission *</FieldLabel>
                  <Select value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="">Select permission</option>
                    {folderPermissions.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel>Folder / Project path *</FieldLabel>
                  <Input value={folderPath} onChange={(e) => setFolderPath(e.target.value)} placeholder="e.g. \\fileserver\QC\Reports" />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>{isManufacturing ? "Equipment *" : "Software *"}</FieldLabel>
                  <Select value={assetCode} onChange={(e) => setAssetCode(e.target.value)} disabled={visibleOptions.length === 0}>
                    <option value="">{visibleOptions.length ? "Select..." : "None available"}</option>
                    {visibleOptions.map((o) => <option key={o.equipment_code} value={o.equipment_code}>{o.equipment_code} · {o.name}</option>)}
                  </Select>
                  {visibleOptions.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      No active {isManufacturing ? "equipment" : "software"} configured for your department ({currentUser?.department}) in plant {plant}.
                    </p>
                  )}
                </Field>
                <Field>
                  <FieldLabel>Requested role *</FieldLabel>
                  <Select value={role} onChange={(e) => setRole(e.target.value)} disabled={!selected}>
                    <option value="">{selected ? "Select role" : "Select equipment first"}</option>
                    {(selected?.allowed_roles ?? []).map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </Field>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Action *</FieldLabel>
                <Select value={action} onChange={(e) => setAction(e.target.value)}>
                  {ACTIONS.map((a) => <option key={a} value={a}>{a.replace("_", " ")}</option>)}
                </Select>
              </Field>
              {selected && (
                <div className="self-end pb-3 text-sm text-slate-600">
                  {selected.has_user_id ? "You already have a user ID on this equipment." : "You do not have a user ID on this equipment yet."}
                </div>
              )}
            </div>
            {missingUserId && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                Your user ID does not exist on this equipment — raise a CREATE request first.
              </p>
            )}

            <Field>
              <FieldLabel>Reason / remarks *</FieldLabel>
              <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe the business need and the requested change..." />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Workflow assignments</CardTitle></CardHeader>
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Reviewer *</FieldLabel>
                {userSelect(reviewer, setReviewer, selectors?.reviewers, "Select reviewer")}
              </Field>
              {!isManufacturing && (
                <Field>
                  <FieldLabel>Department approver (optional)</FieldLabel>
                  {userSelect(deptApprover, setDeptApprover, selectors?.department_approvers, "None")}
                </Field>
              )}
              <Field>
                <FieldLabel>{isManufacturing ? "QA approver *" : "QA approver (optional)"}</FieldLabel>
                {userSelect(qaApprover, setQaApprover, selectors?.qa_approvers, isManufacturing ? "Select QA approver" : "None")}
              </Field>
              <Field>
                <FieldLabel>IT executor (optional)</FieldLabel>
                {userSelect(executor, setExecutor, selectors?.it_executors, "Any IT executor")}
              </Field>
            </div>
          </CardBody>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate("/uam/requests")}>Cancel</Button>
          <Button type="submit" disabled={missingUserId}>Submit request</Button>
        </div>
      </form>

      <CredentialsDialog
        open={signOpen}
        title="E-signature: submit request"
        description="Confirm your identity to submit this request."
        requireReason
        confirmLabel="Sign & submit"
        onConfirm={submit}
        onClose={() => setSignOpen(false)}
      />
    </div>
  );
}
