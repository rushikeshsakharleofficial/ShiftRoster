import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { CalendarDays, ArrowRight, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" data-testid="login-page">
      {/* Left panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-10">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold tracking-tight">ShiftMaster</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome back</h1>
          <p className="text-muted-foreground text-sm mb-8">Sign in to manage your shifts and team</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div data-testid="login-error" className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-testid="login-email-input"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                data-testid="login-password-input"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              data-testid="login-submit-btn"
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign In <ArrowRight className="h-4 w-4 ml-2" /></>}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{" "}
            <Link to="/register" className="text-primary hover:underline font-medium" data-testid="register-link">
              Create one
            </Link>
          </p>
        </div>
      </div>

      {/* Right panel - Visual */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-primary/5 relative overflow-hidden">
        <div className="relative z-10 max-w-md text-center px-8">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <CalendarDays className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight mb-3">
            Shift Roster & Management
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Streamline scheduling, manage teams, track attendance, and keep everyone in sync with real-time presence and notifications.
          </p>
        </div>
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-primary" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
}
