import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Approver, Equipment } from "../types";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Field, FieldLabel, Select, Textarea } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";

export function CreateRequestPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [hods, setHods] = useState<Approver[]>([]);
  const [qas, setQas] = useState<Approver[]>([]);

  const [equipmentCode, setEquipmentCode] = useState("");
  const [requestedRole, setRequestedRole] = useState("");
  const [hodId, setHodId] = useState("");
  const [qaId, setQaId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listEquipment(true).then(setEquipmentList);
    api.listApprovers({ type: "HOD", active_only: true }).then(setHods);
    api.listApprovers({ type: "QA", active_only: true }).then(setQas);
  }, []);

  const selectedEquipment = equipmentList.find((e) => e.equipment_code === equipmentCode);

  const handleSubmit = async () => {
    if (!equipmentCode || !requestedRole || !hodId || !qaId || !reason.trim()) {
      showToast("Please complete every field before submitting.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const req = await api.createRequest({
        equipment_code: equipmentCode,
        requested_role: requestedRole,
        hod_id: hodId,
        qa_id: qaId,
        reason,
      });
      showToast(`Request ${req.request_code} submitted for HOD review.`);
      navigate(`/requests/${req.request_code}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Submission failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Create Access Request</h1>
        <p className="text-sm text-slate-500">
          Requests are routed to the selected HOD, then the selected QA, in that order.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request Details</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <Field>
              <FieldLabel>Equipment</FieldLabel>
              <Select
                value={equipmentCode}
                onChange={(e) => {
                  setEquipmentCode(e.target.value);
                  setRequestedRole("");
                }}
              >
                <option value="">Select equipment...</option>
                {equipmentList.map((eq) => (
                  <option key={eq.equipment_code} value={eq.equipment_code}>
                    {eq.equipment_code} - {eq.name} ({eq.location})
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <FieldLabel>Requested Role</FieldLabel>
              <Select
                value={requestedRole}
                onChange={(e) => setRequestedRole(e.target.value)}
                disabled={!selectedEquipment}
              >
                <option value="">Select role...</option>
                {selectedEquipment?.allowed_roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <FieldLabel>Head of Department (HOD)</FieldLabel>
              <Select value={hodId} onChange={(e) => setHodId(e.target.value)}>
                <option value="">Select HOD...</option>
                {hods.map((h) => (
                  <option key={h.approver_code} value={h.approver_code}>
                    {h.name} - {h.department}
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <FieldLabel>QA Approver</FieldLabel>
              <Select value={qaId} onChange={(e) => setQaId(e.target.value)}>
                <option value="">Select QA...</option>
                {qas.map((q) => (
                  <option key={q.approver_code} value={q.approver_code}>
                    {q.name} - {q.department}
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <FieldLabel>Reason for Access</FieldLabel>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>

            <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
