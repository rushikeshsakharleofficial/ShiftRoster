import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { authApi, formatApiError } from "@/lib/api";
import { CalendarDays, ArrowRight, Loader2, Shield, KeyRound, Eye, EyeOff, Check } from "lucide-react";
import ThemeToggle from "@/components/layout/ThemeToggle";

// ─── Design tokens (inline styles to avoid config-missing Tailwind classes) ───
const T = {
  bgPage:       "#0F1117",
  bgLeft:       "#0C0E18",
  bgCard:       "#13151F",
  bgInput:      "#0F1117",
  border:       "#1E2235",
  borderFocus:  "#3B82F6",
  primary:      "#3B82F6",
  primaryDark:  "#2563EB",
  primaryDeep:  "#1D4ED8",
  textPrimary:  "#F1F5F9",
  textMuted:    "#64748B",
  textPlaceholder: "#334155",
  errorBg:      "rgba(239,68,68,0.1)",
  errorBorder:  "rgba(239,68,68,0.2)",
  errorText:    "#F87171",
};

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    backgroundColor: T.bgPage,
    fontFamily: "'Inter', sans-serif",
    color: T.textPrimary,
  },
  leftPanel: {
    width: "55%",
    backgroundColor: T.bgLeft,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "3rem",
    position: "relative",
    overflow: "hidden",
  },
  leftGlow: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse at 50% 50%, rgba(99,102,241,0.15), transparent 60%)",
    pointerEvents: "none",
  },
  leftContent: {
    position: "relative",
    zIndex: 1,
    maxWidth: "440px",
    width: "100%",
  },
  iconWrap: {
    width: "72px",
    height: "72px",
    borderRadius: "16px",
    backgroundColor: "rgba(59,130,246,0.12)",
    border: `1px solid rgba(59,130,246,0.25)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "2rem",
  },
  h1: {
    fontSize: "2.25rem",
    fontWeight: 700,
    letterSpacing: "-0.03em",
    color: T.textPrimary,
    marginBottom: "0.75rem",
    lineHeight: 1.15,
  },
  tagline: {
    fontSize: "1rem",
    color: T.textMuted,
    lineHeight: 1.6,
    marginBottom: "2.5rem",
  },
  featureList: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  featureItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    fontSize: "0.875rem",
    color: "#94A3B8",
  },
  checkIcon: {
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    backgroundColor: "rgba(59,130,246,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rightPanel: {
    width: "45%",
    backgroundColor: T.bgPage,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
  },
  card: {
    backgroundColor: T.bgCard,
    border: `1px solid ${T.border}`,
    borderRadius: "16px",
    padding: "2rem",
    width: "100%",
    maxWidth: "420px",
  },
  cardTitle: {
    fontSize: "1.625rem",
    fontWeight: 700,
    letterSpacing: "-0.025em",
    color: T.textPrimary,
    marginBottom: "0.375rem",
  },
  cardSubtitle: {
    fontSize: "0.875rem",
    color: T.textMuted,
    marginBottom: "1.75rem",
  },
  label: {
    display: "block",
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "#94A3B8",
    marginBottom: "0.375rem",
  },
  inputBase: {
    width: "100%",
    padding: "0.625rem 0.875rem",
    backgroundColor: T.bgInput,
    border: `1px solid ${T.border}`,
    borderRadius: "8px",
    color: T.textPrimary,
    fontSize: "0.9375rem",
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    boxSizing: "border-box",
  },
  inputFocus: {
    borderColor: T.borderFocus,
    boxShadow: `0 0 0 1px ${T.borderFocus}`,
  },
  passwordWrap: {
    position: "relative",
  },
  eyeBtn: {
    position: "absolute",
    right: "0.75rem",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: T.textMuted,
    padding: "0.25rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  rememberRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "0.25rem",
  },
  rememberLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  checkbox: {
    width: "16px",
    height: "16px",
    accentColor: T.primary,
    cursor: "pointer",
  },
  rememberLabel: {
    fontSize: "0.8125rem",
    color: "#94A3B8",
    cursor: "pointer",
  },
  forgotLink: {
    fontSize: "0.8125rem",
    color: T.primary,
    textDecoration: "none",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
  },
  submitBtn: {
    width: "100%",
    padding: "0.6875rem 1rem",
    background: `linear-gradient(135deg, ${T.primaryDark}, ${T.primary})`,
    border: "none",
    borderRadius: "8px",
    color: "#ffffff",
    fontWeight: 600,
    fontSize: "0.9375rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    transition: "opacity 0.15s ease, background 0.15s ease",
    marginTop: "1.25rem",
  },
  submitBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  errorBox: {
    padding: "0.75rem",
    borderRadius: "8px",
    backgroundColor: T.errorBg,
    border: `1px solid ${T.errorBorder}`,
    color: T.errorText,
    fontSize: "0.875rem",
    marginBottom: "1rem",
  },
  fieldGroup: {
    marginBottom: "1rem",
  },
  footerNote: {
    textAlign: "center",
    fontSize: "0.75rem",
    color: T.textMuted,
    marginTop: "1.5rem",
  },
  mfaCodeInput: {
    textAlign: "center",
    fontSize: "1.5rem",
    letterSpacing: "0.3em",
    fontFamily: "monospace",
  },
  divider: {
    height: "1px",
    backgroundColor: T.border,
    margin: "1.25rem 0",
  },
  // Single-panel centered layout for MFA screens
  centerPage: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.bgPage,
    fontFamily: "'Inter', sans-serif",
    color: T.textPrimary,
    padding: "1.5rem",
  },
  mfaCard: {
    backgroundColor: T.bgCard,
    border: `1px solid ${T.border}`,
    borderRadius: "16px",
    padding: "2rem",
    width: "100%",
    maxWidth: "400px",
  },
  mfaIconWrap: {
    width: "52px",
    height: "52px",
    borderRadius: "12px",
    backgroundColor: "rgba(59,130,246,0.12)",
    border: `1px solid rgba(59,130,246,0.25)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "1.25rem",
  },
  mfaTitle: {
    fontSize: "1.5rem",
    fontWeight: 700,
    letterSpacing: "-0.025em",
    color: T.textPrimary,
    marginBottom: "0.375rem",
  },
  mfaSubtitle: {
    fontSize: "0.875rem",
    color: T.textMuted,
    marginBottom: "1.5rem",
    lineHeight: 1.5,
  },
  ghostBtn: {
    width: "100%",
    padding: "0.625rem 1rem",
    background: "none",
    border: `1px solid ${T.border}`,
    borderRadius: "8px",
    color: "#94A3B8",
    fontWeight: 500,
    fontSize: "0.875rem",
    cursor: "pointer",
    marginTop: "0.75rem",
    transition: "border-color 0.15s ease",
  },
  qrWrap: {
    display: "flex",
    justifyContent: "center",
    padding: "1rem",
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    border: `1px solid ${T.border}`,
    marginBottom: "1rem",
  },
  manualKeyWrap: {
    marginBottom: "1rem",
  },
  manualKeyLabel: {
    fontSize: "0.75rem",
    color: T.textMuted,
    marginBottom: "0.375rem",
    display: "block",
  },
  manualKey: {
    display: "block",
    fontSize: "0.75rem",
    backgroundColor: T.bgInput,
    border: `1px solid ${T.border}`,
    borderRadius: "6px",
    padding: "0.5rem 0.75rem",
    fontFamily: "monospace",
    wordBreak: "break-all",
    userSelect: "all",
    color: "#94A3B8",
  },
};

