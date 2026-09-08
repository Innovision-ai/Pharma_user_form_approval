export type Role = "EMPLOYEE" | "HOD" | "QA" | "ADMIN" | "IT";

export type ApproverType = "HOD" | "QA";

export type RequestStatus =
  | "PENDING_HOD"
  | "PENDING_QA"
  | "IT_PENDING"
  | "PENDING_USER_ACK"
  | "IT_COMPLETED"
  | "REJECTED";

export interface User {
  employee_id: string;
  name: string;
  email: string;
  department: string;
  plant: string;
  role: Role;
  active: boolean;
  action_pin: string;
}

export interface Equipment {
  equipment_code: string;
  name: string;
  type: string;
  location: string;
  plant: string;
  allowed_roles: string[];
  validation_date: string;
  active: boolean;
  created_at: string;
  created_by: string;
}

export interface Approver {
  approver_code: string;
  name: string;
  type: ApproverType;
  department: string;
  email: string;
  active: boolean;
  created_at: string;
}

export interface AccessRequest {
  request_code: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  employee_department: string;
  equipment_code: string;
  equipment_name: string;
  requested_role: string;
  hod_id: string;
  hod_name: string;
  hod_email: string;
  qa_id: string;
  qa_name: string;
  qa_email: string;
  reason: string;
  status: RequestStatus;
  rejection_reason: string | null;
  rejected_stage: "HOD" | "QA" | null;
  user_login_id?: string | null;
  temporary_password?: string | null;
  it_submitted_at?: string | null;
  user_acknowledged?: boolean;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentUser {
  user_name: string;
  department: string;
  user_id: string;
  access_granted_by: string;
  granted_date: string;
  status: string;
}

export interface AuditLog {
  request_code: string | null;
  user_employee_id: string;
  user_name: string;
  action: string;
  description: string;
  timestamp: string;
}

export interface Notification {
  request_code: string;
  recipient_name: string;
  recipient_email: string;
  subject: string;
  body: string;
  type: string;
  status: string;
  created_at: string;
}

export interface DashboardSummary {
  total_equipment: number;
  active_equipment: number;
  pending_hod: number;
  pending_qa: number;
  approved_requests: number;
  it_pending: number;
  recent_requests: AccessRequest[];
}
