import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, FlaskConical, Mail, MapPin, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Approver, Equipment } from "../types";
import { Avatar } from "../components/ui/Avatar";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Field, FieldLabel, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { Stepper } from "../components/ui/Stepper";
import { useToast } from "../components/ui/Toast";
import { cn } from "../lib/cn";

const STEPS = ["Equipment", "Role", "Approvers", "Review"];

export function CreateRequestPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { currentUser } = useAuth();
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [hods, setHods] = useState<Approver[]>([]);
  const [qas, setQas] = useState<Approver[]>([]);
  const [step, setStep] = useState(0);
  const [equipmentCode, setEquipmentCode] = useState("");
  const [requestedRole, setRequestedRole] = useState("");
  const [hodId, setHodId] = useState("");
  const [qaId, setQaId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listEquipment({ activeOnly: true }).then(setEquipmentList);
    api.listApprovers({ type: "HOD", active_only: true }).then(setHods);
    api.listApprovers({ type: "QA", active_only: true }).then(setQas);
  }, []);

  const selectedEquipment = useMemo(() => equipmentList.find((e) => e.equipment_code === equipmentCode), [equipmentList, equipmentCode]);
  const selectedHod = hods.find((approver) => approver.approver_code === hodId);
  const selectedQa = qas.find((approver) => approver.approver_code === qaId);

  const validateStep = () => {
    if (step === 0 && !equipmentCode) { showToast("Select the equipment you need access to.", "error"); return false; }
    if (step === 1 && !requestedRole) { showToast("Select a role for this access request.", "error"); return false; }
    if (step === 2 && (!hodId || !qaId)) { showToast("Select both a HOD and QA approver.", "error"); return false; }
    if (step === 3 && !reason.trim()) { showToast("Add a reason for access before submitting.", "error"); return false; }
    return true;
  };

  const goNext = () => { if (validateStep()) setStep((value) => Math.min(value + 1, STEPS.length - 1)); };
  const goBack = () => setStep((value) => Math.max(value - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSubmitting(true);
    try {
      const request = await api.createRequest({ equipment_code: equipmentCode, requested_role: requestedRole, hod_id: hodId, qa_id: qaId, reason });
      showToast(`Request ${request.request_code} submitted for HOD review.`);
      navigate(`/requests/${request.request_code}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Submission failed", "error");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader eyebrow="Access workflow" title="Create access request" description="Complete four quick steps to route your equipment access request through HOD and QA review." />
      <Card><CardBody><Stepper steps={STEPS} current={step} /></CardBody></Card>

      {step === 0 && (
        <Card>
          <CardHeader><CardTitle>Choose equipment</CardTitle><p className="mt-1 text-xs text-slate-500">Select an active validated asset from your plant.</p></CardHeader>
          <CardBody>
            <div className="grid gap-4 md:grid-cols-2">
              {equipmentList.map((equipment) => {
                const selected = equipmentCode === equipment.equipment_code;
                return <button key={equipment.equipment_code} type="button" onClick={() => { setEquipmentCode(equipment.equipment_code); setRequestedRole(""); }} className={cn("group rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift", selected ? "border-brand-600 bg-brand-50/60 ring-2 ring-brand-500/20" : "border-slate-200 bg-white")}>
                  <div className="flex items-start justify-between gap-3"><div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", selected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500")}><FlaskConical size={20} /></div>{selected ? <CheckCircle2 className="text-brand-600" size={20} /> : <Badge tone={equipment.active ? "green" : "red"}>{equipment.active ? "Active" : "Inactive"}</Badge>}</div>
                  <p className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-400">{equipment.equipment_code} · {equipment.type}</p><h3 className="mt-1 text-base font-bold text-slate-900">{equipment.name}</h3><p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><MapPin size={13} /> {equipment.location} · {equipment.plant}</p><p className="mt-3 text-xs text-slate-400">Validated {equipment.validation_date}</p>
                </button>;
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {step === 1 && selectedEquipment && (
        <Card><CardHeader><CardTitle>Choose requested role</CardTitle><p className="mt-1 text-xs text-slate-500">Select the least-privileged role that matches your work on {selectedEquipment.name}.</p></CardHeader><CardBody><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{selectedEquipment.allowed_roles.map((role) => <button key={role} type="button" onClick={() => setRequestedRole(role)} className={cn("flex items-center justify-between rounded-xl border px-4 py-4 text-left text-sm font-semibold transition", requestedRole === role ? "border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20" : "border-slate-200 text-slate-700 hover:border-brand-300 hover:bg-brand-50/40")}>{role}<CheckCircle2 size={17} className={requestedRole === role ? "text-brand-600" : "text-slate-200"} /></button>)}</div></CardBody></Card>
      )}

      {step === 2 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {[{ title: "Select HOD approver", list: hods, value: hodId, setValue: setHodId, tone: "blue" as const }, { title: "Select QA approver", list: qas, value: qaId, setValue: setQaId, tone: "purple" as const }].map((group) => <Card key={group.title}><CardHeader><CardTitle>{group.title}</CardTitle><p className="mt-1 text-xs text-slate-500">Choose an active approver for this request.</p></CardHeader><CardBody className="space-y-3">{group.list.map((approver) => <button key={approver.approver_code} type="button" onClick={() => group.setValue(approver.approver_code)} className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition", group.value === approver.approver_code ? "border-brand-600 bg-brand-50/60 ring-2 ring-brand-500/20" : "border-slate-200 hover:border-brand-300 hover:bg-slate-50")}><Avatar name={approver.name} size="md" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{approver.name}</span><span className="mt-0.5 block text-xs text-slate-500">{approver.department}</span><span className="mt-1 flex items-center gap-1 text-xs text-slate-400"><Mail size={12} /> {approver.email}</span></span>{group.value === approver.approver_code && <CheckCircle2 size={18} className="text-brand-600" />}</button>)}</CardBody></Card>)}
        </div>
      )}

      {step === 3 && currentUser && (
        <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <Card><CardHeader><CardTitle>Reason for access</CardTitle><p className="mt-1 text-xs text-slate-500">Explain the business need so approvers can review quickly.</p></CardHeader><CardBody><Field><FieldLabel>Access justification *</FieldLabel><Textarea rows={7} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the task, project, or study this access supports..." /></Field></CardBody></Card>
          <Card><CardHeader><CardTitle>Review request</CardTitle></CardHeader><CardBody className="space-y-5"><div className="flex items-center gap-3"><Avatar name={currentUser.name} /><div><p className="text-sm font-semibold text-slate-900">{currentUser.name}</p><p className="text-xs text-slate-500">{currentUser.employee_id} · {currentUser.department}</p></div></div><div className="space-y-3 border-t border-slate-100 pt-4"><ReviewRow icon={FlaskConical} label="Equipment" value={selectedEquipment?.name ?? "—"} /><ReviewRow icon={ShieldCheck} label="Requested role" value={requestedRole || "—"} /><ReviewRow icon={ClipboardCheck} label="HOD / QA" value={`${selectedHod?.name ?? "—"} / ${selectedQa?.name ?? "—"}`} /></div></CardBody></Card>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-200 pt-5"><Button variant="ghost" onClick={goBack} disabled={step === 0}><ArrowLeft size={16} /> Back</Button>{step < STEPS.length - 1 ? <Button onClick={goNext}>Continue <ArrowRight size={16} /></Button> : <Button size="lg" onClick={handleSubmit} disabled={submitting}><ClipboardCheck size={17} /> {submitting ? "Submitting..." : "Submit request"}</Button>}</div>
    </div>
  );
}

function ReviewRow({ icon: Icon, label, value }: { icon: typeof FlaskConical; label: string; value: string }) {
  return <div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Icon size={15} /></div><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="truncate text-sm font-semibold text-slate-800">{value}</p></div></div>;
}
