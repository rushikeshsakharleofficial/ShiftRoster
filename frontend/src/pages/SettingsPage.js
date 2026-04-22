import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { orgApi, authApi, usersApi, ldapApi, slackSsoApi, googleSsoApi, formatApiError } from "@/lib/api";
import AccessRuleBook from "@/components/AccessRuleBook";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/liquid-toggle";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Settings as SettingsIcon, Loader2, Save, Shield, ShieldCheck, ShieldOff, QrCode, KeyRound, Clock, Copy, Download, Share2, AlertTriangle, ImageIcon, Upload, X, Mail, Server, Eye, EyeOff, Lock, Trash2, Zap, Building2, MessageSquare, BookOpen, LogIn } from "lucide-react";
import { generateMnemonic } from "@/lib/crypto";

export default function SettingsPage() {
  const { user, checkAuth } = useAuth();
  const isAdmin = user?.system_role === "admin";
  const isManager = user?.system_role === "manager";
  const [activeSection, setActiveSection] = useState("general");
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [features, setFeatures] = useState({
    encryption_enabled: false,
    gifs_enabled: false,
    disappearing_mode_enabled: false,
    purge_policy_days: 0
  });

  const [userTimer, setUserTimer] = useState(user?.disappearing_timer || "none");
  const [mnemonic, setMnemonic] = useState("");

  const handleMnemonicGen = () => {
    const m = generateMnemonic();
    setMnemonic(m);
  };

  const downloadMnemonic = () => {
    const blob = new Blob([mnemonic], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shiftmaster-recovery-key.txt";
    a.click();
    toast.success("Recovery key downloaded. Keep it safe!");
  };

  const saveOrgFeatures = async (updates) => {
    const newFeatures = { ...features, ...updates };
    try {
      await orgApi.update({ chat_features: newFeatures });
      setFeatures(newFeatures);
      toast.success("Organization features updated");
    } catch (err) {
      toast.error("Failed to update features");
    }
  };

  const handleUserTimerChange = async (val) => {
    try {
      await usersApi.update(user.id, { disappearing_timer: val });
      setUserTimer(val);
      toast.success(`Disappearing timer set to ${val}`);
    } catch (err) {
      toast.error("Failed to update timer");
    }
  };

  const [form, setForm] = useState({
    name: "",
    timezone: "Asia/Kolkata",
    locale: "en-IN",
    currency: "INR",
    work_week_start: 1,
    overtime_daily_threshold: 8,
    overtime_weekly_threshold: 40,
    attendance_enabled: false,
  });

  // MFA state
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaDisableCode, setMfaDisableCode] = useState("");
  const [mfaDisablePassword, setMfaDisablePassword] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [showMfaDisable, setShowMfaDisable] = useState(false);

  // MFA backup codes state
  const [backupCodes, setBackupCodes] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);

  // MFA Share dialog state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmployeeName, setShareEmployeeName] = useState("");
  const [shareManagerName, setShareManagerName] = useState(user?.full_name || "");
  const [shareMessage, setShareMessage] = useState("");

  // Branding state
  const [brandForm, setBrandForm] = useState({ brand_name: "", logo_url: "" });
  const [brandSaving, setBrandSaving] = useState(false);

  // MFA mandate state
  const [mandateAll, setMandateAll] = useState(false);
  const [mandateLoading, setMandateLoading] = useState(false);

  // Password policy state
  const DEFAULT_PASSWORD_POLICY = {
    min_length: 12,
    max_length: 128,
    require_uppercase: false,
    require_lowercase: false,
    require_digit: false,
    require_special: false,
  };
  const [passwordPolicy, setPasswordPolicy] = useState(DEFAULT_PASSWORD_POLICY);
  const [passwordPolicySaving, setPasswordPolicySaving] = useState(false);

  // SMTP state
  const [smtpForm, setSmtpForm] = useState({
    smtp_host: "", smtp_port: "587", smtp_username: "", smtp_password: "",
    smtp_from_email: "", smtp_from_name: "", smtp_use_tls: true, smtp_enabled: false,
  });
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState(null); // {ok: bool, msg: str}
  const [smtpPasswordVisible, setSmtpPasswordVisible] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState("");

  // LDAP / Active Directory state
  const [ldapForm, setLdapForm] = useState({
    enabled: false,
    host: "",
    port: "636",
    use_ssl: true,
    start_tls: false,
    bind_dn: "",
    bind_password: "",
    search_base: "",
    user_filter: "(&(objectClass=person)(sAMAccountName=*))",
    mapping: {
      username: "sAMAccountName",
      email: "mail",
      full_name: "displayName",
      phone: "telephoneNumber",
    },
  });
  const [ldapSaving, setLdapSaving] = useState(false);
  const [ldapTesting, setLdapTesting] = useState(false);
  const [ldapSyncing, setLdapSyncing] = useState(false);
  const [ldapPasswordVisible, setLdapPasswordVisible] = useState(false);
  const [ldapResult, setLdapResult] = useState(null);

  // Slack SSO state
  const [slackForm, setSlackForm] = useState({
    enabled: false,
    client_id: "",
    client_secret: "",
    allowed_workspace: "",
    auto_provision: true,
    default_role: "employee",
    trust_slack_as_mfa: false,
    instance_base_url: window.location.origin,
  });
  const [slackSaving, setSlackSaving] = useState(false);
  const [slackSecretVisible, setSlackSecretVisible] = useState(false);
  const [googleForm, setGoogleForm] = useState({
    enabled: false,
    client_id: "",
    client_secret: "",
    allowed_domain: "",
    auto_provision: true,
    default_role: "employee",
    trust_google_as_mfa: false,
    instance_base_url: window.location.origin,
  });
  const [googleSaving, setGoogleSaving] = useState(false);
  const [googleSecretVisible, setGoogleSecretVisible] = useState(false);
  const [ssoConflictDialog, setSsoConflictDialog] = useState({ open: false, message: "", onConfirm: null });

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await orgApi.get();
        setOrg(data);
        setFeatures(data.chat_features || {
          encryption_enabled: false,
          gifs_enabled: false,
          disappearing_mode_enabled: false,
          purge_policy_days: 0
        });
        setForm({
          name: data.name || "",
          timezone: data.timezone || "Asia/Kolkata",
          locale: data.locale || "en-IN",
          currency: data.currency || "INR",
          work_week_start: data.work_week_start ?? 1,
          overtime_daily_threshold: data.overtime_daily_threshold ?? 8,
          overtime_weekly_threshold: data.overtime_weekly_threshold ?? 40,
          attendance_enabled: !!data.attendance_enabled,
        });
        setMandateAll(!!data.mfa_org_mandate);
        setPasswordPolicy({ ...DEFAULT_PASSWORD_POLICY, ...(data.password_policy || {}) });
        setBrandForm({ brand_name: data.brand_name || data.name || "", logo_url: data.logo_url || "" });
        setSmtpForm({
          smtp_host: data.smtp_host || "",
          smtp_port: String(data.smtp_port || "587"),
          smtp_username: data.smtp_username || "",
          smtp_password: data.smtp_password || "",
          smtp_from_email: data.smtp_from_email || "",
          smtp_from_name: data.smtp_from_name || "",
          smtp_use_tls: data.smtp_use_tls !== false,
          smtp_enabled: !!data.smtp_enabled,
        });
        try {
          const ldapRes = await ldapApi.get();
          setLdapForm((current) => ({
            ...current,
            ...ldapRes.data,
            port: String(ldapRes.data.port || "636"),
            bind_password: ldapRes.data.bind_password || "",
            mapping: { ...current.mapping, ...(ldapRes.data.mapping || {}) },
          }));
        } catch {}
        try {
          if (data.slack_oidc) {
            setSlackForm((cur) => ({
              ...cur,
              ...data.slack_oidc,
              instance_base_url: data.slack_oidc.instance_base_url || window.location.origin,
            }));
          }
        } catch {}
        try {
          if (data.google_oidc) {
            setGoogleForm((cur) => ({
              ...cur,
              ...data.google_oidc,
              instance_base_url: data.google_oidc.instance_base_url || window.location.origin,
            }));
          }
        } catch {}
      } catch {}
      setMfaEnabled(!!user?.mfa_enabled);
      setShareManagerName(user?.full_name || "");
      setLoading(false);
    };
    load();
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await orgApi.update(form);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  // Branding
  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setBrandForm(f => ({ ...f, logo_url: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const handleSaveBranding = async () => {
    setBrandSaving(true);
    try {
      await orgApi.update({ brand_name: brandForm.brand_name, logo_url: brandForm.logo_url });
      toast.success("Branding saved");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setBrandSaving(false);
  };

  // SMTP
  const handleSmtpSave = async () => {
    setSmtpSaving(true);
    try {
      await orgApi.update({
        ...smtpForm,
        smtp_port: parseInt(smtpForm.smtp_port) || 587,
      });
      setSmtpTestResult({ ok: true, msg: "SMTP settings saved." });
    } catch (e) {
      setSmtpTestResult({ ok: false, msg: formatApiError(e.response?.data?.detail) || "Save failed" });
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleSmtpTest = async () => {
    if (!smtpTestEmail) return;
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const { data } = await orgApi.testEmail(smtpTestEmail);
      setSmtpTestResult({ ok: true, msg: data.message });
    } catch (e) {
      setSmtpTestResult({ ok: false, msg: e.response?.data?.detail || "Test failed" });
    } finally {
      setSmtpTesting(false);
    }
  };

  const ldapPayload = () => ({
    ...ldapForm,
    port: parseInt(ldapForm.port, 10) || (ldapForm.use_ssl ? 636 : 389),
  });

  const handleLdapSave = async () => {
    setLdapSaving(true);
    setLdapResult(null);
    try {
      const { data } = await ldapApi.update(ldapPayload());
      setLdapForm((current) => ({
        ...current,
        ...data,
        port: String(data.port || current.port),
        bind_password: data.bind_password || "",
        mapping: { ...current.mapping, ...(data.mapping || {}) },
      }));
      setLdapResult({ ok: true, msg: "LDAP settings saved." });
    } catch (e) {
      setLdapResult({ ok: false, msg: formatApiError(e.response?.data?.detail) });
    } finally {
      setLdapSaving(false);
    }
  };

  const handleLdapTest = async () => {
    setLdapTesting(true);
    setLdapResult(null);
    try {
      const { data } = await ldapApi.test(ldapPayload());
      setLdapResult({ ok: true, msg: data.message || "LDAP connection succeeded." });
    } catch (e) {
      setLdapResult({ ok: false, msg: formatApiError(e.response?.data?.detail) });
    } finally {
      setLdapTesting(false);
    }
  };

  const handleLdapSync = async () => {
    setLdapSyncing(true);
    setLdapResult(null);
    try {
      const { data } = await ldapApi.sync();
      setLdapResult({
        ok: true,
        msg: `Sync complete. Created ${data.created || 0}, updated ${data.updated || 0}, skipped ${data.skipped || 0}.`,
      });
    } catch (e) {
      setLdapResult({ ok: false, msg: formatApiError(e.response?.data?.detail) });
    } finally {
      setLdapSyncing(false);
    }
  };

  const handleSlackSave = async () => {
    if (slackForm.enabled && !slackForm.allowed_workspace.trim()) {
      toast.error("Allowed Workspace Domain is required when Slack SSO is enabled");
      return;
    }
    setSlackSaving(true);
    try {
      const { data } = await slackSsoApi.saveSettings(slackForm);
      if (data.slack_oidc) setSlackForm((cur) => ({ ...cur, ...data.slack_oidc }));
      toast.success("Slack SSO settings saved");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to save Slack SSO settings");
    } finally {
      setSlackSaving(false);
    }
  };

  const handleGoogleSave = async () => {
    if (googleForm.enabled && !googleForm.allowed_domain.trim()) {
      toast.error("Allowed Domain is required when Google SSO is enabled");
      return;
    }
    setGoogleSaving(true);
    try {
      const { data } = await googleSsoApi.saveSettings(googleForm);
      if (data.google_oidc) setGoogleForm((cur) => ({ ...cur, ...data.google_oidc }));
      toast.success("Google SSO settings saved");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to save Google SSO settings");
    } finally {
      setGoogleSaving(false);
    }
  };

  // MFA - Setup
  const handleStartMfaSetup = async () => {
    if (!mfaPassword) {
      toast.error("Enter your password to continue");
      return;
    }
    setMfaLoading(true);
    try {
      const { data } = await authApi.setupMfa({ password: mfaPassword });
      setMfaSetupData(data);
      setShowMfaSetup(true);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setMfaLoading(false);
  };

  const handleConfirmMfa = async () => {
    if (mfaCode.length < 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setMfaLoading(true);
    try {
      await authApi.confirmMfa({ code: mfaCode, secret: mfaSetupData.secret });
      setMfaEnabled(true);
      setShowMfaSetup(false);
      setMfaSetupData(null);
      setMfaCode("");
      setMfaPassword("");
      toast.success("MFA enabled successfully");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setMfaLoading(false);
  };

  // MFA - Disable
  const handleDisableMfa = async () => {
    if (!mfaDisablePassword || mfaDisableCode.length < 6) {
      toast.error("Enter your password and current MFA code");
      return;
    }
    setMfaLoading(true);
    try {
      await authApi.disableMfa({ password: mfaDisablePassword, code: mfaDisableCode });
      setMfaEnabled(false);
      setShowMfaDisable(false);
      setMfaDisableCode("");
      setMfaDisablePassword("");
      toast.success("MFA disabled");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setMfaLoading(false);
  };

  // MFA Backup Codes
  const handleGenerateBackupCodes = async () => {
    setBackupLoading(true);
    try {
      const { data } = await authApi.generateBackupCodes();
      setBackupCodes(data.backup_codes || []);
      toast.success("Backup codes generated — save them now");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setBackupLoading(false);
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success("Copied to clipboard");
  };

  const handleDownloadCodes = () => {
    const text = backupCodes.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shiftroster-mfa-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  // MFA Share dialog helpers
  const buildShareMessage = (empName, mgrName) => {
    const name = empName || "{employee name}";
    const mgr = mgrName || "{manager name}";
    return `Hi ${name},\n\nYour account on ShiftRoster requires Multi-Factor Authentication (MFA) setup.\n\nPlease follow these steps:\n1. Install an authenticator app (Google Authenticator or Authy)\n2. Log in to ShiftRoster\n3. You will be prompted to scan a QR code\n4. Complete the setup to secure your account\n\nIf you have any issues, please contact ${mgr}.\n\nBest regards,\n${mgr}`;
  };

  const handleOpenShare = () => {
    const msg = buildShareMessage(shareEmployeeName, shareManagerName || user?.full_name || "");
    setShareMessage(msg);
    setShowShareDialog(true);
  };

  const handleShareVia = (platform) => {
    const msg = buildShareMessage(shareEmployeeName, shareManagerName || user?.full_name || "");
    const encoded = encodeURIComponent(msg);
    if (platform === "gmail") {
      window.open(`https://mail.google.com/mail/?view=cm&body=${encoded}`, "_blank");
    } else if (platform === "outlook") {
      window.open(`https://outlook.live.com/mail/0/deeplink/compose?body=${encoded}`, "_blank");
    } else if (platform === "teams") {
      window.open(`https://teams.microsoft.com/l/chat/0/0?message=${encoded}`, "_blank");
    } else {
      navigator.clipboard.writeText(msg);
      const labels = { slack: "Slack", flock: "Flock", rocketchat: "RocketChat" };
      toast.success(`Copied for ${labels[platform] || platform}`);
    }
  };

  // MFA Mandate (admin only)
  const handleMandateAll = async (mandate) => {
    setMandateLoading(true);
    try {
      await usersApi.mandateMfa({ mandate });
      setMandateAll(mandate);
      // Also update org setting
      await orgApi.update({ mfa_org_mandate: mandate });
      toast.success(mandate ? "MFA mandated for all users" : "MFA mandate removed");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setMandateLoading(false);
  };

  if (loading) {
    return (
      <div data-testid="settings-page" className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const navSections = [
    { id: "general",      label: "General",       icon: Clock,         show: true },
    { id: "branding",     label: "Branding",      icon: ImageIcon,     show: isAdmin },
    { id: "organization", label: "Organization",  icon: Building2,     show: isAdmin },
    { id: "email",        label: "Email",         icon: Mail,          show: isAdmin },
    { id: "ldap",         label: "LDAP / AD",     icon: Server,        show: isAdmin },
    { id: "slack_sso",    label: "Slack SSO",     icon: LogIn,         show: isAdmin },
    { id: "google_sso",   label: "Google SSO",    icon: LogIn,         show: isAdmin },
    { id: "security",     label: "Security",      icon: Shield,        show: true },
    { id: "chat",         label: "Chat",          icon: MessageSquare, show: true },
    { id: "access",       label: "Access Rules",  icon: BookOpen,      show: isAdmin || isManager },
    { id: "policy",       label: "Policy",        icon: KeyRound,      show: isAdmin },
  ].filter(s => s.show);

  return (
    <div data-testid="settings-page" className="flex gap-6 max-w-5xl">
      {/* Sidebar nav */}
      <aside className="w-44 shrink-0">
        <div className="sticky top-6 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 pb-2">Settings</p>
          {navSections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left
                ${activeSection === id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {navSections.find(s => s.id === activeSection)?.label || "Settings"}
          </h1>
          <p className="text-sm text-muted-foreground">Manage organization and security settings</p>
        </div>

      {/* ── General ── */}
      {activeSection === "general" && <Card className="border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" /> Attendance Tracking
          </CardTitle>
          <CardDescription>
            Enable or disable the clock-in / clock-out feature for your organization.
            When disabled, the Attendance page is hidden for all users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {form.attendance_enabled ? "Enabled" : "Disabled"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {form.attendance_enabled
                  ? "Employees can clock in and out"
                  : "Attendance page is hidden from all users"}
              </p>
            </div>
            <Toggle
              checked={form.attendance_enabled}
              onCheckedChange={async (v) => {
                setForm({ ...form, attendance_enabled: v });
                try {
                  await orgApi.update({ attendance_enabled: v });
                  toast.success(v ? "Attendance tracking enabled" : "Attendance tracking disabled");
                } catch (err) {
                  setForm({ ...form, attendance_enabled: !v });
                  toast.error(formatApiError(err.response?.data?.detail));
                }
              }}
            />
          </div>
        </CardContent>
      </Card>}

      {/* ── Branding ── */}
      {activeSection === "branding" && isAdmin && (
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ImageIcon className="h-5 w-5" /> Branding
            </CardTitle>
            <CardDescription>Customize the app logo and name shown in the sidebar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Brand Name</Label>
              <Input
                placeholder="Your company name"
                value={brandForm.brand_name}
                onChange={e => setBrandForm(f => ({ ...f, brand_name: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Shown in the sidebar instead of "ShiftRoster"</p>
            </div>

            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-4">
                {/* Preview */}
                <div className="w-16 h-16 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden shrink-0">
                  {brandForm.logo_url ? (
                    <img src={brandForm.logo_url} alt="logo preview" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="cursor-pointer">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background hover:bg-accent transition-colors text-sm">
                      <Upload className="h-4 w-4" />
                      Upload Logo
                    </div>
                    <input type="file" accept="image/*" className="sr-only" onChange={handleLogoChange} />
                  </label>
                  {brandForm.logo_url && (
                    <button
                      onClick={() => setBrandForm(f => ({ ...f, logo_url: "" }))}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" /> Remove logo
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG or SVG · Max 2MB · Displayed at 32×32px in sidebar</p>
            </div>

            <Button onClick={handleSaveBranding} disabled={brandSaving} className="gap-2">
              {brandSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Branding
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Email ── */}
      {activeSection === "email" && isAdmin && (
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" /> SMTP Email Settings
            </CardTitle>
            <CardDescription>Configure a relay server (Gmail, Outlook, or any SMTP) for outbound emails</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable SMTP</p>
                <p className="text-xs text-muted-foreground">Send system emails via your SMTP server</p>
              </div>
              <Toggle
                checked={smtpForm.smtp_enabled}
                onCheckedChange={(v) => setSmtpForm(f => ({ ...f, smtp_enabled: v }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SMTP Host</Label>
                <Input placeholder="smtp.gmail.com" value={smtpForm.smtp_host}
                  onChange={e => setSmtpForm(f => ({ ...f, smtp_host: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Port</Label>
                <Input placeholder="587" value={smtpForm.smtp_port}
                  onChange={e => setSmtpForm(f => ({ ...f, smtp_port: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input placeholder="you@gmail.com" value={smtpForm.smtp_username}
                  onChange={e => setSmtpForm(f => ({ ...f, smtp_username: e.target.value }))} />
              </div>
              <div className="space-y-1.5 relative">
                <Label>Password / App Password</Label>
                <div className="relative">
                  <Input
                    type={smtpPasswordVisible ? "text" : "password"}
                    placeholder="••••••••"
                    value={smtpForm.smtp_password}
                    onChange={e => setSmtpForm(f => ({ ...f, smtp_password: e.target.value }))}
                    className="pr-9"
                  />
                  <button type="button" onClick={() => setSmtpPasswordVisible(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {smtpPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>From Email</Label>
                <Input placeholder="noreply@yourcompany.com" value={smtpForm.smtp_from_email}
                  onChange={e => setSmtpForm(f => ({ ...f, smtp_from_email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>From Name</Label>
                <Input placeholder="ShiftRoster" value={smtpForm.smtp_from_name}
                  onChange={e => setSmtpForm(f => ({ ...f, smtp_from_name: e.target.value }))} />
              </div>
            </div>

            {/* TLS toggle */}
            <div className="flex items-center gap-3">
              <Toggle
                checked={smtpForm.smtp_use_tls}
                onCheckedChange={(v) => setSmtpForm(f => ({ ...f, smtp_use_tls: v }))}
                className="h-6 w-10"
              />
              <span className="text-sm">Use STARTTLS (recommended for port 587)</span>
            </div>

            {/* Hint for common providers */}
            <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Common providers:</p>
              <p>• Gmail: host=smtp.gmail.com, port=587, use App Password (2FA required)</p>
              <p>• Outlook/Office365: host=smtp.office365.com, port=587</p>
              <p>• SendGrid: host=smtp.sendgrid.net, port=587, user=apikey</p>
            </div>

            {/* Save button */}
            <Button onClick={handleSmtpSave} disabled={smtpSaving} size="sm">
              {smtpSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Server className="h-4 w-4 mr-2" />}
              Save SMTP Settings
            </Button>

            {/* Test email */}
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-sm font-medium">Send Test Email</p>
              <div className="flex gap-2">
                <Input placeholder="test@example.com" value={smtpTestEmail}
                  onChange={e => setSmtpTestEmail(e.target.value)} className="max-w-xs" />
                <Button variant="outline" size="sm" onClick={handleSmtpTest}
                  disabled={smtpTesting || !smtpTestEmail}>
                  {smtpTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Test"}
                </Button>
              </div>
              {smtpTestResult && (
                <p className={`text-xs ${smtpTestResult.ok ? "text-green-500" : "text-destructive"}`}>
                  {smtpTestResult.ok ? "✓" : "✗"} {smtpTestResult.msg}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Organization ── */}
      {/* LDAP / AD */}
      {activeSection === "ldap" && isAdmin && (
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" /> LDAP / Active Directory
            </CardTitle>
            <CardDescription>Sync employees from your directory and authenticate LDAP users against AD</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable LDAP login</p>
                <p className="text-xs text-muted-foreground">LDAP-managed users will use their directory password</p>
              </div>
              <Toggle checked={ldapForm.enabled} onCheckedChange={(v) => {
                if (v && slackForm.enabled) {
                  setSsoConflictDialog({
                    open: true,
                    message: "Enabling LDAP login will disable Slack SSO. Only one SSO method can be active at a time.",
                    onConfirm: () => {
                      setLdapForm(f => ({ ...f, enabled: true }));
                      setSlackForm(f => ({ ...f, enabled: false }));
                      setSsoConflictDialog(d => ({ ...d, open: false }));
                    },
                  });
                } else {
                  setLdapForm(f => ({ ...f, enabled: v }));
                }
              }} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>LDAP Host</Label>
                <Input placeholder="ad.example.com" value={ldapForm.host}
                  onChange={e => setLdapForm(f => ({ ...f, host: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Port</Label>
                <Input placeholder={ldapForm.use_ssl ? "636" : "389"} value={ldapForm.port}
                  onChange={e => setLdapForm(f => ({ ...f, port: e.target.value }))} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Bind DN</Label>
                <Input placeholder="CN=ServiceAccount,OU=Users,DC=example,DC=com" value={ldapForm.bind_dn}
                  onChange={e => setLdapForm(f => ({ ...f, bind_dn: e.target.value }))} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Bind Password</Label>
                <div className="relative">
                  <Input
                    type={ldapPasswordVisible ? "text" : "password"}
                    placeholder="Directory service account password"
                    value={ldapForm.bind_password}
                    onChange={e => setLdapForm(f => ({ ...f, bind_password: e.target.value }))}
                    className="pr-9"
                  />
                  <button type="button" onClick={() => setLdapPasswordVisible(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {ldapPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {ldapForm.bind_password === "__KEEP_EXISTING_LDAP_PASSWORD__" && (
                  <p className="text-xs text-muted-foreground">A bind password is saved. Type a new password to replace it.</p>
                )}
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Search Base</Label>
                <Input placeholder="OU=Employees,DC=example,DC=com" value={ldapForm.search_base}
                  onChange={e => setLdapForm(f => ({ ...f, search_base: e.target.value }))} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>User Filter</Label>
                <Input placeholder="(&(objectClass=person)(sAMAccountName=*))" value={ldapForm.user_filter}
                  onChange={e => setLdapForm(f => ({ ...f, user_filter: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ["username", "Username attribute"],
                ["email", "Email attribute"],
                ["full_name", "Full name attribute"],
                ["phone", "Phone attribute"],
              ].map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input value={ldapForm.mapping[key] || ""}
                    onChange={e => setLdapForm(f => ({ ...f, mapping: { ...f.mapping, [key]: e.target.value } }))} />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Toggle checked={ldapForm.use_ssl}
                  onCheckedChange={(v) => setLdapForm(f => ({ ...f, use_ssl: v, start_tls: v ? false : f.start_tls }))}
                  className="h-6 w-10" />
                <span className="text-sm">Use LDAPS</span>
              </div>
              <div className="flex items-center gap-2">
                <Toggle checked={ldapForm.start_tls}
                  onCheckedChange={(v) => setLdapForm(f => ({ ...f, start_tls: v, use_ssl: v ? false : f.use_ssl }))}
                  className="h-6 w-10" />
                <span className="text-sm">Use StartTLS</span>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Directory sync behavior</p>
              <p>LDAP users are matched by DN, username, or email. Existing local users are not converted automatically.</p>
              <p>Enable LDAPS or StartTLS before enabling LDAP login.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleLdapSave} disabled={ldapSaving} size="sm">
                {ldapSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save LDAP Settings
              </Button>
              <Button variant="outline" onClick={handleLdapTest} disabled={ldapTesting} size="sm">
                {ldapTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Server className="h-4 w-4 mr-2" />}
                Test Connection
              </Button>
              <Button variant="outline" onClick={handleLdapSync} disabled={ldapSyncing || !ldapForm.enabled} size="sm">
                {ldapSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Force Sync
              </Button>
            </div>

            {ldapResult && (
              <p className={`text-xs ${ldapResult.ok ? "text-green-500" : "text-destructive"}`}>
                {ldapResult.ok ? "OK" : "Error"}: {ldapResult.msg}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Slack SSO */}
      {activeSection === "slack_sso" && isAdmin && (
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <LogIn className="h-5 w-5 text-primary" /> Slack SSO
            </CardTitle>
            <CardDescription>
              Allow users to sign in with their Slack account via OpenID Connect.
              New Slack users are created as <strong>pending</strong> — an admin must activate them before they can log in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable Slack SSO</p>
                <p className="text-xs text-muted-foreground">Show "Sign in with Slack" on the login page</p>
              </div>
              <Toggle checked={slackForm.enabled} onCheckedChange={(v) => {
                if (v && (ldapForm.enabled || googleForm.enabled)) {
                  const conflict = ldapForm.enabled ? "LDAP" : "Google SSO";
                  setSsoConflictDialog({
                    open: true,
                    message: `Enabling Slack SSO will disable ${conflict}. Only one SSO method can be active at a time.`,
                    onConfirm: () => {
                      setSlackForm(f => ({ ...f, enabled: true }));
                      setLdapForm(f => ({ ...f, enabled: false }));
                      setGoogleForm(f => ({ ...f, enabled: false }));
                      setSsoConflictDialog(d => ({ ...d, open: false }));
                    },
                  });
                } else {
                  setSlackForm(f => ({ ...f, enabled: v }));
                }
              }} />
            </div>

            <Separator />

            {/* OAuth credentials */}
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label>Client ID</Label>
                <Input
                  placeholder="Your Slack app's Client ID"
                  value={slackForm.client_id}
                  onChange={e => setSlackForm(f => ({ ...f, client_id: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Client Secret</Label>
                <div className="relative">
                  <Input
                    type={slackSecretVisible ? "text" : "password"}
                    placeholder={slackForm.client_secret === "__KEEP_EXISTING_SLACK_SECRET__" ? "••••••••••••••••" : "Your Slack app's Client Secret"}
                    value={slackForm.client_secret === "__KEEP_EXISTING_SLACK_SECRET__" ? "" : slackForm.client_secret}
                    onChange={e => setSlackForm(f => ({ ...f, client_secret: e.target.value }))}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setSlackSecretVisible(v => !v)}
                  >
                    {slackSecretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {slackForm.client_secret === "__KEEP_EXISTING_SLACK_SECRET__" && (
                  <p className="text-xs text-muted-foreground">A client secret is already saved. Leave blank to keep it.</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Instance URL (determines redirect_uri) */}
            <div className="space-y-1.5">
              <Label>Instance Base URL</Label>
              <Input
                placeholder="https://your-domain.com or http://89.167.44.42:8080"
                value={slackForm.instance_base_url}
                onChange={e => setSlackForm(f => ({ ...f, instance_base_url: e.target.value.trim() }))}
              />
              <p className="text-xs text-muted-foreground">
                Used to build the OAuth redirect URI. Copy the value below into your Slack app's "Redirect URLs" field.
              </p>
              {slackForm.instance_base_url && (
                <div className="flex items-center gap-2 mt-1 p-2 rounded bg-muted text-xs font-mono break-all">
                  {slackForm.instance_base_url.replace(/\/$/, "")}/api/auth/slack/callback
                  <button
                    type="button"
                    className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(`${slackForm.instance_base_url.replace(/\/$/, "")}/api/auth/slack/callback`);
                      toast.success("Copied redirect URI");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <Separator />

            {/* Workspace restriction */}
            <div className="space-y-1.5">
              <Label>Allowed Workspace Domain <span className="text-destructive">*</span></Label>
              <Input
                placeholder="your-company (Slack team domain, without .slack.com)"
                value={slackForm.allowed_workspace}
                onChange={e => setSlackForm(f => ({ ...f, allowed_workspace: e.target.value.trim().toLowerCase() }))}
              />
              <p className="text-xs text-muted-foreground">Required. Only users from this Slack workspace can log in. Find it in your Slack workspace URL: <code>your-company.slack.com</code>.</p>
            </div>

            <Separator />

            {/* Auto provision + default role */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-provision new users</p>
                <p className="text-xs text-muted-foreground">
                  Create an account for unknown emails. New accounts start as <strong>pending</strong> — admin must activate before first login.
                </p>
              </div>
              <Toggle checked={slackForm.auto_provision} onCheckedChange={(v) => setSlackForm(f => ({ ...f, auto_provision: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Default role for new users</Label>
              <Select value={slackForm.default_role} onValueChange={v => setSlackForm(f => ({ ...f, default_role: v }))}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="readonly">Read-only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Admin must activate the user and can change the role before approval.</p>
            </div>

            <Separator />

            {/* MFA trust */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Trust Slack as second factor</p>
                <p className="text-xs text-muted-foreground">
                  If disabled, users with TOTP enabled must still complete TOTP after Slack login.
                </p>
              </div>
              <Toggle checked={slackForm.trust_slack_as_mfa} onCheckedChange={(v) => setSlackForm(f => ({ ...f, trust_slack_as_mfa: v }))} />
            </div>

            <div className="pt-2">
              <Button onClick={handleSlackSave} disabled={slackSaving} size="sm">
                {slackSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Slack SSO Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeSection === "google_sso" && isAdmin && (
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google SSO
            </CardTitle>
            <CardDescription>
              Allow users to sign in with their Google Workspace account via OpenID Connect.
              New Google users are created as <strong>pending</strong> — an admin must activate them before they can log in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable Google SSO</p>
                <p className="text-xs text-muted-foreground">Show "Sign in with Google" on the login page</p>
              </div>
              <Toggle checked={googleForm.enabled} onCheckedChange={(v) => {
                if (v && (ldapForm.enabled || slackForm.enabled)) {
                  const conflict = ldapForm.enabled ? "LDAP" : "Slack SSO";
                  setSsoConflictDialog({
                    open: true,
                    message: `Enabling Google SSO will disable ${conflict}. Only one SSO method can be active at a time.`,
                    onConfirm: () => {
                      setGoogleForm(f => ({ ...f, enabled: true }));
                      setLdapForm(f => ({ ...f, enabled: false }));
                      setSlackForm(f => ({ ...f, enabled: false }));
                      setSsoConflictDialog(d => ({ ...d, open: false }));
                    },
                  });
                } else {
                  setGoogleForm(f => ({ ...f, enabled: v }));
                }
              }} />
            </div>

            <Separator />

            {/* OAuth credentials */}
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label>Client ID</Label>
                <Input
                  placeholder="Your Google OAuth Client ID"
                  value={googleForm.client_id}
                  onChange={e => setGoogleForm(f => ({ ...f, client_id: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Client Secret</Label>
                <div className="relative">
                  <Input
                    type={googleSecretVisible ? "text" : "password"}
                    placeholder={googleForm.client_secret === "__KEEP_EXISTING_GOOGLE_SECRET__" ? "••••••••••••••••" : "Your Google OAuth Client Secret"}
                    value={googleForm.client_secret === "__KEEP_EXISTING_GOOGLE_SECRET__" ? "" : googleForm.client_secret}
                    onChange={e => setGoogleForm(f => ({ ...f, client_secret: e.target.value }))}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setGoogleSecretVisible(v => !v)}
                  >
                    {googleSecretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {googleForm.client_secret === "__KEEP_EXISTING_GOOGLE_SECRET__" && (
                  <p className="text-xs text-muted-foreground">A client secret is already saved. Leave blank to keep it.</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Instance URL */}
            <div className="space-y-1.5">
              <Label>Instance Base URL</Label>
              <Input
                placeholder="https://your-domain.com or http://89.167.44.42:8080"
                value={googleForm.instance_base_url}
                onChange={e => setGoogleForm(f => ({ ...f, instance_base_url: e.target.value.trim() }))}
              />
              <p className="text-xs text-muted-foreground">
                Used to build the OAuth redirect URI. Add the value below to your Google Cloud Console "Authorized redirect URIs".
              </p>
              {googleForm.instance_base_url && (
                <div className="flex items-center gap-2 mt-1 p-2 rounded bg-muted text-xs font-mono break-all">
                  {googleForm.instance_base_url.replace(/\/$/, "")}/api/auth/google/callback
                  <button
                    type="button"
                    className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(`${googleForm.instance_base_url.replace(/\/$/, "")}/api/auth/google/callback`);
                      toast.success("Copied redirect URI");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <Separator />

            {/* Domain restriction */}
            <div className="space-y-1.5">
              <Label>Allowed Domain <span className="text-destructive">*</span></Label>
              <Input
                placeholder="yourcompany.com"
                value={googleForm.allowed_domain}
                onChange={e => setGoogleForm(f => ({ ...f, allowed_domain: e.target.value.trim().toLowerCase() }))}
              />
              <p className="text-xs text-muted-foreground">Required. Only Google accounts from this domain can log in (e.g. <code>yourcompany.com</code>). Works with Google Workspace and personal Gmail on custom domains.</p>
            </div>

            <Separator />

            {/* Auto provision + default role */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-provision new users</p>
                <p className="text-xs text-muted-foreground">
                  Create an account for unknown emails. New accounts start as <strong>pending</strong> — admin must activate before first login.
                </p>
              </div>
              <Toggle checked={googleForm.auto_provision} onCheckedChange={(v) => setGoogleForm(f => ({ ...f, auto_provision: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Default role for new users</Label>
              <Select value={googleForm.default_role} onValueChange={v => setGoogleForm(f => ({ ...f, default_role: v }))}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="readonly">Read-only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Admin must activate the user and can change the role before approval.</p>
            </div>

            <Separator />

            {/* MFA trust */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Trust Google as second factor</p>
                <p className="text-xs text-muted-foreground">
                  If disabled, users with TOTP enabled must still complete TOTP after Google login.
                </p>
              </div>
              <Toggle checked={googleForm.trust_google_as_mfa} onCheckedChange={(v) => setGoogleForm(f => ({ ...f, trust_google_as_mfa: v }))} />
            </div>

            <div className="pt-2">
              <Button onClick={handleGoogleSave} disabled={googleSaving} size="sm">
                {googleSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Google SSO Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeSection === "organization" && isAdmin && <Card className="border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" /> Organization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Organization Name</Label>
            <Input
              data-testid="org-name-input"
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Select value={form.timezone} onValueChange={v => setForm({...form, timezone: v})}>
                <SelectTrigger data-testid="timezone-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                  <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm({...form, currency: v})}>
                <SelectTrigger data-testid="currency-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Daily Overtime Threshold (hrs)</Label>
              <Input
                data-testid="daily-overtime-input"
                type="number"
                value={form.overtime_daily_threshold}
                onChange={e => setForm({...form, overtime_daily_threshold: Number.parseFloat(e.target.value) || 0})}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Weekly Overtime Threshold (hrs)</Label>
              <Input
                data-testid="weekly-overtime-input"
                type="number"
                value={form.overtime_weekly_threshold}
                onChange={e => setForm({...form, overtime_weekly_threshold: Number.parseFloat(e.target.value) || 0})}
              />
            </div>
          </div>

          <Button data-testid="save-settings-btn" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>}

      {/* ── Security ── */}
      {activeSection === "security" && (<><Card className="border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" /> Multi-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security using a TOTP authenticator app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {mfaEnabled ? (
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
              ) : (
                <ShieldOff className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">{mfaEnabled ? "MFA is enabled" : "MFA is disabled"}</p>
                <p className="text-xs text-muted-foreground">
                  {mfaEnabled ? "Your account is protected with two-factor authentication" : "Enable MFA to secure your account"}
                </p>
              </div>
            </div>
          </div>

          {!mfaEnabled && !showMfaSetup && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label>Your Password</Label>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={mfaPassword}
                  onChange={(e) => setMfaPassword(e.target.value)}
                  data-testid="mfa-password-input"
                />
              </div>
              <Button
                onClick={handleStartMfaSetup}
                disabled={mfaLoading || !mfaPassword}
                className="gap-2"
                data-testid="enable-mfa-btn"
              >
                {mfaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Set Up MFA
              </Button>
            </div>
          )}

          {showMfaSetup && mfaSetupData && (
            <div className="space-y-4 pt-2 animate-fade-in">
              <Separator />
              <p className="text-sm text-muted-foreground">
                Scan this QR code with Google Authenticator, Authy, or any TOTP app:
              </p>
              <div className="flex justify-center p-4 bg-white rounded-lg border">
                <img src={mfaSetupData.qr_code} alt="MFA QR Code" className="w-48 h-48" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Manual entry key</Label>
                <code className="block text-xs bg-muted p-2 rounded-md font-mono break-all select-all">
                  {mfaSetupData.manual_entry_key}
                </code>
              </div>
              <div className="space-y-1.5">
                <Label>Verification Code</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replaceAll(/\D/g, ""))}
                  className="text-center text-lg tracking-[0.3em] font-mono"
                  data-testid="mfa-confirm-code-input"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setShowMfaSetup(false); setMfaSetupData(null); }}>
                  Cancel
                </Button>
                <Button onClick={handleConfirmMfa} disabled={mfaLoading || mfaCode.length < 6} className="gap-2">
                  {mfaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Activate MFA
                </Button>
              </div>
            </div>
          )}

          {mfaEnabled && !showMfaDisable && (
            <Button
              variant="outline"
              className="gap-2 text-destructive hover:text-destructive"
              onClick={() => setShowMfaDisable(true)}
              data-testid="disable-mfa-btn"
            >
              <ShieldOff className="h-4 w-4" /> Disable MFA
            </Button>
          )}

          {showMfaDisable && (
            <div className="space-y-3 pt-2 animate-fade-in">
              <Separator />
              <p className="text-sm text-muted-foreground">Enter your password and current MFA code to disable:</p>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={mfaDisablePassword}
                  onChange={(e) => setMfaDisablePassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Current MFA Code</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={mfaDisableCode}
                  onChange={(e) => setMfaDisableCode(e.target.value.replaceAll(/\D/g, ""))}
                  className="text-center text-lg tracking-[0.3em] font-mono"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowMfaDisable(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleDisableMfa} disabled={mfaLoading} className="gap-2">
                  {mfaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                  Confirm Disable
                </Button>
              </div>
            </div>
          )}

          {/* Backup Codes — only when MFA is enabled */}
          {mfaEnabled && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Backup Codes</p>
                    <p className="text-xs text-muted-foreground">
                      Use a backup code if you lose access to your authenticator app
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateBackupCodes}
                    disabled={backupLoading}
                    className="gap-2 shrink-0"
                    data-testid="generate-backup-codes-btn"
                  >
                    {backupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    Generate Codes
                  </Button>
                </div>

                {backupCodes.length > 0 && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Save these codes somewhere safe. Each code can only be used once. These codes will not be shown again.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {backupCodes.map((code) => (
                        <div
                          key={code}
                          className="flex items-center justify-between gap-2 bg-muted rounded-md px-3 py-2"
                        >
                          <code className="text-xs font-mono tracking-wider select-all">{code}</code>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(code)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={handleDownloadCodes} className="gap-2">
                      <Download className="h-4 w-4" /> Download All
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Share MFA Setup Instructions */}
          {(user?.system_role === "admin" || user?.system_role === "manager") && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Share Setup Instructions</p>
                  <p className="text-xs text-muted-foreground">
                    Send MFA setup instructions to an employee
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenShare}
                  className="gap-2 shrink-0"
                  data-testid="share-mfa-btn"
                >
                  <Share2 className="h-4 w-4" /> Share
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* MFA Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share MFA Setup Instructions</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Employee Name</Label>
                <Input
                  placeholder="e.g. John Doe"
                  value={shareEmployeeName}
                  onChange={(e) => {
                    setShareEmployeeName(e.target.value);
                    setShareMessage(buildShareMessage(e.target.value, shareManagerName));
                  }}
                  data-testid="share-employee-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Your Name</Label>
                <Input
                  placeholder="Manager name"
                  value={shareManagerName}
                  onChange={(e) => {
                    setShareManagerName(e.target.value);
                    setShareMessage(buildShareMessage(shareEmployeeName, e.target.value));
                  }}
                  data-testid="share-manager-name"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Message Preview</Label>
              <textarea
                className="w-full min-h-[160px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                value={shareMessage}
                onChange={(e) => setShareMessage(e.target.value)}
                data-testid="share-message"
              />
            </div>
            <div className="space-y-2">
              <Label>Send via</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "gmail", label: "Gmail" },
                  { id: "outlook", label: "Outlook" },
                  { id: "teams", label: "Teams" },
                  { id: "slack", label: "Slack" },
                  { id: "flock", label: "Flock" },
                  { id: "rocketchat", label: "RocketChat" },
                ].map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="sm"
                    onClick={() => handleShareVia(p.id)}
                    data-testid={`share-via-${p.id}`}
                  >
                    {p.label}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(shareMessage);
                    toast.success("Copied to clipboard");
                  }}
                  className="gap-2"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog></>)}

      {/* ── Chat ── */}
      {activeSection === "chat" && <Card className="border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Chat Security & Privacy
          </CardTitle>
          <CardDescription>Manage your personal chat security settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-dashed">
            <div className="space-y-0.5">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Lock className="h-4 w-4" /> End-to-End Encryption
              </p>
              <p className="text-xs text-muted-foreground">Encryption keys are managed locally in your browser.</p>
            </div>
            {!mnemonic ? (
              <Button size="sm" variant="outline" onClick={handleMnemonicGen}>
                <Zap className="h-3.5 w-3.5 mr-1.5" /> Initialize E2EE
              </Button>
            ) : (
              <Button size="sm" onClick={downloadMnemonic}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Download Paper Key
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Default Disappearing Timer</Label>
            <Select value={userTimer} onValueChange={handleUserTimerChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Disabled" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Disabled</SelectItem>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="90d">3 Months</SelectItem>
                <SelectItem value="180d">6 Months</SelectItem>
                <SelectItem value="365d">1 Year</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">New messages will automatically disappear after this duration (if enabled by Admin).</p>
          </div>
        </CardContent>
      </Card>}

      {activeSection === "chat" && isAdmin && (
        <Card className="border border-primary/20 bg-primary/[0.01]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Organization Chat Policy
            </CardTitle>
            <CardDescription>Global controls for chat features and retention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Enable E2EE</p>
                  <p className="text-xs text-muted-foreground">Allow end-to-end encrypted messaging</p>
                </div>
                <Toggle
                  checked={features.encryption_enabled}
                  onCheckedChange={(val) => saveOrgFeatures({ encryption_enabled: val })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Enable GIFs</p>
                  <p className="text-xs text-muted-foreground">Allow users to send GIFs via Giphy</p>
                </div>
                <Toggle
                  checked={features.gifs_enabled}
                  onCheckedChange={(val) => saveOrgFeatures({ gifs_enabled: val })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Disappearing Mode</p>
                  <p className="text-xs text-muted-foreground">Allow users to set message expiration</p>
                </div>
                <Toggle
                  checked={features.disappearing_mode_enabled}
                  onCheckedChange={(val) => saveOrgFeatures({ disappearing_mode_enabled: val })}
                />
              </div>
            </div>

            <Separator className="bg-primary/10" />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-rose-500" />
                <Label className="text-sm font-medium">Global Retention Policy (Housekeeping)</Label>
              </div>
              <Select 
                value={String(features.purge_policy_days || 0)} 
                onValueChange={(val) => saveOrgFeatures({ purge_policy_days: parseInt(val, 10) || 0 })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Lifetime" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Lifetime (No Purge)</SelectItem>
                  <SelectItem value="30">30 Days</SelectItem>
                  <SelectItem value="60">60 Days</SelectItem>
                  <SelectItem value="365">1 Year</SelectItem>
                  <SelectItem value="1825">5 Years</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground italic">Messages older than this period will be permanently deleted from the server every 24 hours.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Access Rules ── */}
      {activeSection === "access" && (isAdmin || isManager) && (
        <AccessRuleBook />
      )}

      {/* ── Policy ── */}
      {activeSection === "policy" && user?.system_role === "admin" && (
        <div className="space-y-6">
          <Card className="border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <KeyRound className="h-5 w-5" /> MFA Policy
              </CardTitle>
              <CardDescription>
                Mandate MFA for all users in your organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Require MFA for all users</p>
                  <p className="text-xs text-muted-foreground">
                    Users will be forced to set up MFA on their next login
                  </p>
                </div>
                <Toggle
                  checked={mandateAll}
                  onCheckedChange={handleMandateAll}
                  disabled={mandateLoading}
                  data-testid="mandate-mfa-switch"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="h-5 w-5" /> Password Policy
              </CardTitle>
              <CardDescription>
                Configure password length and complexity requirements for all users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pp-min">Minimum length</Label>
                  <Input
                    id="pp-min"
                    type="number"
                    min={6}
                    max={128}
                    value={passwordPolicy.min_length}
                    onChange={(e) => setPasswordPolicy((p) => ({ ...p, min_length: parseInt(e.target.value, 10) || 6 }))}
                  />
                  <p className="text-xs text-muted-foreground">Range: 6-128</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pp-max">Maximum length</Label>
                  <Input
                    id="pp-max"
                    type="number"
                    min={8}
                    max={256}
                    value={passwordPolicy.max_length}
                    onChange={(e) => setPasswordPolicy((p) => ({ ...p, max_length: parseInt(e.target.value, 10) || 128 }))}
                  />
                  <p className="text-xs text-muted-foreground">Range: 8-256</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-sm font-medium">Complexity requirements</p>
                {[
                  { key: "require_uppercase", label: "Require uppercase letter (A-Z)" },
                  { key: "require_lowercase", label: "Require lowercase letter (a-z)" },
                  { key: "require_digit", label: "Require digit (0-9)" },
                  { key: "require_special", label: "Require special character (!@#$...)" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <p className="text-sm">{label}</p>
                    <Toggle
                      checked={!!passwordPolicy[key]}
                      onCheckedChange={(v) => setPasswordPolicy((p) => ({ ...p, [key]: !!v }))}
                    />
                  </div>
                ))}
              </div>

              <Separator />

              <Button
                onClick={async () => {
                  if (passwordPolicy.min_length > passwordPolicy.max_length) {
                    toast.error("Min length cannot exceed max length");
                    return;
                  }
                  setPasswordPolicySaving(true);
                  try {
                    await orgApi.update({ password_policy: passwordPolicy });
                    toast.success("Password policy saved");
                  } catch (err) {
                    toast.error(formatApiError(err) || "Failed to save password policy");
                  } finally {
                    setPasswordPolicySaving(false);
                  }
                }}
                disabled={passwordPolicySaving}
              >
                {passwordPolicySaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Password Policy
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
      </div>

      {/* SSO conflict confirmation dialog */}
      {ssoConflictDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Switch SSO Method</p>
                <p className="text-sm text-muted-foreground mt-1">{ssoConflictDialog.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSsoConflictDialog(d => ({ ...d, open: false }))}>
                Cancel
              </Button>
              <Button size="sm" onClick={ssoConflictDialog.onConfirm}>
                Proceed
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
