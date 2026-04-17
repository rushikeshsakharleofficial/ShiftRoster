import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { reportsApi, attendanceApi, tasksApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Users, Building2, CalendarDays, Clock, ClipboardList,
  ArrowLeftRight, TrendingUp, UserCheck, Loader2
} from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);

  const isAdmin = user?.system_role === "admin";
  const isManager = user?.system_role === "manager";

  useEffect(() => {
    const load = async () => {
      try {
        const promises = [tasksApi.getPendingCount()];
        if (isAdmin || isManager) {
          promises.push(reportsApi.overview());
        }
        
        const results = await Promise.all(promises);
        setPendingTasksCount(results[0]?.data?.count || 0);
        if (results[1]) {
          setStats(results[1].data);
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [isAdmin, isManager]);

  const handleClockIn = async () => {
    setClockLoading(true);
    try {
      await attendanceApi.clockIn({});
      setClockedIn(true);
    } catch {}
    setClockLoading(false);
  };

  const handleClockOut = async () => {
    setClockLoading(true);
    try {
      await attendanceApi.clockOut();
      setClockedIn(false);
    } catch {}
    setClockLoading(false);
  };

  const statCards = stats ? [
    { label: "Total Employees", value: stats.total_employees, icon: Users, color: "text-emerald-500" },
    { label: "Total Managers", value: stats.total_managers, icon: UserCheck, color: "text-sky-500" },
    { label: "Active Users", value: stats.active_employees, icon: TrendingUp, color: "text-violet-500" },
    { label: "Departments", value: stats.total_departments, icon: Building2, color: "text-amber-500" },
    { label: "Total Shifts", value: stats.total_shifts, icon: CalendarDays, color: "text-indigo-500" },
    { label: "Clocked In Today", value: stats.clocked_in_today, icon: Clock, color: "text-emerald-500" },
    { label: "Pending Leaves", value: stats.pending_leaves, icon: ClipboardList, color: "text-orange-500" },
    { label: "Pending Swaps", value: stats.pending_swaps, icon: ArrowLeftRight, color: "text-rose-500" },
  ] : [];

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {user?.full_name?.split(" ")[0] || "User"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{user?.system_role?.toUpperCase()}</Badge>
          {user?.employee_level && <Badge variant="secondary" className="text-xs">{user.employee_level}</Badge>}
        </div>
      </div>

      {/* Clock In/Out */}
      <Card className="border">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{clockedIn ? "You are clocked in" : "Ready to start your shift?"}</p>
              <p className="text-xs text-muted-foreground">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
          <Button
            data-testid={clockedIn ? "clock-out-btn" : "clock-in-btn"}
            variant={clockedIn ? "destructive" : "default"}
            size="sm"
            onClick={clockedIn ? handleClockOut : handleClockIn}
            disabled={clockLoading}
          >
            {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (clockedIn ? "Clock Out" : "Clock In")}
          </Button>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      {(isAdmin || isManager) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {loading ? (
            Array(8).fill(0).map((_, i) => (
              <Card key={i} className="border animate-pulse">
                <CardContent className="p-4"><div className="h-16 bg-muted rounded" /></CardContent>
              </Card>
            ))
          ) : (
            statCards.map((s) => (
              <Card key={s.label} className="border hover:-translate-y-0.5 transition-transform">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                    <span className="text-2xl font-bold">{s.value}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border cursor-pointer hover:-translate-y-0.5 transition-transform" onClick={() => navigate("/handovers")} data-testid="quick-action-handovers">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Handovers</p>
                {pendingTasksCount > 0 && (
                  <Badge variant="destructive" className="h-4 px-1 text-[9px]">{pendingTasksCount}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Manage your tasks</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border cursor-pointer hover:-translate-y-0.5 transition-transform" onClick={() => navigate("/shifts")} data-testid="quick-action-shifts">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Shift Calendar</p>
              <p className="text-xs text-muted-foreground">View and manage shifts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border cursor-pointer hover:-translate-y-0.5 transition-transform" onClick={() => navigate("/leave")} data-testid="quick-action-leave">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Leave Requests</p>
              <p className="text-xs text-muted-foreground">Manage time off</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border cursor-pointer hover:-translate-y-0.5 transition-transform" onClick={() => navigate("/attendance")} data-testid="quick-action-attendance">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Attendance</p>
              <p className="text-xs text-muted-foreground">Clock in/out records</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
