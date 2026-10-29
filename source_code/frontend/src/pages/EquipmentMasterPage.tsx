import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, Plus, Eye, Pencil, Power, ArrowRightCircle, Columns3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Equipment } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable, type Column } from "../components/ui/DataTable";
import { PageHeader } from "../components/ui/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, FieldLabel, Input, Select, Textarea } from "../components/ui/Input";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ui/Toast";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { formatDate } from "../lib/format";

// GAMP Cat 2 removed per client feedback — only 1, 3, 4, 5
const GAMP_OPTIONS = ["1", "3", "4", "5"];
const TYPE_OPTIONS = ["Hardware", "Software", "Instrument", "Equipment"];
const SYSTEM_TYPE_OPTIONS = ["HMI", "SCADA", "Software", "DCS", "Data Logger", "Other"];
const VALIDATION_STATUS_OPTIONS = ["under_validation", "validated"];
const COLUMNS_STORAGE_KEY = "equipment-cols";

interface FormState {
  name: string;
  type: string;
  plant: string;
  application_name: string;
  computer_system_id: string;
  instrument_ids: string;
  make: string;
  model_name: string;
  system_type: string;
  gamp_category: string;
  usp_classification: string;
  allowed_roles: string[];
  location: string;
  validation_status: string;
  validation_date: string;
  initial_validation_date: string;
  latest_validation_date: string;
  periodic_review_frequency: string;
  backup_include: boolean;
  remarks: string;
  system_id: string; // not on the form any more; kept so edits do not wipe existing values
}

const emptyForm = (plant: string): FormState => ({
  name: "", type: "Software", plant, application_name: "", computer_system_id: "", instrument_ids: "",
  make: "", model_name: "", system_type: "Software", gamp_category: "4", usp_classification: "",
  allowed_roles: [], location: "", validation_status: "under_validation", validation_date: "",
  initial_validation_date: "", latest_validation_date: "", periodic_review_frequency: "",
  backup_include: false, remarks: "", system_id: "",
});

const validationLabel = (v?: string | null) => (v === "validated" ? "Validated" : "Under Validation");

/** Free-text tag input for allowed roles (type a role and press Enter). */
function RoleTagInput({ value, onChange }: { value: string[]; onChange: (roles: string[]) => void }) {
  const [input, setInput] = useState("");

  const add = () => {
    const parts = input.split(",").map((v) => v.trim()).filter(Boolean);
    const next = [...value];
    parts.forEach((p) => { if (!next.includes(p)) next.push(p); });
    onChange(next);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((r) => (
          <span key={r} className="flex items-center gap-1 rounded-full border border-brand-300 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800">
            {r}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== r))} className="ml-0.5 text-brand-400 hover:text-brand-700" aria-label={`Remove ${r}`}>×</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-slate-400 italic">No roles added yet.</span>}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          onBlur={() => input.trim() && add()}
          placeholder="Type a role (e.g. Analyst) and press Enter"
          className="flex-1"
        />
        <Button type="button" variant="secondary" size="sm" onClick={add}>Add</Button>
      </div>
    </div>
  );
}

const dash = <span className="text-slate-400">—</span>;
const text = (v?: string | number | null) => (v === null || v === undefined || v === "" ? dash : v);

/** Every column the user can show / hide (row 10 of the testing sheet). */
const ALL_COLUMNS: { key: string; header: string; render: (e: Equipment) => ReactNode }[] = [
  { key: "equipment_code", header: "Code", render: (e) => <span className="font-medium">{e.equipment_code}</span> },
  { key: "name", header: "Name", render: (e) => e.name },
  { key: "type", header: "Type", render: (e) => <Badge>{e.type}</Badge> },
  { key: "application_name", header: "Application Name", render: (e) => text(e.application_name) },
  { key: "computer_system_id", header: "Computer System ID", render: (e) => text(e.computer_system_id) },
  { key: "instrument_ids", header: "Instrument IDs", render: (e) => text(e.instrument_ids) },
  { key: "system_type", header: "System Type", render: (e) => (e.system_type ? <Badge>{e.system_type}</Badge> : dash) },
  { key: "make", header: "Make", render: (e) => text(e.make) },
  { key: "model_name", header: "Model", render: (e) => text(e.model_name) },
  { key: "gamp_category", header: "GAMP", render: (e) => (e.gamp_category ? <Badge tone="purple">Cat {e.gamp_category}</Badge> : dash) },
  { key: "usp_classification", header: "USP Classification", render: (e) => text(e.usp_classification) },
  { key: "allowed_roles", header: "Allowed Roles", render: (e) => <span className="text-xs">{e.allowed_roles.join(", ")}</span> },
  { key: "location", header: "Department", render: (e) => e.location },
  { key: "plant", header: "Plant", render: (e) => <Badge tone="blue">{e.plant}</Badge> },
  { key: "validation_status", header: "Validation Status", render: (e) => <StatusBadge status={e.validation_status ?? "under_validation"} /> },
  { key: "validation_date", header: "Validation Completion Date", render: (e) => formatDate(e.validation_date) },
  { key: "periodic_review_frequency", header: "Periodic Review Freq.", render: (e) => (e.periodic_review_frequency != null ? `${e.periodic_review_frequency} months` : dash) },
  { key: "backup_include", header: "Backup", render: (e) => (e.backup_include ? <Badge tone="green">Yes</Badge> : <Badge>No</Badge>) },
  { key: "active", header: "Status", render: (e) => <Badge tone={e.active ? "green" : "red"}>{e.active ? "Active" : "Retired"}</Badge> },
];
const DEFAULT_COLUMNS = ["equipment_code", "name", "system_type", "make", "gamp_category", "plant", "validation_status", "periodic_review_frequency", "backup_include", "active"];

