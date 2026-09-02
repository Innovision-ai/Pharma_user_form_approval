import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setDemoUser } from "../lib/api";
import type { User } from "../types";

const STORAGE_KEY = "pharma-demo-user";

interface AuthContextValue {
  currentUser: User | null;
  allUsers: User[];
  loading: boolean;
  switchUser: (employeeId: string) => Promise<void>;
  logout: () => void;
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshUsers = async () => {
    const users = await api.listUsers();
    setAllUsers(users);
  };

  useEffect(() => {
    (async () => {
      try {
        const users = await api.listUsers();
        setAllUsers(users);
        const savedId = localStorage.getItem(STORAGE_KEY);
        if (savedId) {
          const match = users.find((u) => u.employee_id === savedId && u.active);
          if (match) {
            setDemoUser(match.employee_id);
            setCurrentUser(match);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const switchUser = async (employeeId: string) => {
    setDemoUser(employeeId);
    const user = await api.whoAmI();
    setCurrentUser(user);
    localStorage.setItem(STORAGE_KEY, employeeId);
  };

  const logout = () => {
    setDemoUser(null);
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, allUsers, loading, switchUser, logout, refreshUsers }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
