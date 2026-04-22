import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { authApi, orgApi, slackSsoApi, googleSsoApi, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, Shield, Eye, EyeOff, Check } from "lucide-react";
import ThemeToggle from "@/components/layout/ThemeToggle";

function StyledInput({ id, className = "", style: extraStyle = {}, ...props }) {
  return (
    <input
      id={id}
      className={[
        "w-full px-3.5 py-2.5 rounded-lg text-[0.9375rem]",
        "bg-background/50 dark:bg-white/[0.04]",
        "border border-input dark:border-white/[0.09]",
        "text-foreground placeholder:text-muted-foreground/50",
        "outline-none transition-all duration-200",
        "focus:border-primary/70 dark:focus:border-primary/60",
        "focus:ring-1 focus:ring-primary/20 dark:focus:ring-primary/15",
        "focus:bg-background dark:focus:bg-white/[0.06]",
        className,
      ].filter(Boolean).join(" ")}
      style={Object.keys(extraStyle).length ? extraStyle : undefined}
      {...props}
    />
  );
}

const FEATURES = [
  "Real-time shift scheduling & conflict detection",
  "Team presence tracking and notifications",
  "Attendance management with automated reports",
];

/* ── Shared background blobs for auth screens ── */
function AuthBg() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden" aria-hidden="true">
      <div className="absolute top-[-15%] left-[-5%] w-[55vw] h-[55vh] rounded-full bg-primary/[0.07] blur-[110px]" />
      <div className="absolute bottom-[-10%] right-[0%] w-[45vw] h-[45vh] rounded-full bg-secondary/[0.05] blur-[90px]" />
    </div>
  );
}

