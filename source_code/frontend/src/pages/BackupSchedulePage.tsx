import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { BackupScheduleRow } from "../types";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";

function DueChip({ date }: { date?: string | null }) {
  if (!date) return <span className="text-xs text-slate-400">Not set</span>;
  const d = new Date(date);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Overdue {Math.abs(days)}d</span>;
  if (days <= 7) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Due in {days}d</span>;
  return <span className="text-xs text-slate-600">{d.toLocaleDateString()}</span>;
}

export function BackupSchedulePage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<BackupScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, { date: string; freq: string }>>({});

  const load = () => {
    setLoading(true);
    api.listBackupSchedule().then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleUpdate = async (code: string) => {
    const d = inputs[code]?.date;
    if (!d) return showToast("Please enter a date", "error");
    const freq = parseInt(inputs[code]?.freq || "30");
    setUpdating(code);
    try {
      await api.updateBackupDone(code, d, freq);
      showToast("Backup date updated.");
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
    } finally { setUpdating(null); }
  };

  const canUpdate = currentUser?.role === "IT" || currentUser?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Backup Schedule</h1>
        <p className="text-sm text-slate-500">Track backup completion for systems with backup enabled.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Backup schedule</CardTitle></CardHeader>
        <CardBody>
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                    <th className="pb-3 pr-4">Code</th>
                    <th className="pb-3 pr-4">System name</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Make</th>
                    <th className="pb-3 pr-4">Frequency (days)</th>
                    <th className="pb-3 pr-4">Last backup</th>
                    <th className="pb-3 pr-4">Next backup</th>
                    {canUpdate && <th className="pb-3">Update done</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(r => (
                    <tr key={r.equipment_code} className="hover:bg-slate-50/50">
                      <td className="py-3 pr-4 font-mono text-xs text-slate-600">{r.equipment_code}</td>
                      <td className="py-3 pr-4 font-medium text-slate-900">{r.equipment_name}</td>
                      <td className="py-3 pr-4 text-slate-500">{r.system_type || "—"}</td>
                      <td className="py-3 pr-4 text-slate-500">{r.make || "—"}</td>
                      <td className="py-3 pr-4 text-slate-600">{r.frequency_days ?? "30"}</td>
                      <td className="py-3 pr-4 text-slate-600">{r.last_backup_date ? new Date(r.last_backup_date).toLocaleDateString() : "—"}</td>
                      <td className="py-3 pr-4"><DueChip date={r.next_backup_date} /></td>
                      {canUpdate && (
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <input type="date" className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              value={inputs[r.equipment_code]?.date ?? ""}
                              onChange={e => setInputs(p => ({ ...p, [r.equipment_code]: { ...p[r.equipment_code], date: e.target.value } }))} />
                            <input type="number" placeholder="Days" className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              value={inputs[r.equipment_code]?.freq ?? "30"}
                              onChange={e => setInputs(p => ({ ...p, [r.equipment_code]: { ...p[r.equipment_code], freq: e.target.value } }))} />
                            <Button size="sm" disabled={updating === r.equipment_code} onClick={() => handleUpdate(r.equipment_code)}>
                              {updating === r.equipment_code ? "..." : "Update"}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={canUpdate ? 8 : 7} className="py-8 text-center text-sm text-slate-500">No systems with backup enabled.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
