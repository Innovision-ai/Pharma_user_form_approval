import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Equipment } from "../types";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";

const PLANT_OPTIONS = ["P1", "P2", "P3"];
const TYPE_OPTIONS = ["Hardware", "Software", "Instrument", "Equipment"];

export function InventoryReportPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: "all",
    plant: "",
    type: "",
  });

  const load = () => {
    setLoading(true);
    api
      .listEquipment({
        activeOnly: filters.status === "active",
        plant: filters.plant || undefined,
        type: filters.type || undefined,
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

  const activeCount = items.filter((e) => e.active).length;
  const retiredCount = items.filter((e) => !e.active).length;

  const exportCSV = () => {
    const headers = ["Code", "Name", "Type", "Location", "Plant", "Allowed Roles", "Validation Date", "Status", "Created By"];
    const rows = items.map((e) => [
      e.equipment_code,
      e.name,
      e.type,
      e.location,
      e.plant,
      e.allowed_roles.join("; "),
      e.validation_date,
      e.active ? "Active" : "Retired",
      e.created_by,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Report exported to CSV.", "success");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Inventory Report</h1>
          <p className="text-sm text-slate-500">View and export active and retired equipment inventory.</p>
        </div>
        <Button onClick={exportCSV}>Export CSV</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="p-4">
            <p className="text-sm text-slate-500">Total Equipment</p>
            <p className="text-2xl font-bold text-slate-900">{items.length}</p>
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

      <div className="flex gap-3">
        <Select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="retired">Retired Only</option>
        </Select>
        <Select
          value={filters.plant}
          onChange={(e) => setFilters({ ...filters, plant: e.target.value })}
        >
          <option value="">All Plants</option>
          {PLANT_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
        >
          <option value="">All Types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Loading...</p>
        ) : (
          <DataTable
            rows={items}
            rowKey={(e) => e.equipment_code}
            columns={[
              { header: "Code", render: (e) => <span className="font-medium">{e.equipment_code}</span> },
              { header: "Name", render: (e) => e.name },
              { header: "Type", render: (e) => <Badge>{e.type}</Badge> },
              { header: "Location", render: (e) => e.location },
              { header: "Plant", render: (e) => <Badge tone="blue">{e.plant}</Badge> },
              {
                header: "Allowed Roles",
                render: (e) => (
                  <div className="flex flex-wrap gap-1">
                    {e.allowed_roles.map((r) => (
                      <Badge key={r}>{r}</Badge>
                    ))}
                  </div>
                ),
              },
              { header: "Validation Date", render: (e) => e.validation_date },
              {
                header: "Status",
                render: (e) => (
                  <Badge tone={e.active ? "green" : "red"}>{e.active ? "Active" : "Retired"}</Badge>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
