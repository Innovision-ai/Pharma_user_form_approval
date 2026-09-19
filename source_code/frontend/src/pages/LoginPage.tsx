import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not sign in", "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] h-[50vh] w-[50vw] rounded-full bg-brand-400/20 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[50vh] w-[50vw] rounded-full bg-indigo-500/20 blur-[120px]" />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md p-8"
      >
        <div className="glass-panel p-10">
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
            <p className="mt-2 text-sm text-slate-500 font-medium">Enterprise Equipment Access</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Employee ID
              </label>
              <Input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. EMP001"
                disabled={pending}
                className="bg-white/50 backdrop-blur-sm border-white/40 shadow-inner focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <Input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={pending}
                className="bg-white/50 backdrop-blur-sm border-white/40 shadow-inner focus:bg-white"
              />
            </div>
            <Button 
              type="submit" 
              disabled={pending || !username || !password} 
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
    </div>
  );
}
