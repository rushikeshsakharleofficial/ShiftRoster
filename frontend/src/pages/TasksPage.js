import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { tasksApi, usersApi, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAvatarColor } from "@/lib/utils";
import {
  Plus, CheckCircle2, Circle, Clock, AlertCircle,
  ArrowRight, MessageSquare, Loader2, X
} from "lucide-react";

const PRIORITY_CONFIG = {
  high: { label: "High", class: "bg-destructive/10 text-destructive border-destructive/20" },
  medium: { label: "Medium", class: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400" },
  low: { label: "Low", class: "bg-muted text-muted-foreground border-border" },
};

const STATUS_CONFIG = {
  pending: { label: "Pending", icon: Circle, class: "text-muted-foreground" },
  completed: { label: "Completed", icon: CheckCircle2, class: "text-green-500" },
};

function initials(name) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
}

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(d) {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TasksPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.system_role === "admin";
  const isManager = user?.system_role === "manager";
  const isEmployee = user?.system_role === "employee";
  const canManage = isAdmin || isManager;

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");

  // Assign task dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ title: "", description: "", priority: "medium", due_date: "", assigned_to: "" });
  const [assigning, setAssigning] = useState(false);

  // Detail dialog
  const [detailTask, setDetailTask] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Transfer dialog
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferring, setTransferring] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus !== "all") params.status = filterStatus;
      if (filterAssignee !== "all") params.assigned_to = filterAssignee;
      const { data } = await tasksApi.list(params);
      let list = data;
      if (filterPriority !== "all") list = list.filter(t => t.priority === filterPriority);
      setTasks(list);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, filterAssignee]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!canManage) return;
    usersApi.list().then(({ data }) => setEmployees(data.users || data || [])).catch(() => {});
  }, [canManage]);

  // Auto-open from notification deep-link
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      openDetail(openId);
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = async (id) => {
    setDetailLoading(true);
    setDetailOpen(true);
    setNoteText("");
    try {
      const { data } = await tasksApi.getTask(id);
      setDetailTask(data);
    } catch (e) {
      toast.error("Could not load task details");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCardClick = (task) => openDetail(task.id);

  const handleAssignSubmit = async () => {
    if (!assignForm.title.trim()) {
      toast.error("Title required");
      return;
    }
    if (canManage && !assignForm.assigned_to) {
      toast.error("Assignee required");
      return;
    }
    setAssigning(true);
    try {
      const payload = {
        title: assignForm.title.trim(),
        description: assignForm.description.trim(),
        priority: assignForm.priority,
        due_date: assignForm.due_date || null,
      };
      if (canManage) payload.assigned_to = assignForm.assigned_to;
      await tasksApi.create(payload);
      toast.success(isEmployee ? "Task added" : "Task assigned");
      setAssignOpen(false);
      setAssignForm({ title: "", description: "", priority: "medium", due_date: "", assigned_to: "" });
      loadTasks();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setAssigning(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await tasksApi.addNote(detailTask.id, { text: noteText.trim() });
      toast.success("Note added");
      setNoteText("");
      const { data } = await tasksApi.getTask(detailTask.id);
      setDetailTask(data);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setAddingNote(false);
    }
  };

  const handleComplete = async () => {
    try {
      await tasksApi.complete(detailTask.id);
      toast.success("Task marked complete");
      setDetailOpen(false);
      loadTasks();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  const handleTransfer = async () => {
    if (!transferTo) { toast.error("Select a new owner"); return; }
    setTransferring(true);
    try {
      await tasksApi.transfer(detailTask.id, { new_owner_id: transferTo, reason: transferReason || null });
      toast.success("Task transferred");
      setTransferOpen(false);
      setDetailOpen(false);
      loadTasks();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setTransferring(false);
    }
  };

  const assigneeName = (id) => {
    const emp = employees.find(e => e.id === id);
    return emp?.full_name || id;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {canManage ? "Assign and track tasks across your team" : "Your tasks"}
          </p>
        </div>
        <Button onClick={() => setAssignOpen(true)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> {isEmployee ? "Add Task" : "Assign Task"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        {canManage && employees.length > 0 && (
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {employees.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 mb-3 opacity-20" />
          <p className="text-sm font-medium">No tasks found</p>
          <p className="text-xs mt-1">{canManage ? "Assign a task to get started" : "No tasks assigned to you yet"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tasks.map(task => {
            const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
            const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
            const StatusIcon = sc.icon;
            const due = task.due_date ? new Date(task.due_date) : null;
            const overdue = due && due < new Date() && task.status === "pending";
            return (
              <Card
                key={task.id}
                className="cursor-pointer hover:shadow-md transition-shadow border-border/60"
                onClick={() => handleCardClick(task)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <StatusIcon className={`h-4 w-4 mt-0.5 shrink-0 ${sc.class}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight line-clamp-2">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${pc.class}`}>{pc.label}</Badge>
                    {task.self_assigned && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400">Self Assigned</Badge>
                    )}
                    {due && (
                      <span className={`flex items-center gap-1 text-[10px] ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                        {overdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {fmtDate(due)}
                      </span>
                    )}
                    {task.notes_count > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MessageSquare className="h-3 w-3" /> {task.notes_count}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className={`text-[8px] font-bold ${getAvatarColor(task.assigned_to_name || task.assigned_to)}`}>
                          {initials(task.assigned_to_name || assigneeName(task.assigned_to))}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                        {task.assigned_to_name || assigneeName(task.assigned_to)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Assign Task Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEmployee ? "Add Task" : "Assign Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Title *</Label>
              <Input
                placeholder="Task title"
                value={assignForm.title}
                onChange={e => setAssignForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                placeholder="Optional details..."
                rows={3}
                value={assignForm.description}
                onChange={e => setAssignForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <Select value={assignForm.priority} onValueChange={v => setAssignForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={assignForm.due_date}
                  onChange={e => setAssignForm(f => ({ ...f, due_date: e.target.value }))}
                />
              </div>
            </div>
            {canManage && (
              <div className="space-y-1">
                <Label className="text-xs">Assign To *</Label>
                <Select value={assignForm.assigned_to} onValueChange={v => setAssignForm(f => ({ ...f, assigned_to: v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isEmployee && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">Self Assigned</span>
                Task will be assigned to you
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAssignSubmit} disabled={assigning}>
              {assigning && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {isEmployee ? "Add Task" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
          {detailLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detailTask ? (
            <>
              <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-base leading-tight">{detailTask.title}</DialogTitle>
                    {detailTask.description && (
                      <p className="text-sm text-muted-foreground mt-1">{detailTask.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {(() => {
                    const pc = PRIORITY_CONFIG[detailTask.priority] || PRIORITY_CONFIG.medium;
                    return <Badge variant="outline" className={`text-[10px] ${pc.class}`}>{pc.label} Priority</Badge>;
                  })()}
                  <Badge variant="outline" className={`text-[10px] ${detailTask.status === "completed" ? "text-green-600 border-green-500/30 bg-green-500/10" : ""}`}>
                    {detailTask.status === "completed" ? "Completed" : "Pending"}
                  </Badge>
                  {detailTask.due_date && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Due {fmtDate(detailTask.due_date)}
                    </span>
                  )}
                </div>
              </DialogHeader>

              <ScrollArea className="flex-1 min-h-0 px-6 py-4">
                <div className="space-y-5">
                  {/* Notes timeline */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Notes</p>
                    {(detailTask.notes || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No notes yet</p>
                    ) : (
                      <div className="space-y-3">
                        {(detailTask.notes || []).map((note, i) => (
                          <div key={i} className="flex gap-3">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback className={`text-[10px] font-bold ${getAvatarColor(note.author_name)}`}>
                                {initials(note.author_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-medium">{note.author_name}</span>
                                <span className="text-[10px] text-muted-foreground">{timeAgo(note.timestamp)}</span>
                              </div>
                              <p className="text-sm bg-muted/50 rounded-lg px-3 py-2 leading-relaxed">{note.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add note */}
                  {detailTask.status !== "completed" && (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Add a note..."
                        rows={2}
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        className="text-sm resize-none"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!noteText.trim() || addingNote}
                        onClick={handleAddNote}
                        className="w-full"
                      >
                        {addingNote && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        Add Note
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Actions footer */}
              {detailTask.status !== "completed" && (
                <div className="px-6 py-4 border-t border-border flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="default" className="gap-1.5 flex-1" onClick={handleComplete}>
                    <CheckCircle2 className="h-4 w-4" /> Mark Complete
                  </Button>
                  {canManage && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setTransferTo(""); setTransferReason(""); setTransferOpen(true); }}>
                      <ArrowRight className="h-4 w-4" /> Transfer
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Transfer Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">New Owner *</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason</Label>
              <Textarea
                placeholder="Optional reason for transfer..."
                rows={2}
                value={transferReason}
                onChange={e => setTransferReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleTransfer} disabled={transferring}>
              {transferring && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
