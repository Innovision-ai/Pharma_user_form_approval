import { useEffect, useState } from "react";
import { Calendar, Download, Printer } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { PeriodicReviewRow } from "../types";
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

/** Days from today to a YYYY-MM-DD date, using local dates (no timezone shift). */
function daysUntil(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const now = new Date();
  return Math.round((new Date(y, m - 1, d).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
}

function DueBadge({ date }: { date?: string | null }) {
  if (!date) return <Badge tone="slate">Not set</Badge>;
  const days = daysUntil(date);
  if (days < 0) return <Badge tone="red">Overdue {Math.abs(days)}d</Badge>;
  if (days <= 30) return <Badge tone="amber">Due in {days}d · {formatDate(date)}</Badge>;
  return <Badge tone="green">{formatDate(date)}</Badge>;
}

const CSV_HEADERS = ["Code", "System Name", "Type", "Department", "Periodic Review Freq. (months)", "Last Review", "Next Review", "Updated By"];
const csvRow = (r: PeriodicReviewRow) => [
  r.equipment_code, r.equipment_name, str(r.type), str(r.department), str(r.periodic_review_frequency),
  formatDate(r.last_review_date), formatDate(r.next_review_date), str(r.updated_by),
];

export function PeriodicReviewPage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const canUpdate = currentUser?.role === "IT" || currentUser?.role === "ADMIN";

  const [rows, setRows] = useState<PeriodicReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: "", department: "" });
  const [departments, setDepartments] = useState<string[]>([]);

  // Mark done
  const [target, setTarget] = useState<PeriodicReviewRow | null>(null);
  const [form, setForm] = useState({ date: today(), notes: "" });
  const [credOpen, setCredOpen] = useState(false);

  // Planner
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerYear, setPlannerYear] = useState(String(new Date().getFullYear()));
  const [plannerMonth, setPlannerMonth] = useState("");
  const [plannerRows, setPlannerRows] = useState<PeriodicReviewRow[]>([]);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [printMode, setPrintMode] = useState<"list" | "planner">("list");

  useEffect(() => {
    api.getDepartments().then((d) => setDepartments(d.departments)).catch(() => setDepartments([]));
  }, []);

  const load = () => {
    setLoading(true);
    api.listPeriodicReview({ type: filters.type || undefined, department: filters.department || undefined })
      .then(setRows)
      .catch((e) => showToast(e instanceof Error ? e.message : "Load failed", "error"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [filters]);

  const confirmDone = async ({ password }: { password: string; reason: string }) => {
    if (!target) return;
    await api.updateReviewDone(target.equipment_code, form.date, form.notes || undefined, password);
    setCredOpen(false);
    setTarget(null);
    showToast("Periodic review recorded.");
    load();
  };

  const loadPlanner = async () => {
    if (!plannerYear) return;
    setPlannerLoading(true);
    try {
      setPlannerRows(await api.getPeriodicReviewPlanner(
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

  const baseColumns: Column<PeriodicReviewRow>[] = [
    { header: "Code", render: (r) => <span className="font-mono text-xs">{r.equipment_code}</span> },
    { header: "System Name", render: (r) => <span className="font-semibold">{r.equipment_name}</span> },
    { header: "Type", render: (r) => r.type ? <Badge>{str(r.type)}</Badge> : <span className="text-slate-400">—</span> },
    { header: "Department", render: (r) => str(r.department) || "—" },
    { header: "Periodic Review Freq. (months)", render: (r) => r.periodic_review_frequency ?? <span className="text-slate-400">—</span> },
    { header: "Last Review", render: (r) => formatDate(r.last_review_date) },
    { header: "Next Review", render: (r) => (r.active === false ? <span className="text-slate-400">—</span> : <DueBadge date={r.next_review_date} />) },
  ];
  const columns: Column<PeriodicReviewRow>[] = [
    ...baseColumns,
    { header: "Updated by", render: (r) => <span className="text-xs text-slate-500">{r.updated_by || "—"}</span> },
    { header: "Status", render: (r) => (r.active === false ? <Badge tone="red">Retired</Badge> : <Badge tone="green">Active</Badge>) },
    ...(canUpdate ? [{
      header: "",
      noPrint: true,
      className: "px-6 py-4",
      render: (r: PeriodicReviewRow) => (r.active === false ? null : (
        <Button size="sm" onClick={() => { setTarget(r); setForm({ date: today(), notes: "" }); }}>Update</Button>
      )),
    }] : []),
  ];

  return (
    <PrintReport title={printMode === "planner" ? `Periodic Review Planner – ${plannerPeriod}` : "Periodic Review Report"}>
      <div className="space-y-6">
        <div className="no-print">
          <PageHeader
            eyebrow="Compliance"
            title="Periodic Review Management"
            description="Validated computerized systems due for periodic review. Under-validation and retired systems are excluded."
            actions={
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => { setPlannerOpen(true); void loadPlanner(); }}><Calendar size={15} /> Planner</Button>
                <Button variant="secondary" onClick={printReport}><Printer size={15} /> Print</Button>
                <Button onClick={() => downloadCsv(`periodic-review-${today()}.csv`, CSV_HEADERS, rows.map(csvRow))}><Download size={15} /> Export</Button>
              </div>
            }
          />
        </div>

        <div className="no-print surface flex flex-wrap items-center gap-3 p-4">
          <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="max-w-[180px]">
            <option value="">All types</option>
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} className="max-w-[200px]">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
          <Badge tone="blue">{rows.length} systems</Badge>
        </div>

        {printMode === "list" ? (
          <Card>
            {loading ? (
              <div className="space-y-3 p-6">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
            ) : (
              <DataTable rows={rows} rowKey={(r) => r.equipment_code} emptyMessage="No validated systems with periodic review configured." columns={columns} />
            )}
          </Card>
        ) : (
          <DataTable rows={plannerRows} rowKey={(r) => r.equipment_code} emptyMessage="No reviews due for the selected period." columns={baseColumns} />
        )}
      </div>

      <Modal
        open={!!target && !credOpen}
        title={`Mark review done — ${target?.equipment_name ?? ""}`}
        onClose={() => setTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={() => { if (!form.date) return showToast("Enter the review date", "error"); setCredOpen(true); }}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field><FieldLabel>Review Date *</FieldLabel><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <p className="text-xs text-slate-500">
            Next review is calculated from the review date and the frequency of {target?.periodic_review_frequency ?? 12} months.
          </p>
          <Field><FieldLabel>Notes</FieldLabel><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Review outcome, observations..." /></Field>
        </div>
      </Modal>
      <CredentialsDialog
        open={credOpen}
        title="E-Signature: Confirm Review"
        description={`Record periodic review for ${target?.equipment_name ?? ""} on ${formatDate(form.date)}.`}
        requireReason
        confirmLabel="Sign & save"
        onConfirm={confirmDone}
        onClose={() => setCredOpen(false)}
      />

      <Modal
        open={plannerOpen}
        size="lg"
        title="Periodic Review Planner"
        onClose={() => setPlannerOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPlannerOpen(false)}>Close</Button>
            <Button variant="secondary" onClick={printPlanner}><Printer size={14} /> Print planner</Button>
            <Button onClick={() => downloadCsv(`periodic-review-planner-${plannerYear}${plannerMonth ? `-${plannerMonth}` : ""}.csv`, CSV_HEADERS, plannerRows.map(csvRow))}>
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
            <DataTable rows={plannerRows} rowKey={(r) => r.equipment_code} emptyMessage="No reviews due for the selected period." columns={baseColumns} />
          )}
        </div>
      </Modal>
    </PrintReport>
  );
}
