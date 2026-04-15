import { useState, useEffect } from "react";
import { shiftTemplatesApi, formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, LayoutTemplate, Loader2, Clock } from "lucide-react";

const PRESET_COLORS = [
  "#6366F1", "#10B981", "#F59E0B", "#EF4444",
  "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6",
];

const DEFAULT_SUGGESTIONS = [
  { name: "Morning", start_time: "06:00", end_time: "14:00", required_count: 1, color_hex: "#F59E0B" },
  { name: "Day", start_time: "09:00", end_time: "18:00", required_count: 1, color_hex: "#10B981" },
  { name: "DE Full Day", start_time: "12:00", end_time: "21:00", required_count: 1, color_hex: "#6366F1" },
  { name: "Night", start_time: "22:00", end_time: "06:00", required_count: 1, color_hex: "#8B5CF6" },
  { name: "General", start_time: "10:30", end_time: "19:30", required_count: 1, color_hex: "#3B82F6" },
];

const emptyForm = { name: "", start_time: "09:00", end_time: "17:00", required_count: 1, color_hex: "#6366F1" };

export default function ShiftTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await shiftTemplatesApi.list();
      setTemplates(data || []);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEditId(null);
    setShowCreate(true);
  };

  const openEdit = (tmpl) => {
    setForm({
      name: tmpl.name || "",
      start_time: tmpl.start_time || "09:00",
      end_time: tmpl.end_time || "17:00",
      required_count: tmpl.required_count || 1,
      color_hex: tmpl.color_hex || "#6366F1",
    });
    setEditId(tmpl.id);
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Template name is required");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await shiftTemplatesApi.update(editId, form);
        toast.success("Template updated");
      } else {
        await shiftTemplatesApi.create(form);
        toast.success("Template created");
      }
      setShowCreate(false);
      setEditId(null);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await shiftTemplatesApi.delete(confirmDelete.id);
      toast.success("Template deleted");
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setConfirmDelete(null);
  };

  const handleSeedSuggestion = async (suggestion) => {
    setSaving(true);
    try {
      await shiftTemplatesApi.create(suggestion);
      toast.success(`"${suggestion.name}" template added`);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  const formatTime = (t) => {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hour = parseInt(h, 10);
    const suffix = hour >= 12 ? "PM" : "AM";
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}:${m} ${suffix}`;
  };

  const existingNames = new Set(templates.map((t) => t.name.toLowerCase()));

  return (
    <div data-testid="shift-templates-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6" /> Shift Templates
          </h1>
          <p className="text-sm text-muted-foreground">{templates.length} templates defined</p>
        </div>
        <Button onClick={openCreate} data-testid="create-template-btn">
          <Plus className="h-4 w-4 mr-2" /> New Template
        </Button>
      </div>

      {/* Default suggestions when no templates */}
      {!loading && templates.length === 0 && (
        <Card className="border border-dashed">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Quick-add default templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_SUGGESTIONS.map((s) => (
                <Button
                  key={s.name}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSeedSuggestion(s)}
                  disabled={saving}
                >
                  <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ background: s.color_hex }} />
                  {s.name} ({s.start_time}–{s.end_time})
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggestions row shown at top if templates already exist */}
      {!loading && templates.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground mr-1">Add suggested:</span>
          {DEFAULT_SUGGESTIONS.filter((s) => !existingNames.has(s.name.toLowerCase())).map((s) => (
            <Button
              key={s.name}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleSeedSuggestion(s)}
              disabled={saving}
            >
              <span className="w-2 h-2 rounded-full mr-1.5 shrink-0" style={{ background: s.color_hex }} />
              {s.name}
            </Button>
          ))}
        </div>
      )}

      {/* Templates grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {templates.map((tmpl) => (
            <Card key={tmpl.id} data-testid={`template-card-${tmpl.id}`} className="border hover:shadow-sm transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: tmpl.color_hex || "#6366F1" }}
                    />
                    <span className="font-medium text-sm truncate">{tmpl.name}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(tmpl)}
                      data-testid={`edit-template-${tmpl.id}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete({ id: tmpl.id, name: tmpl.name })}
                      data-testid={`delete-template-${tmpl.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>{formatTime(tmpl.start_time)} – {formatTime(tmpl.end_time)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px]">
                    {tmpl.required_count} required
                  </Badge>
                  {tmpl.color_hex && (
                    <span
                      className="text-[10px] font-mono text-muted-foreground"
                      style={{ color: tmpl.color_hex }}
                    >
                      {tmpl.color_hex}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditId(null); } }}>
        <DialogContent data-testid="template-dialog">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Template" : "New Shift Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Template Name</Label>
              <Input
                data-testid="template-name-input"
                placeholder="e.g. Morning, Night, Day Shift"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input
                  data-testid="template-start-input"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input
                  data-testid="template-end-input"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Required Staff Count</Label>
              <Input
                data-testid="template-count-input"
                type="number"
                min={1}
                max={100}
                value={form.required_count}
                onChange={(e) => setForm({ ...form, required_count: parseInt(e.target.value, 10) || 1 })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-7 h-7 rounded-full border-2 transition-all ${form.color_hex === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                    onClick={() => setForm({ ...form, color_hex: c })}
                    data-testid={`color-${c}`}
                    title={c}
                  />
                ))}
                <Input
                  type="color"
                  className="w-7 h-7 p-0.5 rounded-full cursor-pointer border"
                  value={form.color_hex}
                  onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
                  title="Custom color"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }}>
              Cancel
            </Button>
            <Button data-testid="template-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template "{confirmDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This template will be removed. Existing shifts using this template will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
