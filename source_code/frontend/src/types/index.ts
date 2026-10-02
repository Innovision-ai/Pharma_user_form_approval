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
  plants: string[];
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
  // Extended computerized system fields
  system_id?: string | null;
  system_type?: string | null;
  make?: string | null;
  model_name?: string | null;
  application_name?: string | null;
  gamp_category?: string | null;
  usp_classification?: string | null;
  validation_status?: string | null;
  initial_validation_date?: string | null;
  latest_validation_date?: string | null;
  periodic_review_frequency?: number | null;
  backup_include?: boolean;
  computer_system_id?: string | null;
  remarks?: string | null;
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
  user_total_requests: number;
  user_uam_requests: number;
  user_equipment_count: number;
  user_pending_actions: number;
  validation_alerts: number;
}

export type UAMTemplate = "MANUFACTURING" | "QC" | "ERP";
export type UAMAssetType = "EQUIPMENT" | "SOFTWARE";
export type UAMAction = "CREATE" | "MODIFY" | "DEACTIVATE" | "ACTIVATE" | "UNLOCK" | "CHANGE_PASSWORD";
export type UAMStatus = "PENDING_REVIEW" | "PENDING_DEPARTMENT_APPROVAL" | "PENDING_QA_APPROVAL" | "PENDING_EXECUTION" | "PENDING_INITIATOR_ACK" | "CORRECTION_REQUIRED" | "SUSPENDED" | "CANCELLED" | "COMPLETED" | "REJECTED";

export interface UAMRequest {
  request_code: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  template: UAMTemplate;
  asset_type: UAMAssetType;
  asset_code: string;
  requested_role: string;
  action: UAMAction;
  plant: string;
  reason: string;
  status: UAMStatus;
  form_data: Record<string, unknown>;
  reviewer_id: string | null;
  department_approver_id: string | null;
  qa_approver_id: string | null;
  it_executor_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plant { code: string; name: string; active: boolean; }

// Asset Creation Workflow
export type AssetCreationStatus =
  | "CREATED"
  | "UNDER_REVIEW"
  | "CORRECTION_REQUIRED"
  | "UNDER_IT_REVIEW"
  | "UNDER_APPROVAL"
  | "APPROVED"
  | "CANCELLED"
  | "REJECTED";

export interface AssetCreationRequest {
  id: number;
  request_code: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  system_name?: string | null;
  system_id?: string | null;
  system_type?: string | null;
  make?: string | null;
  model_name?: string | null;
  primary_function?: string | null;
  application_name?: string | null;
  gamp_category?: string | null;
  department?: string | null;
  location?: string | null;
  usp_classification?: string | null;
  db_server_name?: string | null;
  computer_name?: string | null;
  validation_summary_report_no?: string | null;
  approval_date?: string | null;
  change_control_no?: string | null;
  reviewer_id?: string | null;
  it_executor_id?: string | null;
  qa_approver_id?: string | null;
  plant: string;
  status: AssetCreationStatus;
  rejection_reason?: string | null;
  form_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Operational schedule modules
export interface PeriodicReviewRow {
  equipment_code: string;
  equipment_name: string;
  system_type?: string | null;
  make?: string | null;
  validation_status?: string | null;
  validation_date?: string | null;
  periodic_review_frequency?: number | null;
  last_review_date?: string | null;
  next_review_date?: string | null;
  notes?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface BackupScheduleRow {
  equipment_code: string;
  equipment_name: string;
  system_type?: string | null;
  make?: string | null;
  last_backup_date?: string | null;
  next_backup_date?: string | null;
  frequency_days?: number | null;
  notes?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface PMRow {
  equipment_code: string;
  equipment_name: string;
  system_type?: string | null;
  computer_system_id?: string | null;
  last_pm_date?: string | null;
  next_pm_date?: string | null;
  frequency_months?: number | null;
  notes?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

// Password Vault
export interface VaultEntry {
  id: number;
  owner_employee_id: string;
  equipment_code: string;
  equipment_name: string;
  password: string;
  created_date: string;
  expiry_days?: number | null;
  expiry_date?: string | null;
  updated_at: string;
}

// Validation alerts
export interface ValidationAlert {
  equipment_code: string;
  name: string;
  system_type?: string | null;
  validation_status: string;
  days_pending: number;
  created_at: string;
}
