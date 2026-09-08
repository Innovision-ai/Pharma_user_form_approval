import { Badge } from "./ui/Badge";
import type { RequestStatus } from "../types";

const config: Record<RequestStatus, { label: string; tone: "amber" | "blue" | "purple" | "green" | "red" }> = {
  PENDING_HOD: { label: "Pending HOD", tone: "amber" },
  PENDING_QA: { label: "Pending QA", tone: "blue" },
  IT_PENDING: { label: "IT Provisioning", tone: "purple" },
  PENDING_USER_ACK: { label: "User Acknowledgement", tone: "amber" },
  IT_COMPLETED: { label: "Access Granted", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  const { label, tone } = config[status];
  return <Badge tone={tone}>{label}</Badge>;
}
