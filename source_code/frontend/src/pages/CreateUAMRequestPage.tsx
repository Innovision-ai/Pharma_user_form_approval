import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { EquipmentHolder, UAMEquipmentOption, UAMSelectors } from "../types";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Field, FieldLabel, Input, Select, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { CredentialsDialog } from "../components/ui/CredentialsDialog";
import { useToast } from "../components/ui/Toast";
import { TrainingSection, EMPTY_TRAINING, trainingError, type TrainingValue } from "../components/requests/TrainingSection";
import { EquipmentNetworkInfo } from "../components/requests/EquipmentNetworkInfo";
import { TEMPLATE_LABELS } from "./UAMRequestsPage";

const ACTIONS = ["CREATE", "MODIFY", "DEACTIVATE", "ACTIVATE", "UNLOCK", "CHANGE_PASSWORD"];
const GRANTING_ACTIONS = ["CREATE", "ACTIVATE"];
const DEFAULT_TEMPLATES = [
  { code: "MANUFACTURING", asset_types: ["EQUIPMENT"], requires_qa: true },
  { code: "QC", asset_types: ["SOFTWARE"], requires_qa: false },
  { code: "ERP", asset_types: ["SOFTWARE"], requires_qa: false },
  { code: "FOLDER_PROJECT", asset_types: ["FOLDER"], requires_qa: false },
];

interface Beneficiary { employee_id: string; name: string; email: string; department: string }
const EMPTY_BENEFICIARY: Beneficiary = { employee_id: "", name: "", email: "", department: "" };

/**
 * Create a request for yourself, or (forOthers) for another person: a new
 * joiner, a service or validation engineer. For CREATE the person's details are
 * entered by hand; for every other action the person is picked from the users
 * who already hold an ID on the selected equipment.
 */
