import type {
  AccessRequest,
  Approver,
  AuditLog,
  DashboardSummary,
  Equipment,
  Notification,
  User,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let currentDemoUser: string | null = null;

export function setDemoUser(employeeId: string | null) {
  currentDemoUser = employeeId;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (currentDemoUser) {
    headers["X-Demo-User"] = currentDemoUser;
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
  // Users / demo login
  listUsers: (params?: { role?: string; plant?: string; active?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.role) qs.set("role", params.role);
    if (params?.plant) qs.set("plant", params.plant);
    if (params?.active !== undefined) qs.set("active", String(params.active));
    return request<User[]>(`/api/users?${qs.toString()}`);
  },
  createUser: (payload: {
    employee_id: string;
    name: string;
    email: string;
    department: string;
    plant: string;
    role: string;
    active?: boolean;
  }) =>
    request<User>("/api/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateUser: (
    employee_id: string,
    payload: {
      name: string;
      email: string;
      department: string;
      plant: string;
      role: string;
    },
  ) =>
    request<User>(`/api/users/${employee_id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  toggleUserStatus: (employee_id: string) =>
    request<{ employee_id: string; active: boolean }>(`/api/users/${employee_id}/status`, {
      method: "PATCH",
    }),
  whoAmI: () => request<User>("/api/users/me"),

  // Equipment
  listEquipment: (params?: { activeOnly?: boolean; plant?: string; type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.activeOnly) qs.set("active_only", "true");
    if (params?.plant) qs.set("plant", params.plant);
    if (params?.type) qs.set("type", params.type);
    return request<Equipment[]>(`/api/equipment?${qs.toString()}`);
  },
  createEquipment: (payload: {
    name: string;
    type: string;
    location: string;
    plant: string;
    allowed_roles: string[];
    validation_date: string;
  }) =>
    request<Equipment>("/api/equipment", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateEquipment: (
    code: string,
    payload: {
      name: string;
      type: string;
      location: string;
      plant: string;
      allowed_roles: string[];
      validation_date: string;
    },
  ) =>
    request<Equipment>(`/api/equipment/${code}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  toggleEquipmentStatus: (code: string, active: boolean) =>
    request<Equipment>(`/api/equipment/${code}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    }),
  getEquipmentUsers: (code: string) => 
    request<import("../types").EquipmentUser[]>(`/api/equipment/${code}/users`),

  // Approvers
  listApprovers: (params?: { type?: string; active_only?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.active_only) qs.set("active_only", "true");
    return request<Approver[]>(`/api/approvers?${qs.toString()}`);
  },
  createApprover: (payload: {
    name: string;
    type: string;
    department: string;
    email: string;
  }) =>
    request<Approver>("/api/approvers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateApprover: (
    code: string,
    payload: { name: string; department: string; email: string },
  ) =>
    request<Approver>(`/api/approvers/${code}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  toggleApproverStatus: (code: string, active: boolean) =>
    request<Approver>(`/api/approvers/${code}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    }),

  // Requests
  listAllRequests: () => request<AccessRequest[]>("/api/requests"),
  listMyRequests: () => request<AccessRequest[]>("/api/requests/mine"),
  listApprovals: () => request<AccessRequest[]>("/api/requests/approvals"),
  listItQueue: () => request<AccessRequest[]>("/api/requests/it-queue"),
  getRequest: (code: string) => request<AccessRequest>(`/api/requests/${code}`),
  createRequest: (payload: {
    equipment_code: string;
    requested_role: string;
    hod_id: string;
    qa_id: string;
    reason: string;
  }) =>
    request<AccessRequest>("/api/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  approveRequest: (code: string, username: string, pin: string) =>
    request<AccessRequest>(`/api/requests/${code}/approve`, {
      method: "POST",
      body: JSON.stringify({ username, pin }),
    }),
  rejectRequest: (code: string, reason: string, username: string, pin: string) =>
    request<AccessRequest>(`/api/requests/${code}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason, username, pin }),
    }),
  grantAccess: (code: string, user_login_id: string, password: string, notes: string, pin: string) =>
    request<AccessRequest>(`/api/requests/${code}/grant`, {
      method: "POST",
      body: JSON.stringify({ user_login_id, password, notes, pin }),
    }),
  acknowledgeAccess: (code: string, username: string, pin: string) =>
    request<AccessRequest>(`/api/requests/${code}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ username, pin }),
    }),

  // Audit / Notifications / Dashboard
  listAudit: (params?: {
    request_code?: string;
    user?: string;
    action?: string;
    date_from?: string;
    date_to?: string;
  }) => {
    const qs = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    return request<AuditLog[]>(`/api/audit?${qs.toString()}`);
  },
  listNotifications: (requestCode?: string) => {
    const qs = requestCode ? `?request_code=${requestCode}` : "";
    return request<Notification[]>(`/api/notifications${qs}`);
  },
  getDashboardSummary: () => request<DashboardSummary>("/api/dashboard/summary"),
  resetDemoData: () => request<{ status: string; message: string }>("/api/admin/reset", { method: "POST" }),
};
