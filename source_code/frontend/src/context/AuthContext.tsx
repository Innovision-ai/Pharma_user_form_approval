import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, setToken } from "../lib/api";
import type { User } from "../types";

/** Auto log off after this many minutes without mouse / keyboard activity. */
const IDLE_TIMEOUT_MINUTES = 15;

interface AuthContextValue {
  currentUser: User | null;
  /** Plant chosen at login; every page shows only this plant's data. */
  plant: string | null;
  loading: boolean;
  login: (username: string, password: string, plant: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const idleTimer = useRef<number | undefined>(undefined);

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

  const login = async (username: string, password: string, plant: string) => {
    const { access_token } = await api.login(username, password, plant);
    setToken(access_token);
    const user = await api.whoAmI();
    setCurrentUser(user);
  };

  const logout = useCallback(() => {
    setToken(null);
    setCurrentUser(null);
  }, []);

  const refreshUser = async () => setCurrentUser(await api.whoAmI());

  // Auto log off on inactivity (password policy)
  useEffect(() => {
    if (!currentUser) return;
    const reset = () => {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        logout();
        sessionStorage.setItem("pharma-logout-reason", `Signed out after ${IDLE_TIMEOUT_MINUTES} minutes of inactivity.`);
        window.location.assign("/login");
      }, IDLE_TIMEOUT_MINUTES * 60_000);
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [currentUser, logout]);

  const plant = currentUser ? currentUser.selected_plant ?? currentUser.plant : null;

  return (
    <AuthContext.Provider
      value={{ currentUser, plant, loading, login, logout, refreshUser }}
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
