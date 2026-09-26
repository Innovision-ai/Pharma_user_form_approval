import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white text-sm font-bold">
            QZ
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Qualizone</h1>
            <p className="text-sm text-slate-500">Equipment Access</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-500 mb-6">
          Sign in to your account
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Employee ID
            </label>
            <Input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. EMP001"
              disabled={pending}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <Input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={pending}
            />
          </div>
          <Button type="submit" disabled={pending || !username || !password} className="mt-2 w-full">
            {pending ? "Signing in..." : "Sign In"}
          </Button>
        </form>
        <div className="mt-6 text-xs text-slate-500 text-center">
          <p>Demo accounts (password: password123):</p>
          <p>EMP001, HOD001, QA001, IT001, ADM001</p>
        </div>
      </div>
    </div>
  );
}
