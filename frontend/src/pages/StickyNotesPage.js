import { useState, useEffect, useCallback } from "react";
import { format, isSameDay, startOfMonth, endOfMonth } from "date-fns";
import { stickyNotesApi, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { FullScreenCalendar } from "@/components/ui/fullscreen-calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  X,
} from "lucide-react";

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

export default function StickyNotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    text: "",
    color: "#FEF3C7",
    is_public: false,
    pinned: false,
  });

  // Floating notes panel
  const [showFloating, setShowFloating] = useState(false);

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

  // Transform notes into calendar data format
  const calendarData = notes.reduce((acc, note) => {
    const noteDate = new Date(note.note_date + "T00:00:00");
    const existing = acc.find((d) => isSameDay(d.day, noteDate));
    const event = {
      id: note.id,
      name: note.text.substring(0, 40) + (note.text.length > 40 ? "..." : ""),
      time: note.is_public ? "Public" : "Private",
      color: note.color,
      _note: note,
    };
    if (existing) {
      existing.events.push(event);
    } else {
      acc.push({ day: noteDate, events: [event] });
    }
    return acc;
  }, []);

  const handleDateClick = (day) => {
    setSelectedDate(day);
    setShowFloating(true);
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

  // Notes for the selected date
  const selectedDateNotes = notes.filter(
    (n) => n.note_date === format(selectedDate, "yyyy-MM-dd")
  );

  // Pinned notes across all dates
  const pinnedNotes = notes.filter((n) => n.pinned);

  return (
    <div data-testid="sticky-notes-page" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <StickyNote className="h-6 w-6 text-amber-500" />
            Sticky Notes
          </h1>
          <p className="text-sm text-muted-foreground">
            Add notes to calendar dates — visible to you or the whole team
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFloating(!showFloating)}
          >
            {showFloating ? "Hide Panel" : "Show Panel"}
          </Button>
          <Button size="sm" onClick={() => handleNewNote(selectedDate)} className="gap-1">
            <Plus className="h-4 w-4" />
            New Note
          </Button>
        </div>
      </div>

      {/* Pinned Notes Strip */}
      {pinnedNotes.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {pinnedNotes.map((note) => (
            <div
              key={note.id}
              className="sticky-note pinned flex-shrink-0 w-48 rounded-lg p-3 border-2 cursor-pointer"
              style={{ background: note.color, borderColor: `${note.color}80` }}
              onClick={() => handleEditNote(note)}
            >
              <div className="flex items-start justify-between mb-1">
                <Pin className="h-3 w-3 text-primary" />
                <span className="text-[10px] text-muted-foreground">
                  {note.note_date}
                </span>
              </div>
              <p className="text-xs font-medium line-clamp-3 text-foreground/80">
                {note.text}
              </p>
              <div className="flex items-center gap-1 mt-2">
                {note.is_public ? (
                  <Globe className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="text-[10px] text-muted-foreground">
                  {note.user_name}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-4">
        {/* Calendar */}
        <div className={`flex-1 border rounded-lg bg-card ${showFloating ? "lg:w-2/3" : "w-full"}`}>
          <FullScreenCalendar
            data={calendarData}
            onDateClick={handleDateClick}
            onNewEvent={handleNewNote}
          />
        </div>

        {/* Floating side panel */}
        {showFloating && (
          <div className="hidden lg:block w-80 border rounded-lg bg-card p-4 space-y-3 sticky top-0 self-start max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">
                {format(selectedDate, "MMMM d, yyyy")}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowFloating(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {selectedDateNotes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No notes for this date</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-1"
                  onClick={() => handleNewNote(selectedDate)}
                >
                  <Plus className="h-3 w-3" />
                  Add Note
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedDateNotes.map((note) => (
                  <div
                    key={note.id}
                    className="sticky-note rounded-lg p-3 border group relative"
                    style={{ background: note.color }}
                  >
                    <p className="text-xs text-foreground/80 pr-12 whitespace-pre-wrap">
                      {note.text}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1">
                        {note.is_public ? (
                          <Globe className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {note.user_name}
                        </span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleTogglePin(note)}
                      >
                        {note.pinned ? (
                          <PinOff className="h-3 w-3" />
                        ) : (
                          <Pin className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleEditNote(note)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      {(note.user_id === user?.id ||
                        user?.system_role === "admin") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(note.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingNote ? "Edit Note" : "New Sticky Note"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={format(selectedDate, "yyyy-MM-dd")}
                onChange={(e) =>
                  setSelectedDate(new Date(e.target.value + "T00:00:00"))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea
                placeholder="Write your note..."
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      form.color === c.value
                        ? "border-foreground scale-110"
                        : "border-transparent hover:border-muted-foreground/40"
                    }`}
                    style={{ background: c.value }}
                    onClick={() => setForm({ ...form, color: c.value })}
                    type="button"
                    title={c.name}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_public}
                  onCheckedChange={(v) => setForm({ ...form, is_public: v })}
                />
                <Label className="flex items-center gap-1 text-sm">
                  {form.is_public ? (
                    <>
                      <Globe className="h-3.5 w-3.5" /> Public
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5" /> Private
                    </>
                  )}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.pinned}
                  onCheckedChange={(v) => setForm({ ...form, pinned: v })}
                />
                <Label className="flex items-center gap-1 text-sm">
                  <Pin className="h-3.5 w-3.5" /> Pinned
                </Label>
              </div>
            </div>
            {/* Preview */}
            <div
              className="rounded-lg p-3 border text-sm"
              style={{ background: form.color }}
            >
              {form.text || "Preview..."}
            </div>
          </div>
          <DialogFooter>
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
              ) : (
                <>{editingNote ? "Save Changes" : "Create Note"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
