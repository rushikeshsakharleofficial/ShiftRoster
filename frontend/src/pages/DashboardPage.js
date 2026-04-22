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
  UserX, UserMinus, CalendarCheck2, Sparkles, ArrowRight,
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

  /* ── Stat card ── */
  const StatCard = ({ label, value, icon: Icon, color, sub }) => (
    <Card className="border hover:-translate-y-1 transition-all duration-200 group cursor-default">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color.bg} transition-transform duration-200 group-hover:scale-110`}>
            <Icon className={`h-4 w-4 ${color.icon}`} />
          </div>
          <span className="font-mono-data text-3xl font-medium tabular-nums text-foreground leading-none">
            {value ?? "—"}
          </span>
        </div>
        <p className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );

  /* ── Section label ── */
  const SectionLabel = ({ children }) => (
    <div className="flex items-center gap-3 mb-4">
      <p className="font-mono-data text-[10px] font-medium text-muted-foreground/60 uppercase tracking-[0.18em]">{children}</p>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.full_name?.split(" ")[0] || "there";

  return (
    <div data-testid="dashboard-page" className="space-y-7 dispatch-stagger">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-[2rem] sm:text-[2.25rem] leading-tight text-foreground">
            {greeting},&nbsp;
            <span className="italic">{firstName}.</span>
          </h1>
          <p className="font-mono-data text-[11px] text-muted-foreground/60 mt-2 uppercase tracking-wider">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="font-mono-data text-[10px] uppercase tracking-wider">
            {user?.system_role}
          </Badge>
          {user?.employee_level && (
            <Badge variant="secondary" className="font-mono-data text-[10px]">{user.employee_level}</Badge>
          )}
        </div>
      </div>

      {/* ── Clock In/Out ── */}
      <Card className={`border transition-all duration-300 ${clockedIn ? "border-emerald-500/30 dark:border-emerald-500/20" : ""}`}>
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                clockedIn ? "bg-emerald-500/10" : "bg-primary/10"
              }`}>
                <Clock className={`h-5 w-5 transition-colors duration-300 ${clockedIn ? "text-emerald-500" : "text-primary"}`} />
              </div>
              {clockedIn && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 pulse-active border-2 border-background" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {clockedIn ? "You're clocked in" : "Ready to start your shift?"}
              </p>
              <p className="font-mono-data text-[11px] text-muted-foreground/60 mt-0.5 uppercase tracking-wider">
                {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <Button
            data-testid={clockedIn ? "clock-out-btn" : "clock-in-btn"}
            variant={clockedIn ? "destructive" : "default"}
            size="sm"
            onClick={clockedIn ? handleClockOut : handleClockIn}
            disabled={clockLoading}
            className="shrink-0"
          >
            {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (clockedIn ? "Clock Out" : "Clock In")}
          </Button>
        </CardContent>
      </Card>

      {/* ── Admin / Manager Metrics ── */}
      {(isAdmin || isManager) && (
        <div className="space-y-7">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array(12).fill(0).map((_, i) => (
                <Card key={i} className="border animate-pulse">
                  <CardContent className="p-5"><div className="h-[72px] bg-muted/60 rounded-lg" /></CardContent>
                </Card>
              ))}
            </div>
          ) : stats && (
            <>
              <div>
                <SectionLabel>Workforce</SectionLabel>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Total Employees" value={stats.total_employees} icon={Users}
                    color={{ bg: "bg-emerald-500/10", icon: "text-emerald-500" }} />
                  <StatCard label="Total Managers" value={stats.total_managers} icon={UserCheck}
                    color={{ bg: "bg-sky-500/10", icon: "text-sky-500" }} />
                  <StatCard label="Active Users" value={stats.active_employees} icon={TrendingUp}
                    color={{ bg: "bg-violet-500/10", icon: "text-violet-500" }} />
                  <StatCard label="Departments" value={stats.total_departments} icon={Building2}
                    color={{ bg: "bg-amber-500/10", icon: "text-amber-500" }}
                    sub={stats.new_hires_this_month > 0 ? `+${stats.new_hires_this_month} this month` : undefined} />
                </div>
              </div>

              <div>
                <SectionLabel>Today's Activity</SectionLabel>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Shifts Scheduled" value={stats.shifts_today} icon={CalendarCheck2}
                    color={{ bg: "bg-indigo-500/10", icon: "text-indigo-500" }}
                    sub={`of ${stats.total_shifts} total`} />
                  <StatCard label="Clocked In" value={stats.clocked_in_today} icon={Clock}
                    color={{ bg: "bg-emerald-500/10", icon: "text-emerald-500" }}
                    sub={`of ${stats.active_employees} active`} />
                  <StatCard label="Absent Today" value={stats.absent_today} icon={UserX}
                    color={{ bg: "bg-rose-500/10", icon: "text-rose-500" }} />
                  <StatCard label="On Leave" value={stats.on_leave_today} icon={UserMinus}
                    color={{ bg: "bg-orange-500/10", icon: "text-orange-500" }} />
                </div>
              </div>

              <div>
                <SectionLabel>Pending Actions</SectionLabel>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <StatCard label="Leave Requests" value={stats.pending_leaves} icon={ClipboardList}
                    color={{ bg: "bg-orange-500/10", icon: "text-orange-500" }} sub="awaiting approval" />
                  <StatCard label="Shift Swaps" value={stats.pending_swaps} icon={ArrowLeftRight}
                    color={{ bg: "bg-rose-500/10", icon: "text-rose-500" }} sub="awaiting approval" />
                  <StatCard label="My Tasks" value={pendingTasksCount} icon={Sparkles}
                    color={{ bg: "bg-violet-500/10", icon: "text-violet-500" }} sub="pending" />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Employee pending tasks banner ── */}
      {!isAdmin && !isManager && pendingTasksCount > 0 && (
        <Card className="border border-orange-500/20 bg-orange-500/[0.04]">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                <ClipboardList className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {pendingTasksCount} pending handover{pendingTasksCount > 1 ? "s" : ""}
                </p>
                <p className="text-[11px] text-muted-foreground">Tasks assigned to you</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate("/handovers")}>
              View <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Quick Actions ── */}
      <div>
        {(isAdmin || isManager) && <SectionLabel>Quick Actions</SectionLabel>}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { to: "/handovers", icon: ClipboardList, label: "Handovers", sub: "Manage your tasks", color: { bg: "bg-primary/10", icon: "text-primary" }, badge: pendingTasksCount, testid: "quick-action-handovers" },
            { to: "/shifts", icon: CalendarDays, label: "Shift Calendar", sub: "View & manage shifts", color: { bg: "bg-indigo-500/10", icon: "text-indigo-500" }, testid: "quick-action-shifts" },
            { to: "/leave", icon: ClipboardList, label: "Leave Requests", sub: "Manage time off", color: { bg: "bg-orange-500/10", icon: "text-orange-500" }, testid: "quick-action-leave" },
            { to: "/attendance", icon: Clock, label: "Attendance", sub: "Clock in/out records", color: { bg: "bg-emerald-500/10", icon: "text-emerald-500" }, testid: "quick-action-attendance" },
          ].map(({ to, icon: Icon, label, sub, color, badge, testid }) => (
            <Card key={to}
              className="border cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-black/[0.06] dark:hover:shadow-black/30 transition-all duration-200 group"
              onClick={() => navigate(to)} data-testid={testid}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color.bg} transition-transform duration-200 group-hover:scale-105 shrink-0`}>
                  <Icon className={`h-5 w-5 ${color.icon}`} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{label}</p>
                    {badge > 0 && (
                      <Badge variant="destructive" className="h-4 px-1 text-[9px] font-mono-data shrink-0">{badge}</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
