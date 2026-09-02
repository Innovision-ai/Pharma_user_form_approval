import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { api } from "../../lib/api";
import { useToast } from "../ui/Toast";

const ROLE_TONE: Record<string, "blue" | "amber" | "purple" | "green" | "slate"> = {
  EMPLOYEE: "blue",
  HOD: "amber",
  QA: "purple",
  IT: "green",
  ADMIN: "slate",
};

export function Topbar() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  if (!currentUser) return null;

  const handleSwitchUser = () => {
    logout();
    navigate("/login");
  };

  const handleReset = async () => {
    if (!confirm("This wipes all requests, audit logs, and notifications and reloads seed data. Continue?")) {
      return;
    }
    try {
      await api.resetDemoData();
      showToast("Demo data has been reset.");
      window.location.reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Reset failed", "error");
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
        {currentUser.role === "ADMIN" && (
          <Button variant="secondary" size="sm" onClick={handleReset}>
            Reset Demo Data
          </Button>
        )}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-800">{currentUser.name}</span>
          <Badge tone={ROLE_TONE[currentUser.role]}>{currentUser.role}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSwitchUser}>
          Switch User
        </Button>
      </div>
    </header>
  );
}
