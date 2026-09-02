import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../lib/cn";
import type { Role } from "../../types";

interface NavItem {
  to: string;
  label: string;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/equipment", label: "Equipment Master", roles: ["ADMIN"] },
  { to: "/approvers", label: "Approver Master", roles: ["ADMIN"] },
  { to: "/requests/new", label: "Create Request", roles: ["EMPLOYEE"] },
  { to: "/requests/mine", label: "My Requests", roles: ["EMPLOYEE"] },
  { to: "/approvals", label: "Approvals", roles: ["HOD", "QA"] },
  { to: "/it-queue", label: "IT Requests", roles: ["IT"] },
  { to: "/audit", label: "Audit Trail" },
  { to: "/notifications", label: "Notifications" },
];

export function Sidebar() {
  const { currentUser } = useAuth();
  if (!currentUser) return null;

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(currentUser.role),
  );

  return (
    <aside className="flex h-full w-60 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-5">
        <p className="text-sm font-bold text-slate-800">Pharma Access</p>
        <p className="text-xs text-slate-400">Equipment Management</p>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
