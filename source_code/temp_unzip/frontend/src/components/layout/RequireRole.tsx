import type { ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import type { Role } from "../../types";

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { currentUser } = useAuth();

  if (!currentUser || !roles.includes(currentUser.role)) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
        <p className="text-lg font-semibold text-slate-700">Access restricted</p>
        <p className="mt-1 text-sm">Your role does not have permission to view this page.</p>
      </div>
    );
  }

  return <>{children}</>;
}
