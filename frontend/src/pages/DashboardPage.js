import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { reportsApi, attendanceApi, tasksApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Users, Building2, CalendarDays, Clock, ClipboardList,
  ArrowLeftRight, TrendingUp, UserCheck, Loader2,
  UserX, UserMinus, CalendarCheck2, Sparkles,
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
        if (isAdmin || isManager) promises.push(reportsApi.overview());
        const results = await Promise.all(promises);
        setPendingTasksCount(results[0]?.data?.count || 0);
        if (results[1]) setStats(results[1].data);
      } catch {}
      setLoading(false);
    };
    load();
  }, [isAdmin, isManager]);

  const handleClockIn = async () => {
    setClockLoading(true);
    try { await attendanceApi.clockIn({}); setClockedIn(true); } catch {}
    setClockLoading(false);
  };

  const handleClockOut = async () => {
    setClockLoading(true);
    try { await attendanceApi.clockOut(); setClockedIn(false); } catch {}
    setClockLoading(false);
  };

  const StatCard = ({ label, value, icon: Icon, color, sub }) => (
    <Card className="border hover:-translate-y-0.5 transition-transform">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color.bg}`}>
            <Icon className={`h-4.5 w-4.5 ${color.icon}`} />
          </div>
          <span className="text-2xl font-bold tabular-nums">{value ?? "—"}</span>
        </div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );

  const SectionLabel = ({ children }) => (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{children}</p>
  );

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

      {/* Admin / Manager Metrics */}
      {(isAdmin || isManager) && (
        <div className="space-y-6">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array(12).fill(0).map((_, i) => (
                <Card key={i} className="border animate-pulse">
                  <CardContent className="p-4"><div className="h-20 bg-muted rounded" /></CardContent>
                </Card>
              ))}
            </div>
          ) : stats && (
            <>
              {/* Workforce */}
              <div>
                <SectionLabel>Workforce</SectionLabel>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    label="Total Employees"
                    value={stats.total_employees}
                    icon={Users}
                    color={{ bg: "bg-emerald-500/10", icon: "text-emerald-600" }}
                  />
                  <StatCard
                    label="Total Managers"
                    value={stats.total_managers}
                    icon={UserCheck}
                    color={{ bg: "bg-sky-500/10", icon: "text-sky-600" }}
                  />
                  <StatCard
                    label="Active Users"
                    value={stats.active_employees}
                    icon={TrendingUp}
                    color={{ bg: "bg-violet-500/10", icon: "text-violet-600" }}
                  />
                  <StatCard
                    label="Departments"
                    value={stats.total_departments}
                    icon={Building2}
                    color={{ bg: "bg-amber-500/10", icon: "text-amber-600" }}
                    sub={stats.new_hires_this_month > 0 ? `+${stats.new_hires_this_month} new this month` : undefined}
                  />
                </div>
              </div>

              {/* Today's Activity */}
              <div>
                <SectionLabel>Today's Activity</SectionLabel>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    label="Shifts Scheduled"
                    value={stats.shifts_today}
                    icon={CalendarCheck2}
                    color={{ bg: "bg-indigo-500/10", icon: "text-indigo-600" }}
                    sub={`of ${stats.total_shifts} total`}
                  />
                  <StatCard
                    label="Clocked In"
                    value={stats.clocked_in_today}
                    icon={Clock}
                    color={{ bg: "bg-emerald-500/10", icon: "text-emerald-600" }}
                    sub={`of ${stats.active_employees} active`}
                  />
                  <StatCard
                    label="Absent Today"
                    value={stats.absent_today}
                    icon={UserX}
                    color={{ bg: "bg-rose-500/10", icon: "text-rose-600" }}
                  />
                  <StatCard
                    label="On Leave Today"
                    value={stats.on_leave_today}
                    icon={UserMinus}
                    color={{ bg: "bg-orange-500/10", icon: "text-orange-600" }}
                  />
                </div>
              </div>

              {/* Pending Actions */}
              <div>
                <SectionLabel>Pending Actions</SectionLabel>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <StatCard
                    label="Leave Requests"
                    value={stats.pending_leaves}
                    icon={ClipboardList}
                    color={{ bg: "bg-orange-500/10", icon: "text-orange-600" }}
                    sub="awaiting approval"
                  />
                  <StatCard
                    label="Shift Swaps"
                    value={stats.pending_swaps}
                    icon={ArrowLeftRight}
                    color={{ bg: "bg-rose-500/10", icon: "text-rose-600" }}
                    sub="awaiting approval"
                  />
                  <StatCard
                    label="My Tasks"
                    value={pendingTasksCount}
                    icon={Sparkles}
                    color={{ bg: "bg-violet-500/10", icon: "text-violet-600" }}
                    sub="pending handovers"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Employee — pending tasks summary */}
      {!isAdmin && !isManager && pendingTasksCount > 0 && (
        <Card className="border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <ClipboardList className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium">You have {pendingTasksCount} pending handover{pendingTasksCount > 1 ? "s" : ""}</p>
                <p className="text-xs text-muted-foreground">Tasks assigned to you</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/handovers")}>View</Button>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div>
        {(isAdmin || isManager) && <SectionLabel>Quick Actions</SectionLabel>}
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
    </div>
  );
}
