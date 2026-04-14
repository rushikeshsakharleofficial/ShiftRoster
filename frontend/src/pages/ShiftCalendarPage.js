import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { shiftsApi, departmentsApi, usersApi, assignmentsApi, calendarNotesApi, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Plus, ChevronLeft, ChevronRight, Clock, Users, MapPin, StickyNote, X, Pin, Loader2
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, isSameDay, isToday } from "date-fns";

export default function ShiftCalendarPage() {
  const { user } = useAuth();
  const [view, setView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateShift, setShowCreateShift] = useState(false);
  const [showCreateNote, setShowCreateNote] = useState(null);
  const [selectedShift, setSelectedShift] = useState(null);
  const [shiftForm, setShiftForm] = useState({ title: "", department_id: "", start_time: "", end_time: "", location: "", notes: "", is_open: false, required_count: 1 });
  const [noteForm, setNoteForm] = useState({ content: "", color_hex: "#FDE68A", visibility: "team" });
  const [saving, setSaving] = useState(false);
  const [assignUser, setAssignUser] = useState("");

  const isAdmin = user?.system_role === "admin";
  const isManager = user?.system_role === "manager";
  const canManage = isAdmin || isManager;

  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);

  const days = useMemo(() => {
    if (view === "week") return eachDayOfInterval({ start: weekStart, end: weekEnd });
    return eachDayOfInterval({ start: startOfWeek(monthStart, { weekStartsOn: 1 }), end: endOfWeek(monthEnd, { weekStartsOn: 1 }) });
  }, [view, weekStart, weekEnd, monthStart, monthEnd]);

  const loadData = async () => {
    setLoading(true);
    try {
      const sd = view === "week" ? format(weekStart, "yyyy-MM-dd") : format(monthStart, "yyyy-MM-dd");
      const ed = view === "week" ? format(weekEnd, "yyyy-MM-dd") : format(monthEnd, "yyyy-MM-dd");

      const [sRes, dRes, nRes] = await Promise.all([
        shiftsApi.list({ start_date: `${sd}T00:00:00`, end_date: `${ed}T23:59:59` }),
        departmentsApi.list(),
        calendarNotesApi.list({ start_date: sd, end_date: ed }),
      ]);
      setShifts(sRes.data || []);
      setDepartments(dRes.data || []);
      setNotes(nRes.data || []);

      if (canManage) {
        const uRes = await usersApi.list({ limit: 200 });
        setEmployees(uRes.data.users || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [view, currentDate]);

  const navigate = (dir) => {
    if (view === "week") setCurrentDate(dir === "next" ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir === "next" ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
  };

  const getShiftsForDay = (day) => {
    const dayStr = format(day, "yyyy-MM-dd");
    return shifts.filter(s => s.start_time && s.start_time.startsWith(dayStr));
  };

  const getNotesForDay = (day) => {
    const dayStr = format(day, "yyyy-MM-dd");
    return notes.filter(n => n.note_date === dayStr);
  };

  const getDeptColor = (deptId) => departments.find(d => d.id === deptId)?.color_hex || "#6366F1";
  const getDeptName = (deptId) => departments.find(d => d.id === deptId)?.name || "";

  const handleCreateShift = async () => {
    setSaving(true);
    try {
      await shiftsApi.create(shiftForm);
      toast.success("Shift created");
      setShowCreateShift(false);
      setShiftForm({ title: "", department_id: "", start_time: "", end_time: "", location: "", notes: "", is_open: false, required_count: 1 });
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  const handleDeleteShift = async (id) => {
    try {
      await shiftsApi.delete(id);
      toast.success("Shift deleted");
      setSelectedShift(null);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleAssign = async () => {
    if (!assignUser || !selectedShift) return;
    try {
      await assignmentsApi.create({ shift_id: selectedShift.id, user_id: assignUser });
      toast.success("Employee assigned");
      setAssignUser("");
      loadData();
      const updated = await shiftsApi.get(selectedShift.id);
      setSelectedShift(updated.data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleCreateNote = async () => {
    if (!noteForm.content.trim()) return;
    setSaving(true);
    try {
      await calendarNotesApi.create({ ...noteForm, note_date: showCreateNote });
      toast.success("Note added");
      setShowCreateNote(null);
      setNoteForm({ content: "", color_hex: "#FDE68A", visibility: "team" });
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  const noteColors = ["#FDE68A", "#BBF7D0", "#BFDBFE", "#FED7AA", "#E9D5FF", "#FECDD3"];

  return (
    <div data-testid="shift-calendar-page" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shift Calendar</h1>
          <p className="text-sm text-muted-foreground">{shifts.length} shifts scheduled</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button data-testid="create-shift-btn" onClick={() => setShowCreateShift(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Shift
            </Button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate("prev")} data-testid="cal-prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} data-testid="cal-today">Today</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate("next")} data-testid="cal-next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium ml-2">
            {view === "week"
              ? `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`
              : format(currentDate, "MMMM yyyy")}
          </span>
        </div>
        <Tabs value={view} onValueChange={setView}>
          <TabsList className="h-8">
            <TabsTrigger value="week" className="text-xs px-3" data-testid="view-week">Week</TabsTrigger>
            <TabsTrigger value="month" className="text-xs px-3" data-testid="view-month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card className="border overflow-hidden">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
              <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center border-r last:border-r-0">
                {d}
              </div>
            ))}
          </div>
          {/* Day Cells */}
          <div className={`grid grid-cols-7 ${view === "month" ? "" : ""}`}>
            {days.map((day, i) => {
              const dayShifts = getShiftsForDay(day);
              const dayNotes = getNotesForDay(day);
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();

              return (
                <div
                  key={i}
                  className={`border-r border-b last:border-r-0 relative group ${view === "week" ? "min-h-[140px]" : "min-h-[90px]"} ${!isCurrentMonth && view === "month" ? "opacity-40" : ""} ${isToday(day) ? "bg-primary/[0.03]" : ""}`}
                  data-testid={`cal-day-${format(day, "yyyy-MM-dd")}`}
                >
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className={`text-xs font-medium ${isToday(day) ? "text-primary" : "text-muted-foreground"}`}>
                      {format(day, "d")}
                    </span>
                    {canManage && (
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setShowCreateNote(format(day, "yyyy-MM-dd"))}
                        data-testid={`add-note-${format(day, "yyyy-MM-dd")}`}
                      >
                        <StickyNote className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    )}
                  </div>
                  <div className="px-1 space-y-0.5 overflow-y-auto" style={{ maxHeight: view === "week" ? "110px" : "60px" }}>
                    {dayShifts.map(s => (
                      <TooltipProvider key={s.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              className="shift-block w-full text-left"
                              style={{ background: getDeptColor(s.department_id) + "20", color: getDeptColor(s.department_id), borderLeft: `2px solid ${getDeptColor(s.department_id)}` }}
                              onClick={() => setSelectedShift(s)}
                              data-testid={`shift-${s.id}`}
                            >
                              {s.title}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{s.title} — {getDeptName(s.department_id)}</p>
                            <p className="text-[10px] text-muted-foreground">{s.start_time?.substring(11, 16)} – {s.end_time?.substring(11, 16)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                    {dayNotes.map(n => (
                      <div
                        key={n.id}
                        className={`sticky-note text-[10px] px-1.5 py-0.5 rounded ${n.is_pinned ? "pinned" : ""}`}
                        style={{ background: n.color_hex + "40", borderColor: n.color_hex }}
                        data-testid={`note-${n.id}`}
                      >
                        <span className="line-clamp-1">{n.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Create Shift Dialog */}
      <Dialog open={showCreateShift} onOpenChange={setShowCreateShift}>
        <DialogContent data-testid="create-shift-dialog" className="max-w-md">
          <DialogHeader><DialogTitle>Create Shift</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input data-testid="shift-title-input" value={shiftForm.title} onChange={e => setShiftForm({...shiftForm, title: e.target.value})} placeholder="Morning Shift" />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={shiftForm.department_id} onValueChange={v => setShiftForm({...shiftForm, department_id: v})}>
                <SelectTrigger data-testid="shift-dept-select"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input data-testid="shift-start-input" type="datetime-local" value={shiftForm.start_time} onChange={e => setShiftForm({...shiftForm, start_time: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input data-testid="shift-end-input" type="datetime-local" value={shiftForm.end_time} onChange={e => setShiftForm({...shiftForm, end_time: e.target.value})} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input data-testid="shift-location-input" value={shiftForm.location || ""} onChange={e => setShiftForm({...shiftForm, location: e.target.value})} placeholder="Building A" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea data-testid="shift-notes-input" value={shiftForm.notes || ""} onChange={e => setShiftForm({...shiftForm, notes: e.target.value})} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateShift(false)}>Cancel</Button>
            <Button data-testid="shift-save-btn" onClick={handleCreateShift} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift Detail Dialog */}
      <Dialog open={!!selectedShift} onOpenChange={() => setSelectedShift(null)}>
        <DialogContent data-testid="shift-detail-dialog" className="max-w-md">
          <DialogHeader><DialogTitle>{selectedShift?.title}</DialogTitle></DialogHeader>
          {selectedShift && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{selectedShift.start_time?.substring(0, 16).replace("T", " ")} – {selectedShift.end_time?.substring(11, 16)}</span>
              </div>
              {selectedShift.location && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedShift.location}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{getDeptName(selectedShift.department_id) || "No department"}</span>
              </div>
              {selectedShift.notes && <p className="text-sm text-muted-foreground">{selectedShift.notes}</p>}

              {/* Assignments */}
              <div className="border-t pt-3">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Assigned Employees</h4>
                <div className="space-y-1">
                  {(selectedShift.assignments || []).map(a => (
                    <div key={a.id} className="flex items-center justify-between py-1">
                      <span className="text-sm">{a.user_name || a.user_id}</span>
                      <Badge variant="outline" className="text-[10px]">{a.status}</Badge>
                    </div>
                  ))}
                  {(!selectedShift.assignments || selectedShift.assignments.length === 0) && (
                    <p className="text-xs text-muted-foreground">No employees assigned</p>
                  )}
                </div>
                {canManage && (
                  <div className="flex gap-2 mt-2">
                    <Select value={assignUser} onValueChange={setAssignUser}>
                      <SelectTrigger className="flex-1 h-8 text-xs" data-testid="assign-user-select"><SelectValue placeholder="Assign employee" /></SelectTrigger>
                      <SelectContent>
                        {employees.filter(e => e.system_role === "employee").map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8" onClick={handleAssign} data-testid="assign-btn">Assign</Button>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            {canManage && selectedShift && (
              <Button variant="destructive" size="sm" onClick={() => handleDeleteShift(selectedShift.id)} data-testid="delete-shift-btn">
                Delete Shift
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedShift(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Note Dialog */}
      <Dialog open={!!showCreateNote} onOpenChange={() => setShowCreateNote(null)}>
        <DialogContent data-testid="create-note-dialog" className="max-w-sm">
          <DialogHeader><DialogTitle>Add Note — {showCreateNote}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea data-testid="note-content-input" value={noteForm.content} onChange={e => setNoteForm({...noteForm, content: e.target.value})} placeholder="Add a note..." rows={3} />
            <div className="flex gap-2">
              {noteColors.map(c => (
                <button
                  key={c}
                  onClick={() => setNoteForm({...noteForm, color_hex: c})}
                  className={`w-7 h-7 rounded border-2 transition-transform ${noteForm.color_hex === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <Select value={noteForm.visibility} onValueChange={v => setNoteForm({...noteForm, visibility: v})}>
              <SelectTrigger className="h-8 text-xs" data-testid="note-visibility-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Just Me</SelectItem>
                <SelectItem value="team">My Team</SelectItem>
                <SelectItem value="everyone">Everyone</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateNote(null)}>Cancel</Button>
            <Button data-testid="note-save-btn" onClick={handleCreateNote} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
