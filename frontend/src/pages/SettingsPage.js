import { useState, useEffect } from "react";
import { orgApi, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Settings as SettingsIcon, Loader2, Save } from "lucide-react";

export default function SettingsPage() {
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
  });

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
        });
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

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
        <p className="text-sm text-muted-foreground">Manage organization settings</p>
      </div>

      <Card className="border">
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
      </Card>
    </div>
  );
}
