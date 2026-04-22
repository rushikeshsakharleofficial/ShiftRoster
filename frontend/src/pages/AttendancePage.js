import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { attendanceApi, orgApi, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Clock, LogIn, LogOut, Loader2, TimerReset } from "lucide-react";

const EXTEND_OPTIONS = [
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "90 minutes", value: 90 },
  { label: "2 hours", value: 120 },
];

export default function AttendancePage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);
  const [enabled, setEnabled] = useState(null);
  const [showExtend, setShowExtend] = useState(false);
  const [extendMinutes, setExtendMinutes] = useState(30);
  const [extendLoading, setExtendLoading] = useState(false);

  const loadData = async () => {
    try {
      const { data: orgData } = await orgApi.get();
      if (!orgData.attendance_enabled) { setEnabled(false); setLoading(false); return; }
      setEnabled(true);
      const { data } = await attendanceApi.list();
      setLogs(data || []);
      const hasOpen = (data || []).some(l => l.clock_in && !l.clock_out && l.user_id === user?.id);
      setClockedIn(hasOpen);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleClockIn = async () => {
    setClockLoading(true);
    try {
      await attendanceApi.clockIn({ method: "web" });
      toast.success("Clocked in successfully");
      setClockedIn(true);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setClockLoading(false);
  };

  const handleClockOut = async () => {
    setClockLoading(true);
    try {
      await attendanceApi.clockOut();
      toast.success("Clocked out successfully");
      setClockedIn(false);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setClockLoading(false);
  };

  const handleExtendShift = async () => {
    setExtendLoading(true);
    try {
      await attendanceApi.extendShift({ minutes: extendMinutes });
      toast.success(`Shift extended by ${extendMinutes} minutes`);
      setShowExtend(false);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setExtendLoading(false);
  };

  const formatTime = (t) => t ? new Date(t).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const statusColor = (s) => {
    if (s === "present") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    if (s === "late") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    if (s === "absent") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
  };

  if (enabled === false) {
    return (
      <div data-testid="attendance-page" className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <Clock className="h-12 w-12 text-muted-foreground opacity-30" />
        <p className="text-lg font-medium">Attendance tracking is not enabled</p>
        <p className="text-sm text-muted-foreground">A manager or admin can activate it in Settings.</p>
      </div>
    );
  }

  return (
    <div data-testid="attendance-page" className="space-y-6 dispatch-stagger">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[2rem] leading-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">Track your work hours</p>
        </div>
      </div>

      {/* Clock In/Out Card */}
      <Card className="border">
        <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-xl flex items-center justify-center ${clockedIn ? "bg-emerald-500/10" : "bg-muted"}`}>
              <Clock className={`h-7 w-7 ${clockedIn ? "text-emerald-500" : "text-muted-foreground"}`} />
            </div>
            <div>
              <h3 className="font-medium">{clockedIn ? "Currently Clocked In" : "Not Clocked In"}</h3>
              <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-center sm:justify-end">
            {!clockedIn ? (
              <Button data-testid="clock-in-btn" onClick={handleClockIn} disabled={clockLoading} className="gap-2">
                {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Clock In
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowExtend(true)}
                  className="gap-2"
                  data-testid="extend-shift-btn"
                >
                  <TimerReset className="h-4 w-4" />
                  Extend Shift
                </Button>
                <Button data-testid="clock-out-btn" variant="destructive" onClick={handleClockOut} disabled={clockLoading} className="gap-2">
                  {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  Clock Out
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Attendance Log */}
      <Card className="border">
        <Table>
          <TableHeader>
            <TableRow>
              {(user?.system_role === "admin" || user?.system_role === "manager") && <TableHead>Employee</TableHead>}
              <TableHead>Clock In</TableHead>
              <TableHead>Clock Out</TableHead>
              <TableHead>Extended</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No attendance records</TableCell></TableRow>
            ) : (
              logs.map(l => (
                <TableRow key={l.id} data-testid={`attendance-row-${l.id}`}>
                  {(user?.system_role === "admin" || user?.system_role === "manager") && <TableCell className="font-medium">{l.user_name || "—"}</TableCell>}
                  <TableCell className="text-sm">{formatTime(l.clock_in)}</TableCell>
                  <TableCell className="text-sm">{formatTime(l.clock_out)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {l.extended_minutes ? `+${l.extended_minutes}m` : "—"}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{l.clock_in_method || "web"}</Badge></TableCell>
                  <TableCell><Badge className={`text-[10px] ${statusColor(l.status)}`}>{l.status}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Extend Shift Dialog */}
      <Dialog open={showExtend} onOpenChange={setShowExtend}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Extend Shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">How long do you want to extend your current shift?</p>
            <div className="grid grid-cols-2 gap-2">
              {EXTEND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExtendMinutes(opt.value)}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    extendMinutes === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border bg-background hover:bg-accent"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtend(false)}>Cancel</Button>
            <Button onClick={handleExtendShift} disabled={extendLoading} className="gap-2">
              {extendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TimerReset className="h-4 w-4" />}
              Extend {extendMinutes}m
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
