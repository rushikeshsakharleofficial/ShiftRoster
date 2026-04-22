import { useState, useEffect } from "react";
import { reportsApi, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2, BarChart3, Users, Clock, CalendarDays, ClipboardList,
  ArrowLeftRight, Building2, UserCheck, Download, TrendingUp
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area
} from "recharts";

const COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#EC4899", "#06B6D4", "#84CC16"];

export default function ReportsPage() {
  const [stats, setStats] = useState(null);
  const [attendanceChart, setAttendanceChart] = useState([]);
  const [shiftCoverage, setShiftCoverage] = useState([]);
  const [deptBreakdown, setDeptBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, attRes, covRes, deptRes] = await Promise.all([
          reportsApi.overview(),
          reportsApi.attendanceChart({ days: 14 }),
          reportsApi.shiftCoverage({ days: 7 }),
          reportsApi.departmentBreakdown(),
        ]);
        setStats(statsRes.data);
        setAttendanceChart(attRes.data || []);
        setShiftCoverage(covRes.data || []);
        setDeptBreakdown(deptRes.data || []);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const handleExport = async (type) => {
    setExporting(true);
    try {
      const response = await reportsApi.exportCsv(type);
      const blob = new Blob([response.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}_report.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${type} report exported`);
    } catch (err) {
      toast.error("Failed to export report");
    }
    setExporting(false);
  };

  if (loading) {
    return <div data-testid="reports-page" className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const statCards = stats ? [
    { label: "Total Employees", value: stats.total_employees, icon: Users, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Total Managers", value: stats.total_managers, icon: UserCheck, color: "text-sky-500", bg: "bg-sky-500/10" },
    { label: "Active Users", value: stats.active_employees, icon: TrendingUp, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Departments", value: stats.total_departments, icon: Building2, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Total Shifts", value: stats.total_shifts, icon: CalendarDays, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { label: "Clocked In Today", value: stats.clocked_in_today, icon: Clock, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Pending Leaves", value: stats.pending_leaves, icon: ClipboardList, color: "text-orange-500", bg: "bg-orange-500/10" },
    { label: "Pending Swaps", value: stats.pending_swaps, icon: ArrowLeftRight, color: "text-rose-500", bg: "bg-rose-500/10" },
  ] : [];

  return (
    <div data-testid="reports-page" className="space-y-6 dispatch-stagger">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-[2rem] leading-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Organization overview and analytics</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select onValueChange={handleExport} disabled={exporting}>
            <SelectTrigger className="w-[170px]" data-testid="export-select">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                <span>{exporting ? "Exporting..." : "Export CSV"}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="attendance">Attendance Report</SelectItem>
              <SelectItem value="employees">Employee Report</SelectItem>
              <SelectItem value="shifts">Shifts Report</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(c => (
          <Card key={c.label} className="border hover:-translate-y-0.5 transition-transform">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className={`h-9 w-9 rounded-lg ${c.bg} flex items-center justify-center`}>
                  <c.icon className={`h-4 w-4 ${c.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <Tabs defaultValue="attendance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="attendance" data-testid="tab-attendance">Attendance Trends</TabsTrigger>
          <TabsTrigger value="coverage" data-testid="tab-coverage">Shift Coverage</TabsTrigger>
          <TabsTrigger value="departments" data-testid="tab-departments">Departments</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance">
          <Card className="border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Daily Attendance (Last 14 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              {attendanceChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={attendanceChart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 11 }} />
                    <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                    <RechartsTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    />
                    <Area type="monotone" dataKey="present" stroke="#6366F1" fill="#6366F1" fillOpacity={0.15} name="Present" strokeWidth={2} />
                    <Area type="monotone" dataKey="late" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.1} name="Late" strokeWidth={2} />
                    <Legend />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">No attendance data yet. Clock in to start tracking.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coverage">
          <Card className="border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Shift Coverage (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              {shiftCoverage.length > 0 && shiftCoverage.some(d => d.total_shifts > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={shiftCoverage}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 11 }} />
                    <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                    <RechartsTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    />
                    <Bar dataKey="filled_shifts" fill="#10B981" name="Filled" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="unfilled" fill="#EF4444" name="Unfilled" radius={[4, 4, 0, 0]} />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">No shift data yet. Create shifts to see coverage.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Employees by Department</CardTitle>
              </CardHeader>
              <CardContent>
                {deptBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={deptBreakdown} dataKey="employees" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                        {deptBreakdown.map((d, i) => <Cell key={i} fill={d.color || COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No department data</div>
                )}
              </CardContent>
            </Card>
            <Card className="border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Shifts by Department</CardTitle>
              </CardHeader>
              <CardContent>
                {deptBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={deptBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                      <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                      <Bar dataKey="shifts" name="Shifts" radius={[0, 4, 4, 0]}>
                        {deptBreakdown.map((d, i) => <Cell key={i} fill={d.color || COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No department data</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
