import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Input, Field, FieldLabel } from "../components/ui/Input";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ui/Toast";
import type { Equipment, EquipmentUser } from "../types";

function InfoRow({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-800">{typeof value === "boolean" ? (value ? "Yes" : "No") : value}</span>
    </div>
  );
}

export function EquipmentDetailsPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [users, setUsers] = useState<EquipmentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    Promise.all([api.getEquipment(code), api.getEquipmentUsers(code)])
      .then(([eq, us]) => { setEquipment(eq); setUsers(us); })
      .catch((err) => showToast(err instanceof Error ? err.message : "Failed to load", "error"))
      .finally(() => setLoading(false));
  }, [code, showToast]);

  const filteredUsers = useMemo(() =>
    users.filter(u => u.user_name.toLowerCase().includes(search.toLowerCase()) || u.department.toLowerCase().includes(search.toLowerCase())),
    [users, search]);

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => navigate(-1)} className="mb-1 text-sm font-medium text-brand-600 hover:underline">&larr; Back</button>
        <h1 className="text-xl font-bold text-slate-900">Equipment Details: {code}</h1>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>
      ) : equipment ? (
        <>
          {/* Basic info */}
          <Card>
            <CardHeader className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>{equipment.name}</CardTitle>
                <p className="mt-1 text-sm text-slate-500">{equipment.equipment_code} · {equipment.type} · {equipment.location}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Badge tone={equipment.active ? "green" : "red"}>{equipment.active ? "Active" : "Inactive"}</Badge>
                <StatusBadge status={equipment.validation_status ?? "under_validation"} />
                {equipment.gamp_category && <Badge tone="purple">GAMP Cat {equipment.gamp_category}</Badge>}
                {equipment.backup_include && <Badge tone="blue">Backup included</Badge>}
              </div>
            </CardHeader>
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InfoRow label="Plant" value={equipment.plant} />
                <InfoRow label="Validation date" value={equipment.validation_date} />
                <InfoRow label="Allowed roles" value={equipment.allowed_roles.join(", ")} />
              </div>
            </CardBody>
          </Card>

          {/* Computerized system details */}
          <Card>
            <CardHeader><CardTitle>Computerized System Details</CardTitle></CardHeader>
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InfoRow label="System ID" value={equipment.system_id} />
                <InfoRow label="System Type" value={equipment.system_type} />
                <InfoRow label="Make" value={equipment.make} />
                <InfoRow label="Model" value={equipment.model_name} />
                <InfoRow label="Application Name" value={equipment.application_name} />
                <InfoRow label="GAMP Category" value={equipment.gamp_category} />
                <InfoRow label="USP Classification" value={equipment.usp_classification} />
                <InfoRow label="Initial Validation Date" value={equipment.initial_validation_date} />
                <InfoRow label="Latest Validation Date" value={equipment.latest_validation_date} />
                <InfoRow label="Periodic Review Frequency" value={equipment.periodic_review_frequency != null ? `${equipment.periodic_review_frequency} months` : undefined} />
                <InfoRow label="Include in Backup" value={equipment.backup_include} />
                <InfoRow label="Computer System ID" value={equipment.computer_system_id} />
                <InfoRow label="Remarks" value={equipment.remarks} />
              </div>
            </CardBody>
          </Card>

          {/* Users table */}
          <Card>
            <div className="flex items-end justify-between p-4 border-b">
              <div className="flex-1 max-w-sm">
                <FieldLabel>Search users</FieldLabel>
                <Input placeholder="Name or department..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">
                {filteredUsers.length} active users
              </div>
            </div>
            <DataTable
              rows={filteredUsers}
              rowKey={(u) => u.user_id + u.granted_date}
              columns={[
                { header: "User Name", render: (u) => <span className="font-medium">{u.user_name}</span> },
                { header: "User ID", render: (u) => u.user_id },
                { header: "Department", render: (u) => u.department },
                { header: "Access Granted By", render: (u) => u.access_granted_by },
                { header: "Granted Date", render: (u) => new Date(u.granted_date).toLocaleString() },
                { header: "Status", render: (u) => <Badge tone="green">{u.status}</Badge> },
              ]}
            />
          </Card>
        </>
      ) : (
        <p className="text-sm text-slate-500">Equipment not found.</p>
      )}
    </div>
  );
}