export function EquipmentMasterPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { currentUser, plant: loginPlant } = useAuth();
  const plantOptions = currentUser?.plants?.length ? currentUser.plants : [loginPlant ?? "P1"];

  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(loginPlant ?? "P1"));
  const [departments, setDepartments] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "retired">("all");
  const [validationFilter, setValidationFilter] = useState("");
  const [systemTypeFilter, setSystemTypeFilter] = useState("");
  const [plantFilter, setPlantFilter] = useState("");

  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(COLUMNS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  const [confirmTarget, setConfirmTarget] = useState<{ eq: Equipment; mode: "activate" | "retire" } | null>(null);

  useEffect(() => {
    if (!colPickerOpen) return;
    const close = (e: MouseEvent) => { if (!colPickerRef.current?.contains(e.target as Node)) setColPickerOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [colPickerOpen]);

  // Department list follows the selected plant
  useEffect(() => {
    if (!modalOpen) return;
    api.getDepartments(form.plant).then((d) => setDepartments(d.departments)).catch(() => setDepartments([]));
  }, [modalOpen, form.plant]);

  const filteredItems = useMemo(() => items.filter((equipment) => {
    const haystack = `${equipment.equipment_code} ${equipment.name} ${equipment.type} ${equipment.location} ${equipment.plant} ${equipment.make ?? ""} ${equipment.system_type ?? ""} ${equipment.application_name ?? ""} ${equipment.computer_system_id ?? ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase())
      && (statusFilter === "all" || (statusFilter === "active" ? equipment.active : !equipment.active))
      && (!validationFilter || equipment.validation_status === validationFilter)
      && (!systemTypeFilter || equipment.system_type === systemTypeFilter)
      && (!plantFilter || equipment.plant === plantFilter);
  }), [items, query, statusFilter, validationFilter, systemTypeFilter, plantFilter]);

  const load = () => {
    setLoading(true);
    api.listEquipment()
      .then(setItems)
      .catch((err) => showToast(err instanceof Error ? err.message : "Failed to load equipment", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleCol = (key: string) => {
    const next = visibleCols.includes(key) ? visibleCols.filter((c) => c !== key) : ALL_COLUMNS.map((c) => c.key).filter((k) => k === key || visibleCols.includes(k));
    setVisibleCols(next);
    try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const openCreate = () => { setEditingCode(null); setForm(emptyForm(loginPlant ?? "P1")); setModalOpen(true); };

  const openEdit = (eq: Equipment) => {
    setEditingCode(eq.equipment_code);
    setForm({
      name: eq.name,
      type: eq.type,
      plant: eq.plant,
      application_name: eq.application_name ?? "",
      computer_system_id: eq.computer_system_id ?? "",
      instrument_ids: eq.instrument_ids ?? "",
      make: eq.make ?? "",
      model_name: eq.model_name ?? "",
      system_type: eq.system_type ?? "Software",
      gamp_category: eq.gamp_category && GAMP_OPTIONS.includes(eq.gamp_category) ? eq.gamp_category : "4",
      usp_classification: eq.usp_classification ?? "",
      allowed_roles: eq.allowed_roles,
      location: eq.location,
      validation_status: eq.validation_status ?? "under_validation",
      validation_date: eq.validation_date ?? "",
      initial_validation_date: eq.initial_validation_date ?? "",
      latest_validation_date: eq.latest_validation_date ?? "",
      periodic_review_frequency: eq.periodic_review_frequency != null ? String(eq.periodic_review_frequency) : "",
      backup_include: eq.backup_include ?? false,
      remarks: eq.remarks ?? "",
      system_id: eq.system_id ?? "",
    });
    setModalOpen(true);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.name || !form.location || !form.type || !form.plant || form.allowed_roles.length === 0) {
      showToast("Please fill in all required fields and add at least one role.", "error");
      return;
    }
    if (form.validation_status === "validated" && !form.validation_date) {
      showToast("Enter the Validation Completion Date for validated equipment.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        system_id: form.system_id || null,
        validation_date: form.validation_date || null,
        periodic_review_frequency: form.periodic_review_frequency ? parseInt(form.periodic_review_frequency) : null,
        initial_validation_date: form.initial_validation_date || null,
        latest_validation_date: form.latest_validation_date || null,
        computer_system_id: form.computer_system_id || null,
        instrument_ids: form.instrument_ids || null,
      };
      if (editingCode) {
        await api.updateEquipment(editingCode, payload as Parameters<typeof api.updateEquipment>[1]);
        showToast("Equipment updated.");
      } else {
        const created = await api.createEquipment(payload as Parameters<typeof api.createEquipment>[0]);
        showToast(`Equipment ${created.equipment_code} saved.`);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally { setSaving(false); }
  };

  const doConfirm = async () => {
    if (!confirmTarget) return;
    const { eq, mode } = confirmTarget;
    setConfirmTarget(null);
    if (mode === "retire") {
      // Retirement goes through an approved asset retire request
      navigate(`/asset-requests/new?retire=${encodeURIComponent(eq.equipment_code)}`);
      return;
    }
    try {
      await api.toggleEquipmentStatus(eq.equipment_code, true);
      showToast(`${eq.equipment_code} marked Active.`);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
  };

  const columns: Column<Equipment>[] = [
    ...ALL_COLUMNS.filter((c) => visibleCols.includes(c.key)).map(({ header, render }) => ({ header, render })),
    {
      header: "Actions",
      render: (e) => (
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" title="View details" onClick={() => navigate(`/equipment/${e.equipment_code}`)}>
            <Eye size={14} /> <span className="hidden xl:inline">View</span>
          </Button>
          <Button variant="secondary" size="sm" title="Edit" onClick={() => openEdit(e)}>
            <Pencil size={14} /> <span className="hidden xl:inline">Edit</span>
          </Button>
          {e.active ? (
            <Button variant="danger" size="sm" title="Raise retire request" onClick={() => setConfirmTarget({ eq: e, mode: "retire" })}>
              <ArrowRightCircle size={14} /> <span className="hidden xl:inline">Retire</span>
            </Button>
          ) : (
            <Button variant="secondary" size="sm" title="Activate equipment" onClick={() => setConfirmTarget({ eq: e, mode: "activate" })}>
              <Power size={14} /> <span className="hidden xl:inline">Activate</span>
            </Button>
          )}
        </div>
      ),
    },
  ];

  const selectClass = "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-brand-500";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Equipment Master"
        description="Register assets and define the roles that can request access."
        actions={<Button onClick={openCreate}><Plus size={16} /> Add equipment</Button>}
      />

      {/* relative z-20: the Columns pop-up must sit above the table card below */}
      <div className="surface relative z-20 flex flex-col gap-3 p-4 sm:flex-row sm:items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-3.5 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search equipment, department, application..." className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-slate-400" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={selectClass}>
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="retired">Retired only</option>
          </select>
        </div>
        <select value={systemTypeFilter} onChange={(e) => setSystemTypeFilter(e.target.value)} className={selectClass} aria-label="System type filter">
          <option value="">All system types</option>
          {SYSTEM_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={plantFilter} onChange={(e) => setPlantFilter(e.target.value)} className={selectClass} aria-label="Plant filter">
          <option value="">All plants</option>
          {plantOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={validationFilter} onChange={(e) => setValidationFilter(e.target.value)} className={selectClass}>
          <option value="">All validation states</option>
          <option value="validated">Validated</option>
          <option value="under_validation">Under validation</option>
        </select>
        <div className="relative" ref={colPickerRef}>
          <Button variant="secondary" onClick={() => setColPickerOpen((v) => !v)}><Columns3 size={15} /> Columns</Button>
          {colPickerOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-slate-100 bg-white p-3 shadow-xl">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Columns to display</p>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {ALL_COLUMNS.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    <input type="checkbox" checked={visibleCols.includes(c.key)} onChange={() => toggleCol(c.key)} className="h-4 w-4 rounded" />
                    {c.header}
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => { setVisibleCols(DEFAULT_COLUMNS); try { localStorage.removeItem(COLUMNS_STORAGE_KEY); } catch { /* ignore */ } }} className="mt-2 text-xs font-semibold text-brand-600">Reset to default</button>
            </div>
          )}
        </div>
        <Badge tone="blue">{filteredItems.length} assets</Badge>
      </div>

      <Card>
        {loading ? (
          <div className="space-y-3 p-6">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
        ) : (
          <DataTable rows={filteredItems} rowKey={(e) => e.equipment_code} columns={columns} />
        )}
      </Card>

      {confirmTarget && (
        <ConfirmDialog
          open={true}
          title={confirmTarget.mode === "activate" ? "Activate equipment?" : "Retire equipment?"}
          message={confirmTarget.mode === "activate"
            ? `Do you want to activate the equipment ${confirmTarget.eq.equipment_code} (${confirmTarget.eq.name})?`
            : `Do you want to retire the equipment ${confirmTarget.eq.equipment_code} (${confirmTarget.eq.name})? You will be taken to the asset retire request; the equipment is retired once that request is approved.`}
          confirmLabel="Yes"
          danger={confirmTarget.mode === "retire"}
          onConfirm={doConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}

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
          <Field><FieldLabel>1. Equipment Name *</FieldLabel><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>2. Type</FieldLabel>
              <Select value={form.type} onChange={(e) => set("type", e.target.value)}>
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field>
              <FieldLabel>3. Plant</FieldLabel>
              <Select value={form.plant} onChange={(e) => setForm((f) => ({ ...f, plant: e.target.value, location: "" }))}>
                {plantOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          </div>
          <Field><FieldLabel>4. Application Name</FieldLabel><Input value={form.application_name} onChange={(e) => set("application_name", e.target.value)} /></Field>
          <Field>
            <FieldLabel>5. Computer System ID</FieldLabel>
            <Input value={form.computer_system_id} onChange={(e) => set("computer_system_id", e.target.value)} placeholder="e.g. CS-010" />
            <p className="mt-1 text-xs text-slate-500">When entered, the system is added to the Preventive Maintenance planner automatically.</p>
          </Field>
          <Field><FieldLabel>6. Instrument / Equipment / Connected Instrument IDs</FieldLabel><Input value={form.instrument_ids} onChange={(e) => set("instrument_ids", e.target.value)} placeholder="Comma-separated IDs" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel>7. Make</FieldLabel><Input value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="e.g. Siemens" /></Field>
            <Field><FieldLabel>8. Model</FieldLabel><Input value={form.model_name} onChange={(e) => set("model_name", e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>9. System Type</FieldLabel>
              <Select value={form.system_type} onChange={(e) => set("system_type", e.target.value)}>
                {SYSTEM_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field>
              <FieldLabel>10. GAMP Category</FieldLabel>
              <Select value={form.gamp_category} onChange={(e) => set("gamp_category", e.target.value)}>
                {GAMP_OPTIONS.map((g) => <option key={g} value={g}>Category {g}</option>)}
              </Select>
            </Field>
          </div>
          <Field><FieldLabel>11. USP Classification</FieldLabel><Input value={form.usp_classification} onChange={(e) => set("usp_classification", e.target.value)} /></Field>
          <Field>
            <FieldLabel>12. Allowed Roles *</FieldLabel>
            <RoleTagInput value={form.allowed_roles} onChange={(roles) => set("allowed_roles", roles)} />
          </Field>
          <Field>
            <FieldLabel>13. Department *</FieldLabel>
            <Select value={form.location} onChange={(e) => set("location", e.target.value)}>
              <option value="">Select department</option>
              {form.location && !departments.includes(form.location) && <option value={form.location}>{form.location}</option>}
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>14. Validation Status</FieldLabel>
              <Select value={form.validation_status} onChange={(e) => set("validation_status", e.target.value)}>
                {VALIDATION_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{validationLabel(v)}</option>)}
              </Select>
            </Field>
            <Field>
              <FieldLabel>15. Validation Completion Date{form.validation_status === "validated" ? " *" : ""}</FieldLabel>
              <Input type="date" value={form.validation_date} onChange={(e) => set("validation_date", e.target.value)} />
            </Field>
          </div>
          {form.validation_status === "validated" && (
            <p className="-mt-2 text-xs text-amber-700">"Validated" is accepted only after the equipment's asset creation request is approved.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel>16. Initial Validation Date</FieldLabel><Input type="date" value={form.initial_validation_date} onChange={(e) => set("initial_validation_date", e.target.value)} /></Field>
            <Field><FieldLabel>17. Latest Validation Date</FieldLabel><Input type="date" value={form.latest_validation_date} onChange={(e) => set("latest_validation_date", e.target.value)} /></Field>
          </div>
          <Field><FieldLabel>18. Periodic Review Freq. (months)</FieldLabel><Input type="number" min={1} value={form.periodic_review_frequency} onChange={(e) => set("periodic_review_frequency", e.target.value)} placeholder="e.g. 12" /></Field>
          <Field>
            <FieldLabel>19. Include in Backup</FieldLabel>
            <label className="flex items-center gap-2 pt-1">
              <input type="checkbox" checked={form.backup_include} onChange={(e) => set("backup_include", e.target.checked)} className="h-4 w-4 rounded" />
              <span className="text-sm text-slate-700">Yes, include in backup schedule</span>
            </label>
          </Field>
          <Field><FieldLabel>20. Remarks</FieldLabel><Textarea rows={3} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}
