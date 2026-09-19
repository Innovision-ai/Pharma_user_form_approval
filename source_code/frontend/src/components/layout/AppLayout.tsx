import { useState } from "react";
import { Menu } from "lucide-react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppLayout() {
  const { currentUser, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading workspace...
      </div>
    );
  }

  if (!currentUser) return <Navigate to="/login" replace />;

  return (
    <div className="relative flex min-h-screen bg-slate-50 overflow-hidden text-slate-900">
      {/* Dynamic Background Elements */}
      <div className="fixed top-[-10%] left-[-10%] h-[50vh] w-[50vw] rounded-full bg-brand-200/30 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] h-[50vh] w-[50vw] rounded-full bg-indigo-200/30 blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex w-full h-screen">
        <Sidebar
          collapsed={collapsed}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onToggle={() => setCollapsed((value) => !value)}
        />
        <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
          <Topbar onMenu={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto">
            <div className="page-enter mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setSidebarOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 lg:hidden transition-transform hover:scale-105 hover:bg-indigo-500"
      >
        <Menu size={22} />
      </button>
    </div>
  );
}
