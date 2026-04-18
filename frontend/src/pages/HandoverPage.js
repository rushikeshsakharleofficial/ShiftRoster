import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { tasksApi, handoversApi, usersApi, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ClipboardList, CheckCircle2, Circle, ArrowRightLeft,
  Calendar, AlertCircle, History, User, Plus, Loader2,
  Clock, MoreHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITIES = [
  { value: "low", label: "Low", color: "text-blue-500 bg-blue-50" },
  { value: "medium", label: "Medium", color: "text-amber-500 bg-amber-50" },
  { value: "high", label: "High", color: "text-rose-500 bg-rose-50" },
];

export default function HandoverPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showTransfer, setShowTransfer] = useState(null); // task object
  const [showAudit, setShowAudit] = useState(null); // task object
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium",
    assigned_to: "", due_date: ""
  });
  
  const [transferForm, setTransferForm] = useState({ new_owner_id: "", reason: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, usersRes] = await Promise.all([
        tasksApi.list(),
        usersApi.list()
      ]);
      setTasks(tasksRes.data || []);
      setUsers(usersRes.data.users || []);
    } catch (err) {
      toast.error("Failed to load tasks");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!form.title || !form.assigned_to) {
      toast.error("Title and Assignee are required");
      return;
    }
    setSaving(true);
    try {
      await tasksApi.create(form);
      toast.success("Task created and assigned");
      setShowCreate(false);
      setForm({ title: "", description: "", priority: "medium", assigned_to: "", due_date: "" });
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  const handleComplete = async (taskId) => {
    try {
      await tasksApi.complete(taskId);
      toast.success("Task marked as completed");
      loadData();
    } catch (err) {
      toast.error("Failed to complete task");
    }
  };

  const handleTransfer = async () => {
    if (!transferForm.new_owner_id) {
      toast.error("Please select a new owner");
      return;
    }
    setSaving(true);
    try {
      await tasksApi.transfer(showTransfer.id, transferForm);
      toast.success("Task transferred successfully");
      setShowTransfer(null);
      setTransferForm({ new_owner_id: "", reason: "" });
      loadData();
    } catch (err) {
      toast.error("Transfer failed");
    }
    setSaving(false);
  };

  const myTasks = tasks.filter(t => t.assigned_to === user?.id && t.status === "pending");
  const delegatedTasks = tasks.filter(t => t.created_by === user?.id && t.assigned_to !== user?.id);
  const completedTasks = tasks.filter(t => (t.assigned_to === user?.id || t.created_by === user?.id) && t.status === "completed");

  const getUserName = (id) => users.find(u => u.id === id)?.full_name || "Unknown";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Handovers & Tasks</h1>
          <p className="text-muted-foreground">Manage and transfer shift responsibilities</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      <Tabs defaultValue="my-tasks" className="w-full">
        <div className="border-b mb-4">
          <div className="flex items-center justify-between max-w-screen-xl mx-auto px-1">
            <TabsList className="flex gap-6 bg-transparent h-auto p-0 rounded-none border-b-0">
              <TabsTrigger value="my-tasks" className="pb-2 border-b-2 border-transparent data-[state=active]:border-primary rounded-none shadow-none bg-transparent px-0 text-sm h-10">
                My Pending ({myTasks.length})
              </TabsTrigger>
              <TabsTrigger value="delegated" className="pb-2 border-b-2 border-transparent data-[state=active]:border-primary rounded-none shadow-none bg-transparent px-0 text-sm h-10">
                Delegated ({delegatedTasks.length})
              </TabsTrigger>
              <TabsTrigger value="completed" className="pb-2 border-b-2 border-transparent data-[state=active]:border-primary rounded-none shadow-none bg-transparent px-0 text-sm h-10">
                History
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="my-tasks" className="space-y-4">
          {myTasks.length === 0 ? (
            <Card className="border-dashed py-12 flex flex-col items-center justify-center text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground">No pending tasks for you</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onComplete={() => handleComplete(task.id)}
                  onTransfer={() => setShowTransfer(task)}
                  onShowAudit={() => setShowAudit(task)}
                  getUserName={getUserName}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="delegated" className="space-y-4">
          {delegatedTasks.length === 0 ? (
            <Card className="border-dashed py-12 flex flex-col items-center justify-center text-center">
              <ClipboardList className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground">You haven't delegated any tasks</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {delegatedTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onComplete={() => handleComplete(task.id)}
                  onTransfer={() => setShowTransfer(task)}
                  onShowAudit={() => setShowAudit(task)}
                  getUserName={getUserName}
                  isDelegated
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedTasks.map(task => (
              <TaskCard 
                key={task.id} 
                task={task} 
                onShowAudit={() => setShowAudit(task)}
                getUserName={getUserName}
                isHistory
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Assign New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Task Title</Label>
              <Input 
                placeholder="What needs to be done?" 
                value={form.title}
                onChange={e => setForm({...form, title: e.target.value})}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea 
                placeholder="Details for your coworker..." 
                value={form.description}
                onChange={e => setForm({...form, description: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due Date (Optional)</Label>
                <Input 
                  type="datetime-local" 
                  value={form.due_date}
                  onChange={e => setForm({...form, due_date: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Assign To</Label>
              <Select value={form.assigned_to} onValueChange={v => setForm({...form, assigned_to: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Coworker" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.id !== user?.id).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                  <SelectItem value={user?.id || ""}>Me (Self-assign)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={!!showTransfer} onOpenChange={() => setShowTransfer(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Transfer Ownership</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Handing over: <span className="font-semibold text-foreground">{showTransfer?.title}</span>
            </p>
            <div className="space-y-1.5">
              <Label>New Owner</Label>
              <Select value={transferForm.new_owner_id} onValueChange={v => setTransferForm({...transferForm, new_owner_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Coworker" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.id !== user?.id).map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason for Transfer (Optional)</Label>
              <Textarea 
                placeholder="e.g. End of shift, urgent leave..." 
                value={transferForm.reason}
                onChange={e => setTransferForm({...transferForm, reason: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(null)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit Dialog */}
      <Dialog open={!!showAudit} onOpenChange={() => setShowAudit(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Task History</DialogTitle>
          </DialogHeader>
          <div className="py-4 overflow-y-auto max-h-[60vh]">
            <div className="space-y-6 relative ml-2 before:absolute before:inset-y-0 before:left-2 before:w-0.5 before:bg-border">
              {showAudit?.audit_log?.map((entry, idx) => (
                <div key={idx} className="relative pl-8">
                  <div className="absolute left-0 top-1 w-4 h-4 rounded-full border-2 border-background bg-primary shadow-sm" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium capitalize">{entry.action}</span>
                    <p className="text-xs text-muted-foreground">{entry.details}</p>
                    <span className="text-[10px] text-muted-foreground mt-1">
                      {entry.timestamp ? format(new Date(entry.timestamp), "PPp") : "Unknown time"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowAudit(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskCard({ task, onComplete, onTransfer, onShowAudit, getUserName, isDelegated, isHistory }) {
  const priority = PRIORITIES.find(p => p.value === task.priority) || PRIORITIES[1];
  
  return (
    <Card className={cn("overflow-hidden border shadow-sm flex flex-col", task.status === "completed" && "opacity-75")}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="secondary" className={cn("text-[10px] uppercase font-bold", priority.color)}>
            {priority.label}
          </Badge>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onShowAudit} title="History">
              <History className="h-3.5 w-3.5" />
            </Button>
            {!isHistory && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onTransfer} title="Transfer">
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <CardTitle className="text-base line-clamp-1 mt-2">{task.title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-1 flex flex-col">
        <p className="text-xs text-muted-foreground line-clamp-2 mb-4">
          {task.description || "No description provided."}
        </p>
        
        {task.transfer_reason && (
          <div className="mb-4 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded text-[10px] italic flex gap-2">
            <AlertCircle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
            <span>Reason for transfer: {task.transfer_reason}</span>
          </div>
        )}

        <div className="mt-auto space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <User className="h-3 w-3" />
              <span>{isDelegated ? `To: ${getUserName(task.assigned_to)}` : `From: ${getUserName(task.created_by)}`}</span>
            </div>
            {task.due_date && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{(() => {
                  try {
                    return format(new Date(task.due_date), "MMM d, p");
                  } catch (e) {
                    return "Invalid date";
                  }
                })()}</span>
              </div>
            )}
          </div>
          
          {task.status === "completed" ? (
            <div className="pt-2 flex items-center justify-between border-t border-border/50">
              <div className="flex items-center gap-1.5 text-emerald-600 font-medium text-[11px]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Completed</span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {task.completed_at ? format(new Date(task.completed_at), "MMM d") : ""}
              </span>
            </div>
          ) : (
            <Button 
              className="w-full mt-2 h-9 text-xs gap-2 bg-emerald-600 hover:bg-emerald-700" 
              onClick={onComplete}
            >
              <CheckCircle2 className="h-4 w-4" /> Complete Task
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
