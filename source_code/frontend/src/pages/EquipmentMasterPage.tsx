import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, Plus, Eye, Pencil, Power } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Equipment } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { PageHeader } from "../components/ui/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, FieldLabel, Input, Select } from "../components/ui/Input";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ui/Toast";

const ROLE_OPTIONS = ["Analyst", "Senior Analyst", "Scientist", "Operator", "Supervisor"];
const PLANT_OPTIONS = ["P1", "P2", "P3"];
const TYPE_OPTIONS = ["Hardware", "Software", "Instrument", "Equipment"];
const SYSTEM_TYPE_OPTIONS = ["HMI", "SCADA", "Software", "DCS", "Data Logger", "Other"];
const GAMP_OPTIONS = ["1", "2", "3", "4", "5"];
const VALIDATION_STATUS_OPTIONS = ["validated", "under_validation"];

interface FormState {
  name: string;
  type: string;
  location: string;
  plant: string;
  allowed_roles: string[];
  validation_date: string;
  // extended computerized system fields
  system_id: string;
  system_type: string;
  make: string;
  model_name: string;
  application_name: string;
  gamp_category: string;
  usp_classification: string;
  validation_status: string;
  initial_validation_date: string;
  latest_validation_date: string;
  periodic_review_frequency: string;
  backup_include: boolean;
  computer_system_id: string;
  remarks: string;
}

const emptyForm: FormState = {
  name: "", type: "Software", location: "", plant: "P1", allowed_roles: [], validation_date: "",
  system_id: "", system_type: "Software", make: "", model_name: "", application_name: "",
  gamp_category: "4", usp_classification: "", validation_status: "under_validation",
  initial_validation_date: "", latest_validation_date: "",
  periodic_review_frequency: "", backup_include: false, computer_system_id: "", remarks: "",
};

