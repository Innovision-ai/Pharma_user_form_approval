import { useEffect, useMemo, useState } from "react";
import { Calendar, Download, History, Plus, Printer, Search, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { PMRow } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { CredentialsDialog } from "../components/ui/CredentialsDialog";
import { Field, FieldLabel, Input, Select, Textarea } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { formatDate, formatDateTime } from "../lib/format";
import { PrintReport, downloadCsv, printReport } from "../components/PrintReport";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const today = () => new Date().toISOString().split("T")[0];

/** Days from today to a YYYY-MM-DD date, using local dates (no timezone shift). */
function daysUntil(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - base.getTime()) / 86400000);
}

function DueBadge({ date }: { date?: string | null }) {
  if (!date) return <Badge tone="slate">Not set</Badge>;
  const days = daysUntil(date);
  if (days < 0) return <Badge tone="red">Overdue {Math.abs(days)}d</Badge>;
  if (days <= 30) return <Badge tone="amber">Due in {days}d · {formatDate(date)}</Badge>;
  return <span className="text-sm text-slate-600">{formatDate(date)}</span>;
}

interface HistoryRow { id: number; pm_date: string | null; frequency_months: number; notes: string | null; performed_by: string; performed_at: string | null }

const csvRow = (r: PMRow) => [
  r.equipment_code, r.equipment_name, r.computer_system_id ?? "", r.system_id ?? "", r.department ?? "",
  String(r.frequency_months ?? ""), formatDate(r.last_pm_date), formatDate(r.next_pm_date),
  r.source === "additional" ? "Additional" : "Equipment",
];
const CSV_HEADERS = ["Code", "System Name", "Computer System ID", "System ID", "Department", "Frequency (months)", "Last PM", "Next PM", "Source"];

