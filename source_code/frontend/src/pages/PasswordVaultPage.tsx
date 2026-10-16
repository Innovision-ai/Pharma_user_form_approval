import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Plus, Trash2, Pencil, Search } from "lucide-react";
import { api } from "../lib/api";
import type { VaultEntry } from "../types";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Field, FieldLabel, Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { PageHeader } from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { formatDate } from "../lib/format";

function ExpiryBadge({ entry }: { entry: VaultEntry }) {
  if (!entry.expiry_date) return null;
  const d = new Date(entry.expiry_date);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return <Badge tone="red">Expired</Badge>;
  if (days <= 10) return <Badge tone="amber">Expires in {days}d</Badge>;
  return <Badge tone="green">Exp {formatDate(entry.expiry_date)}</Badge>;
}

export function PasswordVaultPage() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addForm, setAddForm] = useState({
    equipment_code: "", equipment_name: "",
    password: "", created_date: new Date().toISOString().split("T")[0], expiry_days: "",
  });

  // Edit modal
  const [editTarget, setEditTarget] = useState<VaultEntry | null>(null);
  const [editForm, setEditForm] = useState({ password: "", expiry_days: "" });
  const [editBusy, setEditBusy] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<VaultEntry | null>(null);

  const load = () => {
    setLoading(true);
    api.listVaultEntries().then(setEntries).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const s = search.toLowerCase();
    return entries.filter((e) =>
      e.equipment_name.toLowerCase().includes(s) ||
      e.equipment_code.toLowerCase().includes(s)
    );
  }, [entries, search]);

  const toggleReveal = (id: number) => setRevealed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteVaultEntry(deleteTarget.id);
      showToast("Entry deleted.");
      setDeleteTarget(null);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed", "error");
    }
  };

  const handleAdd = async () => {
    if (!addForm.equipment_code || !addForm.equipment_name || !addForm.password) {
      return showToast("Please fill required fields", "error");
    }
    setBusy(true);
    try {
      await api.createVaultEntry({
        equipment_code: addForm.equipment_code,
        equipment_name: addForm.equipment_name,
        password: addForm.password,
        created_date: addForm.created_date,
        expiry_days: addForm.expiry_days ? parseInt(addForm.expiry_days) : undefined,
      });
      showToast("Entry added.");
      setShowAdd(false);
      setAddForm({ equipment_code: "", equipment_name: "", password: "", created_date: new Date().toISOString().split("T")[0], expiry_days: "" });
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Add failed", "error");
    } finally { setBusy(false); }
  };

  const openEdit = (entry: VaultEntry) => {
    setEditTarget(entry);
    setEditForm({ password: "", expiry_days: String(entry.expiry_days ?? "") });
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    if (!editForm.password) return showToast("Enter the new password", "error");
    setEditBusy(true);
    try {
      await api.updateVaultEntry(editTarget.id, {
        password: editForm.password,
        expiry_days: editForm.expiry_days ? parseInt(editForm.expiry_days) : undefined,
      });
      showToast("Entry updated. Created/Updated date reset to today.");
      setEditTarget(null);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
    } finally { setEditBusy(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security"
        title="Password Vault"
        description="Securely store equipment credentials. Visible only to you."
        actions={<Button onClick={() => setShowAdd(!showAdd)}><Plus size={16} className="mr-1" />Add entry</Button>}
      />

      {/* Add form */}
      {showAdd && (
        <Card>
          <CardHeader><CardTitle>New vault entry</CardTitle></CardHeader>
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel>Equipment code *</FieldLabel><Input value={addForm.equipment_code} onChange={e => setAddForm(p => ({ ...p, equipment_code: e.target.value }))} placeholder="EQ-001" /></Field>
              <Field><FieldLabel>Equipment name *</FieldLabel><Input value={addForm.equipment_name} onChange={e => setAddForm(p => ({ ...p, equipment_name: e.target.value }))} placeholder="HPLC System" /></Field>
              <Field><FieldLabel>Password *</FieldLabel><Input type="password" autoComplete="new-password" value={addForm.password} onChange={e => setAddForm(p => ({ ...p, password: e.target.value }))} /></Field>
              <Field><FieldLabel>Created date</FieldLabel><Input type="date" value={addForm.created_date} onChange={e => setAddForm(p => ({ ...p, created_date: e.target.value }))} /></Field>
              <Field><FieldLabel>Expiry days (optional)</FieldLabel><Input type="number" value={addForm.expiry_days} onChange={e => setAddForm(p => ({ ...p, expiry_days: e.target.value }))} placeholder="e.g. 90" /></Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button disabled={busy} onClick={handleAdd}>{busy ? "Saving..." : "Save entry"}</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Search */}
      <div className="surface p-4">
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search equipment name or code..." className="pl-9" />
        </div>
      </div>

      {/* Vault table */}
      <Card>
        <CardHeader><CardTitle>My vault ({filtered.length})</CardTitle></CardHeader>
        {loading ? (
          <div className="space-y-3 p-6">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
        ) : (
          <DataTable
            rows={filtered}
            rowKey={(e) => e.id}
            emptyMessage="No vault entries yet. Add one to get started."
            columns={[
              { header: "Equipment", render: (e) => <span className="font-semibold">{e.equipment_name} <span className="text-xs text-slate-400">({e.equipment_code})</span></span> },
              {
                header: "Password",
                render: (e) => (
                  <div className="flex items-center gap-2">
                    <code className={`rounded bg-slate-100 px-2 py-0.5 text-xs font-mono ${revealed.has(e.id) ? "text-slate-800" : "text-slate-100 select-none"}`}>
                      {revealed.has(e.id) ? e.password : "●".repeat(Math.min(e.password.length || 8, 16))}
                    </code>
                    <button onClick={() => toggleReveal(e.id)} className="text-slate-400 hover:text-slate-600">
                      {revealed.has(e.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                ),
              },
              {
                header: "Created / Last Updated Date",
                render: (e) => <span className="text-sm">{formatDate(e.created_date)}</span>,
              },
              {
                header: "Expiry",
                render: (e) => e.expiry_days
                  ? <span className="text-sm text-slate-600">In {e.expiry_days} days</span>
                  : <span className="text-slate-400">—</span>,
              },
              {
                header: "Status",
                render: (e) => <ExpiryBadge entry={e} />,
              },
              {
                header: "",
                render: (e) => (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(e)} title="Edit / update password">
                      <Pencil size={13} /> <span className="hidden xl:inline">Edit</span>
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setDeleteTarget(e)} title="Delete">
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Edit modal */}
      {editTarget && (
        <Modal
          open={true}
          title={`Update vault entry — ${editTarget.equipment_name}`}
          onClose={() => setEditTarget(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button disabled={editBusy} onClick={handleEdit}>{editBusy ? "Saving..." : "Update password"}</Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Updating the password will reset the <strong>Created / Last Updated Date</strong> to today and recompute the expiry date.
            </p>
            <Field>
              <FieldLabel>New Password *</FieldLabel>
              <Input type="password" autoComplete="new-password" value={editForm.password} onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))} />
            </Field>
            <Field>
              <FieldLabel>Expiry days (from today)</FieldLabel>
              <Input type="number" value={editForm.expiry_days} onChange={e => setEditForm(p => ({ ...p, expiry_days: e.target.value }))} placeholder="e.g. 90" />
            </Field>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          open={true}
          title="Delete vault entry?"
          message={`Are you sure you want to delete the vault entry for "${deleteTarget.equipment_name}"? This cannot be undone.`}
          confirmLabel="Yes, delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
