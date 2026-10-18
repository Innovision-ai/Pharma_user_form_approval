import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Input";
import { api } from "../lib/api";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [plants, setPlants] = useState<string[]>([]);
  const [plant, setPlant] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const reason = sessionStorage.getItem("pharma-logout-reason");
    if (reason) { setNotice(reason); sessionStorage.removeItem("pharma-logout-reason"); }
  }, []);

  // Plants available to this username (login is allowed only for these)
  useEffect(() => {
    const id = username.trim();
    if (!id) { setPlants([]); setPlant(""); return; }
    setLookingUp(true);
    const t = window.setTimeout(() => {
      api.getLoginPlants(id)
        .then(({ plants }) => {
          setPlants(plants);
          setPlant((current) => (plants.includes(current) ? current : plants[0] ?? ""));
        })
        .catch(() => setPlants([]))
        .finally(() => setLookingUp(false));
    }, 350);
    return () => window.clearTimeout(t);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plant) return showToast("Select the plant you want to log in to.", "error");
    setPending(true);
    try {
      await login(username.trim(), password, plant);
      navigate("/dashboard");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not sign in", "error");
    } finally {
      setPending(false);
    }
  };

  const plantPlaceholder = !username.trim()
    ? "Enter username first"
    : lookingUp ? "Checking plants..." : "No plant access for this username";

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-50 bg-cover bg-center"
      style={{ backgroundImage: "url(/login-bg.svg)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md p-8"
      >
        <div className="glass-panel bg-white/75 p-10">
          <div className="flex flex-col items-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-700 text-white text-2xl font-bold shadow-lg shadow-brand-500/30"
            >
              QZ
            </motion.div>
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900">Qualizone</h1>
            <p className="mt-2 text-sm text-slate-500 font-medium">Equipment Access Management</p>
          </div>

          {notice && (
            <p className="mb-5 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-800">{notice}</p>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Username</label>
              <Input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                disabled={pending}
                className="bg-white/60 border-white/40 shadow-inner focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Plant</label>
              <Select
                required
                value={plant}
                onChange={(e) => setPlant(e.target.value)}
                disabled={pending || plants.length === 0}
                className="bg-white/60 border-white/40 shadow-inner focus:bg-white"
              >
                {plants.length === 0 && <option value="">{plantPlaceholder}</option>}
                {plants.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Password</label>
              <Input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={pending}
                className="bg-white/60 border-white/40 shadow-inner focus:bg-white"
              />
            </div>
            <Button
              type="submit"
              disabled={pending || !username || !password || !plant}
              className="mt-4 w-full h-12 text-base shadow-[0_4px_14px_0_rgb(99,102,241,0.39)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.23)] hover:bg-indigo-500"
            >
              {pending ? "Authenticating..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-8 text-center text-xs font-medium text-slate-400">
            <p>Demo accounts (password: password123):</p>
            <p className="mt-1 text-slate-500">EMP001, HOD001, QA001, IT001, ADM001</p>
          </div>
        </div>
      </motion.div>

      <footer className="relative z-10 pb-6 text-center text-xs font-medium text-slate-500">
        Powered by <span className="font-bold text-slate-700">Air Care Zone</span>
        <span className="mx-2 text-slate-300">|</span>
        © {new Date().getFullYear()} Air Care Zone. All rights reserved.
      </footer>
    </div>
  );
}
