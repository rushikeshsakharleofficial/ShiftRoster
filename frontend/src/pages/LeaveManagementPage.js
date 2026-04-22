import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { leaveApi, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Check, X, Loader2, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LeaveManagementPage() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ leave_type: "annual", from_date: "", to_date: "", days_count: 1, notes: "" });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  const canManage = user?.system_role === "admin" || user?.system_role === "manager";

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter) params.status = filter;
      const { data } = await leaveApi.list(params);
      setLeaves(data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [filter]);

  const handleCreate = async () => {
    if (new Date(form.from_date) > new Date(form.to_date)) {
      toast.error("From date cannot be after To date");
      return;
    }
    setSaving(true);
    try {
      await leaveApi.create(form);
      toast.success("Leave request submitted");
      setShowCreate(false);
      setForm({ leave_type: "annual", from_date: "", to_date: "", days_count: 0, notes: "" });
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  // Auto-calculate days
  useEffect(() => {
    if (form.from_date && form.to_date) {
      const start = new Date(form.from_date);
      const end = new Date(form.to_date);
      if (start <= end) {
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive
        setForm(f => ({ ...f, days_count: diffDays }));
      } else {
        setForm(f => ({ ...f, days_count: 0 }));
      }
    }
  }, [form.from_date, form.to_date]);


  const handleReview = async (id, status) => {
    try {
      await leaveApi.review(id, { status });
      toast.success(`Leave ${status}`);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const statusColor = (s) => {
    if (s === "approved") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    if (s === "rejected") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    if (s === "pending") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
  };

  return (
    <div data-testid="leave-management-page" className="space-y-6 dispatch-stagger">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leave Management</h1>
          <p className="text-sm text-muted-foreground">{leaves.length} requests</p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[130px]" data-testid="leave-status-filter">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button data-testid="create-leave-btn" onClick={() => setShowCreate(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Request Leave
          </Button>
        </div>
      </div>

      <Card className="border">
        <Table>
          <TableHeader>
            <TableRow>
              {canManage && <TableHead>Employee</TableHead>}
              <TableHead>Type</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              {canManage && <TableHead className="w-[100px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={canManage ? 8 : 6} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : leaves.length === 0 ? (
              <TableRow><TableCell colSpan={canManage ? 8 : 6} className="text-center py-8 text-muted-foreground">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No leave requests
              </TableCell></TableRow>
            ) : (
              leaves.map(l => (
                <TableRow key={l.id} data-testid={`leave-row-${l.id}`}>
                  {canManage && <TableCell className="font-medium">{l.user_name || "—"}</TableCell>}
                  <TableCell><Badge variant="outline" className="text-[10px] capitalize">{l.leave_type?.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="text-sm">{l.from_date}</TableCell>
                  <TableCell className="text-sm">{l.to_date}</TableCell>
                  <TableCell className="text-sm">{l.days_count}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${statusColor(l.status)}`}>{l.status}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">{l.notes || "—"}</TableCell>
                  {canManage && (
                    <TableCell>
                      {l.status === "pending" && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => handleReview(l.id, "approved")} data-testid={`approve-leave-${l.id}`}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleReview(l.id, "rejected")} data-testid={`reject-leave-${l.id}`}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Leave Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent data-testid="create-leave-dialog">
          <DialogHeader><DialogTitle>Request Leave</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Leave Type</Label>
              <Select value={form.leave_type} onValueChange={v => setForm({...form, leave_type: v})}>
                <SelectTrigger data-testid="leave-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="comp_off">Comp Off</SelectItem>
                  <SelectItem value="maternity">Maternity</SelectItem>
                  <SelectItem value="paternity">Paternity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input data-testid="leave-from-input" type="date" value={form.from_date} onChange={e => setForm({...form, from_date: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input data-testid="leave-to-input" type="date" value={form.to_date} onChange={e => setForm({...form, to_date: e.target.value})} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Days</Label>
              <div className="relative">
                <Input 
                  data-testid="leave-days-input" 
                  type="number" 
                  value={form.days_count} 
                  readOnly 
                  className={cn(
                    "bg-muted/50 font-bold",
                    form.days_count > 0 ? "text-primary border-primary/30" : "text-muted-foreground"
                  )}
                />
                {form.days_count > 0 && (
                  <p className="text-[9px] text-primary font-medium mt-1 animate-in fade-in slide-in-from-top-1">
                    Days are calculated automatically (inclusive)
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea data-testid="leave-notes-input" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} placeholder="Reason for leave..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button data-testid="leave-save-btn" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
