import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Approver, ApproverType } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, FieldLabel, Input, Select } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

interface FormState {
  name: string;
  type: ApproverType;
  department: string;
  email: string;
}

const emptyForm: FormState = { name: "", type: "HOD", department: "", email: "" };

export function ApproverMasterPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Approver[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .listApprovers()
      .then(setItems)
      .catch((err) => showToast(err instanceof Error ? err.message : "Failed to load approvers", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditingCode(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (a: Approver) => {
    setEditingCode(a.approver_code);
    setForm({ name: a.name, type: a.type, department: a.department, email: a.email });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.department || !form.email) {
      showToast("Please fill in all fields.", "error");
      return;
    }
    setSaving(true);
    try {
      if (editingCode) {
        await api.updateApprover(editingCode, form);
        showToast("Approver updated.");
      } else {
        await api.createApprover(form);
        showToast("Approver created.");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (a: Approver) => {
    try {
      await api.toggleApproverStatus(a.approver_code, !a.active);
      showToast(`${a.approver_code} marked ${!a.active ? "active" : "inactive"}.`);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Approver Master</h1>
          <p className="text-sm text-slate-500">Manage the HOD and QA approvers requests can be routed to.</p>
        </div>
        <Button onClick={openCreate}>+ Add Approver</Button>
      </div>

      <Card>
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Loading...</p>
        ) : (
          <DataTable
            rows={items}
            rowKey={(a) => a.approver_code}
            columns={[
              { header: "Code", render: (a) => <span className="font-medium">{a.approver_code}</span> },
              { header: "Name", render: (a) => a.name },
              { header: "Type", render: (a) => <Badge tone={a.type === "HOD" ? "amber" : "purple"}>{a.type}</Badge> },
              { header: "Department", render: (a) => a.department },
              { header: "Email", render: (a) => a.email },
              {
                header: "Status",
                render: (a) => (
                  <Badge tone={a.active ? "green" : "red"}>{a.active ? "Active" : "Inactive"}</Badge>
                ),
              },
              {
                header: "",
                render: (a) => (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(a)}>
                      Edit
                    </Button>
                    <Button
                      variant={a.active ? "danger" : "secondary"}
                      size="sm"
                      onClick={() => handleToggleStatus(a)}
                    >
                      {a.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editingCode ? `Edit ${editingCode}` : "Add Approver"}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Type</FieldLabel>
            <Select
              value={form.type}
              disabled={!!editingCode}
              onChange={(e) => setForm({ ...form, type: e.target.value as ApproverType })}
            >
              <option value="HOD">HOD</option>
              <option value="QA">QA</option>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Department</FieldLabel>
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
