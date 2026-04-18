import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { authApi, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, KeyRound, CheckCircle2, ShieldCheck, Eye, EyeOff, AlertCircle } from "lucide-react";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { toast } from "sonner";

export default function SetupPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const passwordValidation = {
    length: password.length >= 12,
    hasNumber: /[0-9]/.test(password),
    hasUpper: /[A-Z]/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  const isPasswordValid = Object.values(passwordValidation).every(v => v);
  const matches = password === confirmPassword && confirmPassword !== "";

  useEffect(() => {
    if (!token) {
      setError("Missing setup token. Please check your email link.");
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isPasswordValid) return;
    if (!matches) {
      setError("Passwords do not match");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await authApi.post("/setup-password", { token, password });
      setSuccess(true);
      toast.success("Password set successfully!");
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-[420px] text-center p-6 border-emerald-500/20 bg-emerald-500/[0.02]">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center animate-bounce">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold mb-2">Setup Complete!</CardTitle>
          <CardDescription className="text-base mb-6">
            Your password has been successfully set. You can now access your ShiftMaster dashboard.
          </CardDescription>
          <Button className="w-full h-11 text-base font-bold" asChild>
            <Link to="/login">Go to Login</Link>
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">Redirecting to login in a few seconds...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary" />
      </div>

      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-[420px] relative z-10 shadow-2xl border-border/50">
        <CardHeader className="space-y-1 pb-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center mb-4">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Set Your Password</CardTitle>
          <CardDescription>
            Choose a strong password to secure your account.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold">New Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 12 characters"
                  className="pr-10 h-11"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Confirm Password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="h-11"
                required
              />
            </div>

            {/* Validation Checklist */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {[
                { label: "12+ characters", met: passwordValidation.length },
                { label: "Number", met: passwordValidation.hasNumber },
                { label: "Uppercase", met: passwordValidation.hasUpper },
                { label: "Special char", met: passwordValidation.hasSpecial },
              ].map((req, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${req.met ? "bg-emerald-500" : "bg-muted"}`}>
                    {req.met && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className={`text-[11px] font-medium transition-colors ${req.met ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground"}`}>
                    {req.label}
                  </span>
                </div>
              ))}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-11 text-base font-bold shadow-lg shadow-primary/20" 
              disabled={loading || !isPasswordValid || !matches || !token}
            >
              {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
              Secure Account
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-border mt-4 pt-6 pb-6">
          <p className="text-xs text-muted-foreground">
            Having trouble? Contact your manager for help.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