export function PreventiveMaintenancePage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const canUpdate = currentUser?.role === "IT" || currentUser?.role === "ADMIN";

  const [rows, setRows] = useState<PMRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");

  // Mark done
  const [doneTarget, setDoneTarget] = useState<PMRow | null>(null);
  const [doneForm, setDoneForm] = useState({ date: today(), freq: "6", notes: "" });
  const [credOpen, setCredOpen] = useState(false);

  // History
  const [historyTarget, setHistoryTarget] = useState<PMRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Additional systems
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ system_name: "", system_id: "", computer_system_id: "", frequency_months: "6" });
  const [addBusy, setAddBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PMRow | null>(null);

  // Planner
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerYear, setPlannerYear] = useState(String(new Date().getFullYear()));
  const [plannerMonth, setPlannerMonth] = useState("");
  const [plannerRows, setPlannerRows] = useState<PMRow[]>([]);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [printMode, setPrintMode] = useState<"list" | "planner">("list");

  const load = () => {
    setLoading(true);
    api.listPM()
      .then(setRows)
      .catch((e) => showToast(e instanceof Error ? e.message : "Load failed", "error"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const departments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.department).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchDept = !department || r.department === department;
      const haystack = `${r.equipment_code} ${r.equipment_name} ${r.computer_system_id ?? ""} ${r.system_id ?? ""}`.toLowerCase();
      return matchDept && (!s || haystack.includes(s));
    });
  }, [rows, search, department]);

  const openDone = (row: PMRow) => {
    setDoneTarget(row);
    setDoneForm({ date: today(), freq: String(row.frequency_months ?? 6), notes: "" });
  };

  const confirmDone = async ({ password }: { password: string; reason: string }) => {
    if (!doneTarget) return;
    const freq = parseInt(doneForm.freq) || 6;
    if (doneTarget.source === "additional" && doneTarget.additional_id != null) {
      await api.updateAdditionalPMDone(doneTarget.additional_id, doneForm.date, freq, doneForm.notes || undefined, password);
    } else {
      await api.updatePMDone(doneTarget.equipment_code, doneForm.date, freq, doneForm.notes || undefined, password);
    }
    setCredOpen(false);
    setDoneTarget(null);
    showToast("PM recorded.");
    load();
  };

  const openHistory = async (row: PMRow) => {
    setHistoryTarget(row);
    setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory((await api.getPMHistory(row.equipment_code)) as unknown as HistoryRow[]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load history", "error");
    } finally { setHistoryLoading(false); }
  };

  const handleAdd = async () => {
    if (!addForm.system_name.trim()) return showToast("System name is required", "error");
    setAddBusy(true);
    try {
      await api.createAdditionalPMSystem({
        system_name: addForm.system_name.trim(),
        system_id: addForm.system_id || undefined,
        computer_system_id: addForm.computer_system_id || undefined,
        frequency_months: parseInt(addForm.frequency_months) || 6,
      });
      showToast("System added to PM list.");
      setAddOpen(false);
      setAddForm({ system_name: "", system_id: "", computer_system_id: "", frequency_months: "6" });
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Add failed", "error");
    } finally { setAddBusy(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteTarget.additional_id == null) return;
    try {
      await api.deleteAdditionalPMSystem(deleteTarget.additional_id);
      showToast("System removed.");
      setDeleteTarget(null);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed", "error");
    }
  };

  const loadPlanner = async () => {
    setPlannerLoading(true);
    try {
      setPlannerRows(await api.getPMPlanner(parseInt(plannerYear), plannerMonth ? parseInt(plannerMonth) : undefined));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Planner load failed", "error");
    } finally { setPlannerLoading(false); }
  };

  const plannerPeriod = plannerMonth ? `${MONTHS[parseInt(plannerMonth) - 1]} ${plannerYear}` : plannerYear;
  const scheduled = plannerRows.filter((r) => r.next_pm_date);
  const unscheduled = plannerRows.filter((r) => !r.next_pm_date);

  const printPlanner = () => {
    setPlannerOpen(false);
    setPrintMode("planner");
    setTimeout(() => { printReport(); setPrintMode("list"); }, 50);
  };

  const columns: Column<PMRow>[] = [
    { header: "Code", render: (r) => <span className="font-mono text-xs">{r.equipment_code}</span> },
    { header: "System Name", render: (r) => <span className="font-semibold">{r.equipment_name}</span> },
    { header: "Computer System ID", render: (r) => r.computer_system_id || <span className="text-slate-400">—</span> },
    { header: "System ID", render: (r) => r.system_id || <span className="text-slate-400">—</span> },
    { header: "Department", render: (r) => r.department || <span className="text-slate-400">—</span> },
    { header: "Frequency (months)", render: (r) => r.frequency_months ?? 6 },
    { header: "Last PM", render: (r) => formatDate(r.last_pm_date) },
    { header: "Next PM", render: (r) => (r.active === false ? <span className="text-slate-400">—</span> : <DueBadge date={r.next_pm_date} />) },
    { header: "Source", render: (r) => r.source === "additional" ? <Badge tone="purple">Additional</Badge> : <Badge tone="blue">Equipment</Badge> },
    { header: "Status", render: (r) => (r.active === false ? <Badge tone="red">Retired</Badge> : <Badge tone="green">Active</Badge>) },
    {
      header: "",
      noPrint: true,
      className: "px-6 py-4",
      render: (r) => (
        <div className="flex flex-wrap gap-2">
          {canUpdate && r.active !== false && <Button size="sm" onClick={() => openDone(r)}>Update</Button>}
          <Button size="sm" variant="secondary" onClick={() => openHistory(r)}><History size={13} /> History</Button>
          {canUpdate && r.source === "additional" && (
            <Button size="sm" variant="danger" title="Remove system" onClick={() => setDeleteTarget(r)}><Trash2 size={13} /></Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PrintReport title={printMode === "planner" ? `PM Planner – ${plannerPeriod}` : "Preventive Maintenance List"}>
      <div className="space-y-6">
        <div className="no-print">
          <PageHeader
            eyebrow="Operations"
            title="Preventive Maintenance"
            description="Systems with a Computer System ID, plus additional systems (servers, components). Retired equipment is excluded."
            actions={
              <div className="flex flex-wrap gap-2">
                {canUpdate && <Button variant="secondary" onClick={() => setAddOpen(true)}><Plus size={15} /> Add system</Button>}
                <Button variant="secondary" onClick={() => { setPlannerOpen(true); void loadPlanner(); }}><Calendar size={15} /> Planner</Button>
                <Button variant="secondary" onClick={printReport}><Printer size={15} /> Print</Button>
                <Button onClick={() => downloadCsv(`pm-list-${today()}.csv`, CSV_HEADERS, filtered.map(csvRow))}><Download size={15} /> Export</Button>
              </div>
            }
          />
        </div>

        <div className="no-print surface flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search system, code, computer system ID..." className="pl-9" />
          </div>
          <Select value={department} onChange={(e) => setDepartment(e.target.value)} className="max-w-xs">
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
              <DataTable rows={filtered} rowKey={(r) => r.equipment_code} emptyMessage="No systems with a Computer System ID configured." columns={columns} />
            )}
          </Card>
        ) : (
          <PlannerTable rows={scheduled} unscheduled={unscheduled} />
        )}
      </div>

      {/* Mark done */}
      <Modal
        open={!!doneTarget && !credOpen}
        title={`Mark PM done — ${doneTarget?.equipment_name ?? ""}`}
        onClose={() => setDoneTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDoneTarget(null)}>Cancel</Button>
            <Button onClick={() => { if (!doneForm.date) return showToast("Enter the PM date", "error"); setCredOpen(true); }}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel>PM Date *</FieldLabel><Input type="date" value={doneForm.date} onChange={(e) => setDoneForm({ ...doneForm, date: e.target.value })} /></Field>
            <Field><FieldLabel>Frequency (months)</FieldLabel><Input type="number" min={1} value={doneForm.freq} onChange={(e) => setDoneForm({ ...doneForm, freq: e.target.value })} /></Field>
          </div>
          <Field><FieldLabel>Notes</FieldLabel><Textarea rows={3} value={doneForm.notes} onChange={(e) => setDoneForm({ ...doneForm, notes: e.target.value })} placeholder="Activities performed, observations..." /></Field>
        </div>
      </Modal>
      <CredentialsDialog
        open={credOpen}
        title="E-Signature: Confirm PM"
        description={`Record PM for ${doneTarget?.equipment_name ?? ""} on ${formatDate(doneForm.date)}.`}
        requireReason
        confirmLabel="Sign & save"
        onConfirm={confirmDone}
        onClose={() => setCredOpen(false)}
      />

      {/* History */}
      <Modal open={!!historyTarget} size="xl" title={`PM history — ${historyTarget?.equipment_name ?? ""}`} onClose={() => setHistoryTarget(null)}>
        {historyLoading ? <p className="text-sm text-slate-500">Loading...</p> : (
          <DataTable
            rows={history}
            rowKey={(h) => h.id}
            emptyMessage="No PM activity recorded yet."
            columns={[
              { header: "PM Date", render: (h) => formatDate(h.pm_date) },
              { header: "Frequency (months)", render: (h) => h.frequency_months },
              { header: "Notes", render: (h) => h.notes || <span className="text-slate-400">—</span> },
              { header: "Performed by", render: (h) => h.performed_by },
              { header: "Recorded at", render: (h) => <span className="whitespace-nowrap">{formatDateTime(h.performed_at)}</span> },
            ]}
          />
        )}
      </Modal>

      {/* Add additional system */}
      <Modal
        open={addOpen}
        title="Add system to PM list"
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={addBusy} onClick={handleAdd}>{addBusy ? "Saving..." : "Add system"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">For systems that are not part of Equipment Master, e.g. servers or other components.</p>
          <Field><FieldLabel>System Name *</FieldLabel><Input value={addForm.system_name} onChange={(e) => setAddForm({ ...addForm, system_name: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel>System ID</FieldLabel><Input value={addForm.system_id} onChange={(e) => setAddForm({ ...addForm, system_id: e.target.value })} /></Field>
            <Field><FieldLabel>Computer System ID</FieldLabel><Input value={addForm.computer_system_id} onChange={(e) => setAddForm({ ...addForm, computer_system_id: e.target.value })} /></Field>
          </div>
          <Field><FieldLabel>Frequency (months)</FieldLabel><Input type="number" min={1} value={addForm.frequency_months} onChange={(e) => setAddForm({ ...addForm, frequency_months: e.target.value })} /></Field>
        </div>
      </Modal>

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Remove system?"
          message={`Do you want to remove "${deleteTarget.equipment_name}" from the PM list?`}
          confirmLabel="Yes, remove"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Planner */}
      <Modal
        open={plannerOpen}
        size="lg"
        title="PM Planner"
        onClose={() => setPlannerOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPlannerOpen(false)}>Close</Button>
            <Button variant="secondary" onClick={printPlanner}><Printer size={14} /> Print planner</Button>
            <Button onClick={() => downloadCsv(`pm-planner-${plannerYear}${plannerMonth ? `-${plannerMonth}` : ""}.csv`, CSV_HEADERS, plannerRows.map(csvRow))}>
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
          {plannerLoading ? <p className="text-sm text-slate-500">Loading...</p> : <PlannerTable rows={scheduled} unscheduled={unscheduled} />}
        </div>
      </Modal>
    </PrintReport>
  );
}

function PlannerTable({ rows, unscheduled }: { rows: PMRow[]; unscheduled: PMRow[] }) {
  return (
    <div className="space-y-3">
      <DataTable
        rows={rows}
        rowKey={(r) => r.equipment_code}
        emptyMessage="No PM due in the selected period."
        columns={[
          { header: "Code", render: (r) => r.equipment_code },
          { header: "System Name", render: (r) => r.equipment_name },
          { header: "Computer System ID", render: (r) => r.computer_system_id || "—" },
          { header: "Frequency (months)", render: (r) => r.frequency_months ?? 6 },
          { header: "Last PM", render: (r) => formatDate(r.last_pm_date) },
          { header: "Due Date", render: (r) => formatDate(r.next_pm_date) },
        ]}
      />
      {unscheduled.length > 0 && (
        <p className="text-xs text-slate-500">
          Not yet scheduled (no PM recorded): {unscheduled.map((r) => `${r.equipment_name} (${r.equipment_code})`).join(", ")}
        </p>
      )}
    </div>
  );
}
