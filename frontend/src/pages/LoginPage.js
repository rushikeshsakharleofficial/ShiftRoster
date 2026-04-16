import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { authApi, formatApiError } from "@/lib/api";
import { CalendarDays, ArrowRight, Loader2, Shield, KeyRound, Eye, EyeOff, Check } from "lucide-react";
import ThemeToggle from "@/components/layout/ThemeToggle";

// ─── Reusable styled input with focus state ───────────────────────────────────
function StyledInput({ id, className = "", style: extraStyle = {}, ...props }) {
  return (
    <input
      id={id}
      className={[
        "w-full px-3.5 py-2.5 rounded-lg text-[0.9375rem]",
        "bg-background border border-border text-foreground",
        "placeholder:text-muted-foreground",
        "outline-none transition-colors duration-150",
        "focus:border-primary focus:ring-1 focus:ring-primary",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={Object.keys(extraStyle).length ? extraStyle : undefined}
      {...props}
    />
  );
}

// ─── Features shown on left panel ────────────────────────────────────────────
const FEATURES = [
  "Real-time shift scheduling & conflict detection",
  "Team presence tracking and notifications",
  "Attendance management with automated reports",
];

export default function LoginPage() {
  const { login, completeMfaLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  // ── MFA Verify Screen ──────────────────────────────────────────────────────
  if (mfaStep === "verify") {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background text-foreground p-6"
        style={{ fontFamily: "'Inter', sans-serif" }}
        data-testid="login-page"
      >
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle />
        </div>
        <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-[400px]">
          <div className="w-[52px] h-[52px] rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center mb-5">
            <Shield size={24} className="text-primary" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1.5">Two-factor verification</h1>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Open your authenticator app and enter the 6-digit code to continue.
          </p>

          <form onSubmit={handleVerifyMfa}>
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">{error}</div>
            )}

            <div className="mb-4">
              <label htmlFor="mfa-code" className="block text-[0.8125rem] font-medium text-muted-foreground mb-1.5">Authentication Code</label>
              <StyledInput
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

            <button
              type="submit"
              className={[
                "w-full py-[0.6875rem] px-4 mt-5 rounded-lg font-semibold text-[0.9375rem] text-white",
                "bg-gradient-to-br from-primary to-primary/80",
                "flex items-center justify-center gap-2",
                "transition-opacity duration-150",
                loading || mfaCode.length < 6 ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
              disabled={loading || mfaCode.length < 6}
            >
              {loading
                ? <Loader2 size={18} className="animate-spin" />
                : <><span>Verify</span><ArrowRight size={16} /></>
              }
            </button>

            <button
              type="button"
              className="w-full py-2.5 px-4 mt-3 rounded-lg border border-border text-muted-foreground font-medium text-sm transition-colors duration-150 hover:border-muted-foreground bg-transparent cursor-pointer"
              onClick={() => { setMfaStep(null); setMfaCode(""); setError(""); }}
            >
              Back to login
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── MFA Setup Screen ───────────────────────────────────────────────────────
  if (mfaStep === "setup") {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background text-foreground p-6"
        style={{ fontFamily: "'Inter', sans-serif" }}
        data-testid="login-page"
      >
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle />
        </div>
        <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-[460px]">
          <div className="w-[52px] h-[52px] rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center mb-5">
            <Shield size={24} className="text-primary" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1.5">Set up authenticator</h1>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Your administrator requires multi-factor authentication. Scan the QR code
            with Google Authenticator or any TOTP app, then enter the 6-digit code.
          </p>

          {mfaSetupData && (
            <>
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">{error}</div>
              )}

              <div className="flex justify-center p-4 bg-white rounded-lg border border-border mb-4">
                <img src={mfaSetupData.qr_code} alt="MFA QR Code" style={{ width: "192px", height: "192px" }} />
              </div>

              <div className="mb-4">
                <span className="block text-xs text-muted-foreground mb-1.5">Manual entry key</span>
                <code className="block text-xs bg-background border border-border rounded-md px-3 py-2 font-mono break-all select-all text-muted-foreground">
                  {mfaSetupData.manual_entry_key}
                </code>
              </div>

              <div className="h-px bg-border my-5" />

              <form onSubmit={handleConfirmMfaSetup}>
                <div className="mb-4">
                  <label htmlFor="setup-mfa-code" className="block text-[0.8125rem] font-medium text-muted-foreground mb-1.5">Verification Code</label>
                  <StyledInput
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

                <button
                  type="submit"
                  className={[
                    "w-full py-[0.6875rem] px-4 mt-5 rounded-lg font-semibold text-[0.9375rem] text-white",
                    "bg-gradient-to-br from-primary to-primary/80",
                    "flex items-center justify-center gap-2",
                    "transition-opacity duration-150",
                    loading || mfaCode.length < 6 ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                  disabled={loading || mfaCode.length < 6}
                >
                  {loading
                    ? <Loader2 size={18} className="animate-spin" />
                    : <><span>Activate MFA</span><ArrowRight size={16} /></>
                  }
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Standard Login Screen ──────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex bg-background text-foreground"
      style={{ fontFamily: "'Inter', sans-serif" }}
      data-testid="login-page"
    >
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Left panel — branding + features */}
      <div className="hidden lg:flex w-[55%] bg-sidebar items-center justify-center p-12 relative overflow-hidden">
        {/* subtle glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(99,102,241,0.15), transparent 60%)" }}
          aria-hidden="true"
        />

        <div className="relative z-10 max-w-[440px] w-full">
          <div className="w-[72px] h-[72px] rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center mb-8">
            <CalendarDays size={48} className="text-primary" />
          </div>

          <h1 className="text-[2.25rem] font-bold tracking-[-0.03em] text-foreground mb-3 leading-[1.15]">ShiftRoster</h1>
          <p className="text-base text-muted-foreground leading-relaxed mb-10">
            Intelligent shift management<br />for modern teams.
          </p>

          <ul className="flex flex-col gap-4" aria-label="Features">
            {FEATURES.map((feat) => (
              <li key={feat} className="flex items-center gap-3 text-sm text-slate-400">
                <span
                  className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <Check size={11} className="text-primary" strokeWidth={3} />
                </span>
                {feat}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right panel — login card */}
      <div className="flex-1 lg:w-auto bg-background flex items-center justify-center p-8">
        <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-[420px]">
          {/* Mobile logo (hidden on lg+) */}
          <div className="flex lg:hidden items-center gap-2 mb-6 text-foreground">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <CalendarDays size={18} className="text-primary" />
            </div>
            <span className="font-bold text-[1.1rem] tracking-[-0.02em]">ShiftRoster</span>
          </div>

          <h2 className="text-[1.625rem] font-bold tracking-[-0.025em] text-foreground mb-1.5">Welcome back</h2>
          <p className="text-sm text-muted-foreground mb-7">Sign in to your workspace</p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div data-testid="login-error" className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">{error}</div>
            )}

            {/* Email */}
            <div className="mb-4">
              <label htmlFor="email" className="block text-[0.8125rem] font-medium text-muted-foreground mb-1.5">Email or Username</label>
              <StyledInput
                id="email"
                data-testid="login-email-input"
                type="text"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Password */}
            <div className="mb-4">
              <label htmlFor="password" className="block text-[0.8125rem] font-medium text-muted-foreground mb-1.5">Password</label>
              <div className="relative">
                <StyledInput
                  id="password"
                  data-testid="login-password-input"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: "2.75rem" }}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-muted-foreground p-1 flex items-center justify-center"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOff size={16} />
                    : <Eye size={16} />
                  }
                </button>
              </div>
            </div>

            {/* Remember me + Forgot password */}
            <div className="flex items-center justify-between mt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="remember-me"
                  type="checkbox"
                  className="w-4 h-4 accent-primary cursor-pointer"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  data-testid="remember-me-checkbox"
                />
                <span className="text-[0.8125rem] text-slate-400 cursor-pointer">Remember me for 30 days</span>
              </label>
              <button type="button" className="text-[0.8125rem] text-primary bg-transparent border-none cursor-pointer p-0">
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <button
              data-testid="login-submit-btn"
              type="submit"
              className={[
                "w-full py-[0.6875rem] px-4 mt-5 rounded-lg font-semibold text-[0.9375rem] text-white",
                "bg-gradient-to-br from-primary to-primary/80",
                "flex items-center justify-center gap-2",
                "transition-opacity duration-150",
                loading ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
              disabled={loading}
            >
              {loading
                ? <Loader2 size={18} className="animate-spin" />
                : <><span>Sign In</span><ArrowRight size={16} /></>
              }
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Account access is managed by your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
