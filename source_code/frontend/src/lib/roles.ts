/** Display labels only. DB / API role codes are unchanged. */
export const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Initiator",
  HOD: "Reviewer",
  QA: "QA Approver",
  ADMIN: "IT Executor",
  IT: "IT Support",
  INVENTORY_REQUESTOR: "Inventory Requestor",
};

export const roleLabel = (role?: string | null) => (role ? ROLE_LABELS[role] ?? role : "");

/** Roles selectable when creating/editing users (IT kept so existing IT users stay valid). */
export const ASSIGNABLE_ROLES = ["EMPLOYEE", "HOD", "QA", "ADMIN", "IT", "INVENTORY_REQUESTOR"] as const;

/** Equipment lifecycle wording used everywhere: Active / Retired. */
export const lifecycleLabel = (active: boolean) => (active ? "Active" : "Retired");
