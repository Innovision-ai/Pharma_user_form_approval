import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  Bell,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../lib/cn";
import type { Role } from "../../types";

type Icon = typeof Gauge;
interface NavItem { to: string; label: string; icon: Icon; roles?: Role[] }

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/equipment", label: "Equipment Master", icon: FlaskConical, roles: ["ADMIN"] },
  { to: "/approvers", label: "Approver Master", icon: ShieldCheck, roles: ["ADMIN"] },
  { to: "/users", label: "User Management", icon: Users, roles: ["ADMIN"] },
  { to: "/inventory", label: "Inventory Report", icon: ClipboardList, roles: ["ADMIN"] },
  { to: "/requests/new", label: "Create Request", icon: ClipboardCheck, roles: ["EMPLOYEE"] },
  { to: "/requests/mine", label: "My Requests", icon: FileClock, roles: ["EMPLOYEE"] },
  { to: "/approvals", label: "Approvals", icon: ShieldCheck, roles: ["HOD", "QA"] },
  { to: "/it-queue", label: "IT Requests", icon: Settings2, roles: ["IT"] },
  { to: "/audit", label: "Audit Trail", icon: FileClock },
  { to: "/notifications", label: "Notifications", icon: Bell },
];

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onClose, onToggle }: SidebarProps) {
  const { currentUser } = useAuth();
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
  if (!currentUser) return null;

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(currentUser.role));

  return (
    <>
      {mobileOpen && <button aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" />}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/20 bg-white/80 backdrop-blur-2xl transition-all duration-300 lg:static lg:translate-x-0 shadow-glass",
        "w-72",
        collapsed && "lg:w-[76px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        {/* Logo area */}
        <div className={cn("flex h-[76px] items-center border-b border-white/20 px-5", collapsed && "lg:justify-center lg:px-3")}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-indigo-700 text-sm font-extrabold text-white shadow-lg shadow-brand-500/30">QZ</div>
            {!collapsed && <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-slate-900 tracking-tight">Qualizone</p>
              <p className="truncate text-[11px] text-slate-400 font-medium">Equipment Access Management</p>
            </div>}
          </div>
          <button type="button" aria-label="Close navigation" onClick={onClose} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 lg:hidden"><X size={18} /></button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className={cn("mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400", collapsed && "lg:text-center lg:px-0")}>{collapsed ? "•" : "Workspace"}</p>
          {visibleItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={onClose} title={collapsed ? label : undefined} className={({ isActive }) => cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
              collapsed && "lg:justify-center lg:px-0",
              isActive
                ? "bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-lg shadow-brand-600/30"
                : "text-slate-500 hover:bg-slate-100/80 hover:text-slate-900",
            )}>
              <Icon size={18} strokeWidth={1.8} />
              {!collapsed && <span>{label}</span>}
              {label === "Notifications" && !collapsed && <span className="ml-auto flex h-2 w-2 rounded-full bg-brand-400 ring-2 ring-brand-200" />}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/20 p-3">
          <button type="button" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="hidden w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:flex">
            {collapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /> Collapse menu</>}
          </button>
        </div>
      </aside>
    </>
  );
}

