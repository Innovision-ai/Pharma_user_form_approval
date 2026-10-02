import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { User } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, FieldLabel, Input, Select, Textarea } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

const ROLE_OPTIONS = ["EMPLOYEE", "HOD", "QA", "ADMIN", "IT"];
const PLANT_OPTIONS = ["P1", "P2", "P3"];

interface FormState {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  plant: string;
  plants: string[];
  role: string;
}

const emptyForm: FormState = {
  employee_id: "",
  name: "",
  email: "",
  department: "",
  plant: "P1",
  plants: [],
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
  const [filters, setFilters] = useState({ role: "", plant: "", active: "" });

  // Bulk deactivation
  const [bulkTarget, setBulkTarget] = useState<User | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkItUser, setBulkItUser] = useState("IT001");
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.listUsers({
      role: filters.role || undefined,
      plant: filters.plant || undefined,
      active: filters.active === "" ? undefined : filters.active === "true",
    })
      .then(setItems)
      .catch((err) => showToast(err instanceof Error ? err.message : "Failed to load users", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filters]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setModalOpen(true); };

  const openEdit = (user: User) => {
    setEditingId(user.employee_id);
    setForm({
      employee_id: user.employee_id,
      name: user.name,
      email: user.email,
      department: user.department,
      plant: user.plant,
      plants: user.plants ?? [],
      role: user.role,
    });
    setModalOpen(true);
  };

  const togglePlant = (p: string) =>
    setForm(prev => ({
      ...prev,
      plants: prev.plants.includes(p) ? prev.plants.filter(x => x !== p) : [...prev.plants, p],
    }));

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
    } finally { setSaving(false); }
  };

  const handleToggleStatus = async (user: User) => {
    try { await api.toggleUserStatus(user.employee_id); showToast(`${user.employee_id} status updated.`); load(); }
    catch (err) { showToast(err instanceof Error ? err.message : "Update failed", "error"); }
  };

  const handleBulkDeactivate = async () => {
    if (!bulkTarget || !bulkReason) return showToast("Reason is required", "error");
    setBulkBusy(true);
    try {
      const result = await api.bulkDeactivateUser({ employee_id: bulkTarget.employee_id, it_executor_id: bulkItUser, reason: bulkReason });
      showToast(`${result.count} deactivation request(s) created.`);
      setBulkTarget(null);
      setBulkReason("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Bulk deactivate failed", "error");
    } finally { setBulkBusy(false); }
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
        <Select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
          <option value="">All Roles</option>
          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        <Select value={filters.plant} onChange={(e) => setFilters({ ...filters, plant: e.target.value })}>
          <option value="">All Plants</option>
          {PLANT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select value={filters.active} onChange={(e) => setFilters({ ...filters, active: e.target.value })}>
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </div>

      {bulkTarget && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
          <p className="font-semibold text-red-800">Bulk deactivation for <span className="font-mono">{bulkTarget.employee_id}</span> — {bulkTarget.name}</p>
          <p className="text-sm text-red-700">This will create DEACTIVATE UAM requests for all active access this user holds.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel>IT executor ID</FieldLabel><Input value={bulkItUser} onChange={e => setBulkItUser(e.target.value)} /></Field>
            <Field><FieldLabel>Reason *</FieldLabel><Textarea rows={2} value={bulkReason} onChange={e => setBulkReason(e.target.value)} placeholder="Reason for bulk deactivation..." /></Field>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setBulkTarget(null)}>Cancel</Button>
            <Button variant="danger" disabled={bulkBusy} onClick={handleBulkDeactivate}>{bulkBusy ? "Processing..." : "Request bulk deactivation"}</Button>
          </div>
        </div>
      )}

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
              { header: "Department", render: (u) => u.department },
              { header: "Plant", render: (u) => <div className="flex flex-wrap gap-1">{(u.plants?.length ? u.plants : [u.plant]).map(p => <Badge key={p}>{p}</Badge>)}</div> },
              { header: "Role", render: (u) => <Badge tone="blue">{u.role}</Badge> },
              { header: "Status", render: (u) => <Badge tone={u.active ? "green" : "red"}>{u.active ? "Active" : "Inactive"}</Badge> },
              {
                header: "",
                render: (u) => (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(u)}>Edit</Button>
                    <Button variant={u.active ? "danger" : "secondary"} size="sm" onClick={() => handleToggleStatus(u)}>
                      {u.active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => { setBulkTarget(u); setBulkReason(""); }}>Bulk deactivate</Button>
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
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field>
            <FieldLabel>Employee ID</FieldLabel>
            <Input value={form.employee_id} disabled={!!editingId} readOnly={!!editingId} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} />
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
            <FieldLabel>Primary plant</FieldLabel>
            <Select value={form.plant} onChange={(e) => setForm({ ...form, plant: e.target.value })}>
              {PLANT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field>
            <FieldLabel>Plant access (multi-select)</FieldLabel>
            <div className="flex flex-wrap gap-2 pt-1">
              {PLANT_OPTIONS.map(p => (
                <label key={p} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={form.plants.includes(p)} onChange={() => togglePlant(p)} className="rounded" />
                  {p}
                </label>
              ))}
            </div>
          </Field>
          <Field>
            <FieldLabel>Role</FieldLabel>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
