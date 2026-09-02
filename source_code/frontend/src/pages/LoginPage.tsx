import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Badge } from "../components/ui/Badge";
import { useToast } from "../components/ui/Toast";

const ROLE_TONE: Record<string, "blue" | "amber" | "purple" | "green" | "slate"> = {
  EMPLOYEE: "blue",
  HOD: "amber",
  QA: "purple",
  IT: "green",
  ADMIN: "slate",
};

export function LoginPage() {
  const { allUsers, switchUser } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const handleSelect = async (employeeId: string) => {
    setPending(employeeId);
    try {
      await switchUser(employeeId);
      navigate("/dashboard");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not sign in", "error");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Pharmaceutical Equipment Access Management</h1>
        <p className="mt-1 text-sm text-slate-500">
          Demo mode - no password required. Pick an identity below to sign in as that user and
          explore the corresponding role's screens.
        </p>

        <div className="mt-6 grid gap-2">
          {allUsers.map((user) => (
            <button
              key={user.employee_id}
              disabled={!user.active || pending !== null}
              onClick={() => handleSelect(user.employee_id)}
              className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                <p className="text-xs text-slate-500">
                  {user.employee_id} - {user.department}
                  {!user.active && " (inactive)"}
                </p>
              </div>
              <Badge tone={ROLE_TONE[user.role]}>{user.role}</Badge>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
