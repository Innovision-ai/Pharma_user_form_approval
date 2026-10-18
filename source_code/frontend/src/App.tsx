import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/ui/Toast";
import { AppLayout } from "./components/layout/AppLayout";
import { RequireRole } from "./components/layout/RequireRole";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EquipmentMasterPage } from "./pages/EquipmentMasterPage";
import { EquipmentDetailsPage } from "./pages/EquipmentDetailsPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import { InventoryReportPage } from "./pages/InventoryReportPage";
import { CreateRequestPage } from "./pages/CreateRequestPage";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { ITRequestsPage } from "./pages/ITRequestsPage";
import { RequestDetailPage } from "./pages/RequestDetailPage";
import { AuditTrailPage } from "./pages/AuditTrailPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { UAMRequestsPage } from "./pages/UAMRequestsPage";
import { CreateUAMRequestPage } from "./pages/CreateUAMRequestPage";
import { UAMRequestDetailPage } from "./pages/UAMRequestDetailPage";
import { AssetRequestsPage } from "./pages/AssetRequestsPage";
import { CreateAssetRequestPage } from "./pages/CreateAssetRequestPage";
import { AssetRequestDetailPage } from "./pages/AssetRequestDetailPage";
import { PeriodicReviewPage } from "./pages/PeriodicReviewPage";
import { BackupSchedulePage } from "./pages/BackupSchedulePage";
import { PreventiveMaintenancePage } from "./pages/PreventiveMaintenancePage";
import { PasswordVaultPage } from "./pages/PasswordVaultPage";
import { AboutPage } from "./pages/AboutPage";

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />

            <Route path="/equipment" element={<RequireRole roles={["ADMIN"]}><EquipmentMasterPage /></RequireRole>} />
            <Route path="/equipment/:code" element={<EquipmentDetailsPage />} />
            {/* Approver Master removed: approvers are managed through user roles */}
            <Route path="/approvers" element={<Navigate to="/users" replace />} />
            <Route path="/users" element={<RequireRole roles={["ADMIN"]}><UserManagementPage /></RequireRole>} />
            <Route path="/inventory" element={<RequireRole roles={["ADMIN"]}><InventoryReportPage /></RequireRole>} />

            <Route path="/requests/new" element={<RequireRole roles={["EMPLOYEE"]}><CreateRequestPage /></RequireRole>} />
            <Route path="/requests/mine" element={<RequireRole roles={["EMPLOYEE"]}><MyRequestsPage /></RequireRole>} />
            <Route path="/requests/:code" element={<RequestDetailPage />} />

            <Route path="/uam/requests" element={<UAMRequestsPage />} />
            <Route path="/uam/requests/new" element={<RequireRole roles={["EMPLOYEE", "ADMIN"]}><CreateUAMRequestPage /></RequireRole>} />
            <Route path="/uam/requests/:code" element={<UAMRequestDetailPage />} />

            <Route path="/asset-requests" element={<AssetRequestsPage />} />
            <Route path="/asset-requests/new" element={<RequireRole roles={["EMPLOYEE", "ADMIN", "INVENTORY_REQUESTOR"]}><CreateAssetRequestPage /></RequireRole>} />
            <Route path="/asset-requests/:code" element={<AssetRequestDetailPage />} />

            <Route path="/periodic-review" element={<RequireRole roles={["IT", "ADMIN"]}><PeriodicReviewPage /></RequireRole>} />
            <Route path="/backup-schedule" element={<RequireRole roles={["IT", "ADMIN"]}><BackupSchedulePage /></RequireRole>} />
            <Route path="/preventive-maintenance" element={<RequireRole roles={["IT", "ADMIN"]}><PreventiveMaintenancePage /></RequireRole>} />
            <Route path="/vault" element={<PasswordVaultPage />} />

            <Route path="/approvals" element={<RequireRole roles={["HOD", "QA"]}><ApprovalsPage /></RequireRole>} />
            <Route path="/it-queue" element={<RequireRole roles={["IT"]}><ITRequestsPage /></RequireRole>} />

            <Route path="/audit" element={<AuditTrailPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/about" element={<AboutPage />} />

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
