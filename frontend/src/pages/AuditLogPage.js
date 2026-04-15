import { useState, useEffect, useCallback, useRef } from "react";
import { auditApi } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ScrollText, ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp } from "lucide-react";

const ENTITY_OPTIONS = [
  { value: "all", label: "All Entities" },
  { value: "user", label: "User" },
  { value: "department", label: "Department" },
  { value: "shift", label: "Shift" },
  { value: "shift_template", label: "Shift Template" },
  { value: "leave_request", label: "Leave Request" },
  { value: "manager_group", label: "Manager Group" },
  { value: "manager_nomination", label: "Manager Nomination" },
  { value: "attendance", label: "Attendance" },
  { value: "swap_request", label: "Swap Request" },
  { value: "recurring_shifts", label: "Recurring Shifts" },
];

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "move", label: "Move" },
  { value: "mfa_mandate", label: "MFA Mandate" },
];

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [actorSearch, setActorSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Debounce actor search
  const [debouncedActor, setDebouncedActor] = useState("");
  const actorTimer = useRef(null);

  // Expanded diff rows
  const [expandedRows, setExpandedRows] = useState(new Set());

  const handleActorInput = (val) => {
    setActorSearch(val);
    clearTimeout(actorTimer.current);
    actorTimer.current = setTimeout(() => {
      setDebouncedActor(val);
      setPage(0);
    }, 400);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { skip: page * PAGE_SIZE, limit: PAGE_SIZE };
      if (entityFilter && entityFilter !== "all") params.entity = entityFilter;
      if (actionFilter && actionFilter !== "all") params.action = actionFilter;
      if (debouncedActor) params.actor_id = debouncedActor;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const { data } = await auditApi.list(params);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch {}
    setLoading(false);
  }, [page, entityFilter, actionFilter, debouncedActor, startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [entityFilter, actionFilter, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const actionColor = (a) => {
    if (a === "create") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    if (a === "delete") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    if (a === "update") return "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300";
    if (a === "approved") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    if (a === "rejected") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    if (a === "move") return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
    if (a === "mfa_mandate") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
  };

  const toggleRow = (id) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportCsv = () => {
    const rows = [
      ["Actor", "Action", "Entity", "Entity ID", "Time", "Diff"],
      ...logs.map((l) => [
        l.actor_name || "System",
        l.action,
        l.entity,
        l.entity_id || "",
        l.created_at ? new Date(l.created_at).toLocaleString() : "",
        l.diff ? JSON.stringify(l.diff) : "",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="audit-log-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground">{total} records</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]" data-testid="audit-entity-filter">
            <SelectValue placeholder="All Entities" />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[150px]" data-testid="audit-action-filter">
            <SelectValue placeholder="All Actions" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground px-0.5">From</span>
          <Input
            type="date"
            className="w-[150px] h-9"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(0); }}
            data-testid="audit-start-date"
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground px-0.5">To</span>
          <Input
            type="date"
            className="w-[150px] h-9"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(0); }}
            data-testid="audit-end-date"
          />
        </div>

        <Input
          className="w-[200px] h-9"
          placeholder="Search actor ID..."
          value={actorSearch}
          onChange={(e) => handleActorInput(e.target.value)}
          data-testid="audit-actor-search"
        />

        {(entityFilter || actionFilter || startDate || endDate || actorSearch) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              setEntityFilter("");
              setActionFilter("");
              setStartDate("");
              setEndDate("");
              setActorSearch("");
              setDebouncedActor("");
              setPage(0);
            }}
          >
            Clear filters
          </Button>
        )}
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
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No audit logs found
                </TableCell>
              </TableRow>
            ) : (
              logs.map((l) => {
                const isExpanded = expandedRows.has(l.id);
                const hasDiff = l.diff && Object.keys(l.diff).length > 0;
                return [
                  <TableRow key={l.id} data-testid={`audit-row-${l.id}`} className={hasDiff ? "cursor-pointer hover:bg-muted/40" : ""} onClick={() => hasDiff && toggleRow(l.id)}>
                    <TableCell className="font-medium">{l.actor_name || "System"}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${actionColor(l.action)}`}>{l.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{l.entity}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {l.entity_id ? l.entity_id.substring(0, 8) + "…" : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.created_at ? new Date(l.created_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      {hasDiff && (
                        isExpanded
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>,
                  isExpanded && hasDiff && (
                    <TableRow key={`${l.id}-diff`}>
                      <TableCell colSpan={6} className="bg-muted/30 px-6 py-3">
                        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                          {JSON.stringify(l.diff, null, 2)}
                        </pre>
                      </TableCell>
                    </TableRow>
                  ),
                ];
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {page + 1} of {totalPages} ({total} total)</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => p - 1)}
            data-testid="audit-prev-page"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => setPage((p) => p + 1)}
            data-testid="audit-next-page"
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