export function CreateUAMRequestPage({ forOthers = false }: { forOthers?: boolean }) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const plant = currentUser?.selected_plant ?? currentUser?.plant ?? "P1";

  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [folderPermissions, setFolderPermissions] = useState<string[]>(["Read", "Write", "Modify", "Full Control"]);
  const [tempDays, setTempDays] = useState<number[]>([10, 15]);
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
  const [training, setTraining] = useState<TrainingValue>(EMPTY_TRAINING);
  const [temporary, setTemporary] = useState(false);
  const [temporaryDays, setTemporaryDays] = useState(10);
  const [signOpen, setSignOpen] = useState(false);

  // Request for others
  const [beneficiary, setBeneficiary] = useState<Beneficiary>(EMPTY_BENEFICIARY);
  const [holders, setHolders] = useState<EquipmentHolder[]>([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [holderId, setHolderId] = useState("");

  useEffect(() => {
    api.listUAMTemplates()
      .then((t) => {
        setTemplates(t.templates);
        if (t.folder_permissions?.length) setFolderPermissions(t.folder_permissions);
        const days = (t as { temporary_login_days?: number[] }).temporary_login_days;
        if (days?.length) setTempDays(days);
      })
      .catch(() => undefined);
    api.getUAMEquipmentOptions(forOthers ? "all" : "mine").then(setOptions).catch((e) => showToast(e instanceof Error ? e.message : "Failed to load equipment", "error"));
    api.getUAMSelectors().then(setSelectors).catch((e) => showToast(e instanceof Error ? e.message : "Failed to load approvers", "error"));
  }, [showToast, forOthers]);

  const isFolder = template === "FOLDER_PROJECT";
  const isManufacturing = template === "MANUFACTURING";
  const assetType = templates.find((t) => t.code === template)?.asset_types[0] ?? "EQUIPMENT";
  const isCreate = action === "CREATE";
  const canBeTemporary = GRANTING_ACTIONS.includes(action);
  const targetCode = isFolder ? folderName.trim() : assetCode;

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
  useEffect(() => { if (!canBeTemporary) setTemporary(false); }, [canBeTemporary]);

  // Users holding an ID on the chosen equipment / folder (request for others, non-CREATE)
  useEffect(() => {
    setHolderId("");
    if (!forOthers || isCreate || !targetCode) { setHolders([]); return; }
    setHoldersLoading(true);
    api.getUAMEquipmentUsers(targetCode)
      .then(setHolders)
      .catch(() => setHolders([]))
      .finally(() => setHoldersLoading(false));
  }, [forOthers, isCreate, targetCode]);

  const holder = holders.find((h) => h.employee_id === holderId);
  const missingUserId = !forOthers && !isFolder && !!selected && action !== "CREATE" && !selected.has_user_id;

  const validationError = (): string | null => {
    if (isFolder) {
      if (!folderName.trim()) return "Enter the folder / project name.";
      if (!folderPath.trim()) return "Enter the folder / project path.";
      if (!role) return "Select the permission level.";
    } else {
      if (!assetCode) return "Select the equipment / software.";
      if (!role) return "Select the requested role.";
    }
    if (forOthers) {
      if (isCreate) {
        if (!beneficiary.employee_id.trim()) return "Enter the person's employee / user ID.";
        if (beneficiary.employee_id.trim() === currentUser?.employee_id) return "Use 'Create request' for your own access.";
        if (!beneficiary.name.trim()) return "Enter the person's name.";
      } else if (!holderId) {
        return "Select the user this request is for.";
      }
    }
    if (missingUserId) return "Your user ID does not exist on this equipment — raise a CREATE request first.";
    if (!reason.trim()) return "Enter the reason / remarks.";
    const tErr = trainingError(training);
    if (tErr) return tErr;
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
    // Upload the optional training record first, then reference it.
    let attachmentId: number | undefined;
    if (training.completed === "YES" && training.file) {
      attachmentId = (await api.uploadAttachment(training.file, "training")).id;
    }
    const who = forOthers
      ? isCreate
        ? {
            beneficiary_employee_id: beneficiary.employee_id.trim(),
            beneficiary_name: beneficiary.name.trim(),
            beneficiary_email: beneficiary.email.trim() || undefined,
            beneficiary_department: beneficiary.department.trim() || undefined,
          }
        : {
            beneficiary_employee_id: holder?.employee_id,
            beneficiary_name: holder?.name,
            beneficiary_department: holder?.department ?? undefined,
          }
      : {};
    const req = await api.createUAMRequest({
      template,
      asset_type: assetType,
      asset_code: targetCode,
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
      for_others: forOthers || undefined,
      ...who,
      training_completed: training.completed as "YES" | "NA",
      training_remark: training.completed === "NA" ? training.remark.trim() : undefined,
      training_attachment_id: attachmentId,
      temporary_login: canBeTemporary && temporary ? true : undefined,
      temporary_days: canBeTemporary && temporary ? temporaryDays : undefined,
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
  const setB = (patch: Partial<Beneficiary>) => setBeneficiary((b) => ({ ...b, ...patch }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Requests"
        title={forOthers ? "Request for Others" : "Create Request"}
        description={forOthers
          ? "Raise a user ID request for another person — a new joiner, service engineer or validation engineer. Select the template, equipment, action and the user."
          : "Select a template and action. The request is routed through review, approval, IT execution and your acknowledgement."}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Request details</CardTitle></CardHeader>
          <CardBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Template *</FieldLabel>
                <Select value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Template">
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
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>{isManufacturing ? "Equipment *" : "Software *"}</FieldLabel>
                    <Select value={assetCode} onChange={(e) => setAssetCode(e.target.value)} disabled={visibleOptions.length === 0} aria-label="Equipment">
                      <option value="">{visibleOptions.length ? "Select..." : "None available"}</option>
                      {visibleOptions.map((o) => <option key={o.equipment_code} value={o.equipment_code}>{o.equipment_code} · {o.name}</option>)}
                    </Select>
                    {visibleOptions.length === 0 && (
                      <p className="mt-1 text-xs text-amber-700">
                        {forOthers
                          ? `No active ${isManufacturing ? "equipment" : "software"} in plant ${plant}.`
                          : `No active ${isManufacturing ? "equipment" : "software"} configured for your department (${currentUser?.department}) in plant ${plant}.`}
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
                {selected && (
                  <EquipmentNetworkInfo csid={selected.computer_system_id} hostname={selected.hostname} ip={selected.ip_address} />
                )}
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Action *</FieldLabel>
                <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action">
                  {ACTIONS.map((a) => <option key={a} value={a}>{a.replace("_", " ")}</option>)}
                </Select>
              </Field>
              {!forOthers && selected && (
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

            {canBeTemporary && (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
                  <input type="checkbox" checked={temporary} onChange={(e) => setTemporary(e.target.checked)} className="h-4 w-4 rounded" />
                  Temporary login
                </label>
                {temporary && (
                  <>
                    <Select value={String(temporaryDays)} onChange={(e) => setTemporaryDays(Number(e.target.value))} className="max-w-[10rem]" aria-label="Temporary login days">
                      {tempDays.map((d) => <option key={d} value={d}>{d} days</option>)}
                    </Select>
                    <p className="text-xs text-slate-500">A deactivation request is raised automatically when the period ends.</p>
                  </>
                )}
              </div>
            )}

            <Field>
              <FieldLabel>Reason / remarks *</FieldLabel>
              <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe the business need and the requested change..." />
            </Field>

            <TrainingSection value={training} onChange={setTraining} />
          </CardBody>
        </Card>

        {forOthers && (
          <Card>
            <CardHeader><CardTitle>User the request is for</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              {isCreate ? (
                <>
                  <p className="text-sm text-slate-600">
                    Enter the details of the person who needs the new user ID. The password will be shared with them verbally by IT.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel>Employee / user ID *</FieldLabel>
                      <Input aria-label="Beneficiary employee ID" maxLength={40} value={beneficiary.employee_id} onChange={(e) => setB({ employee_id: e.target.value })} placeholder="e.g. EMP120 or VENDOR-01" />
                    </Field>
                    <Field>
                      <FieldLabel>Name *</FieldLabel>
                      <Input aria-label="Beneficiary name" maxLength={120} value={beneficiary.name} onChange={(e) => setB({ name: e.target.value })} />
                    </Field>
                    <Field>
                      <FieldLabel>Email</FieldLabel>
                      <Input aria-label="Beneficiary email" type="email" maxLength={160} value={beneficiary.email} onChange={(e) => setB({ email: e.target.value })} />
                    </Field>
                    <Field>
                      <FieldLabel>Department / company</FieldLabel>
                      <Input aria-label="Beneficiary department" maxLength={80} value={beneficiary.department} onChange={(e) => setB({ department: e.target.value })} placeholder="e.g. QC or vendor name" />
                    </Field>
                  </div>
                </>
              ) : (
                <Field>
                  <FieldLabel>User *</FieldLabel>
                  <Select value={holderId} onChange={(e) => setHolderId(e.target.value)} disabled={!targetCode || holdersLoading || holders.length === 0} aria-label="Beneficiary user">
                    <option value="">
                      {!targetCode ? "Select equipment first" : holdersLoading ? "Loading users..." : holders.length ? "Select user" : "No users"}
                    </option>
                    {holders.map((h) => (
                      <option key={h.employee_id} value={h.employee_id}>
                        {h.name} ({h.employee_id}) · user ID {h.user_id} · {h.role}
                      </option>
                    ))}
                  </Select>
                  {targetCode && !holdersLoading && holders.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">No users hold an ID on this equipment.</p>
                  )}
                </Field>
              )}
            </CardBody>
          </Card>
        )}

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