export function EquipmentMasterPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [validationFilter, setValidationFilter] = useState("");

  const filteredItems = useMemo(() => items.filter((equipment) => {
    const haystack = `${equipment.equipment_code} ${equipment.name} ${equipment.type} ${equipment.location} ${equipment.plant} ${equipment.make ?? ""} ${equipment.system_type ?? ""}`.toLowerCase();
    const matchesQuery = haystack.includes(query.toLowerCase());
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? equipment.active : !equipment.active);
    const matchesValidation = !validationFilter || equipment.validation_status === validationFilter;
    return matchesQuery && matchesStatus && matchesValidation;
  }), [items, query, statusFilter, validationFilter]);

  const load = () => {
    setLoading(true);
    api.listEquipment()
      .then(setItems)
      .catch((err) => showToast(err instanceof Error ? err.message : "Failed to load equipment", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => { setEditingCode(null); setForm(emptyForm); setModalOpen(true); };

  const openEdit = (eq: Equipment) => {
    setEditingCode(eq.equipment_code);
    setForm({
      name: eq.name,
      type: eq.type,
      location: eq.location,
      plant: eq.plant,
      allowed_roles: eq.allowed_roles,
      validation_date: eq.validation_date,
      system_id: eq.system_id ?? "",
      system_type: eq.system_type ?? "Software",
      make: eq.make ?? "",
      model_name: eq.model_name ?? "",
      application_name: eq.application_name ?? "",
      gamp_category: eq.gamp_category ?? "4",
      usp_classification: eq.usp_classification ?? "",
      validation_status: eq.validation_status ?? "under_validation",
      initial_validation_date: eq.initial_validation_date ?? "",
      latest_validation_date: eq.latest_validation_date ?? "",
      periodic_review_frequency: eq.periodic_review_frequency != null ? String(eq.periodic_review_frequency) : "",
      backup_include: eq.backup_include ?? false,
      computer_system_id: eq.computer_system_id ?? "",
      remarks: eq.remarks ?? "",
    });
    setModalOpen(true);
  };

  const toggleRole = (role: string) =>
    setForm((f) => ({
      ...f,
      allowed_roles: f.allowed_roles.includes(role)
        ? f.allowed_roles.filter((r) => r !== role)
        : [...f.allowed_roles, role],
    }));

  const handleSave = async () => {
    if (!form.name || !form.location || !form.type || !form.plant || !form.validation_date || form.allowed_roles.length === 0) {
      showToast("Please fill in all required fields and select at least one role.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        periodic_review_frequency: form.periodic_review_frequency ? parseInt(form.periodic_review_frequency) : null,
        initial_validation_date: form.initial_validation_date || null,
        latest_validation_date: form.latest_validation_date || null,
      };
      if (editingCode) {
        await api.updateEquipment(editingCode, payload as Parameters<typeof api.updateEquipment>[1]);
        showToast("Equipment updated.");
      } else {
        await api.createEquipment(payload as Parameters<typeof api.createEquipment>[0]);
        showToast("Equipment created.");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally { setSaving(false); }
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
    <div className="space-y-8">
      <PageHeader eyebrow="Administration" title="Equipment Master" description="Register validated assets and define the roles that can request access." actions={<Button onClick={openCreate}><Plus size={16} /> Add equipment</Button>} />

      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search equipment, location, plant..." className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-slate-400" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-brand-500">
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>
        <select value={validationFilter} onChange={(e) => setValidationFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-brand-500">
          <option value="">All validation states</option>
          <option value="validated">Validated</option>
          <option value="under_validation">Under validation</option>
        </select>
        <Badge tone="blue">{filteredItems.length} assets</Badge>
      </div>

      <Card>
        {loading ? (
          <div className="space-y-3 p-6">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
        ) : (
          <DataTable
            rows={filteredItems}
            rowKey={(e) => e.equipment_code}
            columns={[
              { header: "Code", render: (e) => <span className="font-medium">{e.equipment_code}</span> },
              { header: "Name", render: (e) => e.name },
              { header: "System Type", render: (e) => e.system_type ? <Badge>{e.system_type}</Badge> : <span className="text-slate-400">—</span> },
              { header: "Make", render: (e) => e.make ?? <span className="text-slate-400">—</span> },
              { header: "GAMP", render: (e) => e.gamp_category ? <Badge tone="purple">Cat {e.gamp_category}</Badge> : <span className="text-slate-400">—</span> },
              { header: "Plant", render: (e) => <Badge tone="blue">{e.plant}</Badge> },
              { header: "Validation", render: (e) => <StatusBadge status={e.validation_status ?? "under_validation"} /> },
              { header: "Review (mo)", render: (e) => e.periodic_review_frequency ?? <span className="text-slate-400">—</span> },
              { header: "Backup", render: (e) => e.backup_include ? <Badge tone="green">Yes</Badge> : <Badge>No</Badge> },
              { header: "Status", render: (e) => <Badge tone={e.active ? "green" : "red"}>{e.active ? "Active" : "Inactive"}</Badge> },
              {
                header: "",
                render: (e) => (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" title="View details" onClick={() => navigate(`/equipment/${e.equipment_code}`)}>
                      <Eye size={14} /> <span className="hidden xl:inline">View</span>
                    </Button>
                    <Button variant="secondary" size="sm" title="Edit" onClick={() => openEdit(e)}>
                      <Pencil size={14} /> <span className="hidden xl:inline">Edit</span>
                    </Button>
                    <Button variant={e.active ? "danger" : "secondary"} size="sm" title={e.active ? "Deactivate" : "Activate"} onClick={() => handleToggleStatus(e)}>
                      <Power size={14} /> <span className="hidden xl:inline">{e.active ? "Deactivate" : "Activate"}</span>
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
        placement="drawer"
        title={editingCode ? `Edit ${editingCode}` : "Add Equipment"}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Basic info</p>
          <Field><FieldLabel>Equipment Name *</FieldLabel><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Type</FieldLabel>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field>
              <FieldLabel>Plant</FieldLabel>
              <Select value={form.plant} onChange={(e) => setForm({ ...form, plant: e.target.value })}>
                {PLANT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          </div>
          <Field><FieldLabel>Location *</FieldLabel><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field><FieldLabel>Validation Date *</FieldLabel><Input type="date" value={form.validation_date} onChange={(e) => setForm({ ...form, validation_date: e.target.value })} /></Field>
          <Field>
            <FieldLabel>Allowed Roles</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => (
                <button key={role} type="button" onClick={() => toggleRole(role)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${form.allowed_roles.includes(role) ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 text-slate-600"}`}>
                  {role}
                </button>
              ))}
            </div>
          </Field>

          <p className="pt-2 text-xs font-extrabold uppercase tracking-widest text-slate-400">Computerized system details</p>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel>System ID</FieldLabel><Input value={form.system_id} onChange={(e) => setForm({ ...form, system_id: e.target.value })} placeholder="CS-001" /></Field>
            <Field>
              <FieldLabel>System Type</FieldLabel>
              <Select value={form.system_type} onChange={(e) => setForm({ ...form, system_type: e.target.value })}>
                {SYSTEM_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel>Make</FieldLabel><Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="e.g. Siemens" /></Field>
            <Field><FieldLabel>Model</FieldLabel><Input value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} /></Field>
          </div>
          <Field><FieldLabel>Application Name</FieldLabel><Input value={form.application_name} onChange={(e) => setForm({ ...form, application_name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>GAMP Category</FieldLabel>
              <Select value={form.gamp_category} onChange={(e) => setForm({ ...form, gamp_category: e.target.value })}>
                {GAMP_OPTIONS.map((g) => <option key={g} value={g}>Category {g}</option>)}
              </Select>
            </Field>
            <Field><FieldLabel>USP Classification</FieldLabel><Input value={form.usp_classification} onChange={(e) => setForm({ ...form, usp_classification: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Validation Status</FieldLabel>
              <Select value={form.validation_status} onChange={(e) => setForm({ ...form, validation_status: e.target.value })}>
                {VALIDATION_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </Select>
            </Field>
            <Field><FieldLabel>Periodic Review (months)</FieldLabel><Input type="number" value={form.periodic_review_frequency} onChange={(e) => setForm({ ...form, periodic_review_frequency: e.target.value })} placeholder="e.g. 12" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel>Initial Validation Date</FieldLabel><Input type="date" value={form.initial_validation_date} onChange={(e) => setForm({ ...form, initial_validation_date: e.target.value })} /></Field>
            <Field><FieldLabel>Latest Validation Date</FieldLabel><Input type="date" value={form.latest_validation_date} onChange={(e) => setForm({ ...form, latest_validation_date: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel>Computer System ID</FieldLabel><Input value={form.computer_system_id} onChange={(e) => setForm({ ...form, computer_system_id: e.target.value })} /></Field>
            <Field>
              <FieldLabel>Include in Backup</FieldLabel>
              <label className="flex items-center gap-2 pt-2">
                <input type="checkbox" checked={form.backup_include} onChange={(e) => setForm({ ...form, backup_include: e.target.checked })} className="h-4 w-4 rounded" />
                <span className="text-sm text-slate-700">Yes, include in backup schedule</span>
              </label>
            </Field>
          </div>
          <Field><FieldLabel>Remarks</FieldLabel><Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
