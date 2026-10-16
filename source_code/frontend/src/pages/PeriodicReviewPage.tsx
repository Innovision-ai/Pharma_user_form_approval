import { useEffect, useMemo, useState } from "react";
import { Printer, Download, Calendar } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { PeriodicReviewRow } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Field, FieldLabel, Input, Select, Textarea } from "../components/ui/Input";
import { CredentialsDialog } from "../components/ui/CredentialsDialog";
import { PageHeader } from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { formatDate } from "../lib/format";
import { downloadCsv, printReport } from "../components/PrintReport";

function DueBadge({ date }: { date?: string | null }) {
  if (!date) return <Badge tone="slate">Not set</Badge>;
  const d = new Date(date);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return <Badge tone="red">Overdue {Math.abs(days)}d</Badge>;
  if (days <= 30) return <Badge tone="amber">Due in {days}d</Badge>;
  return <Badge tone="green">{formatDate(date)}</Badge>;
}

const TYPE_OPTIONS = ["Hardware", "Software", "Instrument", "Equipment"];

export function PeriodicReviewPage() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<PeriodicReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: "", department: "" });

  // Planner modal
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerYear, setPlannerYear] = useState(String(new Date().getFullYear()));
  const [plannerMonth, setPlannerMonth] = useState("");
  const [plannerRows, setPlannerRows] = useState<PeriodicReviewRow[]>([]);
  const [plannerLoading, setPlannerLoading] = useState(false);

  // Update-done modal
  const [updateTarget, setUpdateTarget] = useState<PeriodicReviewRow | null>(null);
  const [updateDate, setUpdateDate] = useState(new Date().toISOString().split("T")[0]);
  const [updateNotes, setUpdateNotes] = useState("");
  const [credOpen, setCredOpen] = useState(false);

  const canUpdate = currentUser?.role === "IT" || currentUser?.role === "ADMIN";

  const load = () => {
    setLoading(true);
    api.listPeriodicReview()
      .then(setRows)
      .catch((e) => showToast(e instanceof Error ? e.message : "Load failed", "error"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const row = r as Record<string, unknown>;
      const matchType = !filters.type || row.type === filters.type;
      const matchDept = !filters.department || (row.department as string ?? "").toLowerCase().includes(filters.department.toLowerCase());
      return matchType && matchDept;
    });
  }, [rows, filters]);

  const handleOpenUpdate = (row: PeriodicReviewRow) => {
    setUpdateTarget(row);
    setUpdateDate(new Date().toISOString().split("T")[0]);
    setUpdateNotes("");
    setCredOpen(true);
  };

  const doUpdate = async (authPassword: string, _reason: string) => {
    if (!updateTarget) return;
    setCredOpen(false);
    try {
      await api.updateReviewDone(updateTarget.equipment_code, updateDate, updateNotes, authPassword);
      showToast("Review date updated.");
      setUpdateTarget(null);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
    }
  };

  const loadPlanner = async () => {
    if (!plannerYear) return;
    setPlannerLoading(true);
    try {
      const data = await api.getPeriodicReviewPlanner(parseInt(plannerYear), plannerMonth ? parseInt(plannerMonth) : undefined, filters.type || undefined, filters.department || undefined);
      setPlannerRows(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Planner load failed", "error");
    } finally { setPlannerLoading(false); }
  };

  const handleExportCsv = () => {
    const headers = ["Code", "System Name", "Type", "Department", "Freq (months)", "Last Review", "Next Review", "Updated By"];
    const csvRows = filtered.map((r) => {
      const row = r as Record<string, unknown>;
      return [
        r.equipment_code, r.equipment_name, String(row.type ?? ""), String(row.department ?? ""),
        String(r.periodic_review_frequency ?? ""), formatDate(r.last_review_date), formatDate(r.next_review_date),
        String(r.updated_by ?? ""),
      ];
    });
    downloadCsv(`periodic-review-${new Date().toISOString().split("T")[0]}.csv`, headers, csvRows);
    showToast("Exported to CSV.");
  };

  const handlePrint = () => printReport();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compliance"
        title="Periodic Review Planner"
        description="Track periodic reviews for validated computerized systems. Under-validation systems are excluded."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setPlannerOpen(true); loadPlanner(); }}><Calendar size={15} /> Planner</Button>
            <Button variant="secondary" onClick={handlePrint}><Printer size={15} /> Print</Button>
            <Button onClick={handleExportCsv}><Download size={15} /> Export</Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="surface flex gap-3 p-4 flex-wrap items-center">
        <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">All Types</option>
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
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
            emptyMessage="No validated systems with periodic review configured."
            columns={[
              { header: "Code", render: (r) => <span className="font-mono text-xs">{r.equipment_code}</span> },
              { header: "System Name", render: (r) => <span className="font-semibold">{r.equipment_name}</span> },
              { header: "Type", render: (r) => { const row = r as Record<string, unknown>; return row.type ? <Badge>{String(row.type)}</Badge> : <span className="text-slate-400">—</span>; } },
              { header: "Department", render: (r) => { const row = r as Record<string, unknown>; return String(row.department ?? "—"); } },
              { header: "Freq (mo)", render: (r) => r.periodic_review_frequency ?? <span className="text-slate-400">—</span> },
              { header: "Last Review", render: (r) => <span className="text-sm">{formatDate(r.last_review_date)}</span> },
              { header: "Next Review", render: (r) => <DueBadge date={r.next_review_date} /> },
              { header: "Updated by", render: (r) => <span className="text-xs text-slate-500">{r.updated_by ?? "—"}</span> },
              canUpdate ? {
                header: "",
                render: (r) => (
                  <Button size="sm" onClick={() => handleOpenUpdate(r)}>
                    Mark done
                  </Button>
                ),
              } : null,
            ].filter(Boolean) as Parameters<typeof DataTable>[0]["columns"]}
          />
        )}
      </Card>

      {/* Credentials dialog for update */}
      {credOpen && updateTarget && (
        <>
          <div className="surface p-4 space-y-3 border border-slate-200 rounded-xl">
            <p className="text-sm font-semibold">Mark review done for: <span className="text-brand-700">{updateTarget.equipment_name}</span></p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field><FieldLabel>Review Date *</FieldLabel><Input type="date" value={updateDate} onChange={e => setUpdateDate(e.target.value)} /></Field>
              <Field><FieldLabel>Notes</FieldLabel><Input value={updateNotes} onChange={e => setUpdateNotes(e.target.value)} placeholder="Optional notes..." /></Field>
            </div>
          </div>
          <CredentialsDialog
            open={credOpen}
            title="E-Signature: Confirm Review"
            requireReason={false}
            onConfirm={(userId, password, reason) => doUpdate(password, reason ?? "")}
            onCancel={() => { setCredOpen(false); setUpdateTarget(null); }}
          />
        </>
      )}

      {/* Planner modal */}
      <Modal
        open={plannerOpen}
        title="Periodic Review Planner"
        onClose={() => setPlannerOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPlannerOpen(false)}>Close</Button>
            <Button onClick={() => downloadCsv(
              `periodic-review-planner-${plannerYear}${plannerMonth ? `-${plannerMonth}` : ""}.csv`,
              ["Code", "System Name", "Type", "Dept", "Freq (mo)", "Next Review"],
              plannerRows.map(r => {
                const row = r as Record<string, unknown>;
                return [r.equipment_code, r.equipment_name, String(row.type ?? ""), String(row.department ?? ""), String(r.periodic_review_frequency ?? ""), formatDate(r.next_review_date)];
              })
            )}>
              <Download size={14} /> Export Planner
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-3 items-end">
            <Field>
              <FieldLabel>Year</FieldLabel>
              <Input type="number" value={plannerYear} onChange={e => setPlannerYear(e.target.value)} className="w-28" />
            </Field>
            <Field>
              <FieldLabel>Month (optional)</FieldLabel>
              <Select value={plannerMonth} onChange={e => setPlannerMonth(e.target.value)}>
                <option value="">All months</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {new Date(2000, i).toLocaleString("default", { month: "long" })}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={loadPlanner}>Load</Button>
          </div>
          {plannerLoading ? <p className="text-sm text-slate-500">Loading...</p> : (
            <DataTable
              rows={plannerRows}
              rowKey={(r) => r.equipment_code}
              emptyMessage="No reviews due for the selected period."
              columns={[
                { header: "Code", render: (r) => r.equipment_code },
                { header: "System Name", render: (r) => r.equipment_name },
                { header: "Freq (mo)", render: (r) => r.periodic_review_frequency ?? "—" },
                { header: "Next Review", render: (r) => <DueBadge date={r.next_review_date} /> },
              ]}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
