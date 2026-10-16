import { Bell, ChevronDown, Menu, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { api } from "../../lib/api";
import { useToast } from "../ui/Toast";

const ROLE_TONE: Record<string, "blue" | "amber" | "purple" | "green" | "slate"> = { EMPLOYEE: "blue", HOD: "amber", QA: "purple", IT: "green", ADMIN: "slate" };
const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard", "/equipment": "Equipment Master", "/approvers": "Approver Master", "/users": "User Management", "/inventory": "Inventory Report",
  "/requests/new": "Create Access Request", "/requests/mine": "My Requests", "/approvals": "Approval Inbox", "/it-queue": "IT Provisioning", "/audit": "Audit Trail", "/notifications": "Notifications",
};

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  if (!currentUser) return null;

  const handleReset = async () => {
    if (!confirm("This wipes all requests, audit logs, and notifications and reloads seed data. Continue?")) return;
    try { await api.resetDemoData(); showToast("Demo data has been reset."); window.location.reload(); }
    catch (err) { showToast(err instanceof Error ? err.message : "Reset failed", "error"); }
  };

  return (
    <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenu} aria-label="Open navigation" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><Menu size={19} /></button>
        <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-950">{TITLES[location.pathname] ?? (location.pathname.startsWith("/requests/") ? "Request Details" : "Workspace")}</p><p className="hidden text-xs text-slate-400 sm:block">Qualizone <span className="mx-1">/</span> Access management</p></div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400 md:flex"><Search size={15} /><span>Search workspace</span><kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px]">⌘ K</kbd></div>
        <button type="button" aria-label="Notifications" onClick={() => navigate("/notifications")} className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><Bell size={18} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand-600 ring-2 ring-white" /></button>
        {currentUser.role === "ADMIN" && <Button variant="secondary" size="sm" onClick={handleReset} className="hidden xl:inline-flex">Reset Demo Data</Button>}
        <div className="hidden h-8 w-px bg-slate-200 sm:block" />
        <div className="flex items-center gap-2"><Avatar name={currentUser.name} size="sm" /><div className="hidden text-right lg:block"><p className="text-xs font-semibold text-slate-900">{currentUser.name}</p><Badge tone={ROLE_TONE[currentUser.role]} className="mt-0.5">{currentUser.role}</Badge></div><ChevronDown size={14} className="hidden text-slate-400 sm:block" /></div>
        <Button variant="ghost" size="sm" onClick={() => { logout(); navigate("/login"); }} className="hidden sm:inline-flex">Switch User</Button>
      </div>
    </header>
  );
}
