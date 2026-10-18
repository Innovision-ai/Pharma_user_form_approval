import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronDown, Info, KeyRound, LogOut, Menu, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { useAuth } from "../../context/AuthContext";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { api } from "../../lib/api";
import { roleLabel } from "../../lib/roles";
import { NAV_ITEMS } from "./Sidebar";
import { ChangePasswordDialog } from "../ChangePasswordDialog";

const ROLE_TONE: Record<string, "blue" | "amber" | "purple" | "green" | "slate"> = { EMPLOYEE: "blue", HOD: "amber", QA: "purple", IT: "green", ADMIN: "slate", INVENTORY_REQUESTOR: "green" };
const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard", "/equipment": "Equipment Master", "/users": "User Management", "/inventory": "Inventory Report",
  "/requests/new": "Create Access Request", "/requests/mine": "My Requests", "/approvals": "Approval Inbox", "/it-queue": "IT Provisioning",
  "/audit": "Audit Trail", "/notifications": "Notifications", "/uam/requests": "Requests", "/uam/requests/new": "Create Request",
  "/asset-requests": "Asset Requests", "/asset-requests/new": "New Asset Request", "/periodic-review": "Periodic Review Management",
  "/preventive-maintenance": "Preventive Maintenance Management", "/backup-schedule": "Backup Schedule Management",
  "/vault": "Password Vault", "/about": "About",
};

function pageTitle(path: string) {
  if (TITLES[path]) return TITLES[path];
  if (path.startsWith("/uam/requests/")) return "Request Details";
  if (path.startsWith("/asset-requests/")) return "Asset Request Details";
  if (path.startsWith("/equipment/")) return "Equipment Details";
  if (path.startsWith("/requests/")) return "Request Details";
  return "Workspace";
}

interface SearchHit { key: string; group: string; label: string; sub?: string; to: string }

/** Workspace search (Ctrl/⌘ + K): pages, equipment, requests and asset requests. */
function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !currentUser) return;
    setQuery(""); setActive(0);
    window.setTimeout(() => inputRef.current?.focus(), 10);
    const loads: Promise<SearchHit[]>[] = [
      api.listUAMRequests().then((rs) => rs.map((r) => ({
        key: `uam-${r.request_code}`, group: "Requests", label: r.request_code,
        sub: `${r.asset_code} · ${r.action} · ${r.employee_name}`, to: `/uam/requests/${r.request_code}`,
      }))),
      api.listAssetRequests().then((rs) => rs.map((r) => ({
        key: `ast-${r.request_code}`, group: "Asset Requests", label: r.request_code,
        sub: `${r.request_type === "RETIRE" ? "Retire" : "Create"} · ${r.system_name ?? r.equipment_code ?? ""}`, to: `/asset-requests/${r.request_code}`,
      }))),
    ];
    if (currentUser.role === "ADMIN") {
      loads.push(api.listEquipment().then((es) => es.map((e) => ({
        key: `eq-${e.equipment_code}`, group: "Equipment", label: `${e.equipment_code} · ${e.name}`,
        sub: `${e.system_type ?? e.type} · ${e.location}`, to: `/equipment/${e.equipment_code}`,
      }))));
    }
    Promise.allSettled(loads).then((res) =>
      setRecords(res.flatMap((r) => (r.status === "fulfilled" ? r.value : []))));
  }, [open, currentUser]);

  const hits = useMemo(() => {
    if (!currentUser) return [];
    const q = query.trim().toLowerCase();
    const pages: SearchHit[] = NAV_ITEMS
      .filter((n) => !n.roles || n.roles.includes(currentUser.role))
      .map((n) => ({ key: `page-${n.to}`, group: "Pages", label: n.label, to: n.to }));
    const all = [...pages, ...records];
    if (!q) return pages;
    return all.filter((h) => `${h.label} ${h.sub ?? ""}`.toLowerCase().includes(q)).slice(0, 30);
  }, [query, records, currentUser]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;
  const go = (hit?: SearchHit) => { if (!hit) return; onClose(); navigate(hit.to); };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-slate-950/40 p-4 pt-[12vh] backdrop-blur-[2px]">
      <button aria-label="Close search" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter") go(hits[active]);
            }}
            placeholder="Search pages, equipment, request numbers..."
            className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {hits.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500">No results for "{query}".</p>}
          {hits.map((h, i) => (
            <button
              key={h.key}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left ${i === active ? "bg-brand-50" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{h.label}</span>
                {h.sub && <span className="block truncate text-xs text-slate-500">{h.sub}</span>}
              </span>
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">{h.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { currentUser, plant, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  if (!currentUser) return null;

  const signOut = () => { logout(); navigate("/login"); };

  return (
    <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-4 border-b border-white/20 bg-white/70 px-4 backdrop-blur-2xl shadow-sm sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenu} aria-label="Open navigation" className="rounded-xl p-2 text-slate-500 hover:bg-white/60 hover:text-slate-900 transition lg:hidden"><Menu size={19} /></button>
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold tracking-tight text-slate-900">{pageTitle(location.pathname)}</p>
          <p className="hidden text-xs text-slate-400 font-medium sm:block">Qualizone <span className="mx-1 text-slate-300">·</span> Plant {plant}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden items-center gap-2 rounded-xl border border-slate-200/60 bg-white/50 backdrop-blur-sm px-3.5 py-2 text-xs text-slate-400 md:flex hover:bg-white/80 transition"
        >
          <Search size={14} /><span>Search workspace</span><kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Ctrl K</kbd>
        </button>
        <button type="button" aria-label="Search" onClick={() => setSearchOpen(true)} className="rounded-xl p-2.5 text-slate-500 transition hover:bg-white/60 md:hidden"><Search size={18} /></button>
        <button
          type="button"
          aria-label="Notifications"
          onClick={() => navigate("/notifications")}
          className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-white/60 hover:text-slate-900"
        >
          <Bell size={18} />
        </button>
        <Badge tone="blue" className="hidden sm:inline-flex">{plant}</Badge>
        <div className="hidden h-7 w-px bg-slate-200/60 sm:block" />
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 transition hover:bg-white/60"
          >
            <Avatar name={currentUser.name} size="sm" />
            <div className="hidden text-left lg:block">
              <p className="text-xs font-bold text-slate-900">{currentUser.name}</p>
              <Badge tone={ROLE_TONE[currentUser.role]} className="mt-0.5">{roleLabel(currentUser.role)}</Badge>
            </div>
            <ChevronDown size={14} className={`text-slate-400 transition ${menuOpen ? "rotate-180" : ""}`} />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-bold text-slate-900">{currentUser.name}</p>
                <p className="text-xs text-slate-500">{currentUser.employee_id} · {currentUser.email}</p>
                <p className="mt-1 text-xs text-slate-500">{roleLabel(currentUser.role)} · {currentUser.department} · Plant {plant}</p>
              </div>
              <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); navigate("/about"); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><Info size={15} /> About</button>
              <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setPwOpen(true); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><KeyRound size={15} /> Change password</button>
              <button role="menuitem" type="button" onClick={signOut} className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut size={15} /> Sign out</button>
            </div>
          )}
        </div>
      </div>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </header>
  );
}
