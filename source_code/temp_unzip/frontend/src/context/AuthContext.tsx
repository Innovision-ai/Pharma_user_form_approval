import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken } from "../lib/api";
import type { User } from "../types";

interface AuthContextValue {
  currentUser: User | null;
  loading: boolean;
  login: (username: string, pin: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("pharma-jwt-token");
        if (token) {
          setToken(token);
          const user = await api.whoAmI();
          setCurrentUser(user);
        }
      } catch (err) {
        setToken(null);
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (username: string, pin: string) => {
    const { access_token } = await api.login(username, pin);
    setToken(access_token);
    const user = await api.whoAmI();
    setCurrentUser(user);
  };

  const logout = () => {
    setToken(null);
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, loading, login, logout }}
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
