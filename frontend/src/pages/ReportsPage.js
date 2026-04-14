import { useState, useEffect } from "react";
import { reportsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, Users, Clock, CalendarDays, ClipboardList, ArrowLeftRight, Building2, UserCheck } from "lucide-react";

export default function ReportsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await reportsApi.overview();
        setStats(data);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div data-testid="reports-page" className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cards = stats ? [
    { label: "Total Employees", value: stats.total_employees, icon: Users, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Total Managers", value: stats.total_managers, icon: UserCheck, color: "text-sky-500", bg: "bg-sky-500/10" },
    { label: "Active Users", value: stats.active_employees, icon: Users, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Departments", value: stats.total_departments, icon: Building2, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Total Shifts", value: stats.total_shifts, icon: CalendarDays, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { label: "Clocked In Today", value: stats.clocked_in_today, icon: Clock, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Pending Leaves", value: stats.pending_leaves, icon: ClipboardList, color: "text-orange-500", bg: "bg-orange-500/10" },
    { label: "Pending Swaps", value: stats.pending_swaps, icon: ArrowLeftRight, color: "text-rose-500", bg: "bg-rose-500/10" },
  ] : [];

  return (
    <div data-testid="reports-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Organization overview and statistics</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.label} className="border hover:-translate-y-0.5 transition-transform">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`h-10 w-10 rounded-lg ${c.bg} flex items-center justify-center`}>
                  <c.icon className={`h-5 w-5 ${c.color}`} />
                </div>
              </div>
              <p className="text-3xl font-bold">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border">
        <CardContent className="p-8 text-center text-muted-foreground">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Detailed Charts Coming Soon</p>
          <p className="text-sm mt-1">Attendance trends, shift coverage, and more</p>
        </CardContent>
      </Card>
    </div>
  );
}
