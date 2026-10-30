import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { roleLabel } from "../lib/roles";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

export const APP_VERSION = "2.1.0";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-6">
      <span className="w-48 shrink-0 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
}

export function AboutPage() {
  const { currentUser, plant } = useAuth();
  const [policy, setPolicy] = useState("");
  useEffect(() => { api.getPasswordPolicy().then((p) => setPolicy(p.text)).catch(() => setPolicy("")); }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Software information" title="About Qualizone" />
      <div className="flex flex-wrap items-center justify-center gap-10 rounded-3xl border border-white/40 bg-white/70 p-6">
        <img src="/qualizone-logo.png" alt="Qualizone" className="h-24 w-auto object-contain" />
        <img src="/acz-logo.png" alt="Air Care Zone" className="h-16 w-auto object-contain" />
      </div>
      <Card>
        <CardHeader><CardTitle>Product</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <Row label="Product" value="Qualizone – Equipment Access Management" />
          <Row label="Version" value={APP_VERSION} />
          <Row label="Modules" value="Equipment Master, Asset Requests, Inventory Report, User Access Requests, Periodic Review, Preventive Maintenance, Backup Schedule, Password Vault, User Management, Audit Trail" />
          <Row label="Compliance" value="Electronic records with e-signature (user ID, password, reason) and audit trail of old / new values" />
          <Row label="Developed by" value="Air Care Zone" />
          <Row label="Copyright" value={`© ${new Date().getFullYear()} Air Care Zone. All rights reserved.`} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>Your session</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <Row label="User" value={`${currentUser?.name} (${currentUser?.employee_id})`} />
          <Row label="Role" value={roleLabel(currentUser?.role)} />
          <Row label="Plant" value={plant ?? "—"} />
          {policy && <Row label="Password policy" value={policy} />}
          <Row label="Auto log off" value="After 15 minutes of inactivity" />
        </CardBody>
      </Card>
    </div>
  );
}
