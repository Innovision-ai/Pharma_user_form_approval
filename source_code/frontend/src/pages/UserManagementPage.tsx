import { useEffect, useMemo, useState } from "react";
import { Search, Upload, UserMinus, Unlock, Pencil, Power, Eye, Printer, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { User, UserAccess } from "../types";
import { PrintReport, downloadCsv, printReport } from "../components/PrintReport";
import { formatDate } from "../lib/format";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, FieldLabel, Input, Select, Textarea } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { PageHeader } from "../components/ui/PageHeader";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ROLE_LABELS } from "../lib/roles";

// "IT" is no longer assignable (sheet: IT -> remove; Admin is the IT Executor).
// Existing IT users keep working and keep their role when edited.
const ROLE_OPTIONS = ["EMPLOYEE", "HOD", "QA", "ADMIN", "INVENTORY_REQUESTOR"];
const FILTER_ROLE_OPTIONS = [...ROLE_OPTIONS, "IT"];
const PLANT_OPTIONS = ["P1", "P2", "P3"];
const IMPORT_HEADERS = ["username", "name", "email", "department", "plant", "role", "password"];

/** Parse the AD / ERP CSV export: header row + one user per line. */
function parseImportCsv(textValue: string) {
  const lines = textValue.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("Paste a header row and at least one user.");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  if (idx("username") < 0 || idx("name") < 0 || idx("email") < 0 || idx("department") < 0) {
    throw new Error(`Header must include: ${IMPORT_HEADERS.join(", ")}`);
  }
  const roleCodes: Record<string, string> = Object.fromEntries(
    Object.entries(ROLE_LABELS).flatMap(([code, label]) => [[code.toLowerCase(), code], [label.toLowerCase(), code]]),
  );
  return lines.slice(1).map((line, i) => {
    const cols = line.split(",").map((c) => c.trim());
    const get = (k: string) => (idx(k) >= 0 ? cols[idx(k)] ?? "" : "");
    const role = roleCodes[get("role").toLowerCase()] ?? "EMPLOYEE";
    const plants = get("plant").split(/[;|]/).map((p) => p.trim()).filter(Boolean);
    if (!get("username") || !get("name") || !get("email")) throw new Error(`Line ${i + 2}: username, name and email are required.`);
    return {
      employee_id: get("username"), name: get("name"), email: get("email"),
      department: get("department") || "General", plant: plants[0] ?? "P1", plants,
      role, password: get("password") || undefined,
    };
  });
}

interface FormState {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  plant: string;
  plants: string[];
  role: string;
  password: string;
}

