import { useState, useEffect } from "react";
import { shiftTemplatesApi, departmentsApi, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, LayoutTemplate, Loader2, Clock, Building2 } from "lucide-react";

const PRESET_COLORS = [
  "#6366F1", "#10B981", "#F59E0B", "#EF4444",
  "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6",
];

const emptyForm = {
  name: "", start_time: "09:00", end_time: "17:00",
  required_count: 1, color_hex: "#6366F1", department_id: "",
};

export default function ShiftTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDept, setActiveDept] = useState("all"); // "all" | dept id
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tmplRes, deptRes] = await Promise.all([
        shiftTemplatesApi.list(),
        departmentsApi.list(),
      ]);
      setTemplates(tmplRes.data || []);
      setDepartments(deptRes.data || []);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const openCreate = () => {
    setForm({ ...emptyForm, department_id: activeDept === "all" ? "" : activeDept });
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
      department_id: tmpl.department_id || "",
    });
    setEditId(tmpl.id);
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Template name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        start_time: form.start_time,
        end_time: form.end_time,
        required_count: form.required_count,
        color_hex: form.color_hex,
        department_id: form.department_id || null,
      };
      if (editId) {
        await shiftTemplatesApi.update(editId, payload);
        toast.success("Template updated");
      } else {
        await shiftTemplatesApi.create(payload);
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

  const formatTime = (t) => {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hour = parseInt(h, 10);
    return `${hour % 12 === 0 ? 12 : hour % 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
  };

  const deptName = (id) => departments.find((d) => d.id === id)?.name || "";

  // Filter displayed templates by active department tab
  const visibleTemplates = activeDept === "all"
    ? templates
    : templates.filter((t) => t.department_id === activeDept);

  // Build tab list: "All" + each dept that has templates + any dept user can select
  const deptTabs = [
    { id: "all", name: "All", count: templates.length },
    ...departments.map((d) => ({
      id: d.id,
      name: d.name,
      count: templates.filter((t) => t.department_id === d.id).length,
    })),
  ];

  // Templates without a department
  const unassignedCount = templates.filter((t) => !t.department_id).length;

  return (
    <div data-testid="shift-templates-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6" /> Shift Templates
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeDept === "all" ? `${templates.length} templates total` : `${visibleTemplates.length} templates in ${deptName(activeDept) || "this department"}`}
          </p>
        </div>
        <Button onClick={openCreate} data-testid="create-template-btn">
          <Plus className="h-4 w-4 mr-2" /> New Template
        </Button>
      </div>

      {/* Department tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {deptTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveDept(tab.id)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
              activeDept === tab.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {tab.name}
            <span className={`ml-1.5 text-xs ${activeDept === tab.id ? "opacity-80" : "opacity-60"}`}>
              ({tab.count})
            </span>
          </button>
        ))}
        {unassignedCount > 0 && (
          <button
            onClick={() => setActiveDept("unassigned")}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
              activeDept === "unassigned"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            No Department
            <span className="ml-1.5 text-xs opacity-60">({unassignedCount})</span>
          </button>
        )}
      </div>

      {/* Templates grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : visibleTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <LayoutTemplate className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No templates yet</p>
          <p className="text-xs mt-1">
            {activeDept === "all"
              ? "Create your first shift template to get started"
              : `No templates for ${deptName(activeDept) || "this department"}`}
          </p>
          <Button size="sm" className="mt-4" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(activeDept === "unassigned"
            ? templates.filter((t) => !t.department_id)
            : visibleTemplates
          ).map((tmpl) => (
            <Card key={tmpl.id} data-testid={`template-card-${tmpl.id}`} className="border hover:shadow-sm transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: tmpl.color_hex || "#6366F1" }} />
                    <span className="font-medium text-sm truncate">{tmpl.name}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tmpl)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete({ id: tmpl.id, name: tmpl.name })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>{formatTime(tmpl.start_time)} – {formatTime(tmpl.end_time)}</span>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-1">
                  <Badge variant="secondary" className="text-[10px]">{tmpl.required_count} required</Badge>
                  {tmpl.department_id && (
                    <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                      <Building2 className="h-2.5 w-2.5" />
                      {deptName(tmpl.department_id)}
                    </Badge>
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

            {/* Department */}
            <div className="space-y-1.5">
              <Label>Department <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select
                value={form.department_id || "none"}
                onValueChange={(v) => setForm({ ...form, department_id: v === "none" ? "" : v })}
              >
                <SelectTrigger data-testid="template-dept-select">
                  <SelectValue placeholder="Select department…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No department (shared) —</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c} type="button"
                    className={`w-7 h-7 rounded-full border-2 transition-all ${form.color_hex === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                    onClick={() => setForm({ ...form, color_hex: c })}
                    title={c}
                  />
                ))}
                <Input
                  type="color" className="w-7 h-7 p-0.5 rounded-full cursor-pointer border"
                  value={form.color_hex}
                  onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
                  title="Custom color"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }}>Cancel</Button>
            <Button data-testid="template-save-btn" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
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
