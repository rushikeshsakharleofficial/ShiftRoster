import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { attendanceApi, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Clock, LogIn, LogOut, Loader2 } from "lucide-react";

export default function AttendancePage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);

  const loadData = async () => {
    try {
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

  const formatTime = (t) => t ? new Date(t).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const statusColor = (s) => {
    if (s === "present") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    if (s === "late") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    if (s === "absent") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
  };

  return (
    <div data-testid="attendance-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
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
          <div className="flex gap-2">
            {!clockedIn ? (
              <Button data-testid="clock-in-btn" onClick={handleClockIn} disabled={clockLoading} className="gap-2">
                {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Clock In
              </Button>
            ) : (
              <Button data-testid="clock-out-btn" variant="destructive" onClick={handleClockOut} disabled={clockLoading} className="gap-2">
                {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Clock Out
              </Button>
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
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No attendance records</TableCell></TableRow>
            ) : (
              logs.map(l => (
                <TableRow key={l.id} data-testid={`attendance-row-${l.id}`}>
                  {(user?.system_role === "admin" || user?.system_role === "manager") && <TableCell className="font-medium">{l.user_name || "—"}</TableCell>}
                  <TableCell className="text-sm">{formatTime(l.clock_in)}</TableCell>
                  <TableCell className="text-sm">{formatTime(l.clock_out)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{l.clock_in_method || "web"}</Badge></TableCell>
                  <TableCell><Badge className={`text-[10px] ${statusColor(l.status)}`}>{l.status}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