const emptyForm: FormState = {
  employee_id: "",
  name: "",
  email: "",
  department: "",
  plant: "P1",
  plants: [],
  role: "EMPLOYEE",
  password: "",
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
  const [search, setSearch] = useState("");

  // Confirm toggle dialog
  const [confirmToggle, setConfirmToggle] = useState<User | null>(null);

  // Bulk deactivation
  const [bulkTarget, setBulkTarget] = useState<User | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkItUser, setBulkItUser] = useState("IT001");
  const [bulkBusy, setBulkBusy] = useState(false);

  const [departments, setDepartments] = useState<string[]>([]);

  // View user: equipment on which the user ID exists
  const [viewTarget, setViewTarget] = useState<User | null>(null);
  const [access, setAccess] = useState<UserAccess[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);

  const openView = (user: User) => {
    setViewTarget(user);
    setAccess([]);
    setAccessLoading(true);
    api.getUserAccess(user.employee_id)
      .then(setAccess)
      .catch((err) => showToast(err instanceof Error ? err.message : "Could not load access", "error"))
      .finally(() => setAccessLoading(false));
  };

  const reportTitle = filters.active === "true" ? "Active User List" : filters.active === "false" ? "Inactive User List" : "User List";
  const exportUsers = () => {
    downloadCsv(
      `${reportTitle.toLowerCase().replace(/ /g, "-")}-${new Date().toISOString().split("T")[0]}.csv`,
      ["Username", "Name", "Email", "Department", "Plants", "Role", "Source", "Status"],
      filtered.map((u) => [
        u.employee_id, u.name, u.email, u.department, (u.plants?.length ? u.plants : [u.plant]).join("; "),
        ROLE_LABELS[u.role] ?? u.role, u.auth_source === "DIRECTORY" ? "AD / ERP" : "Local",
        u.active ? (u.locked ? "Active (locked)" : "Active") : "Inactive",
      ]),
    );
  };

  // AD / ERP import
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

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

  // Department list depends on the plant chosen first
  useEffect(() => {
    if (!modalOpen) return;
    api.getDepartments(form.plant).then((d) => setDepartments(d.departments)).catch(() => setDepartments([]));
  }, [modalOpen, form.plant]);

  const handleImport = async () => {
    let rows;
    try { rows = parseImportCsv(importText); } catch (err) { setImportResult(err instanceof Error ? err.message : "Invalid file"); return; }
    setImportBusy(true); setImportResult(null);
    try {
      const res = await api.importUsers(rows);
      setImportResult(
        `Imported ${res.created.length} user(s)` +
        (res.skipped.length ? `; skipped existing: ${res.skipped.join(", ")}` : "") +
        (res.errors.length ? `; errors: ${res.errors.join(" | ")}` : ""),
      );
      if (res.created.length) load();
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : "Import failed");
    } finally { setImportBusy(false); }
  };

  const handleUnlock = async (user: User) => {
    try { await api.unlockUser(user.employee_id); showToast(`${user.employee_id} unlocked.`); load(); }
    catch (err) { showToast(err instanceof Error ? err.message : "Unlock failed", "error"); }
  };

  // Client-side search on name/id/email/dept
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter((u) =>
      u.name.toLowerCase().includes(s) ||
      u.employee_id.toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s) ||
      u.department.toLowerCase().includes(s)
    );
  }, [items, search]);

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
      password: "",
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { employee_id: _eid, password: _pw, ...updateData } = form;
        await api.updateUser(editingId, updateData);
        showToast("User updated.");
      } else {
        await api.createUser({ ...form, password: form.password || undefined });
        showToast("User created.");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally { setSaving(false); }
  };

  const handleToggleStatus = (user: User) => setConfirmToggle(user);

  const doToggleStatus = async () => {
    if (!confirmToggle) return;
    const user = confirmToggle;
    setConfirmToggle(null);
    try {
      await api.toggleUserStatus(user.employee_id);
      showToast(`${user.employee_id} status updated.`);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
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
    <PrintReport title={`${reportTitle}${filters.role ? ` – ${ROLE_LABELS[filters.role] ?? filters.role}` : ""}`}>
    <div className="space-y-6">
      <div className="no-print">
      <PageHeader
        eyebrow="Administration"
        title="User Management"
        description={`Total users: ${items.length}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { setImportText(""); setImportResult(null); setImportOpen(true); }}><Upload size={15} /> Import from AD / ERP</Button>
            <Button onClick={openCreate}>+ Add local user</Button>
          </div>
        }
      />
      </div>

      <div className="no-print surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, ID, email, department..." className="pl-9" />
        </div>
        <Select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
          <option value="">All Roles</option>
          {FILTER_ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
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
        <Badge tone="blue">{filtered.length} shown</Badge>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={printReport} title="Print or save the filtered list as PDF"><Printer size={14} /> Print list</Button>
          <Button variant="secondary" size="sm" onClick={exportUsers}><Download size={14} /> Export list</Button>
        </div>
      </div>
      <p className="print-only text-xs">Total: {filtered.length} users{filters.active ? ` (${filters.active === "true" ? "active" : "inactive"} only)` : ""}</p>

      <Modal
        open={!!bulkTarget}
        title={`Bulk deactivation — ${bulkTarget?.employee_id ?? ""}`}
        onClose={() => setBulkTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkTarget(null)}>Cancel</Button>
            <Button variant="danger" disabled={bulkBusy} onClick={handleBulkDeactivate}>{bulkBusy ? "Processing..." : "Raise deactivation requests"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Raises a DEACTIVATE request for every system <strong>{bulkTarget?.name}</strong> has access to. Each request goes through the normal review.
          </p>
          <Field>
            <FieldLabel>IT executor</FieldLabel>
            <Select value={bulkItUser} onChange={(e) => setBulkItUser(e.target.value)}>
              {items.filter((u) => u.active && (u.role === "ADMIN" || u.role === "IT")).map((u) => (
                <option key={u.employee_id} value={u.employee_id}>{u.name} ({u.employee_id})</option>
              ))}
            </Select>
          </Field>
          <Field><FieldLabel>Reason *</FieldLabel><Textarea rows={3} value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="e.g. Employee left the organisation" /></Field>
        </div>
      </Modal>


      <Modal
        open={!!viewTarget}
        size="xl"
        title={`User ${viewTarget?.employee_id ?? ""} — ${viewTarget?.name ?? ""}`}
        onClose={() => setViewTarget(null)}
        footer={<Button variant="secondary" onClick={() => setViewTarget(null)}>Close</Button>}
      >
        {viewTarget && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Username", viewTarget.employee_id],
                ["Name", viewTarget.name],
                ["Email", viewTarget.email],
                ["Department", viewTarget.department],
                ["Plants", (viewTarget.plants?.length ? viewTarget.plants : [viewTarget.plant]).join(", ")],
                ["Role", ROLE_LABELS[viewTarget.role] ?? viewTarget.role],
                ["Source", viewTarget.auth_source === "DIRECTORY" ? "AD / ERP" : "Local"],
                ["Status", viewTarget.active ? (viewTarget.locked ? "Active (locked)" : "Active") : "Inactive"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{label}</p>
                  <p className="text-sm font-medium text-slate-800">{value}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-slate-800">
                User ID created on {access.length} equipment
                <span className="ml-2 font-medium text-slate-500">({access.filter((a) => a.status === "Active").length} active)</span>
              </p>
              {accessLoading ? <p className="text-sm text-slate-500">Loading...</p> : (
                <DataTable
                  rows={access}
                  rowKey={(a) => `${a.equipment_code}-${a.user_id}`}
                  emptyMessage="No user ID has been created for this user on any equipment yet."
                  columns={[
                    { header: "Equipment", render: (a) => <Link className="font-semibold text-brand-600" to={`/equipment/${a.equipment_code}`}>{a.equipment_code}</Link> },
                    { header: "Name", render: (a) => a.equipment_name },
                    { header: "User ID on system", render: (a) => <span className="font-mono text-xs">{a.user_id}</span> },
                    { header: "Role", render: (a) => a.role },
                    { header: "Granted", render: (a) => formatDate(a.granted_date) },
                    { header: "Request", render: (a) => a.request_code },
                    { header: "Status", render: (a) => <Badge tone={a.status === "Active" ? "green" : "red"}>{a.status}</Badge> },
                  ]}
                />
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={importOpen}
        size="lg"
        title="Import users from Active Directory / ERP"
        onClose={() => setImportOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>Close</Button>
            <Button disabled={importBusy || !importText.trim()} onClick={handleImport}>{importBusy ? "Importing..." : "Import users"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Export the users from AD / ERP as CSV and paste or upload it. Header: <code className="rounded bg-slate-100 px-1 text-xs">{IMPORT_HEADERS.join(",")}</code>.
            Several plants can be separated with ";". Roles accept the code or the label (Initiator, Reviewer, QA Approver, IT Executor, Inventory Requestor).
            Existing usernames are skipped.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setImportText); }}
            className="block text-sm"
          />
          <Textarea rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={`${IMPORT_HEADERS.join(",")}\nEMP050,Ravi Kumar,ravi@company.com,QC,P1,Initiator,Welcome@123`} className="font-mono text-xs" />
          {importResult && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{importResult}</p>}
        </div>
      </Modal>

      <Card>
        {loading ? (
          <div className="space-y-3 p-6">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
        ) : (
          <DataTable
            rows={filtered}
            rowKey={(u) => u.employee_id}
            columns={[
              { header: "Username", render: (u) => <span className="font-medium">{u.employee_id}</span> },
              { header: "Name", render: (u) => u.name },
              { header: "Department", render: (u) => u.department },
              { header: "Plant", render: (u) => <div className="flex flex-wrap gap-1">{(u.plants?.length ? u.plants : [u.plant]).map(p => <Badge key={p}>{p}</Badge>)}</div> },
              { header: "Role", render: (u) => <Badge tone="blue">{ROLE_LABELS[u.role] ?? u.role}</Badge> },
              { header: "Source", render: (u) => <span className="text-xs text-slate-500">{u.auth_source === "DIRECTORY" ? "AD / ERP" : "Local"}</span> },
              {
                header: "Status",
                render: (u) => (
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={u.active ? "green" : "red"}>{u.active ? "Active" : "Inactive"}</Badge>
                    {u.locked && <Badge tone="amber">Locked</Badge>}
                  </div>
                ),
              },
              {
                header: "Actions",
                noPrint: true,
                render: (u) => (
                  <div className="flex items-center gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => openView(u)} title="View user and the equipment where the user ID exists"><Eye size={13} /> View</Button>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(u)} title="Edit user"><Pencil size={13} /> Edit</Button>
                    <Button variant="secondary" size="sm" onClick={() => handleToggleStatus(u)} title={u.active ? "Deactivate user" : "Activate user"}>
                      <Power size={13} /> {u.active ? "Deactivate" : "Activate"}
                    </Button>
                    {u.locked && (
                      <Button variant="secondary" size="sm" onClick={() => handleUnlock(u)} title="Unlock account"><Unlock size={13} /></Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => { setBulkTarget(u); setBulkReason(""); }} title="Raise deactivation requests for all of this user's access" className="text-red-600 hover:bg-red-50 hover:text-red-700">
                      <UserMinus size={14} />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Confirm status toggle dialog */}
      {confirmToggle && (
        <ConfirmDialog
          open={true}
          title={confirmToggle.active ? "Deactivate user?" : "Activate user?"}
          message={`Do you want to ${confirmToggle.active ? "deactivate" : "activate"} user ${confirmToggle.employee_id} (${confirmToggle.name})?`}
          confirmLabel={confirmToggle.active ? "Yes, deactivate" : "Yes, activate"}
          danger={confirmToggle.active}
          onConfirm={doToggleStatus}
          onCancel={() => setConfirmToggle(null)}
        />
      )}

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
            <FieldLabel>Username *</FieldLabel>
            <Input value={form.employee_id} disabled={!!editingId} readOnly={!!editingId} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Name *</FieldLabel>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Email *</FieldLabel>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel>Primary plant *</FieldLabel>
            <Select value={form.plant} onChange={(e) => setForm({ ...form, plant: e.target.value, department: "" })}>
              {PLANT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field>
            <FieldLabel>Department *</FieldLabel>
            <Select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              <option value="">Select department</option>
              {form.department && !departments.includes(form.department) && <option value={form.department}>{form.department}</option>}
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
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
              {(form.role === "IT" ? [...ROLE_OPTIONS, "IT"] : ROLE_OPTIONS).map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
            </Select>
          </Field>
          {!editingId && (
            <Field>
              <FieldLabel>Initial Password</FieldLabel>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Set the user's initial password"
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-slate-500">Min 8 chars, must include uppercase, lowercase, digit and special char.</p>
            </Field>
          )}
        </div>
      </Modal>
    </div>
    </PrintReport>
  );
}
