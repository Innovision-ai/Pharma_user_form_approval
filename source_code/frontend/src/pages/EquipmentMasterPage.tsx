import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Equipment } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, FieldLabel, Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

const ROLE_OPTIONS = ["Analyst", "Senior Analyst", "Scientist", "Operator", "Supervisor"];

interface FormState {
  name: string;
  location: string;
  allowed_roles: string[];
  validation_date: string;
}

const emptyForm: FormState = { name: "", location: "", allowed_roles: [], validation_date: "" };

export function EquipmentMasterPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .listEquipment()
      .then(setItems)
      .catch((err) => showToast(err instanceof Error ? err.message : "Failed to load equipment", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditingCode(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (eq: Equipment) => {
    setEditingCode(eq.equipment_code);
    setForm({
      name: eq.name,
      location: eq.location,
      allowed_roles: eq.allowed_roles,
      validation_date: eq.validation_date,
    });
    setModalOpen(true);
  };

  const toggleRole = (role: string) => {
    setForm((f) => ({
      ...f,
      allowed_roles: f.allowed_roles.includes(role)
        ? f.allowed_roles.filter((r) => r !== role)
        : [...f.allowed_roles, role],
    }));
  };

  const handleSave = async () => {
    if (!form.name || !form.location || !form.validation_date || form.allowed_roles.length === 0) {
      showToast("Please fill in all fields and select at least one role.", "error");
      return;
    }
    setSaving(true);
    try {
      if (editingCode) {
        await api.updateEquipment(editingCode, form);
        showToast("Equipment updated.");
      } else {
        await api.createEquipment(form);
        showToast("Equipment created.");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (eq: Equipment) => {
    try {
      await api.toggleEquipmentStatus(eq.equipment_code, !eq.active);
      showToast(`${eq.equipment_code} marked ${!eq.active ? "active" : "inactive"}.`);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Equipment Master</h1>
          <p className="text-sm text-slate-500">Register equipment and define which roles may request access.</p>
        </div>
        <Button onClick={openCreate}>+ Add Equipment</Button>
      </div>

      <Card>
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Loading...</p>
        ) : (
          <DataTable
            rows={items}
            rowKey={(e) => e.equipment_code}
            columns={[
              { header: "Code", render: (e) => <span className="font-medium">{e.equipment_code}</span> },
              { header: "Name", render: (e) => e.name },
              { header: "Location", render: (e) => e.location },
              {
                header: "Allowed Roles",
                render: (e) => (
                  <div className="flex flex-wrap gap-1">
                    {e.allowed_roles.map((r) => (
                      <Badge key={r}>{r}</Badge>
                    ))}
                  </div>
                ),
              },
              { header: "Validation Date", render: (e) => e.validation_date },
              {
                header: "Status",
                render: (e) => (
                  <Badge tone={e.active ? "green" : "red"}>{e.active ? "Active" : "Inactive"}</Badge>
                ),
              },
              {
                header: "",
                render: (e) => (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(e)}>
                      Edit
                    </Button>
                    <Button
                      variant={e.active ? "danger" : "secondary"}
                      size="sm"
                      onClick={() => handleToggleStatus(e)}
                    >
                      {e.active ? "Deactivate" : "Activate"}
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
        title={editingCode ? `Edit ${editingCode}` : "Add Equipment"}
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
            <FieldLabel>Equipment Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Location</FieldLabel>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Validation Date</FieldLabel>
            <Input
              type="date"
              value={form.validation_date}
              onChange={(e) => setForm({ ...form, validation_date: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>Allowed Roles</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    form.allowed_roles.includes(role)
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-300 text-slate-600"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
