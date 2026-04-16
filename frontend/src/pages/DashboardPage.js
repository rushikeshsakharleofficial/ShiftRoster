import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { reportsApi, attendanceApi } from "@/lib/api";
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
  const [loading, setLoading] = useState(true);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);

  const isAdmin = user?.system_role === "admin";
  const isManager = user?.system_role === "manager";

  useEffect(() => {
    const load = async () => {
      try {
        if (isAdmin || isManager) {
          const { data } = await reportsApi.overview();
          setStats(data);
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
    { label: "Total Employees", value: stats.total_employees, icon: Users, iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400" },
    { label: "Total Managers", value: stats.total_managers, icon: UserCheck, iconBg: "bg-sky-500/10", iconColor: "text-sky-400" },
    { label: "Active Users", value: stats.active_employees, icon: TrendingUp, iconBg: "bg-violet-500/10", iconColor: "text-violet-400" },
    { label: "Departments", value: stats.total_departments, icon: Building2, iconBg: "bg-amber-500/10", iconColor: "text-amber-400" },
    { label: "Total Shifts", value: stats.total_shifts, icon: CalendarDays, iconBg: "bg-indigo-500/10", iconColor: "text-indigo-400" },
    { label: "Clocked In", value: stats.clocked_in_today, icon: Clock, iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400" },
    { label: "Pending Leaves", value: stats.pending_leaves, icon: ClipboardList, iconBg: "bg-orange-500/10", iconColor: "text-orange-400" },
    { label: "Pending Swaps", value: stats.pending_swaps, icon: ArrowLeftRight, iconBg: "bg-rose-500/10", iconColor: "text-rose-400" },
  ] : [];

  return (
    <div data-testid="dashboard-page" className="space-y-6 min-h-screen bg-background p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Welcome back, {user?.full_name?.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary border border-primary/20 text-xs px-2 py-0.5 rounded-full font-medium">
            {user?.system_role?.toUpperCase()}
          </span>
          {user?.employee_level && (
            <span className="bg-card text-muted-foreground border border-border text-xs px-2 py-0.5 rounded-full font-medium">
              {user.employee_level}
            </span>
          )}
        </div>
      </div>

      {/* Clock In/Out */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-lg p-2.5 flex items-center justify-center">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{clockedIn ? "You are clocked in" : "Ready to start your shift?"}</p>
            <p className="text-xs text-muted-foreground">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>
        {clockedIn ? (
          <button
            data-testid="clock-out-btn"
            onClick={handleClockOut}
            disabled={clockLoading}
            className="bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors hover:bg-destructive/20"
          >
            {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Clock Out"}
          </button>
        ) : (
          <button
            data-testid="clock-in-btn"
            onClick={handleClockIn}
            disabled={clockLoading}
            className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
          >
            {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Clock In"}
          </button>
        )}
      </div>

      {/* Stats Grid */}
      {(isAdmin || isManager) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {loading ? (
            Array(8).fill(0).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
                <div className="h-16 bg-border rounded" />
              </div>
            ))
          ) : (
            statCards.map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{s.label}</span>
                  <div className={`h-8 w-8 rounded-lg ${s.iconBg} flex items-center justify-center`}>
                    <s.icon className={`h-4 w-4 ${s.iconColor}`} />
                  </div>
                </div>
                <p className="text-3xl font-bold text-foreground font-mono tabular-nums tracking-tight mt-3">{s.value}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="bg-card border border-border rounded-xl p-5 cursor-pointer hover:border-primary/30 hover:-translate-y-0.5 transition-all flex items-center gap-3"
          onClick={() => navigate("/shifts")}
          data-testid="quick-action-shifts"
        >
          <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
            <CalendarDays className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Shift Calendar</p>
            <p className="text-xs text-muted-foreground">View and manage shifts</p>
          </div>
        </div>
        <div
          className="bg-card border border-border rounded-xl p-5 cursor-pointer hover:border-primary/30 hover:-translate-y-0.5 transition-all flex items-center gap-3"
          onClick={() => navigate("/leave")}
          data-testid="quick-action-leave"
        >
          <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
            <ClipboardList className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Leave Requests</p>
            <p className="text-xs text-muted-foreground">Manage time off</p>
          </div>
        </div>
        <div
          className="bg-card border border-border rounded-xl p-5 cursor-pointer hover:border-primary/30 hover:-translate-y-0.5 transition-all flex items-center gap-3"
          onClick={() => navigate("/attendance")}
          data-testid="quick-action-attendance"
        >
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Attendance</p>
            <p className="text-xs text-muted-foreground">Clock in/out records</p>
          </div>
        </div>
      </div>
    </div>
  );
}