// ─── Reusable styled input with focus state ───────────────────────────────────
function StyledInput({ id, style: extraStyle = {}, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      id={id}
      style={{
        ...styles.inputBase,
        ...(focused ? styles.inputFocus : {}),
        ...extraStyle,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
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
      <div style={styles.centerPage} data-testid="login-page">
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle />
        </div>
        <div style={styles.mfaCard}>
          <div style={styles.mfaIconWrap}>
            <Shield size={24} color={T.primary} />
          </div>

          <h1 style={styles.mfaTitle}>Two-factor verification</h1>
          <p style={styles.mfaSubtitle}>
            Open your authenticator app and enter the 6-digit code to continue.
          </p>

          <form onSubmit={handleVerifyMfa}>
            {error && (
              <div style={styles.errorBox}>{error}</div>
            )}

            <div style={styles.fieldGroup}>
              <label htmlFor="mfa-code" style={styles.label}>Authentication Code</label>
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
                style={styles.mfaCodeInput}
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              style={{
                ...styles.submitBtn,
                ...(loading || mfaCode.length < 6 ? styles.submitBtnDisabled : {}),
              }}
              disabled={loading || mfaCode.length < 6}
            >
              {loading
                ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                : <><span>Verify</span><ArrowRight size={16} /></>
              }
            </button>

            <button
              type="button"
              style={styles.ghostBtn}
              onClick={() => { setMfaStep(null); setMfaCode(""); setError(""); }}
            >
              Back to login
            </button>
          </form>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── MFA Setup Screen ───────────────────────────────────────────────────────
  if (mfaStep === "setup") {
    return (
      <div style={styles.centerPage} data-testid="login-page">
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle />
        </div>
        <div style={{ ...styles.mfaCard, maxWidth: "460px" }}>
          <div style={styles.mfaIconWrap}>
            <Shield size={24} color={T.primary} />
          </div>

          <h1 style={styles.mfaTitle}>Set up authenticator</h1>
          <p style={styles.mfaSubtitle}>
            Your administrator requires multi-factor authentication. Scan the QR code
            with Google Authenticator or any TOTP app, then enter the 6-digit code.
          </p>

          {mfaSetupData && (
            <>
              {error && (
                <div style={styles.errorBox}>{error}</div>
              )}

              <div style={styles.qrWrap}>
                <img src={mfaSetupData.qr_code} alt="MFA QR Code" style={{ width: "192px", height: "192px" }} />
              </div>

              <div style={styles.manualKeyWrap}>
                <span style={styles.manualKeyLabel}>Manual entry key</span>
                <code style={styles.manualKey}>{mfaSetupData.manual_entry_key}</code>
              </div>

              <div style={styles.divider} />

              <form onSubmit={handleConfirmMfaSetup}>
                <div style={styles.fieldGroup}>
                  <label htmlFor="setup-mfa-code" style={styles.label}>Verification Code</label>
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
                    style={styles.mfaCodeInput}
                    autoFocus
                    required
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    ...styles.submitBtn,
                    ...(loading || mfaCode.length < 6 ? styles.submitBtnDisabled : {}),
                  }}
                  disabled={loading || mfaCode.length < 6}
                >
                  {loading
                    ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                    : <><span>Activate MFA</span><ArrowRight size={16} /></>
                  }
                </button>
              </form>
            </>
          )}
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Standard Login Screen ──────────────────────────────────────────────────
  return (
    <div style={styles.page} data-testid="login-page">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      {/* Left panel — branding + features */}
      <div style={styles.leftPanel} className="hidden lg:flex">
        <div style={styles.leftGlow} aria-hidden="true" />

        <div style={styles.leftContent}>
          <div style={styles.iconWrap}>
            <CalendarDays size={48} color={T.primary} />
          </div>

          <h1 style={styles.h1}>ShiftRoster</h1>
          <p style={styles.tagline}>
            Intelligent shift management<br />for modern teams.
          </p>

          <ul style={styles.featureList} aria-label="Features">
            {FEATURES.map((feat) => (
              <li key={feat} style={styles.featureItem}>
                <span style={styles.checkIcon} aria-hidden="true">
                  <Check size={11} color={T.primary} strokeWidth={3} />
                </span>
                {feat}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right panel — login card */}
      <div style={styles.rightPanel} className="flex-1 lg:w-auto">
        <div style={styles.card}>
          {/* Mobile logo (hidden on lg+) */}
          <div
            className="flex lg:hidden items-center gap-2 mb-6"
            style={{ color: T.textPrimary }}
          >
            <div style={{ ...styles.checkIcon, width: "36px", height: "36px", borderRadius: "8px", backgroundColor: "rgba(59,130,246,0.12)" }}>
              <CalendarDays size={18} color={T.primary} />
            </div>
            <span style={{ fontWeight: 700, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>ShiftRoster</span>
          </div>

          <h2 style={styles.cardTitle}>Welcome back</h2>
          <p style={styles.cardSubtitle}>Sign in to your workspace</p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div data-testid="login-error" style={styles.errorBox}>{error}</div>
            )}

            {/* Email */}
            <div style={styles.fieldGroup}>
              <label htmlFor="email" style={styles.label}>Email or Username</label>
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
            <div style={styles.fieldGroup}>
              <label htmlFor="password" style={styles.label}>Password</label>
              <div style={styles.passwordWrap}>
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
                  style={styles.eyeBtn}
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
            <div style={styles.rememberRow}>
              <label style={styles.rememberLeft}>
                <input
                  id="remember-me"
                  type="checkbox"
                  style={styles.checkbox}
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  data-testid="remember-me-checkbox"
                />
                <span style={styles.rememberLabel}>Remember me for 30 days</span>
              </label>
              <button type="button" style={styles.forgotLink}>
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <button
              data-testid="login-submit-btn"
              type="submit"
              style={{
                ...styles.submitBtn,
                ...(loading ? styles.submitBtnDisabled : {}),
              }}
              disabled={loading}
            >
              {loading
                ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                : <><span>Sign In</span><ArrowRight size={16} /></>
              }
            </button>
          </form>

          <p style={styles.footerNote}>
            Account access is managed by your administrator.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        input::placeholder { color: ${T.textPlaceholder}; }
      `}</style>
    </div>
  );
}
