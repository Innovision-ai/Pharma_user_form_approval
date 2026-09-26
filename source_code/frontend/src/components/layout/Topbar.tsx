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
  "/requests/new": "Create Access Request", "/requests/mine": "My Requests", "/approvals": "Approval Inbox", "/it-queue": "IT Provisioning", "/audit": "Audit Trail", "/notifications": "Notifications", "/uam/requests": "UAM Requests", "/uam/requests/new": "Create UAM Request",
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
    <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-4 border-b border-white/20 bg-white/70 px-4 backdrop-blur-2xl shadow-sm sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenu} aria-label="Open navigation" className="rounded-xl p-2 text-slate-500 hover:bg-white/60 hover:text-slate-900 transition lg:hidden"><Menu size={19} /></button>
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold tracking-tight text-slate-900">
            {TITLES[location.pathname] ?? (location.pathname.startsWith("/requests/") ? "Request Details" : "Workspace")}
          </p>
          <p className="hidden text-xs text-slate-400 font-medium sm:block">Qualizone <span className="mx-1 text-slate-300">·</span> Access Management</p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-2 rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm px-3.5 py-2 text-xs text-slate-400 md:flex cursor-pointer hover:bg-white/80 transition">
          <Search size={14} /><span>Search workspace</span><kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">⌘K</kbd>
        </div>
        <button
          type="button"
          aria-label="Notifications"
          onClick={() => navigate("/notifications")}
          className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-white/60 hover:text-slate-900"
        >
          <Bell size={18} />
          <span className="absolute right-2 top-2 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white"></span>
          </span>
        </button>
        {currentUser.role === "ADMIN" && <Button variant="secondary" size="sm" onClick={handleReset} className="hidden xl:inline-flex">Reset Demo Data</Button>}
        <div className="hidden h-7 w-px bg-slate-200/60 sm:block" />
        <div className="flex items-center gap-2.5">
          <Avatar name={currentUser.name} size="sm" />
          <div className="hidden text-left lg:block">
            <p className="text-xs font-bold text-slate-900">{currentUser.name}</p>
            <Badge tone={ROLE_TONE[currentUser.role]} className="mt-0.5">{currentUser.role}</Badge>
          </div>
          <ChevronDown size={14} className="hidden text-slate-400 sm:block" />
        </div>
        <Button variant="ghost" size="sm" onClick={() => { logout(); navigate("/login"); }} className="hidden sm:inline-flex text-slate-500 hover:text-red-500">Sign Out</Button>
      </div>
    </header>
  );
}

