import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Field, FieldLabel, Input, Textarea } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

interface Selector { id: string; name: string; department?: string; }
interface Selectors { reviewers: Selector[]; it_executors: Selector[]; qa_approvers: Selector[]; }

export function CreateAssetRequestPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [selectors, setSelectors] = useState<Selectors | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    system_name: "", system_id: "", system_type: "Software",
    make: "", model_name: "", application_name: "",
    gamp_category: "4", usp_classification: "", department: "",
    location: "", primary_function: "", db_server_name: "",
    computer_name: "", validation_summary_report_no: "",
    approval_date: "", change_control_no: "",
    reviewer_id: "", it_executor_id: "", qa_approver_id: "",
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  useEffect(() => { api.getAssetRequestSelectors().then(setSelectors); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setBusy(true);
    try {
      const req = await api.createAssetRequest({
        ...form,
        approval_date: form.approval_date || undefined,
        plant: currentUser.plant,
      } as Parameters<typeof api.createAssetRequest>[0]);
      showToast(`${req.request_code} submitted for review.`);
      navigate(`/asset-requests/${req.request_code}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Submission failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Create Asset Creation Request</h1>
        <p className="text-sm text-slate-500">Submit a new computerized system for registration. The request will go through Reviewer → IT → QA approval.</p>
      </div>
      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>System identification</CardTitle></CardHeader>
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel>System name *</FieldLabel><Input required value={form.system_name} onChange={set("system_name")} placeholder="e.g. LIMS v2" /></Field>
              <Field><FieldLabel>System ID</FieldLabel><Input value={form.system_id} onChange={set("system_id")} placeholder="CS-XXX" /></Field>
              <Field><FieldLabel>System type</FieldLabel>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.system_type} onChange={set("system_type")}>
                  {["HMI", "SCADA", "Software", "DCS", "Data Logger", "Other"].map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field><FieldLabel>GAMP category</FieldLabel>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.gamp_category} onChange={set("gamp_category")}>
                  {["1", "2", "3", "4", "5"].map(c => <option key={c} value={c}>Category {c}</option>)}
                </select>
              </Field>
              <Field><FieldLabel>Make / Vendor</FieldLabel><Input value={form.make} onChange={set("make")} placeholder="e.g. Agilent" /></Field>
              <Field><FieldLabel>Model name</FieldLabel><Input value={form.model_name} onChange={set("model_name")} /></Field>
              <Field><FieldLabel>Application name</FieldLabel><Input value={form.application_name} onChange={set("application_name")} /></Field>
              <Field><FieldLabel>USP classification</FieldLabel><Input value={form.usp_classification} onChange={set("usp_classification")} placeholder="Category 1/2/3/4" /></Field>
              <Field><FieldLabel>Department</FieldLabel><Input value={form.department} onChange={set("department")} /></Field>
              <Field><FieldLabel>Location</FieldLabel><Input value={form.location} onChange={set("location")} /></Field>
              <Field><FieldLabel>DB server name</FieldLabel><Input value={form.db_server_name} onChange={set("db_server_name")} /></Field>
              <Field><FieldLabel>Computer name</FieldLabel><Input value={form.computer_name} onChange={set("computer_name")} /></Field>
              <Field><FieldLabel>Validation summary report no.</FieldLabel><Input value={form.validation_summary_report_no} onChange={set("validation_summary_report_no")} /></Field>
              <Field><FieldLabel>Approval date</FieldLabel><Input type="date" value={form.approval_date} onChange={set("approval_date")} /></Field>
              <Field><FieldLabel>Change control no.</FieldLabel><Input value={form.change_control_no} onChange={set("change_control_no")} /></Field>
            </div>
            <Field className="mt-4"><FieldLabel>Primary function / purpose</FieldLabel><Textarea rows={3} value={form.primary_function} onChange={set("primary_function")} placeholder="Describe the function of this system..." /></Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Workflow assignments</CardTitle></CardHeader>
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field><FieldLabel>Reviewer (HOD)</FieldLabel>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.reviewer_id} onChange={set("reviewer_id")}>
                  <option value="">Select reviewer</option>
                  {selectors?.reviewers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.department})</option>)}
                </select>
              </Field>
              <Field><FieldLabel>IT executor</FieldLabel>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.it_executor_id} onChange={set("it_executor_id")}>
                  <option value="">Select IT user</option>
                  {selectors?.it_executors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field><FieldLabel>QA approver</FieldLabel>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.qa_approver_id} onChange={set("qa_approver_id")}>
                  <option value="">Select QA user</option>
                  {selectors?.qa_approvers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.department})</option>)}
                </select>
              </Field>
            </div>
          </CardBody>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>{busy ? "Submitting..." : "Submit request"}</Button>
        </div>
      </form>
    </div>
  );
}
