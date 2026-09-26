import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { User } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, FieldLabel, Input, Select } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

const ROLE_OPTIONS = ["EMPLOYEE", "HOD", "QA", "ADMIN", "IT"];
const PLANT_OPTIONS = ["P1", "P2", "P3"];

interface FormState {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  plant: string;
  role: string;
}

const emptyForm: FormState = {
  employee_id: "",
  name: "",
  email: "",
  department: "",
  plant: "P1",
  role: "EMPLOYEE",
};

export function UserManagementPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({
    role: "",
    plant: "",
    active: "",
  });

  const load = () => {
    setLoading(true);
    api
      .listUsers({
        role: filters.role || undefined,
        plant: filters.plant || undefined,
        active: filters.active === "" ? undefined : filters.active === "true",
      })
      .then(setItems)
      .catch((err) => showToast(err instanceof Error ? err.message : "Failed to load users", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filters]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingId(user.employee_id);
    setForm({
      employee_id: user.employee_id,
      name: user.name,
      email: user.email,
      department: user.department,
      plant: user.plant,
      role: user.role,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.employee_id || !form.name || !form.email || !form.department) {
      showToast("Please fill in all required fields.", "error");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateUser(editingId, form);
        showToast("User updated.");
      } else {
        await api.createUser(form);
        showToast("User created.");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await api.toggleUserStatus(user.employee_id);
      showToast(`${user.employee_id} status updated.`);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500">Create, edit, and manage system users.</p>
        </div>
        <Button onClick={openCreate}>+ Add User</Button>
      </div>

      <div className="flex gap-3">
        <Select
          value={filters.role}
          onChange={(e) => setFilters({ ...filters, role: e.target.value })}
        >
          <option value="">All Roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Select
          value={filters.plant}
          onChange={(e) => setFilters({ ...filters, plant: e.target.value })}
        >
          <option value="">All Plants</option>
          {PLANT_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select
          value={filters.active}
          onChange={(e) => setFilters({ ...filters, active: e.target.value })}
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </div>

      <Card>
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Loading...</p>
        ) : (
          <DataTable
            rows={items}
            rowKey={(u) => u.employee_id}
            columns={[
              { header: "Employee ID", render: (u) => <span className="font-medium">{u.employee_id}</span> },
              { header: "Name", render: (u) => u.name },
              { header: "Email", render: (u) => u.email },
              { header: "Department", render: (u) => u.department },
              { header: "Plant", render: (u) => <Badge>{u.plant}</Badge> },
              { header: "Role", render: (u) => <Badge tone="blue">{u.role}</Badge> },
              {
                header: "Status",
                render: (u) => (
                  <Badge tone={u.active ? "green" : "red"}>{u.active ? "Active" : "Inactive"}</Badge>
                ),
              },
              {
                header: "",
                render: (u) => (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(u)}>
                      Edit
                    </Button>
                    <Button
                      variant={u.active ? "danger" : "secondary"}
                      size="sm"
                      onClick={() => handleToggleStatus(u)}
                    >
                      {u.active ? "Deactivate" : "Activate"}
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
        title={editingId ? `Edit ${editingId}` : "Add User"}
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
            <FieldLabel>Employee ID</FieldLabel>
            <Input
              value={form.employee_id}
              disabled={!!editingId}
              readOnly={!!editingId}
              onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Department</FieldLabel>
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Plant</FieldLabel>
            <Select value={form.plant} onChange={(e) => setForm({ ...form, plant: e.target.value })}>
              {PLANT_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel>Role</FieldLabel>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
