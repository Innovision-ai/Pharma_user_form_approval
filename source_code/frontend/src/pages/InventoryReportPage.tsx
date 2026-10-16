import { useEffect, useMemo, useState } from "react";
import { Search, Printer, Download } from "lucide-react";
import { api } from "../lib/api";
import type { Equipment } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Input";
import { Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { PageHeader } from "../components/ui/PageHeader";
import { formatDate } from "../lib/format";
import { downloadCsv, printReport } from "../components/PrintReport";

const PLANT_OPTIONS = ["P1", "P2", "P3"];
// For inventory, filter by System Type per the client requirement (not just generic "type")
const SYSTEM_TYPE_OPTIONS = ["HMI", "SCADA", "Software", "DCS", "Data Logger", "Other"];

// The 14 columns requested in the observations
const COLUMN_KEYS = [
  "equipment_code", "name", "type", "application_name", "computer_system_id",
  "instrument_ids", "make", "model_name", "system_type", "gamp_category",
  "usp_classification", "allowed_roles", "location", "validation_status", "validation_date",
];
const COLUMN_HEADERS: Record<string, string> = {
  equipment_code: "Code",
  name: "Equipment Name",
  type: "Type",
  application_name: "Application Name",
  computer_system_id: "Computer System ID",
  instrument_ids: "Instrument / Equipment / Connected IDs",
  make: "Make",
  model_name: "Model",
  system_type: "System Type",
  gamp_category: "GAMP Category",
  usp_classification: "USP Classification",
  allowed_roles: "Allowed Roles",
  location: "Department",
  validation_status: "Validation Status",
  validation_date: "Validation Completion Date",
};

export function InventoryReportPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "all", plant: "", system_type: "" });
  // Column picker - save to localStorage
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("inventory-cols");
      return saved ? JSON.parse(saved) : COLUMN_KEYS;
    } catch {
      return COLUMN_KEYS;
    }
  });
  const [showColPicker, setShowColPicker] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .listEquipment({
        activeOnly: filters.status === "active",
        plant: filters.plant || undefined,
        system_type: filters.system_type || undefined,
      })
      .then((data) => {
        if (filters.status === "retired") {
          setItems(data.filter((e) => !e.active));
        } else {
          setItems(data);
        }
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Failed to load equipment", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filters]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter((e) =>
      e.equipment_code.toLowerCase().includes(s) ||
      e.name.toLowerCase().includes(s) ||
      (e.application_name ?? "").toLowerCase().includes(s) ||
      (e.computer_system_id ?? "").toLowerCase().includes(s)
    );
  }, [items, search]);

  const activeCount = filtered.filter((e) => e.active).length;
  const retiredCount = filtered.filter((e) => !e.active).length;

  const toggleCol = (col: string) => {
    const next = visibleCols.includes(col) ? visibleCols.filter((c) => c !== col) : [...visibleCols, col];
    setVisibleCols(next);
    localStorage.setItem("inventory-cols", JSON.stringify(next));
  };

  const getCellValue = (e: Equipment, key: string): string => {
    switch (key) {
      case "allowed_roles": return Array.isArray(e.allowed_roles) ? e.allowed_roles.join("; ") : String(e.allowed_roles ?? "");
      case "validation_date": return formatDate(e.validation_date);
      case "validation_status": return e.validation_status === "validated" ? "Validated" : e.validation_status === "under_validation" ? "Under Validation" : e.validation_status ?? "";
      default: return String((e as unknown as Record<string, unknown>)[key] ?? "");
    }
  };

  const handleExportCsv = () => {
    const rows = filtered.map((e) => visibleCols.map((k) => getCellValue(e, k)));
    const headers = visibleCols.map((k) => COLUMN_HEADERS[k] ?? k);
    downloadCsv(`inventory-report-${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
    showToast("Inventory report exported to CSV.", "success");
  };

  const handlePrint = () => {
    printReport();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Inventory Report"
        description="View and export the complete equipment inventory with full computerized system details."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowColPicker((v) => !v)}>Columns</Button>
            <Button variant="secondary" onClick={handlePrint}><Printer size={15} /> Print</Button>
            <Button onClick={handleExportCsv}><Download size={15} /> Export CSV</Button>
          </div>
        }
      />

      {/* Column picker */}
      {showColPicker && (
        <Card>
          <div className="p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Select columns to display</p>
            <div className="flex flex-wrap gap-2">
              {COLUMN_KEYS.map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={visibleCols.includes(k)} onChange={() => toggleCol(k)} className="rounded" />
                  {COLUMN_HEADERS[k] ?? k}
                </label>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="p-4">
            <p className="text-sm text-slate-500">Total Shown</p>
            <p className="text-2xl font-bold text-slate-900">{filtered.length}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-sm text-slate-500">Active</p>
            <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-sm text-slate-500">Retired</p>
            <p className="text-2xl font-bold text-red-600">{retiredCount}</p>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, application, CS ID..." className="pl-9" />
        </div>
        <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="retired">Retired Only</option>
        </Select>
        <Select value={filters.plant} onChange={(e) => setFilters({ ...filters, plant: e.target.value })}>
          <option value="">All Plants</option>
          {PLANT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select value={filters.system_type} onChange={(e) => setFilters({ ...filters, system_type: e.target.value })}>
          <option value="">All System Types</option>
          {SYSTEM_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>

      <Card>
        {loading ? (
          <div className="space-y-3 p-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
        ) : (
          <DataTable
            rows={filtered}
            rowKey={(e) => e.equipment_code}
            emptyMessage="No equipment found matching the current filters."
            columns={[
              ...(visibleCols.includes("equipment_code") ? [{ header: "Code", render: (e: Equipment) => <span className="font-medium">{e.equipment_code}</span> }] : []),
              ...(visibleCols.includes("name") ? [{ header: "Equipment Name", render: (e: Equipment) => e.name }] : []),
              ...(visibleCols.includes("type") ? [{ header: "Type", render: (e: Equipment) => <Badge>{e.type}</Badge> }] : []),
              ...(visibleCols.includes("application_name") ? [{ header: "Application Name", render: (e: Equipment) => e.application_name ?? <span className="text-slate-400">—</span> }] : []),
              ...(visibleCols.includes("computer_system_id") ? [{ header: "Computer System ID", render: (e: Equipment) => e.computer_system_id ?? <span className="text-slate-400">—</span> }] : []),
              ...(visibleCols.includes("instrument_ids") ? [{ header: "Instrument IDs", render: (e: Equipment) => e.instrument_ids ?? <span className="text-slate-400">—</span> }] : []),
              ...(visibleCols.includes("make") ? [{ header: "Make", render: (e: Equipment) => e.make ?? <span className="text-slate-400">—</span> }] : []),
              ...(visibleCols.includes("model_name") ? [{ header: "Model", render: (e: Equipment) => e.model_name ?? <span className="text-slate-400">—</span> }] : []),
              ...(visibleCols.includes("system_type") ? [{ header: "System Type", render: (e: Equipment) => e.system_type ? <Badge>{e.system_type}</Badge> : <span className="text-slate-400">—</span> }] : []),
              ...(visibleCols.includes("gamp_category") ? [{ header: "GAMP", render: (e: Equipment) => e.gamp_category ? <Badge tone="purple">Cat {e.gamp_category}</Badge> : <span className="text-slate-400">—</span> }] : []),
              ...(visibleCols.includes("usp_classification") ? [{ header: "USP", render: (e: Equipment) => e.usp_classification ?? <span className="text-slate-400">—</span> }] : []),
              ...(visibleCols.includes("allowed_roles") ? [{ header: "Allowed Roles", render: (e: Equipment) => <div className="flex flex-wrap gap-1">{(Array.isArray(e.allowed_roles) ? e.allowed_roles : []).map((r: string) => <Badge key={r}>{r}</Badge>)}</div> }] : []),
              ...(visibleCols.includes("location") ? [{ header: "Department", render: (e: Equipment) => e.location }] : []),
              ...(visibleCols.includes("validation_status") ? [{ header: "Validation Status", render: (e: Equipment) => <Badge tone={e.validation_status === "validated" ? "green" : "amber"}>{e.validation_status === "validated" ? "Validated" : "Under Validation"}</Badge> }] : []),
              ...(visibleCols.includes("validation_date") ? [{ header: "Validation Date", render: (e: Equipment) => formatDate(e.validation_date) }] : []),
              { header: "Status", render: (e: Equipment) => <Badge tone={e.active ? "green" : "red"}>{e.active ? "Active" : "Retired"}</Badge> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
