import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setupApi, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, ArrowRight, Loader2, Shield, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function SetupPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    org_name: "",
    admin_name: "",
    admin_email: "",
    admin_password: "",
    confirm_password: "",
    timezone: "Asia/Kolkata",
  });

  useEffect(() => {
    const check = async () => {
      try {
        const { data } = await setupApi.checkStatus();
        if (!data.setup_required) {
          navigate("/login", { replace: true });
        }
      } catch {}
      setLoading(false);
    };
    check();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.admin_password !== form.confirm_password) {
      toast.error("Passwords do not match");
      return;
    }
    if (form.admin_password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      await setupApi.createSuperAdmin({
        org_name: form.org_name,
        admin_name: form.admin_name,
        admin_email: form.admin_email,
        admin_password: form.admin_password,
        timezone: form.timezone,
      });
      toast.success("Setup completed! Please log in.");
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" data-testid="setup-page">
      {/* Left panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-xl font-semibold tracking-tight">ShiftRoster</span>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Open Source</p>
            </div>
          </div>

          <h1 className="text-3xl font-bold tracking-tight mb-2">Initial Setup</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Configure your organization and create the SuperAdmin account
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Step 1: Organization */}
            {step === 1 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 text-sm font-medium text-primary mb-4">
                  <Sparkles className="h-4 w-4" />
                  Step 1 of 2 — Organization Details
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org_name">Organization Name</Label>
                  <Input
                    id="org_name"
                    placeholder="e.g., Acme Corp"
                    value={form.org_name}
                    onChange={(e) => setForm({ ...form, org_name: e.target.value })}
                    required
                    data-testid="setup-org-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                    <SelectTrigger data-testid="setup-timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                      <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                      <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                      <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
                      <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                      <SelectItem value="Australia/Sydney">Australia/Sydney (AEST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={!form.org_name.trim()}
                  onClick={() => setStep(2)}
                  data-testid="setup-next-btn"
                >
                  Next <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}

            {/* Step 2: SuperAdmin */}
            {step === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 text-sm font-medium text-primary mb-4">
                  <Shield className="h-4 w-4" />
                  Step 2 of 2 — SuperAdmin Account
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin_name">Full Name</Label>
                  <Input
                    id="admin_name"
                    placeholder="Admin Name"
                    value={form.admin_name}
                    onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                    required
                    data-testid="setup-admin-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin_email">Email</Label>
                  <Input
                    id="admin_email"
                    type="email"
                    placeholder="admin@company.com"
                    value={form.admin_email}
                    onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                    required
                    data-testid="setup-admin-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin_password">Password</Label>
                  <Input
                    id="admin_password"
                    type="password"
                    placeholder="Minimum 6 characters"
                    value={form.admin_password}
                    onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                    required
                    data-testid="setup-admin-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Confirm Password</Label>
                  <Input
                    id="confirm_password"
                    type="password"
                    placeholder="Re-enter password"
                    value={form.confirm_password}
                    onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                    required
                    data-testid="setup-confirm-password"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="w-full"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submitting}
                    data-testid="setup-submit-btn"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>Complete Setup <ArrowRight className="h-4 w-4 ml-2" /></>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Right panel - Visual */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-primary/5 relative overflow-hidden">
        <div className="relative z-10 max-w-md text-center px-8">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <CalendarDays className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight mb-3">
            Welcome to ShiftRoster
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-4">
            Open source shift roster and management dashboard. Streamline scheduling,
            manage teams, track attendance, and keep everyone in sync.
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">✓ Drag & Drop Scheduling</span>
            <span className="flex items-center gap-1">✓ MFA Support</span>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground mt-2">
            <span className="flex items-center gap-1">✓ Real-time Presence</span>
            <span className="flex items-center gap-1">✓ Analytics</span>
          </div>
        </div>
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-primary" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
}
