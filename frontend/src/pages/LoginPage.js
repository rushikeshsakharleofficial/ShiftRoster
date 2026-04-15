import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { authApi, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarDays, ArrowRight, Loader2, Shield, KeyRound } from "lucide-react";

export default function LoginPage() {
  const { login, completeMfaLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // MFA state
  const [mfaStep, setMfaStep] = useState(null); // null | 'verify' | 'setup'
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSetupData, setMfaSetupData] = useState(null);
  const [mfaSecret, setMfaSecret] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password, rememberMe);

      if (result.mfa_required) {
        setMfaStep("verify");
        setMfaToken(result.mfa_token);
        setLoading(false);
        return;
      }

      if (result.mfa_setup_required) {
        setMfaStep("setup");
        setMfaToken(result.mfa_token);
        // Auto-trigger MFA setup
        try {
          const { data } = await authApi.setupMfa({ password }, result.mfa_token);
          setMfaSetupData(data);
          setMfaSecret(data.secret);
        } catch (err) {
          setError(formatApiError(err.response?.data?.detail));
        }
        setLoading(false);
        return;
      }

      navigate("/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMfa = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await authApi.verifyMfa({ mfa_token: mfaToken, code: mfaCode, remember_me: rememberMe });
      completeMfaLogin(data);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmMfaSetup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await authApi.confirmMfa(
        { code: mfaCode, secret: mfaSecret },
        mfaToken
      );
      completeMfaLogin(data);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  // MFA Verify Screen
  if (mfaStep === "verify") {
    return (
      <div className="min-h-screen flex" data-testid="login-page">
        <div className="flex-1 flex items-center justify-center p-6 md:p-12">
          <div className="w-full max-w-sm">
            <div className="flex items-center gap-2 mb-10">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold tracking-tight">Two-Factor Auth</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight mb-2">Enter MFA Code</h1>
            <p className="text-muted-foreground text-sm mb-8">
              Open your authenticator app and enter the 6-digit code
            </p>

            <form onSubmit={handleVerifyMfa} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="mfa-code">Authentication Code</Label>
                <Input
                  id="mfa-code"
                  data-testid="mfa-code-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-2xl tracking-[0.3em] font-mono"
                  autoFocus
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || mfaCode.length < 6}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Verify <ArrowRight className="h-4 w-4 ml-2" /></>}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm"
                onClick={() => { setMfaStep(null); setMfaCode(""); setError(""); }}
              >
                Back to login
              </Button>
            </form>
          </div>
        </div>
        <div className="hidden lg:flex flex-1 items-center justify-center bg-primary/5 relative overflow-hidden">
          <div className="relative z-10 max-w-md text-center px-8">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <KeyRound className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight mb-3">Secure Access</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Multi-factor authentication adds an extra layer of security to protect your account.
            </p>
          </div>
          <div className="absolute inset-0 opacity-[0.03]">
            <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-primary" />
            <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-primary" />
          </div>
        </div>
      </div>
    );
  }

  // MFA Setup Screen (mandated first-time)
  if (mfaStep === "setup") {
    return (
      <div className="min-h-screen flex" data-testid="login-page">
        <div className="flex-1 flex items-center justify-center p-6 md:p-12">
          <div className="w-full max-w-sm">
            <div className="flex items-center gap-2 mb-10">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold tracking-tight">MFA Setup Required</span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight mb-2">Set Up Authenticator</h1>
            <p className="text-muted-foreground text-sm mb-6">
              Your administrator requires multi-factor authentication. Scan the QR code with Google Authenticator or any TOTP app.
            </p>

            {mfaSetupData && (
              <div className="space-y-4">
                {error && (
                  <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
                    {error}
                  </div>
                )}
                <div className="flex justify-center p-4 bg-white rounded-lg border">
                  <img src={mfaSetupData.qr_code} alt="MFA QR Code" className="w-48 h-48" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Manual entry key</Label>
                  <code className="block text-xs bg-muted p-2 rounded font-mono break-all select-all">
                    {mfaSetupData.manual_entry_key}
                  </code>
                </div>
                <form onSubmit={handleConfirmMfaSetup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="setup-mfa-code">Verification Code</Label>
                    <Input
                      id="setup-mfa-code"
                      data-testid="mfa-setup-code-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                      className="text-center text-2xl tracking-[0.3em] font-mono"
                      autoFocus
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading || mfaCode.length < 6}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Activate MFA <ArrowRight className="h-4 w-4 ml-2" /></>}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
        <div className="hidden lg:flex flex-1 items-center justify-center bg-primary/5 relative overflow-hidden">
          <div className="relative z-10 max-w-md text-center px-8">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Shield className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight mb-3">Security First</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Protect your account with time-based one-time passwords from your authenticator app.
            </p>
          </div>
          <div className="absolute inset-0 opacity-[0.03]">
            <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-primary" />
            <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-primary" />
          </div>
        </div>
      </div>
    );
  }

  // Standard Login Screen
  return (
    <div className="min-h-screen flex" data-testid="login-page">
      {/* Left panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-10">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-xl font-semibold tracking-tight">ShiftRoster</span>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Open Source</p>
            </div>
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
              <Label htmlFor="email">Email or Username</Label>
              <Input
                id="email"
                data-testid="login-email-input"
                type="text"
                placeholder="you@company.com or your.username"
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
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(!!checked)}
                data-testid="remember-me-checkbox"
              />
              <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                Remember me for 30 days
              </Label>
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

          <p className="text-center text-xs text-muted-foreground mt-8">
            Account access is managed by your administrator.
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
