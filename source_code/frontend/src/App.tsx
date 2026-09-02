import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/ui/Toast";
import { AppLayout } from "./components/layout/AppLayout";
import { RequireRole } from "./components/layout/RequireRole";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EquipmentMasterPage } from "./pages/EquipmentMasterPage";
import { ApproverMasterPage } from "./pages/ApproverMasterPage";
import { CreateRequestPage } from "./pages/CreateRequestPage";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { ITRequestsPage } from "./pages/ITRequestsPage";
import { RequestDetailPage } from "./pages/RequestDetailPage";
import { AuditTrailPage } from "./pages/AuditTrailPage";
import { NotificationsPage } from "./pages/NotificationsPage";

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />

            <Route
              path="/equipment"
              element={
                <RequireRole roles={["ADMIN"]}>
                  <EquipmentMasterPage />
                </RequireRole>
              }
            />
            <Route
              path="/approvers"
              element={
                <RequireRole roles={["ADMIN"]}>
                  <ApproverMasterPage />
                </RequireRole>
              }
            />

            <Route
              path="/requests/new"
              element={
                <RequireRole roles={["EMPLOYEE"]}>
                  <CreateRequestPage />
                </RequireRole>
              }
            />
            <Route
              path="/requests/mine"
              element={
                <RequireRole roles={["EMPLOYEE"]}>
                  <MyRequestsPage />
                </RequireRole>
              }
            />
            <Route path="/requests/:code" element={<RequestDetailPage />} />

            <Route
              path="/approvals"
              element={
                <RequireRole roles={["HOD", "QA"]}>
                  <ApprovalsPage />
                </RequireRole>
              }
            />
            <Route
              path="/it-queue"
              element={
                <RequireRole roles={["IT"]}>
                  <ITRequestsPage />
                </RequireRole>
              }
            />

            <Route path="/audit" element={<AuditTrailPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
