import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { orgApi, authApi, usersApi, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Settings as SettingsIcon, Loader2, Save, Shield, ShieldCheck, ShieldOff, QrCode, KeyRound, Clock, Copy, Download, Share2, AlertTriangle, ImageIcon, Upload, X } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.system_role === "admin";
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await orgApi.get();
        setOrg(data);
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
        setBrandForm({ brand_name: data.brand_name || data.name || "", logo_url: data.logo_url || "" });
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

  return (
    <div data-testid="settings-page" className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage organization and security settings</p>
      </div>

      {/* Attendance Feature Toggle — admin or manager */}
      <Card className="border">
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
            <Switch
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
      </Card>

      {/* Branding — admin only */}
      {isAdmin && (
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

      {/* Organization Settings — admin only */}
      {isAdmin && <Card className="border">
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

      {/* MFA - Personal */}
      <Card className="border">
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
      </Dialog>

      {/* MFA Mandate (Admin only) */}
      {user?.system_role === "admin" && (
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
              <Switch
                checked={mandateAll}
                onCheckedChange={handleMandateAll}
                disabled={mandateLoading}
                data-testid="mandate-mfa-switch"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
