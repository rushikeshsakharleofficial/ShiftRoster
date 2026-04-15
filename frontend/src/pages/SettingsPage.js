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
import { toast } from "sonner";
import { Settings as SettingsIcon, Loader2, Save, Shield, ShieldCheck, ShieldOff, QrCode, KeyRound, Clock } from "lucide-react";

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
      } catch {}
      setMfaEnabled(!!user?.mfa_enabled);
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
                onChange={e => setForm({...form, overtime_daily_threshold: parseFloat(e.target.value) || 0})}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Weekly Overtime Threshold (hrs)</Label>
              <Input
                data-testid="weekly-overtime-input"
                type="number"
                value={form.overtime_weekly_threshold}
                onChange={e => setForm({...form, overtime_weekly_threshold: parseFloat(e.target.value) || 0})}
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
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
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
                  onChange={(e) => setMfaDisableCode(e.target.value.replace(/\D/g, ""))}
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
        </CardContent>
      </Card>

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
