import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { DataTable } from "../components/ui/DataTable";
import { Badge } from "../components/ui/Badge";
import { Input, Field, FieldLabel } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import type { EquipmentUser } from "../types";

export function EquipmentDetailsPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [users, setUsers] = useState<EquipmentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    api.getEquipmentUsers(code)
      .then(setUsers)
      .catch((err) => showToast(err instanceof Error ? err.message : "Failed to load equipment users", "error"))
      .finally(() => setLoading(false));
  }, [code, showToast]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.user_name.toLowerCase().includes(search.toLowerCase()) || 
      u.department.toLowerCase().includes(search.toLowerCase())
    );
  }, [users, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => navigate(-1)} className="text-brand-600 hover:underline text-sm font-medium mb-1">
            &larr; Back
          </button>
          <h1 className="text-xl font-bold text-slate-900">Equipment Details: {code}</h1>
          <p className="text-sm text-slate-500">Active users assigned to this equipment.</p>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b flex justify-between items-end">
          <div className="flex-1 max-w-sm">
            <FieldLabel>Search Users</FieldLabel>
            <Input 
              placeholder="Search by name or department..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
            />
          </div>
          <div className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">
            Total Active Users: {filteredUsers.length}
          </div>
        </div>

        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Loading...</p>
        ) : (
          <DataTable
            rows={filteredUsers}
            rowKey={(u) => u.user_id + u.granted_date}
            columns={[
              { header: "User Name", render: (u) => <span className="font-medium">{u.user_name}</span> },
              { header: "User ID", render: (u) => u.user_id },
              { header: "Department", render: (u) => u.department },
              { header: "Access Granted By", render: (u) => u.access_granted_by },
              { header: "Granted Date", render: (u) => new Date(u.granted_date).toLocaleString() },
              { header: "Status", render: (u) => <Badge tone="green">{u.status}</Badge> }
            ]}
          />
        )}
      </Card>
    </div>
  );
}
