import { useEffect, useMemo, useState } from "react";
import { Printer, Download, Calendar, Search } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { BackupScheduleRow } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, FieldLabel, Input, Select, Textarea } from "../components/ui/Input";
import { CredentialsDialog } from "../components/ui/CredentialsDialog";
import { PageHeader } from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { formatDate } from "../lib/format";
import { downloadCsv, printReport } from "../components/PrintReport";

function DueBadge({ row }: { row: BackupScheduleRow }) {
  // Note: last/next backup removed from display per client request
  // We show frequency only, no dates
  const r = row as Record<string, unknown>;
  const freq = r.frequency_days as number | undefined;
  return <span className="text-sm text-slate-600">{freq ?? 30} days</span>;
}

const TYPE_OPTIONS = ["Hardware", "Software", "Instrument", "Equipment"];

export function BackupSchedulePage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<BackupScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ type: "", department: "" });

  // Planner modal
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerYear, setPlannerYear] = useState(String(new Date().getFullYear()));
  const [plannerMonth, setPlannerMonth] = useState("");
  const [plannerRows, setPlannerRows] = useState<BackupScheduleRow[]>([]);
  const [plannerLoading, setPlannerLoading] = useState(false);

  // Update-done form
  const [updateTarget, setUpdateTarget] = useState<BackupScheduleRow | null>(null);
  const [updateDate, setUpdateDate] = useState(new Date().toISOString().split("T")[0]);
  const [updateFreq, setUpdateFreq] = useState("30");
  const [updateNotes, setUpdateNotes] = useState("");
  const [updatePath, setUpdatePath] = useState("");
  const [credOpen, setCredOpen] = useState(false);

  const canUpdate = currentUser?.role === "IT" || currentUser?.role === "ADMIN";

  const load = () => {
    setLoading(true);
    api.listBackupSchedule({ type: filters.type || undefined, department: filters.department || undefined, search: search || undefined })
      .then(setRows)
      .catch((e) => showToast(e instanceof Error ? e.message : "Load failed", "error"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [filters]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter(r =>
      r.equipment_name.toLowerCase().includes(s) ||
      r.equipment_code.toLowerCase().includes(s)
    );
  }, [rows, search]);

  const openUpdate = (row: BackupScheduleRow) => {
    const r = row as Record<string, unknown>;
    setUpdateTarget(row);
    setUpdateDate(new Date().toISOString().split("T")[0]);
    setUpdateFreq(String(r.frequency_days ?? 30));
    setUpdateNotes("");
    setUpdatePath(String(r.backup_path ?? ""));
    setCredOpen(true);
  };

  const doUpdate = async (authPassword: string, _reason: string) => {
    if (!updateTarget) return;
    setCredOpen(false);
    try {
      await api.updateBackupDone(
        updateTarget.equipment_code, updateDate,
        parseInt(updateFreq) || 30,
        updateNotes, authPassword, updatePath || undefined
      );
      showToast("Backup schedule updated.");
      setUpdateTarget(null);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
    }
  };

  const loadPlanner = async () => {
    setPlannerLoading(true);
    try {
      const data = await api.getBackupSchedulePlanner(
        parseInt(plannerYear), plannerMonth ? parseInt(plannerMonth) : undefined,
        filters.type || undefined, filters.department || undefined
      );
      setPlannerRows(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Planner load failed", "error");
    } finally { setPlannerLoading(false); }
  };

  const handleExportCsv = () => {
    const headers = ["Code", "System Name", "Type", "Department", "Frequency (days)", "Backup Path", "Updated By"];
    const csvRows = filtered.map((r) => {
      const row = r as Record<string, unknown>;
      return [r.equipment_code, r.equipment_name, String(row.type ?? ""), String(row.department ?? ""), String(row.frequency_days ?? 30), String(row.backup_path ?? ""), String(r.updated_by ?? "")];
    });
    downloadCsv(`backup-schedule-${new Date().toISOString().split("T")[0]}.csv`, headers, csvRows);
    showToast("Exported to CSV.");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Backup Schedule"
        description="Track backup completion for systems with backup enabled. Retired equipment is excluded."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setPlannerOpen(true); loadPlanner(); }}><Calendar size={15} /> Planner</Button>
            <Button variant="secondary" onClick={printReport}><Printer size={15} /> Print</Button>
            <Button onClick={handleExportCsv}><Download size={15} /> Export</Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="surface flex gap-3 p-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search systems..." className="pl-9" onBlur={() => load()} />
        </div>
        <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">All Types</option>
          {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Input value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} placeholder="Filter by department..." className="max-w-xs" />
        <Badge tone="blue">{filtered.length} systems</Badge>
      </div>

      <Card>
        {loading ? (
          <div className="space-y-3 p-6">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
        ) : (
          <DataTable
            rows={filtered}
            rowKey={(r) => r.equipment_code}
            emptyMessage="No systems with backup enabled."
            columns={([
              { header: "Code", render: (r) => <span className="font-mono text-xs">{r.equipment_code}</span> },
              { header: "System Name", render: (r) => <span className="font-semibold">{r.equipment_name}</span> },
              { header: "Type", render: (r) => { const row = r as Record<string, unknown>; return row.type ? <Badge>{String(row.type)}</Badge> : <span className="text-slate-400">—</span>; } },
              { header: "Department", render: (r) => { const row = r as Record<string, unknown>; return String(row.department ?? "—"); } },
              { header: "CS ID", render: (r) => { const row = r as Record<string, unknown>; return String(row.computer_system_id ?? "—"); } },
              { header: "Frequency", render: (r) => <DueBadge row={r} /> },
              { header: "Backup Path", render: (r) => { const row = r as Record<string, unknown>; return row.backup_path ? <span className="font-mono text-xs text-slate-700">{String(row.backup_path)}</span> : <span className="text-slate-400">—</span>; } },
              { header: "Updated by", render: (r) => <span className="text-xs text-slate-500">{r.updated_by ?? "—"}</span> },
              canUpdate ? {
                header: "",
                render: (r) => (
                  <Button size="sm" onClick={() => openUpdate(r)}>Mark done</Button>
                ),
              } : null,
            ] as (Column<BackupScheduleRow> | null)[]).filter(Boolean) as Column<BackupScheduleRow>[]}
          />
        )}
      </Card>

      {/* Update done inline form */}
      {credOpen && updateTarget && (
        <>
          <div className="surface p-4 space-y-3 border border-slate-200 rounded-xl">
            <p className="text-sm font-semibold">Mark backup done for: <span className="text-brand-700">{updateTarget.equipment_name}</span></p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field><FieldLabel>Backup Date *</FieldLabel><Input type="date" value={updateDate} onChange={e => setUpdateDate(e.target.value)} /></Field>
              <Field><FieldLabel>Frequency (days)</FieldLabel><Input type="number" value={updateFreq} onChange={e => setUpdateFreq(e.target.value)} /></Field>
              <Field><FieldLabel>Backup Path</FieldLabel><Input value={updatePath} onChange={e => setUpdatePath(e.target.value)} placeholder="e.g. D:\Backups\system1" /></Field>
            </div>
            <Field><FieldLabel>Notes</FieldLabel><Input value={updateNotes} onChange={e => setUpdateNotes(e.target.value)} placeholder="Optional notes..." /></Field>
          </div>
          <CredentialsDialog
            open={credOpen}
            title="E-Signature: Confirm Backup"
            requireReason={false}
            onConfirm={({ password, reason }) => doUpdate(password, reason)}
            onClose={() => { setCredOpen(false); setUpdateTarget(null); }}
          />
        </>
      )}

      {/* Planner modal */}
      <Modal
        open={plannerOpen}
        title="Backup Schedule Planner"
        onClose={() => setPlannerOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPlannerOpen(false)}>Close</Button>
            <Button onClick={() => downloadCsv(
              `backup-planner-${plannerYear}${plannerMonth ? `-${plannerMonth}` : ""}.csv`,
              ["Code", "System Name", "Type", "Dept", "Frequency (days)"],
              plannerRows.map(r => {
                const row = r as Record<string, unknown>;
                return [r.equipment_code, r.equipment_name, String(row.type ?? ""), String(row.department ?? ""), String(row.frequency_days ?? 30)];
              })
            )}>
              <Download size={14} /> Export Planner
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-3 items-end">
            <Field><FieldLabel>Year</FieldLabel><Input type="number" value={plannerYear} onChange={e => setPlannerYear(e.target.value)} className="w-28" /></Field>
            <Field>
              <FieldLabel>Month (optional)</FieldLabel>
              <Select value={plannerMonth} onChange={e => setPlannerMonth(e.target.value)}>
                <option value="">All months</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>{new Date(2000, i).toLocaleString("default", { month: "long" })}</option>
                ))}
              </Select>
            </Field>
            <Button onClick={loadPlanner}>Load</Button>
          </div>
          {plannerLoading ? <p className="text-sm text-slate-500">Loading...</p> : (
            <DataTable
              rows={plannerRows}
              rowKey={(r) => r.equipment_code}
              emptyMessage="No backups due for the selected period."
              columns={[
                { header: "Code", render: (r) => r.equipment_code },
                { header: "System Name", render: (r) => r.equipment_name },
                { header: "Frequency (days)", render: (r) => { const row = r as Record<string, unknown>; return String(row.frequency_days ?? 30); } },
              ]}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