/* ── Shared submit button style ── */
function SubmitBtn({ loading, disabled, children }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className={[
        "w-full py-[0.7rem] px-4 mt-5 rounded-lg font-semibold text-[0.9375rem] text-white",
        "bg-gradient-to-r from-primary via-primary to-primary/80",
        "hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-px",
        "flex items-center justify-center gap-2 transition-all duration-200",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        (loading || disabled) ? "opacity-50 cursor-not-allowed translate-y-0 shadow-none" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function LoginPage() {
  const { login, completeMfaLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [orgBrand, setOrgBrand] = useState({ name: "ShiftRoster", logo_url: "" });
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    orgApi.get().then(({ data }) => {
      setOrgBrand({ name: data.brand_name || data.name || "ShiftRoster", logo_url: data.logo_url || "" });
      setSlackEnabled(!!data.slack_enabled);
      setGoogleEnabled(!!data.google_enabled);
    }).catch(() => {});
    slackSsoApi.getConfig().then(({ data }) => setSlackEnabled(!!data.enabled)).catch(() => {});
    googleSsoApi.getConfig().then(({ data }) => setGoogleEnabled(!!data.enabled)).catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const slackError = params.get("error");
    if (slackError === "slack_approval_pending") setError("Your Slack account is pending admin approval.");
    else if (slackError === "slack_denied") setError("Slack sign-in was cancelled.");
    else if (slackError === "slack_workspace_not_configured") setError("Slack SSO is not fully configured. Contact your administrator.");
    else if (slackError === "slack_workspace_not_allowed") setError("Your Slack workspace is not allowed for this organization.");
    else if (slackError) setError("Slack sign-in failed. Please try again or contact your administrator.");

    const googleError = params.get("error");
    if (googleError === "google_approval_pending") setError("Your Google account is pending admin approval.");
    else if (googleError === "google_denied") setError("Google sign-in was cancelled.");
    else if (googleError === "google_domain_not_configured") setError("Google SSO is not fully configured. Contact your administrator.");
    else if (googleError === "google_domain_not_allowed") setError("Your Google account domain is not allowed for this organization.");
    else if (googleError && googleError.startsWith("google_")) setError("Google sign-in failed. Please try again or contact your administrator.");
  }, []);

  const [mfaStep, setMfaStep] = useState(null);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSetupData, setMfaSetupData] = useState(null);
  const [mfaSecret, setMfaSecret] = useState("");

  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryType, setRecoveryType] = useState("mfa");

  const handleRecoveryRequest = async () => {
    setRecoveryLoading(true);
    try {
      const endpoint = recoveryType === "password" ? "/forgot-password" : "/mfa-recovery-request";
      await authApi.post(endpoint, { email: recoveryEmail || email, message: recoveryMessage });
      setRecoverySent(true);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password, rememberMe);
      if (result.mfa_required) { setMfaStep("verify"); setMfaToken(result.mfa_token); setLoading(false); return; }
      if (result.mfa_setup_required) {
        setMfaStep("setup"); setMfaToken(result.mfa_token);
        try {
          const { data } = await authApi.setupMfa({ password }, result.mfa_token);
          setMfaSetupData(data); setMfaSecret(data.secret);
        } catch (err) { setError(formatApiError(err.response?.data?.detail)); }
        setLoading(false); return;
      }
      navigate("/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  const handleVerifyMfa = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const { data } = await authApi.verifyMfa({ mfa_token: mfaToken, code: mfaCode, remember_me: rememberMe });
      completeMfaLogin(data); navigate("/");
    } catch (err) { setError(formatApiError(err.response?.data?.detail) || err.message); }
    finally { setLoading(false); }
  };

  const handleConfirmMfaSetup = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const { data } = await authApi.confirmMfa({ code: mfaCode, secret: mfaSecret }, mfaToken);
      completeMfaLogin(data); navigate("/");
    } catch (err) { setError(formatApiError(err.response?.data?.detail) || err.message); }
    finally { setLoading(false); }
  };

  /* ── Recovery modal (shared) ── */
  const RecoveryModal = () => recoveryOpen ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-background/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-card/90 backdrop-blur-2xl border border-border/60 dark:border-white/[0.08] rounded-2xl p-8 w-full max-w-[420px] shadow-2xl shadow-black/30 animate-in zoom-in-95 duration-200">
        <h2 className="font-display text-xl text-foreground mb-2">
          {recoveryType === "password" ? "Reset Password" : "Request MFA Reset"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {recoverySent
            ? "Instructions sent. If no email arrived, contact your manager for a manual setup link."
            : recoveryType === "password"
              ? "Enter your email to receive a reset link. If no email service is configured, this notifies your manager."
              : "Lost your device and backup codes? Enter your email to request a manual reset from your manager."}
        </p>
        {!recoverySent ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email Address</label>
              <StyledInput value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder="your@email.com" />
            </div>
            {recoveryType === "mfa" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Message (Optional)</label>
                <textarea
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-background/50 dark:bg-white/[0.04] border border-input dark:border-white/[0.09] text-foreground outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/20 min-h-[80px] resize-none transition-all duration-200"
                  placeholder="e.g. Lost my phone while traveling"
                  value={recoveryMessage}
                  onChange={(e) => setRecoveryMessage(e.target.value)}
                />
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setRecoveryOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleRecoveryRequest} disabled={recoveryLoading || !recoveryEmail}>
                {recoveryLoading ? <Loader2 className="animate-spin h-4 w-4 mr-1" /> : null}
                {recoveryType === "password" ? "Reset" : "Send"}
              </Button>
            </div>
          </div>
        ) : (
          <Button className="w-full" onClick={() => setRecoveryOpen(false)}>Got it</Button>
        )}
      </div>
    </div>
  ) : null;

  /* ── MFA Verify Screen ── */
  if (mfaStep === "verify") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6" data-testid="login-page">
        <AuthBg />
        <div className="fixed top-4 right-4 z-50"><ThemeToggle /></div>

        <div className="w-full max-w-[400px] animate-in fade-in slide-in-from-bottom-4 duration-600">
          <div className="bg-card/80 backdrop-blur-2xl border border-border/60 dark:border-white/[0.07] rounded-2xl p-8 shadow-2xl shadow-black/20 dark:shadow-black/50">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
              <Shield size={20} className="text-primary" />
            </div>
            <h1 className="font-display text-2xl text-foreground mb-2">Two-factor verification</h1>
            <p className="text-sm text-muted-foreground mb-7 leading-relaxed">
              Open your authenticator app and enter the 6-digit code.
            </p>

            <form onSubmit={handleVerifyMfa}>
              {error && <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm mb-4">{error}</div>}
              <div className="mb-4">
                <label htmlFor="mfa-code" className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Authentication Code</label>
                <StyledInput
                  id="mfa-code" data-testid="mfa-code-input"
                  type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  placeholder="000 000"
                  value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-2xl tracking-[0.4em] font-mono-data"
                  autoFocus required
                />
              </div>
              <SubmitBtn loading={loading} disabled={mfaCode.length < 6}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : <><span>Verify</span><ArrowRight size={16} /></>}
              </SubmitBtn>
              <button type="button"
                className="w-full py-2.5 px-4 mt-3 rounded-lg border border-border/70 text-muted-foreground font-medium text-sm transition-all duration-200 hover:border-primary/40 hover:text-foreground bg-transparent cursor-pointer"
                onClick={() => { setMfaStep(null); setMfaCode(""); setError(""); }}>
                Back to login
              </button>
              <button type="button"
                onClick={() => { setRecoveryEmail(email); setRecoveryOpen(true); setRecoverySent(false); }}
                className="w-full mt-4 text-xs text-muted-foreground hover:text-primary transition-colors font-medium underline-offset-4 hover:underline">
                Lost MFA access?
              </button>
            </form>
          </div>
        </div>
        <RecoveryModal />
      </div>
    );
  }

  /* ── MFA Setup Screen ── */
  if (mfaStep === "setup") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6" data-testid="login-page">
        <AuthBg />
        <div className="fixed top-4 right-4 z-50"><ThemeToggle /></div>

        <div className="w-full max-w-[460px] animate-in fade-in slide-in-from-bottom-4 duration-600">
          <div className="bg-card/80 backdrop-blur-2xl border border-border/60 dark:border-white/[0.07] rounded-2xl p-8 shadow-2xl shadow-black/20 dark:shadow-black/50">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
              <Shield size={20} className="text-primary" />
            </div>
            <h1 className="font-display text-2xl text-foreground mb-2">Set up authenticator</h1>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Your administrator requires MFA. Scan the QR code with Google Authenticator or any TOTP app.
            </p>

            {mfaSetupData && (
              <>
                {error && <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm mb-4">{error}</div>}
                <div className="flex justify-center p-4 bg-white rounded-xl border border-border mb-4">
                  <img src={mfaSetupData.qr_code} alt="MFA QR Code" style={{ width: "192px", height: "192px" }} />
                </div>
                <div className="mb-5">
                  <span className="block text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Manual entry key</span>
                  <code className="block text-xs bg-muted/50 border border-border/50 rounded-lg px-3 py-2 font-mono-data break-all select-all text-muted-foreground">
                    {mfaSetupData.manual_entry_key}
                  </code>
                </div>
                <div className="h-px bg-border/50 my-5" />
                <form onSubmit={handleConfirmMfaSetup}>
                  <div className="mb-4">
                    <label htmlFor="setup-mfa-code" className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Verification Code</label>
                    <StyledInput
                      id="setup-mfa-code" data-testid="mfa-setup-code-input"
                      type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                      placeholder="000 000"
                      value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                      className="text-center text-2xl tracking-[0.4em] font-mono-data"
                      autoFocus required
                    />
                  </div>
                  <SubmitBtn loading={loading} disabled={mfaCode.length < 6}>
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <><span>Activate MFA</span><ArrowRight size={16} /></>}
                  </SubmitBtn>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Standard Login Screen ── */
  return (
    <div className="min-h-screen flex bg-background text-foreground" data-testid="login-page">
      <div className="fixed top-4 right-4 z-50"><ThemeToggle /></div>

      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex w-[52%] relative overflow-hidden items-center justify-center"
        style={{ background: "linear-gradient(145deg, #03070D 0%, #050C17 50%, #060E1C 100%)" }}>

        {/* Dot-grid overlay */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(59,130,246,0.14) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }} />

        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true"
          style={{ background: "radial-gradient(ellipse at 38% 55%, rgba(59,130,246,0.20) 0%, transparent 58%)" }} />

        {/* Top-right accent */}
        <div className="absolute top-0 right-0 w-[40%] h-[40%] pointer-events-none" aria-hidden="true"
          style={{ background: "radial-gradient(ellipse at 80% 10%, rgba(99,102,241,0.10) 0%, transparent 50%)" }} />

        <div className="relative z-10 px-14 py-16 max-w-[480px] w-full dispatch-stagger">
          {/* Logo */}
          {orgBrand.logo_url && (
            <div className="mb-10 w-14 h-14 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-xl shadow-blue-500/20 shrink-0">
              <img src={orgBrand.logo_url} alt="logo" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Brand headline */}
          <h1 className="font-display text-[3rem] leading-[1.08] text-white mb-3">
            {orgBrand.name}
          </h1>

          {/* Italic tagline */}
          <p className="font-display italic text-[1.25rem] leading-relaxed mb-12"
            style={{ color: "rgba(147,197,253,0.75)" }}>
            Intelligent shift management<br />for modern teams.
          </p>

          {/* Numbered features */}
          <ul className="space-y-6 mb-14">
            {FEATURES.map((feat, i) => (
              <li key={feat} className="flex items-start gap-4">
                <span className="font-mono-data text-[11px] text-blue-500/50 pt-0.5 shrink-0 tabular-nums leading-relaxed">
                  0{i + 1}
                </span>
                <span className="text-[0.875rem] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {feat}
                </span>
              </li>
            ))}
          </ul>

          {/* Bottom rule */}
          <div className="flex items-center gap-4">
            <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.06)" }} />
            <span className="font-mono-data text-[9px] uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.18)" }}>
              Secure · Reliable · Always-on
            </span>
            <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>
        </div>
      </div>

      {/* ── Right credentials panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {/* Subtle bg blobs for right panel (dark mode only) */}
        <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute bottom-[-5%] right-[-5%] w-[50vw] h-[50vh] rounded-full opacity-0 dark:opacity-100 bg-secondary/[0.05] blur-[100px]" />
        </div>

        <div className="w-full max-w-[400px] dispatch-stagger">
          {/* Mobile brand (hidden lg+) */}
          <div className="flex lg:hidden items-center gap-3 mb-8">
            {orgBrand.logo_url && (
              <div className="w-9 h-9 rounded-xl overflow-hidden border border-border">
                <img src={orgBrand.logo_url} alt="logo" className="w-full h-full object-cover" />
              </div>
            )}
            <span className="font-display text-xl text-foreground">{orgBrand.name}</span>
          </div>

          {/* ── Glass card ── */}
          <div className="bg-card/80 dark:bg-card/60 backdrop-blur-2xl border border-border/60 dark:border-white/[0.07] rounded-2xl p-8 shadow-2xl shadow-black/10 dark:shadow-black/50">
            <h2 className="font-display text-[1.875rem] text-foreground mb-1">Welcome back</h2>
            <p className="text-sm text-muted-foreground mb-7">Sign in to your workspace</p>

            <form onSubmit={handleSubmit}>
              {error && (
                <div data-testid="login-error" className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm mb-5">
                  {error}
                </div>
              )}

              {/* Email */}
              <div className="mb-4">
                <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Email or Username
                </label>
                <StyledInput
                  id="email" data-testid="login-email-input"
                  type="text" placeholder="you@company.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} required
                />
              </div>

              {/* Password */}
              <div className="mb-4">
                <label htmlFor="password" className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <StyledInput
                    id="password" data-testid="login-password-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingRight: "2.75rem" }} required
                  />
                  <button type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground p-1 transition-colors"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Remember + Forgot */}
              <div className="flex items-center justify-between mt-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative">
                    <input
                      id="remember-me" type="checkbox"
                      className="sr-only peer"
                      checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}
                      data-testid="remember-me-checkbox"
                    />
                    <div className="w-4 h-4 rounded border border-input bg-background/50 dark:bg-white/[0.04] peer-checked:bg-primary peer-checked:border-primary transition-all flex items-center justify-center">
                      {rememberMe && <Check size={10} className="text-white" strokeWidth={3} />}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                    Remember me 30 days
                  </span>
                </label>
                <button type="button"
                  onClick={() => { setRecoveryEmail(email); setRecoveryOpen(true); setRecoverySent(false); setRecoveryType("password"); }}
                  className="text-xs text-primary/80 hover:text-primary transition-colors hover:underline underline-offset-4 bg-transparent border-none cursor-pointer p-0">
                  Forgot password?
                </button>
              </div>

              <SubmitBtn loading={loading} disabled={false}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : <><span>Sign In</span><ArrowRight size={16} /></>}
              </SubmitBtn>
            </form>

            {/* SSO */}
            {(slackEnabled || googleEnabled) && (
              <div className="mt-5 space-y-3">
                <div className="relative flex items-center gap-3">
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">or continue with</span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
                {slackEnabled && (
                  <a href="/api/auth/slack/login"
                    className="w-full flex items-center justify-center gap-3 py-[0.65rem] px-4 rounded-lg font-medium text-sm border border-border/70 dark:border-white/[0.08] bg-card/50 hover:bg-accent text-foreground transition-all duration-200 hover:-translate-y-px hover:shadow-sm">
                    <svg width="18" height="18" viewBox="0 0 122.8 122.8" aria-hidden="true">
                      <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#E01E5A"/>
                      <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36C5F0"/>
                      <path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2EB67D"/>
                      <path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ECB22E"/>
                    </svg>
                    Sign in with Slack
                  </a>
                )}
                {googleEnabled && (
                  <a href="/api/auth/google/login"
                    className="w-full flex items-center justify-center gap-3 py-[0.65rem] px-4 rounded-lg font-medium text-sm border border-border/70 dark:border-white/[0.08] bg-card/50 hover:bg-accent text-foreground transition-all duration-200 hover:-translate-y-px hover:shadow-sm">
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign in with Google
                  </a>
                )}
              </div>
            )}
          </div>

          <p className="text-center text-[11px] text-muted-foreground/50 mt-5">
            Account access is managed by your administrator.
          </p>
        </div>
      </div>

      <RecoveryModal />
    </div>
  );
}
