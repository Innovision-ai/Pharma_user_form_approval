import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/format";
import type { Equipment } from "../types";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Field, FieldLabel, Input, Select, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";

interface Selector { id: string; name: string; department?: string }
interface Selectors { reviewers: Selector[]; it_executors: Selector[]; qa_approvers: Selector[] }

// GAMP Category 2 is no longer used - only 1, 3, 4, 5
const GAMP_OPTIONS = ["1", "3", "4", "5"];
const SYSTEM_TYPES = ["HMI", "SCADA", "Software", "DCS", "Data Logger", "Other"];

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value || "—"}</p>
    </div>
  );
}

export function CreateAssetRequestPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [params] = useSearchParams();
  const retireCode = params.get("retire");
  const plant = currentUser?.selected_plant ?? currentUser?.plant ?? "P1";

  const [selectors, setSelectors] = useState<Selectors | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [busy, setBusy] = useState(false);
  // Creation request for equipment already registered in Equipment Master
  const [registered, setRegistered] = useState<Equipment[]>([]);
  const [linkCode, setLinkCode] = useState(params.get("equipment") ?? "");

  const [form, setForm] = useState({
    system_name: "", system_id: "", system_type: "Software",
    make: "", model_name: "", application_name: "",
    gamp_category: "4", usp_classification: "", department: "",
    location: "", primary_function: "", db_server_name: "",
    computer_name: "", validation_summary_report_no: "",
    approval_date: "", change_control_no: "",
    reviewer_id: "", it_executor_id: "", qa_approver_id: "",
  });

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  useEffect(() => {
    api.getAssetRequestSelectors().then(setSelectors).catch(() => setSelectors(null));
    api.getDepartments(plant).then((d) => setDepartments(d.departments)).catch(() => setDepartments([]));
  }, [plant]);

  useEffect(() => {
    if (retireCode) return;
    api.listEquipment({ activeOnly: true }).then(setRegistered).catch(() => setRegistered([]));
  }, [retireCode]);

  // Selecting registered equipment fills in all its details
  useEffect(() => {
    const eq = registered.find((e) => e.equipment_code === linkCode);
    if (!eq) return;
    setForm((prev) => ({
      ...prev,
      system_name: eq.name,
      system_id: eq.system_id ?? "",
      system_type: eq.system_type ?? prev.system_type,
      make: eq.make ?? "",
      model_name: eq.model_name ?? "",
      application_name: eq.application_name ?? "",
      gamp_category: eq.gamp_category && GAMP_OPTIONS.includes(eq.gamp_category) ? eq.gamp_category : prev.gamp_category,
      usp_classification: eq.usp_classification ?? "",
      department: eq.location ?? "",
      location: eq.location ?? "",
      computer_name: eq.computer_system_id ?? "",
    }));
  }, [linkCode, registered]);

  useEffect(() => {
    if (!retireCode) { setEquipment(null); return; }
    api.getEquipment(retireCode)
      .then(setEquipment)
      .catch((e) => showToast(e instanceof Error ? e.message : "Equipment not found", "error"));
  }, [retireCode, showToast]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (retireCode && !form.primary_function.trim()) return showToast("Enter the reason for retirement.", "error");
    if (!retireCode && !form.system_name.trim()) return showToast("System name is required.", "error");
    setBusy(true);
    try {
      const assignments = {
        reviewer_id: form.reviewer_id || undefined,
        it_executor_id: form.it_executor_id || undefined,
        qa_approver_id: form.qa_approver_id || undefined,
      };
      const req = retireCode
        ? await api.createAssetRequest({
            request_type: "RETIRE",
            equipment_code: retireCode,
            plant: equipment?.plant ?? plant,
            primary_function: form.primary_function.trim(),
            ...assignments,
          })
        : await api.createAssetRequest({
            ...form,
            ...assignments,
            approval_date: form.approval_date || undefined,
            plant,
            request_type: "CREATE",
            equipment_code: linkCode || undefined,
          } as Parameters<typeof api.createAssetRequest>[0]);
      showToast(`${req.request_code} submitted for review.`);
      navigate(`/asset-requests/${req.request_code}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Submission failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const assignmentsCard = (
    <Card>
      <CardHeader><CardTitle>Workflow assignments</CardTitle></CardHeader>
      <CardBody>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel>Reviewer</FieldLabel>
            <Select value={form.reviewer_id} onChange={set("reviewer_id")}>
              <option value="">Any reviewer</option>
              {selectors?.reviewers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.department})</option>)}
            </Select>
          </Field>
          <Field>
            <FieldLabel>IT executor</FieldLabel>
            <Select value={form.it_executor_id} onChange={set("it_executor_id")}>
              <option value="">Any IT executor</option>
              {selectors?.it_executors.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}
            </Select>
          </Field>
          <Field>
            <FieldLabel>QA approver</FieldLabel>
            <Select value={form.qa_approver_id} onChange={set("qa_approver_id")}>
              <option value="">Any QA approver</option>
              {selectors?.qa_approvers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.department})</option>)}
            </Select>
          </Field>
        </div>
      </CardBody>
    </Card>
  );

  if (retireCode) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          eyebrow="Asset Requests"
          title="Asset Retire Request"
          description="Once this request is approved by Reviewer → IT → QA, the equipment is automatically marked Retired and taken out of the PM, backup and periodic review planners (it stays visible for history)."
        />
        <form onSubmit={submit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Equipment to retire</CardTitle></CardHeader>
            <CardBody>
              {equipment ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Info label="Code" value={equipment.equipment_code} />
                  <Info label="Name" value={equipment.name} />
                  <Info label="Type" value={equipment.type} />
                  <Info label="System type" value={equipment.system_type} />
                  <Info label="Make / Model" value={[equipment.make, equipment.model_name].filter(Boolean).join(" / ")} />
                  <Info label="Computer System ID" value={equipment.computer_system_id} />
                  <Info label="Department" value={equipment.location} />
                  <Info label="Plant" value={equipment.plant} />
                  <Info label="Validation completion date" value={formatDate(equipment.validation_date)} />
                  <Info label="Status" value={equipment.active ? "Active" : "Retired"} />
                </div>
              ) : (
                <p className="text-sm text-slate-500">Loading equipment {retireCode}...</p>
              )}
              {equipment && !equipment.active && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">This equipment is already retired.</p>
              )}
              <Field className="mt-5">
                <FieldLabel>Reason for retirement *</FieldLabel>
                <Textarea rows={3} value={form.primary_function} onChange={set("primary_function")} placeholder="Why is this system being retired?" />
              </Field>
            </CardBody>
          </Card>
          {assignmentsCard}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" disabled={busy || !equipment || !equipment.active}>{busy ? "Submitting..." : "Submit retire request"}</Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Asset Requests"
        title="Asset Creation Request"
        description={`Submit a new computerized system for registration in plant ${plant}. The request goes through Reviewer → IT → QA approval.`}
      />
      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Equipment</CardTitle></CardHeader>
          <CardBody>
            <Field>
              <FieldLabel>Registered equipment</FieldLabel>
              <Select value={linkCode} onChange={(e) => setLinkCode(e.target.value)}>
                <option value="">New system (not yet in Equipment Master)</option>
                {registered.map((e) => (
                  <option key={e.equipment_code} value={e.equipment_code}>{e.equipment_code} · {e.name} ({e.location})</option>
                ))}
              </Select>
            </Field>
            <p className="mt-2 text-xs text-slate-500">
              {linkCode
                ? "Details below are filled in from Equipment Master. Once approved, the equipment can be marked Validated."
                : "On approval, the new system is registered in Equipment Master automatically."}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>System identification</CardTitle></CardHeader>
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel>System name *</FieldLabel><Input required value={form.system_name} onChange={set("system_name")} placeholder="e.g. LIMS v2" /></Field>
              <Field><FieldLabel>System ID</FieldLabel><Input value={form.system_id} onChange={set("system_id")} placeholder="CS-XXX" /></Field>
              <Field>
                <FieldLabel>System type</FieldLabel>
                <Select value={form.system_type} onChange={set("system_type")}>
                  {SYSTEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
              <Field>
                <FieldLabel>GAMP category</FieldLabel>
                <Select value={form.gamp_category} onChange={set("gamp_category")}>
                  {GAMP_OPTIONS.map((c) => <option key={c} value={c}>Category {c}</option>)}
                </Select>
              </Field>
              <Field><FieldLabel>Make / Vendor</FieldLabel><Input value={form.make} onChange={set("make")} placeholder="e.g. Agilent" /></Field>
              <Field><FieldLabel>Model</FieldLabel><Input value={form.model_name} onChange={set("model_name")} /></Field>
              <Field><FieldLabel>Application name</FieldLabel><Input value={form.application_name} onChange={set("application_name")} /></Field>
              <Field><FieldLabel>USP classification</FieldLabel><Input value={form.usp_classification} onChange={set("usp_classification")} /></Field>
              <Field>
                <FieldLabel>Department</FieldLabel>
                <Select value={form.department} onChange={set("department")}>
                  <option value="">Select department</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              </Field>
              <Field><FieldLabel>Location</FieldLabel><Input value={form.location} onChange={set("location")} /></Field>
              <Field><FieldLabel>DB server name</FieldLabel><Input value={form.db_server_name} onChange={set("db_server_name")} /></Field>
              <Field><FieldLabel>Computer System ID</FieldLabel><Input value={form.computer_name} onChange={set("computer_name")} /></Field>
              <Field><FieldLabel>Validation summary report no.</FieldLabel><Input value={form.validation_summary_report_no} onChange={set("validation_summary_report_no")} /></Field>
              <Field><FieldLabel>Approval date</FieldLabel><Input type="date" value={form.approval_date} onChange={set("approval_date")} /></Field>
              <Field><FieldLabel>Change control no.</FieldLabel><Input value={form.change_control_no} onChange={set("change_control_no")} /></Field>
            </div>
            <Field className="mt-4">
              <FieldLabel>Primary function / purpose</FieldLabel>
              <Textarea rows={3} value={form.primary_function} onChange={set("primary_function")} placeholder="Describe the function of this system..." />
            </Field>
          </CardBody>
        </Card>
        {assignmentsCard}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate("/asset-requests")}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Submitting..." : "Submit request"}</Button>
        </div>
      </form>
    </div>
  );
}
