import { useState, useEffect } from "react";
import { auditApi } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ScrollText } from "lucide-react";

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (entityFilter && entityFilter !== "all") params.entity = entityFilter;
      const { data } = await auditApi.list(params);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [entityFilter]);

  const actionColor = (a) => {
    if (a === "create") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    if (a === "delete") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    if (a === "update") return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
    if (a === "approved") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    if (a === "rejected") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
  };

  return (
    <div data-testid="audit-log-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground">{total} records</p>
        </div>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[160px]" data-testid="audit-entity-filter">
            <SelectValue placeholder="All Entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="department">Department</SelectItem>
            <SelectItem value="shift">Shift</SelectItem>
            <SelectItem value="leave_request">Leave Request</SelectItem>
            <SelectItem value="manager_group">Manager Group</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Entity ID</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No audit logs
              </TableCell></TableRow>
            ) : (
              logs.map(l => (
                <TableRow key={l.id} data-testid={`audit-row-${l.id}`}>
                  <TableCell className="font-medium">{l.actor_name || "System"}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${actionColor(l.action)}`}>{l.action}</Badge></TableCell>
                  <TableCell className="text-sm">{l.entity}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{l.entity_id ? l.entity_id.substring(0, 8) + "..." : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.created_at ? new Date(l.created_at).toLocaleString() : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
