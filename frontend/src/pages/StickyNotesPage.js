import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { stickyNotesApi, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { FullScreenCalendar } from "@/components/ui/fullscreen-calendar";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/liquid-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  StickyNote,
  Plus,
  Trash2,
  Pin,
  PinOff,
  Globe,
  Lock,
  Loader2,
  Pencil,
  CalendarIcon,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NOTE_COLORS = [
  { name: "Yellow", value: "#FEF3C7" },
  { name: "Blue", value: "#DBEAFE" },
  { name: "Green", value: "#D1FAE5" },
  { name: "Pink", value: "#FCE7F3" },
  { name: "Purple", value: "#EDE9FE" },
  { name: "Orange", value: "#FED7AA" },
  { name: "Red", value: "#FEE2E2" },
  { name: "Teal", value: "#CCFBF1" },
];

const ROTATIONS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const POSITIONS_KEY = "sticky-note-positions";

function loadStoredPositions() {
  try {
    return JSON.parse(localStorage.getItem(POSITIONS_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistPositions(positions) {
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
}

function gridPosition(index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: col * 240 + 24, // Using slightly more space
    y: row * 220 + 24,
  };
}

// ─── Draggable floating sticky note ──────────────────────────────────────────
function FloatingNote({
  note,
  position,
  onPositionChange,
  onEdit,
  onDelete,
  onTogglePin,
  canDelete,
  isHighlighted,
}) {
  const [pos, setPos] = useState(position);
  const posRef = useRef(position);
  const isDragging = useRef(false);
  const origin = useRef({ mx: 0, my: 0, nx: 0, ny: 0 });
  const onChangeRef = useRef(onPositionChange);
  const [zoomOpen, setZoomOpen] = useState(false);
  const isTruncated = note.text.length > 120 || note.text.split("\n").length > 4;

  useEffect(() => {
    onChangeRef.current = onPositionChange;
  });

  // Sync position when parent resets layout
  useEffect(() => {
    posRef.current = position;
    setPos(position);
  }, [position.x, position.y]); // eslint-disable-line react-hooks/exhaustive-deps

  const rotation = useMemo(
    () => ROTATIONS[Math.abs(parseInt(note.id, 10)) % ROTATIONS.length],
    [note.id]
  );

  const handleMouseDown = (e) => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    isDragging.current = true;
    origin.current = {
      mx: e.clientX,
      my: e.clientY,
      nx: posRef.current.x,
      ny: posRef.current.y,
    };
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!isDragging.current) return;
      const x = origin.current.nx + e.clientX - origin.current.mx;
      const y = origin.current.ny + e.clientY - origin.current.my;
      posRef.current = { x, y };
      setPos({ x, y });
    };
    const onUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        onChangeRef.current(note.id, posRef.current);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [note.id]);

  return (
    <div
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        transform: `rotate(${rotation}deg)`,
        background: note.color,
        cursor: "grab",
        userSelect: "none",
        boxShadow: isHighlighted
          ? `0 0 0 2.5px hsl(var(--primary)), 4px 8px 20px rgba(0,0,0,0.22)`
          : "2px 5px 14px rgba(0,0,0,0.16), 0 1px 3px rgba(0,0,0,0.08)",
        zIndex: isHighlighted ? 20 : 10,
        transition: "box-shadow 0.2s",
      }}
      className="rounded-sm p-3 group select-none w-48 md:w-52"
      onMouseDown={handleMouseDown}
    >
      {/* Tape strip */}
      <div
        className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-4 rounded-sm"
        style={{
          background: "rgba(255,255,255,0.52)",
          border: "1px solid rgba(0,0,0,0.07)",
          backdropFilter: "blur(2px)",
        }}
      />

      {note.pinned && (
        <Pin className="h-3 w-3 text-primary absolute top-2.5 right-2.5" />
      )}

      <div className="text-[10px] mt-1 mb-1.5 flex items-center gap-1" style={{ color: "rgba(0,0,0,0.55)" }}>
        <CalendarIcon className="h-2.5 w-2.5 shrink-0" />
        {note.note_date}
      </div>

      <p
        className="text-sm break-words pr-1"
        style={{
          color: "rgba(0,0,0,0.78)",
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          lineHeight: "1.5",
        }}
      >
        {note.text}
      </p>
      {isTruncated && (
        <button
          className="text-[11px] font-medium mt-1 underline underline-offset-2"
          style={{ color: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { e.stopPropagation(); setZoomOpen(true); }}
        >
          See more
        </button>
      )}

      {/* Actions */}
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1 min-w-0">
          {note.is_public ? (
            <Globe className="h-3 w-3 shrink-0" style={{ color: "rgba(0,0,0,0.45)" }} />
          ) : (
            <Lock className="h-3 w-3 shrink-0" style={{ color: "rgba(0,0,0,0.45)" }} />
          )}
          <span className="text-[10px] truncate max-w-[60px]" style={{ color: "rgba(0,0,0,0.5)" }}>
            {note.user_name}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            className="p-0.5 rounded hover:bg-black/10 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(note);
            }}
            title={note.pinned ? "Unpin" : "Pin"}
          >
            {note.pinned ? (
              <PinOff className="h-3 w-3" />
            ) : (
              <Pin className="h-3 w-3" />
            )}
          </button>
          <button
            className="p-0.5 rounded hover:bg-black/10 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(note);
            }}
            title="Edit"
          >
            <Pencil className="h-3 w-3" />
          </button>
          {canDelete && (
            <button
              className="p-0.5 rounded hover:bg-black/10 transition-colors text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(note.id);
              }}
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Zoom popup */}
      {isTruncated && (
        <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
          <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                {note.note_date}
                {note.pinned && <Pin className="h-3.5 w-3.5 text-primary ml-1" />}
              </DialogTitle>
            </DialogHeader>
            <div
              className="rounded-md border shadow-sm relative overflow-hidden transition-colors w-full"
              style={{ background: note.color, borderColor: "rgba(0,0,0,0.08)" }}
            >
              {/* Visual Decoration (Tape) */}
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-3 opacity-60"
                style={{
                  background: "rgba(255,255,255,0.8)",
                  borderBottom: "1px solid rgba(0,0,0,0.05)",
                  borderLeft: "1px solid rgba(0,0,0,0.05)",
                  borderRight: "1px solid rgba(0,0,0,0.05)",
                  borderRadius: "0 0 4px 4px",
                }}
              />
              <div className="p-6 pt-8 overflow-y-auto" style={{ maxHeight: "50vh" }}>
                <p className="text-base leading-relaxed whitespace-pre-wrap break-words"
                  style={{ color: "rgba(0,0,0,0.82)", wordBreak: "break-word" }}>
                  {note.text}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1">
                {note.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {note.user_name}
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1"
                  onClick={() => { setZoomOpen(false); onEdit(note); }}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
                {canDelete && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-destructive hover:text-destructive"
                    onClick={() => { setZoomOpen(false); onDelete(note.id); }}>
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StickyNotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filterDate, setFilterDate] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notePositions, setNotePositions] = useState(loadStoredPositions);
  const [form, setForm] = useState({
    text: "",
    color: "#FEF3C7",
    is_public: false,
    pinned: false,
  });

  const loadNotes = useCallback(async () => {
    try {
      const { data } = await stickyNotesApi.list();
      setNotes(data.notes || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Assign grid positions for notes that don't have stored positions yet
  useEffect(() => {
    setNotePositions((prev) => {
      const updated = { ...prev };
      let changed = false;
      notes.forEach((note, index) => {
        if (!updated[note.id]) {
          updated[note.id] = gridPosition(index);
          changed = true;
        }
      });
      if (changed) {
        persistPositions(updated);
        return updated;
      }
      return prev;
    });
  }, [notes]);

  const handlePositionChange = useCallback((noteId, pos) => {
    setNotePositions((prev) => {
      const next = { ...prev, [noteId]: pos };
      persistPositions(next);
      return next;
    });
  }, []);

  const resetLayout = useCallback(() => {
    setNotePositions((prev) => {
      const next = { ...prev };
      notes.forEach((note, index) => {
        next[note.id] = gridPosition(index);
      });
      persistPositions(next);
      return next;
    });
  }, [notes]);

  // Calendar data
  const calendarData = useMemo(
    () =>
      notes.reduce((acc, note) => {
        const noteDate = new Date(note.note_date + "T00:00:00");
        const existing = acc.find((d) => isSameDay(d.day, noteDate));
        const event = {
          id: note.id,
          name:
            note.text.substring(0, 40) +
            (note.text.length > 40 ? "..." : ""),
          time: note.is_public ? "Public" : "Private",
          color: note.color,
        };
        if (existing) existing.events.push(event);
        else acc.push({ day: noteDate, events: [event] });
        return acc;
      }, []),
    [notes]
  );

  const handleDateClick = (day) => {
    setFilterDate(day);
    setSelectedDate(day);
  };

  const handleNewNote = (day) => {
    setSelectedDate(day || new Date());
    setEditingNote(null);
    setForm({ text: "", color: "#FEF3C7", is_public: false, pinned: false });
    setDialogOpen(true);
  };

  const handleEditNote = (note) => {
    setEditingNote(note);
    setForm({
      text: note.text,
      color: note.color,
      is_public: note.is_public,
      pinned: note.pinned,
    });
    setSelectedDate(new Date(note.note_date + "T00:00:00"));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.text.trim()) {
      toast.error("Note text is required");
      return;
    }
    setSaving(true);
    try {
      if (editingNote) {
        await stickyNotesApi.update(editingNote.id, {
          ...form,
          note_date: format(selectedDate, "yyyy-MM-dd"),
        });
        toast.success("Note updated");
      } else {
        await stickyNotesApi.create({
          ...form,
          note_date: format(selectedDate, "yyyy-MM-dd"),
        });
        toast.success("Note created");
      }
      setDialogOpen(false);
      loadNotes();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  const handleDelete = async (noteId) => {
    try {
      await stickyNotesApi.delete(noteId);
      toast.success("Note deleted");
      loadNotes();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleTogglePin = async (note) => {
    try {
      await stickyNotesApi.update(note.id, { pinned: !note.pinned });
      loadNotes();
    } catch {}
  };

  const displayedNotes = filterDate
    ? notes.filter(
        (n) => n.note_date === format(filterDate, "yyyy-MM-dd")
      )
    : notes;

  return (
    <div data-testid="sticky-notes-page" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <StickyNote className="h-6 w-6 text-amber-500" />
            Sticky Notes
          </h1>
          <p className="text-sm text-muted-foreground">
            Double-click a date to open its notes board
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button size="sm" onClick={() => handleNewNote(selectedDate)} className="gap-1">
            <Plus className="h-4 w-4" />
            New Note
          </Button>
        </div>
      </div>

      {/* Calendar — always visible */}
      <div className="border rounded-lg bg-card">
        <FullScreenCalendar
          data={calendarData}
          onDateClick={handleDateClick}
          onNewEvent={handleNewNote}
        />
      </div>

      {/* Corkboard Dialog — opens on date double-click */}
      <Dialog open={filterDate !== null} onOpenChange={(open) => { if (!open) setFilterDate(null); }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span className="flex items-center gap-2">
                <StickyNote className="h-5 w-5 text-amber-500" />
                {filterDate ? format(filterDate, "MMMM d, yyyy") : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={resetLayout} className="gap-1">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Reset Layout
                </Button>
                <Button size="sm" onClick={() => handleNewNote(filterDate)} className="gap-1">
                  <Plus className="h-4 w-4" />
                  New Note
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Corkboard canvas */}
          <div
            className="relative overflow-auto rounded-md flex-1"
            style={{
              minHeight: 480,
              backgroundImage: `radial-gradient(circle, rgba(128,128,128,0.25) 1px, transparent 1px)`,
              backgroundSize: "28px 28px",
            }}
          >
            {displayedNotes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
                <StickyNote className="h-14 w-14 mb-3 opacity-15" />
                <p className="text-sm opacity-60">
                  No notes for this date — click New Note to add one
                </p>
              </div>
            )}
            {displayedNotes.map((note) => (
              <FloatingNote
                key={note.id}
                note={note}
                position={notePositions[note.id] || gridPosition(notes.indexOf(note))}
                onPositionChange={handlePositionChange}
                onEdit={handleEditNote}
                onDelete={handleDelete}
                onTogglePin={handleTogglePin}
                canDelete={note.user_id === user?.id || user?.system_role === "admin"}
                isHighlighted={false}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="shrink-0 px-6 pt-6">
            <DialogTitle>
              {editingNote ? "Edit Note" : "New Sticky Note"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6">
            <div className="flex flex-col gap-5 py-4">
              {/* Date Picker Section */}
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal gap-2 h-10",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="h-4 w-4 shrink-0" />
                      {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedDate(date);
                          setDatePickerOpen(false);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Note Input Section */}
              <div className="space-y-2">
                <Label>Note Content</Label>
                <Textarea
                  placeholder="Write your note here..."
                  value={form.text}
                  onChange={(e) => setForm({ ...form, text: e.target.value })}
                  rows={5}
                  className="resize-none p-3 leading-relaxed w-full border-muted-foreground/20 focus-visible:ring-amber-500/30"
                />
              </div>

              {/* Color Picker Section */}
              <div className="space-y-2">
                <Label>Note Color</Label>
                <div className="flex gap-2.5 flex-wrap pt-1">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c.value}
                      className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-95 ${
                        form.color === c.value
                          ? "border-foreground scale-110 shadow-sm"
                          : "border-transparent hover:border-muted-foreground/30"
                      }`}
                      style={{ background: c.value }}
                      onClick={() => setForm({ ...form, color: c.value })}
                      type="button"
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* Toggles Section */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div 
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setForm({ ...form, is_public: !form.is_public })}
                >
                  <div className="flex items-center gap-2">
                    {form.is_public ? <Globe className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-medium">{form.is_public ? "Public" : "Private"}</span>
                  </div>
                  <Toggle
                    checked={form.is_public}
                    onCheckedChange={(v) => setForm({ ...form, is_public: v })}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div 
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setForm({ ...form, pinned: !form.pinned })}
                >
                  <div className="flex items-center gap-2">
                    <Pin className={cn("h-4 w-4", form.pinned ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-sm font-medium">Pinned</span>
                  </div>
                  <Toggle
                    checked={form.pinned}
                    onCheckedChange={(v) => setForm({ ...form, pinned: v })}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>

              {/* Final Preview Section */}
              <div className="space-y-2 pt-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Live Preview</Label>
                <div
                  className="w-full rounded-md border shadow-sm relative overflow-hidden transition-colors duration-300"
                  style={{ background: form.color, borderColor: "rgba(0,0,0,0.08)" }}
                >
                  {/* Visual Decoration (Tape) */}
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-3 opacity-60"
                    style={{
                      background: "rgba(255,255,255,0.8)",
                      borderBottom: "1px solid rgba(0,0,0,0.05)",
                      borderLeft: "1px solid rgba(0,0,0,0.05)",
                      borderRight: "1px solid rgba(0,0,0,0.05)",
                      borderRadius: "0 0 4px 4px",
                    }}
                  />
                  <div className="p-5 pt-7 min-h-[100px] flex flex-col">
                    <span 
                      className="text-sm leading-relaxed" 
                      style={{ 
                        color: "rgba(0,0,0,0.75)", 
                        whiteSpace: "pre-wrap", 
                        wordBreak: "break-word",
                        fontWeight: 450
                      }}
                    >
                      {form.text || "Start typing to see your note preview..."}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 px-6 py-4 border-t bg-muted/10">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingNote ? (
                "Save Changes"
              ) : (
                "Create Note"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
