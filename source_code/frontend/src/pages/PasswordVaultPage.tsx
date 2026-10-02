import { useEffect, useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { VaultEntry } from "../types";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, FieldLabel, Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

function ExpiryChip({ date }: { date?: string | null }) {
  if (!date) return null;
  const d = new Date(date);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Expired</span>;
  if (days <= 10) return <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Expires in {days}d</span>;
  return <span className="ml-2 text-xs text-slate-400">exp {d.toLocaleDateString()}</span>;
}

export function PasswordVaultPage() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ equipment_code: "", equipment_name: "", password: "", created_date: new Date().toISOString().split("T")[0], expiry_days: "" });

  const load = () => {
    setLoading(true);
    api.listVaultEntries().then(setEntries).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggleReveal = (id: number) => setRevealed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleDelete = async (id: number) => {
    try { await api.deleteVaultEntry(id); showToast("Entry deleted."); load(); }
    catch (e) { showToast(e instanceof Error ? e.message : "Delete failed", "error"); }
  };

  const handleAdd = async () => {
    if (!form.equipment_code || !form.equipment_name || !form.password) return showToast("Please fill required fields", "error");
    setBusy(true);
    try {
      await api.createVaultEntry({
        equipment_code: form.equipment_code,
        equipment_name: form.equipment_name,
        password: form.password,
        created_date: form.created_date,
        expiry_days: form.expiry_days ? parseInt(form.expiry_days) : undefined,
      });
      showToast("Entry added.");
      setShowAdd(false);
      setForm({ equipment_code: "", equipment_name: "", password: "", created_date: new Date().toISOString().split("T")[0], expiry_days: "" });
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Add failed", "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Password Vault</h1>
          <p className="text-sm text-slate-500">Securely store equipment credentials. Visible only to you.</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}><Plus size={16} className="mr-1" />Add entry</Button>
      </div>

      {showAdd && (
        <Card>
          <CardHeader><CardTitle>New vault entry</CardTitle></CardHeader>
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel>Equipment code *</FieldLabel><Input value={form.equipment_code} onChange={e => setForm(p => ({ ...p, equipment_code: e.target.value }))} placeholder="EQ-001" /></Field>
              <Field><FieldLabel>Equipment name *</FieldLabel><Input value={form.equipment_name} onChange={e => setForm(p => ({ ...p, equipment_name: e.target.value }))} placeholder="HPLC System" /></Field>
              <Field><FieldLabel>Password *</FieldLabel><Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} /></Field>
              <Field><FieldLabel>Created date</FieldLabel><Input type="date" value={form.created_date} onChange={e => setForm(p => ({ ...p, created_date: e.target.value }))} /></Field>
              <Field><FieldLabel>Expiry days (optional)</FieldLabel><Input type="number" value={form.expiry_days} onChange={e => setForm(p => ({ ...p, expiry_days: e.target.value }))} placeholder="e.g. 90" /></Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button disabled={busy} onClick={handleAdd}>{busy ? "Saving..." : "Save entry"}</Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>My vault ({entries.length})</CardTitle></CardHeader>
        <CardBody>
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading...</p> : entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No vault entries yet. Add one to get started.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {entries.map(e => (
                <div key={e.id} className="flex items-center justify-between py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{e.equipment_name} <span className="font-mono text-xs text-slate-400">({e.equipment_code})</span></p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className={`rounded bg-slate-100 px-2 py-0.5 text-xs font-mono ${revealed.has(e.id) ? "text-slate-800" : "text-slate-100 select-none"}`}>
                        {revealed.has(e.id) ? e.password : "●".repeat(Math.min(e.password.length, 16))}
                      </code>
                      <button onClick={() => toggleReveal(e.id)} className="text-slate-400 hover:text-slate-600">
                        {revealed.has(e.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <span className="text-xs text-slate-400">Created {new Date(e.created_date).toLocaleDateString()}</span>
                      <ExpiryChip date={e.expiry_date} />
                    </div>
                  </div>
                  <button onClick={() => handleDelete(e.id)} className="ml-4 text-red-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
