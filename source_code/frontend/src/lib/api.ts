import type {
  AccessRequest,
  Approver,
  AssetCreationRequest,
  AuditLog,
  BackupScheduleRow,
  DashboardSummary,
  Equipment,
  Notification,
  PeriodicReviewRow,
  PMRow,
  User,
  ValidationAlert,
  VaultEntry,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let currentToken: string | null = localStorage.getItem("pharma-jwt-token");

export function setToken(token: string | null) {
  currentToken = token;
  if (token) {
    localStorage.setItem("pharma-jwt-token", token);
  } else {
    localStorage.removeItem("pharma-jwt-token");
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (currentToken) {
    headers["Authorization"] = `Bearer ${currentToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.detail ?? message;
    } catch {
      // response had no JSON body
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  login: async (username: string, password: string, plant?: string) => {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);
    if (plant) formData.append("plant", plant);
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    if (!res.ok) {
      let message = "Login failed";
      try { const body = await res.json(); if (typeof body.detail === "string") message = body.detail; } catch { /* no body */ }
      throw new ApiError(res.status, message);
    }
    return res.json() as Promise<{ access_token: string; token_type: string }>;
  },
  getLoginPlants: (employee_id: string) =>
    request<{ plants: string[] }>(`/api/auth/plants?employee_id=${encodeURIComponent(employee_id)}`),
  verifyCredentials: (password: string) =>
    request<{ ok: boolean; user_id: string; name: string }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ password }) }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean }>("/api/auth/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),
  getPasswordPolicy: () =>
    request<{ min_length: number; expiry_days: number; history_count: number; max_failed_attempts: number; idle_timeout_minutes: number; text: string }>("/api/auth/password-policy"),
  getDepartments: (plant?: string) =>
    request<{ plants: Record<string, string[]>; departments: string[] }>(`/api/meta/departments${plant ? `?plant=${encodeURIComponent(plant)}` : ""}`),

  // Users
  listUsers: (params?: { role?: string; plant?: string; active?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.role) qs.set("role", params.role);
    if (params?.plant) qs.set("plant", params.plant);
    if (params?.active !== undefined) qs.set("active", String(params.active));
    return request<User[]>(`/api/users?${qs.toString()}`);
  },
  createUser: (payload: {
    employee_id: string; name: string; email: string; department: string;
    plant: string; plants?: string[]; role: string; active?: boolean; password?: string;
  }) => request<User>("/api/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (employee_id: string, payload: {
    name: string; email: string; department: string; plant: string; plants?: string[]; role: string;
  }) => request<User>(`/api/users/${employee_id}`, { method: "PUT", body: JSON.stringify(payload) }),
  toggleUserStatus: (employee_id: string) =>
    request<{ employee_id: string; active: boolean }>(`/api/users/${employee_id}/status`, { method: "PATCH" }),
  whoAmI: () => request<User>("/api/users/me"),

  // Equipment
  listEquipment: (params?: { activeOnly?: boolean; plant?: string; type?: string; system_type?: string; validation_status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.activeOnly) qs.set("active_only", "true");
    if (params?.plant) qs.set("plant", params.plant);
    if (params?.type) qs.set("type", params.type);
    if (params?.system_type) qs.set("system_type", params.system_type);
    if (params?.validation_status) qs.set("validation_status", params.validation_status);
    return request<Equipment[]>(`/api/equipment?${qs.toString()}`);
  },
  createEquipment: (payload: Partial<Equipment> & { name: string; location: string; allowed_roles: string[]; validation_date: string }) =>
    request<Equipment>("/api/equipment", { method: "POST", body: JSON.stringify(payload) }),
  updateEquipment: (code: string, payload: Partial<Equipment> & { name: string; location: string; allowed_roles: string[]; validation_date: string }) =>
    request<Equipment>(`/api/equipment/${code}`, { method: "PUT", body: JSON.stringify(payload) }),
  toggleEquipmentStatus: (code: string, active: boolean) =>
    request<Equipment>(`/api/equipment/${code}/status`, { method: "PATCH", body: JSON.stringify({ active }) }),
  getEquipment: (code: string) =>
    request<Equipment>(`/api/equipment/${code}`),
  getEquipmentUsers: (code: string) =>
    request<import("../types").EquipmentUser[]>(`/api/equipment/${code}/users`),
  getValidationAlerts: () =>
    request<ValidationAlert[]>("/api/equipment/validation-alerts"),

  // Approvers
  listApprovers: (params?: { type?: string; active_only?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.active_only) qs.set("active_only", "true");
    return request<Approver[]>(`/api/approvers?${qs.toString()}`);
  },
  createApprover: (payload: { name: string; type: string; department: string; email: string }) =>
    request<Approver>("/api/approvers", { method: "POST", body: JSON.stringify(payload) }),
  updateApprover: (code: string, payload: { name: string; department: string; email: string }) =>
    request<Approver>(`/api/approvers/${code}`, { method: "PUT", body: JSON.stringify(payload) }),
  toggleApproverStatus: (code: string, active: boolean) =>
    request<Approver>(`/api/approvers/${code}/status`, { method: "PATCH", body: JSON.stringify({ active }) }),

  // Requests
  listAllRequests: () => request<AccessRequest[]>("/api/requests"),
  listMyRequests: () => request<AccessRequest[]>("/api/requests/mine"),
  listApprovals: () => request<AccessRequest[]>("/api/requests/approvals"),
  listItQueue: () => request<AccessRequest[]>("/api/requests/it-queue"),
  getRequest: (code: string) => request<AccessRequest>(`/api/requests/${code}`),
  createRequest: (payload: { equipment_code: string; requested_role: string; hod_id: string; qa_id: string; reason: string }) =>
    request<AccessRequest>("/api/requests", { method: "POST", body: JSON.stringify(payload) }),
  approveRequest: (code: string, username: string, pin: string) =>
    request<AccessRequest>(`/api/requests/${code}/approve`, { method: "POST", body: JSON.stringify({ username, pin }) }),
  rejectRequest: (code: string, reason: string, username: string, pin: string) =>
    request<AccessRequest>(`/api/requests/${code}/reject`, { method: "POST", body: JSON.stringify({ reason, username, pin }) }),
  grantAccess: (code: string, user_login_id: string, password: string, notes: string, pin: string) =>
    request<AccessRequest>(`/api/requests/${code}/grant`, { method: "POST", body: JSON.stringify({ user_login_id, password, notes, pin }) }),
  acknowledgeAccess: (code: string, username: string, pin: string) =>
    request<AccessRequest>(`/api/requests/${code}/acknowledge`, { method: "POST", body: JSON.stringify({ username, pin }) }),

  // Audit / Notifications / Dashboard
  listAudit: (params?: { request_code?: string; user?: string; action?: string; date_from?: string; date_to?: string }) => {
    const qs = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([k, v]) => { if (v) qs.set(k, v); });
    return request<AuditLog[]>(`/api/audit?${qs.toString()}`);
  },
  listNotifications: (requestCode?: string) => {
    const qs = requestCode ? `?request_code=${requestCode}` : "";
    return request<Notification[]>(`/api/notifications${qs}`);
  },
  getDashboardSummary: () => request<DashboardSummary>("/api/dashboard/summary"),
  resetDemoData: () => request<{ status: string; message: string }>("/api/admin/reset", { method: "POST" }),

  // UAM workflow
  listUAMTemplates: () => request<{ templates: Array<{ code: string; asset_types: string[]; requires_qa: boolean }>; actions: string[] }>("/api/uam/requests/templates"),
  listUAMRequests: (params?: { status?: string; plant?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.plant) qs.set("plant", params.plant);
    return request<import("../types").UAMRequest[]>(`/api/uam/requests?${qs.toString()}`);
  },
  getUAMRequest: (code: string) => request<import("../types").UAMRequest>(`/api/uam/requests/${code}`),
  createUAMRequest: (payload: {
    template: string; asset_type: string; asset_code: string; requested_role: string;
    action: string; reason: string; plant: string; reviewer_id?: string;
    department_approver_id?: string; qa_approver_id?: string; it_executor_id?: string;
    form_data?: Record<string, unknown>;
  }) => request<import("../types").UAMRequest>("/api/uam/requests", { method: "POST", body: JSON.stringify(payload) }),
  approveUAMRequest: (code: string, comment?: string) => request<import("../types").UAMRequest>(`/api/uam/requests/${code}/approve`, { method: "POST", body: JSON.stringify({ comment }) }),
  requestUAMCorrection: (code: string, comment: string) => request<import("../types").UAMRequest>(`/api/uam/requests/${code}/correction`, { method: "POST", body: JSON.stringify({ comment }) }),
  rejectUAMRequest: (code: string, comment: string) => request<import("../types").UAMRequest>(`/api/uam/requests/${code}/reject`, { method: "POST", body: JSON.stringify({ comment }) }),
  executeUAMRequest: (code: string, user_login_id: string, password: string, comment?: string) => request<import("../types").UAMRequest>(`/api/uam/requests/${code}/execute`, { method: "POST", body: JSON.stringify({ user_login_id, password, comment }) }),
  acknowledgeUAMRequest: (code: string, comment?: string) => request<import("../types").UAMRequest>(`/api/uam/requests/${code}/acknowledge`, { method: "POST", body: JSON.stringify({ comment }) }),
  cancelUAMRequest: (code: string, comment?: string) => request<import("../types").UAMRequest>(`/api/uam/requests/${code}/cancel`, { method: "POST", body: JSON.stringify({ comment }) }),
  bulkDeactivateUser: (payload: { employee_id: string; it_executor_id: string; reason: string }) =>
    request<{ created_requests: string[]; count: number }>("/api/uam/requests/bulk-deactivate", { method: "POST", body: JSON.stringify(payload) }),

  // Asset creation requests
  getAssetRequestSelectors: () => request<{ reviewers: Array<{id: string; name: string; department: string}>; it_executors: Array<{id: string; name: string}>; qa_approvers: Array<{id: string; name: string; department: string}> }>("/api/asset-requests/selectors"),
  listAssetRequests: (params?: { status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    return request<AssetCreationRequest[]>(`/api/asset-requests?${qs.toString()}`);
  },
  createAssetRequest: (payload: Partial<AssetCreationRequest> & { plant: string }) =>
    request<AssetCreationRequest>("/api/asset-requests", { method: "POST", body: JSON.stringify(payload) }),
  getAssetRequest: (code: string) => request<AssetCreationRequest>(`/api/asset-requests/${code}`),
  assetReviewComplete: (code: string, comment?: string) => request<AssetCreationRequest>(`/api/asset-requests/${code}/review-complete`, { method: "POST", body: JSON.stringify({ comment }) }),
  assetITReviewComplete: (code: string, comment?: string) => request<AssetCreationRequest>(`/api/asset-requests/${code}/it-review-complete`, { method: "POST", body: JSON.stringify({ comment }) }),
  assetQAApprove: (code: string, comment?: string) => request<AssetCreationRequest>(`/api/asset-requests/${code}/qa-approve`, { method: "POST", body: JSON.stringify({ comment }) }),
  assetCorrection: (code: string, comment: string) => request<AssetCreationRequest>(`/api/asset-requests/${code}/correction`, { method: "POST", body: JSON.stringify({ comment }) }),
  assetResubmit: (code: string, comment?: string) => request<AssetCreationRequest>(`/api/asset-requests/${code}/resubmit`, { method: "POST", body: JSON.stringify({ comment }) }),
  assetReject: (code: string, comment?: string) => request<AssetCreationRequest>(`/api/asset-requests/${code}/reject`, { method: "POST", body: JSON.stringify({ comment }) }),
  assetCancel: (code: string, comment?: string) => request<AssetCreationRequest>(`/api/asset-requests/${code}/cancel`, { method: "POST", body: JSON.stringify({ comment }) }),

  // Periodic Review
  listPeriodicReview: (params?: { type?: string; department?: string }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.department) qs.set("department", params.department);
    return request<PeriodicReviewRow[]>(`/api/periodic-review?${qs.toString()}`);
  },
  listPeriodicReviewDue: () => request<PeriodicReviewRow[]>("/api/periodic-review/due"),
  getPeriodicReviewPlanner: (year: number, month?: number, type?: string, department?: string) => {
    const qs = new URLSearchParams({ year: String(year) });
    if (month) qs.set("month", String(month));
    if (type) qs.set("type", type);
    if (department) qs.set("department", department);
    return request<PeriodicReviewRow[]>(`/api/periodic-review/planner?${qs.toString()}`);
  },
  updateReviewDone: (code: string, last_review_date: string, notes?: string, auth_password?: string) =>
    request<PeriodicReviewRow>(`/api/periodic-review/${code}/update-done`, { method: "PUT", body: JSON.stringify({ last_review_date, notes, auth_password }) }),

  // Backup Schedule
  listBackupSchedule: (params?: { type?: string; department?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.department) qs.set("department", params.department);
    if (params?.search) qs.set("search", params.search);
    return request<BackupScheduleRow[]>(`/api/backup-schedule?${qs.toString()}`);
  },
  getBackupSchedulePlanner: (year: number, month?: number, type?: string, department?: string) => {
    const qs = new URLSearchParams({ year: String(year) });
    if (month) qs.set("month", String(month));
    if (type) qs.set("type", type);
    if (department) qs.set("department", department);
    return request<BackupScheduleRow[]>(`/api/backup-schedule/planner?${qs.toString()}`);
  },
  updateBackupDone: (code: string, last_backup_date: string, frequency_days?: number, notes?: string, auth_password?: string, backup_path?: string) =>
    request<BackupScheduleRow>(`/api/backup-schedule/${code}/update-done`, { method: "PUT", body: JSON.stringify({ last_backup_date, frequency_days: frequency_days ?? 30, notes, auth_password, backup_path }) }),

  // Preventive Maintenance
  listPM: (params?: { plant?: string }) => {
    const qs = new URLSearchParams();
    if (params?.plant) qs.set("plant", params.plant);
    return request<PMRow[]>(`/api/preventive-maintenance?${qs.toString()}`);
  },
  getPMPlanner: (year: number, month?: number) => {
    const qs = new URLSearchParams({ year: String(year) });
    if (month) qs.set("month", String(month));
    return request<PMRow[]>(`/api/preventive-maintenance/planner?${qs.toString()}`);
  },
  getPMHistory: (equipment_code: string) =>
    request<Record<string, unknown>[]>(`/api/preventive-maintenance/history/${equipment_code}`),
  updatePMDone: (code: string, last_pm_date: string, frequency_months?: number, notes?: string, auth_password?: string) =>
    request<PMRow>(`/api/preventive-maintenance/${code}/update-done`, { method: "PUT", body: JSON.stringify({ last_pm_date, frequency_months: frequency_months ?? 6, notes, auth_password }) }),
  listAdditionalPMSystems: () => request<PMRow[]>("/api/preventive-maintenance/additional"),
  createAdditionalPMSystem: (payload: Record<string, unknown>) =>
    request<PMRow>("/api/preventive-maintenance/additional", { method: "POST", body: JSON.stringify(payload) }),
  updateAdditionalPMSystem: (id: number, payload: Record<string, unknown>) =>
    request<PMRow>(`/api/preventive-maintenance/additional/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteAdditionalPMSystem: (id: number) =>
    request<void>(`/api/preventive-maintenance/additional/${id}`, { method: "DELETE" }),

  // Password Vault
  listVaultEntries: (search?: string) => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return request<VaultEntry[]>(`/api/vault${qs}`);
  },
  createVaultEntry: (payload: { equipment_code: string; equipment_name: string; password: string; created_date: string; expiry_days?: number }) =>
    request<VaultEntry>("/api/vault", { method: "POST", body: JSON.stringify(payload) }),
  updateVaultEntry: (id: number, payload: { password: string; expiry_days?: number }) =>
    request<VaultEntry>(`/api/vault/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteVaultEntry: (id: number) =>
    request<void>(`/api/vault/${id}`, { method: "DELETE" }),
};
