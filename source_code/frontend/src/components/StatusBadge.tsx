import { Badge } from "./ui/Badge";
import type { RequestStatus } from "../types";

const config: Record<string, { label: string; tone: "amber" | "blue" | "purple" | "green" | "red" | "slate" }> = {
  PENDING_HOD: { label: "Pending HOD", tone: "amber" },
  PENDING_QA: { label: "Pending QA", tone: "blue" },
  IT_PENDING: { label: "IT Provisioning", tone: "purple" },
  PENDING_USER_ACK: { label: "User Acknowledgement", tone: "amber" },
  IT_COMPLETED: { label: "Access Granted", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
  PENDING_REVIEW: { label: "Pending review", tone: "amber" },
  PENDING_DEPARTMENT_APPROVAL: { label: "Department approval", tone: "amber" },
  PENDING_QA_APPROVAL: { label: "QA approval", tone: "purple" },
  PENDING_EXECUTION: { label: "Pending execution", tone: "blue" },
  PENDING_INITIATOR_ACK: { label: "Awaiting acknowledgement", tone: "blue" },
  CORRECTION_REQUIRED: { label: "Correction required", tone: "amber" },
  SUSPENDED: { label: "Suspended", tone: "amber" },
  CANCELLED: { label: "Cancelled", tone: "slate" },
  COMPLETED: { label: "Completed", tone: "green" },
};

export function StatusBadge({ status }: { status: RequestStatus | string }) {
  const { label, tone } = config[status] ?? { label: status, tone: "slate" as const };
  return <Badge tone={tone}>{label}</Badge>;
}
