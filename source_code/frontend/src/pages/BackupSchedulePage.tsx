import { useEffect, useMemo, useState } from "react";
import { Calendar, Download, Printer, Search } from "lucide-react";
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
import { PrintReport, downloadCsv, printReport } from "../components/PrintReport";

const TYPE_OPTIONS = ["Hardware", "Software", "Instrument", "Equipment"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const today = () => new Date().toISOString().split("T")[0];
const str = (v: unknown) => (v == null ? "" : String(v));

const CSV_HEADERS = ["Code", "System Name", "Type", "Department", "Computer System ID", "Frequency (days)", "Backup Path", "Updated By"];
const csvRow = (r: BackupScheduleRow) => [
  r.equipment_code, r.equipment_name, str(r.type), str(r.department), str(r.computer_system_id),
  str(r.frequency_days ?? 30), str(r.backup_path), str(r.updated_by),
];

export function BackupSchedulePage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const canUpdate = currentUser?.role === "IT" || currentUser?.role === "ADMIN";

  const [rows, setRows] = useState<BackupScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ type: "", department: "" });
  const [departments, setDepartments] = useState<string[]>([]);

  // Mark done
  const [target, setTarget] = useState<BackupScheduleRow | null>(null);
  const [form, setForm] = useState({ date: today(), freq: "30", path: "", notes: "" });
  const [credOpen, setCredOpen] = useState(false);

  // Planner
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerYear, setPlannerYear] = useState(String(new Date().getFullYear()));
  const [plannerMonth, setPlannerMonth] = useState("");
  const [plannerRows, setPlannerRows] = useState<BackupScheduleRow[]>([]);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [printMode, setPrintMode] = useState<"list" | "planner">("list");

  useEffect(() => {
    api.getDepartments().then((d) => setDepartments(d.departments)).catch(() => setDepartments([]));
  }, []);

  const load = () => {
    setLoading(true);
    api.listBackupSchedule({ type: filters.type || undefined, department: filters.department || undefined })
      .then(setRows)
      .catch((e) => showToast(e instanceof Error ? e.message : "Load failed", "error"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [filters]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      `${r.equipment_code} ${r.equipment_name} ${str(r.computer_system_id)} ${str(r.backup_path)}`.toLowerCase().includes(s),
    );
  }, [rows, search]);

  const openDone = (row: BackupScheduleRow) => {
    setTarget(row);
    setForm({ date: today(), freq: str(row.frequency_days ?? 30), path: str(row.backup_path), notes: "" });
  };

  const confirmDone = async ({ password }: { password: string; reason: string }) => {
    if (!target) return;
    await api.updateBackupDone(target.equipment_code, form.date, parseInt(form.freq) || 30, form.notes || undefined, password, form.path);
    setCredOpen(false);
    setTarget(null);
    showToast("Backup schedule updated.");
    load();
  };

  const loadPlanner = async () => {
    setPlannerLoading(true);
    try {
      setPlannerRows(await api.getBackupSchedulePlanner(
        parseInt(plannerYear), plannerMonth ? parseInt(plannerMonth) : undefined,
        filters.type || undefined, filters.department || undefined,
      ));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Planner load failed", "error");
    } finally { setPlannerLoading(false); }
  };

  const plannerPeriod = plannerMonth ? `${MONTHS[parseInt(plannerMonth) - 1]} ${plannerYear}` : plannerYear;
  const printPlanner = () => {
    setPlannerOpen(false);
    setPrintMode("planner");
    setTimeout(() => { printReport(); setPrintMode("list"); }, 50);
  };

  const baseColumns: Column<BackupScheduleRow>[] = [
    { header: "Code", render: (r) => <span className="font-mono text-xs">{r.equipment_code}</span> },
    { header: "System Name", render: (r) => <span className="font-semibold">{r.equipment_name}</span> },
    { header: "Type", render: (r) => r.type ? <Badge>{str(r.type)}</Badge> : <span className="text-slate-400">—</span> },
    { header: "Department", render: (r) => str(r.department) || "—" },
    { header: "Computer System ID", render: (r) => str(r.computer_system_id) || "—" },
    { header: "Frequency", render: (r) => <span className="text-sm text-slate-600">{str(r.frequency_days ?? 30)} days</span> },
    { header: "Backup Path", render: (r) => r.backup_path ? <span className="font-mono text-xs text-slate-700">{str(r.backup_path)}</span> : <span className="text-slate-400">—</span> },
  ];
  const columns: Column<BackupScheduleRow>[] = [
    ...baseColumns,
    { header: "Updated by", render: (r) => <span className="text-xs text-slate-500">{r.updated_by || "—"}</span> },
    { header: "Status", render: (r) => (r.active === false ? <Badge tone="red">Retired</Badge> : <Badge tone="green">Active</Badge>) },
    ...(canUpdate ? [{
      header: "",
      noPrint: true,
      className: "px-6 py-4",
      // Retired systems stay listed for their history but cannot be updated
      render: (r: BackupScheduleRow) => (r.active === false ? null : <Button size="sm" onClick={() => openDone(r)}>Update</Button>),
    }] : []),
  ];

  return (
    <PrintReport title={printMode === "planner" ? `Backup Planner – ${plannerPeriod}` : "Backup Schedule Report"}>
      <div className="space-y-6">
        <div className="no-print">
          <PageHeader
            eyebrow="Operations"
            title="Backup Schedule"
            description="Systems with backup enabled. Retired equipment is excluded."
            actions={
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => { setPlannerOpen(true); void loadPlanner(); }}><Calendar size={15} /> Planner</Button>
                <Button variant="secondary" onClick={printReport}><Printer size={15} /> Print</Button>
                <Button onClick={() => downloadCsv(`backup-schedule-${today()}.csv`, CSV_HEADERS, filtered.map(csvRow))}><Download size={15} /> Export</Button>
              </div>
            }
          />
        </div>

        <div className="no-print surface flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search system, code, path..." className="pl-9" />
          </div>
          <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="max-w-[180px]">
            <option value="">All types</option>
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} className="max-w-[200px]">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
          <Badge tone="blue">{filtered.length} systems</Badge>
        </div>

        {printMode === "list" ? (
          <Card>
            {loading ? (
              <div className="space-y-3 p-6">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
            ) : (
              <DataTable rows={filtered} rowKey={(r) => r.equipment_code} emptyMessage="No systems with backup enabled." columns={columns} />
            )}
          </Card>
        ) : (
          <DataTable rows={plannerRows} rowKey={(r) => r.equipment_code} emptyMessage="No backups due for the selected period." columns={baseColumns} />
        )}
      </div>

      <Modal
        open={!!target && !credOpen}
        title={`Mark backup done — ${target?.equipment_name ?? ""}`}
        onClose={() => setTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={() => { if (!form.date) return showToast("Enter the backup date", "error"); setCredOpen(true); }}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel>Backup Date *</FieldLabel><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field><FieldLabel>Frequency (days)</FieldLabel><Input type="number" min={1} value={form.freq} onChange={(e) => setForm({ ...form, freq: e.target.value })} /></Field>
          </div>
          <Field><FieldLabel>Backup Path / Data Backup Path</FieldLabel><Input value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} placeholder="e.g. \\backup-server\HPLC01" /></Field>
          <Field><FieldLabel>Notes</FieldLabel><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." /></Field>
        </div>
      </Modal>
      <CredentialsDialog
        open={credOpen}
        title="E-Signature: Confirm Backup"
        description={`Record backup for ${target?.equipment_name ?? ""} on ${formatDate(form.date)}.`}
        requireReason
        confirmLabel="Sign & save"
        onConfirm={confirmDone}
        onClose={() => setCredOpen(false)}
      />

      <Modal
        open={plannerOpen}
        size="lg"
        title="Backup Schedule Planner"
        onClose={() => setPlannerOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPlannerOpen(false)}>Close</Button>
            <Button variant="secondary" onClick={printPlanner}><Printer size={14} /> Print planner</Button>
            <Button onClick={() => downloadCsv(`backup-planner-${plannerYear}${plannerMonth ? `-${plannerMonth}` : ""}.csv`, CSV_HEADERS, plannerRows.map(csvRow))}>
              <Download size={14} /> Download
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field><FieldLabel>Year</FieldLabel><Input type="number" value={plannerYear} onChange={(e) => setPlannerYear(e.target.value)} className="w-28" /></Field>
            <Field>
              <FieldLabel>Month</FieldLabel>
              <Select value={plannerMonth} onChange={(e) => setPlannerMonth(e.target.value)}>
                <option value="">All months (yearly)</option>
                {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
              </Select>
            </Field>
            <Button onClick={loadPlanner}>Load</Button>
          </div>
          {plannerLoading ? <p className="text-sm text-slate-500">Loading...</p> : (
            <DataTable rows={plannerRows} rowKey={(r) => r.equipment_code} emptyMessage="No backups due for the selected period." columns={baseColumns} />
          )}
        </div>
      </Modal>
    </PrintReport>
  );
}
