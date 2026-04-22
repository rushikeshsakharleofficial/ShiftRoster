import { useState, useEffect } from "react";
import { departmentsApi, positionsApi, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2, Loader2 } from "lucide-react";

export default function DepartmentsPage() {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [form, setForm] = useState({ name: "", color_hex: "#3B82F6" });
  const [saving, setSaving] = useState(false);
  const [showAddPosition, setShowAddPosition] = useState(null);
  const [posName, setPosName] = useState("");

  const loadData = async () => {
    try {
      const [dRes, pRes] = await Promise.all([departmentsApi.list(), positionsApi.list()]);
      setDepartments(dRes.data || []);
      setPositions(pRes.data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (showEdit) {
        await departmentsApi.update(showEdit, form);
        toast.success("Department updated");
      } else {
        await departmentsApi.create(form);
        toast.success("Department created");
      }
      setShowCreate(false);
      setShowEdit(null);
      setForm({ name: "", color_hex: "#3B82F6" });
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
    setSaving(false);
  };

  const handleDelete = (id) => setConfirmDelete({ id, label: "department" });

  const doDelete = async () => {
    try {
      await departmentsApi.delete(confirmDelete.id);
      toast.success("Department deleted");
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleAddPosition = async () => {
    if (!posName.trim()) return;
    try {
      await positionsApi.create({ name: posName, department_id: showAddPosition });
      toast.success("Position added");
      setPosName("");
      setShowAddPosition(null);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleDeletePosition = async (id) => {
    try {
      await positionsApi.delete(id);
      toast.success("Position deleted");
      loadData();
    } catch {}
  };

  const colors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

  return (
    <div data-testid="departments-page" className="space-y-6 dispatch-stagger">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Departments</h1>
          <p className="text-sm text-muted-foreground">{departments.length} departments</p>
        </div>
        <Button data-testid="create-dept-btn" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Department
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map(dept => (
            <Card key={dept.id} className="border hover:-translate-y-0.5 transition-transform" data-testid={`dept-card-${dept.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: dept.color_hex + "20" }}>
                      <Building2 className="h-5 w-5" style={{ color: dept.color_hex }} />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{dept.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-3 h-3 rounded" style={{ background: dept.color_hex }} />
                        <span className="text-xs text-muted-foreground">{dept.color_hex}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => { setForm({ name: dept.name, color_hex: dept.color_hex }); setShowEdit(dept.id); }}
                      data-testid={`edit-dept-${dept.id}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(dept.id)} data-testid={`delete-dept-${dept.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {/* Positions */}
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Positions</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowAddPosition(dept.id)} data-testid={`add-position-${dept.id}`}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {positions.filter(p => p.department_id === dept.id).map(p => (
                      <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted">
                        {p.name}
                        <button onClick={() => handleDeletePosition(p.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    {positions.filter(p => p.department_id === dept.id).length === 0 && (
                      <span className="text-xs text-muted-foreground">No positions yet</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Department */}
      <Dialog open={showCreate || !!showEdit} onOpenChange={() => { setShowCreate(false); setShowEdit(null); }}>
        <DialogContent data-testid="dept-dialog">
          <DialogHeader>
            <DialogTitle>{showEdit ? "Edit Department" : "New Department"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input data-testid="dept-name-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Engineering" />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2">
                {colors.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm({...form, color_hex: c})}
                    className={`w-8 h-8 rounded-lg border-2 transition-transform ${form.color_hex === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setShowEdit(null); }}>Cancel</Button>
            <Button data-testid="dept-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Position */}
      <Dialog open={!!showAddPosition} onOpenChange={() => setShowAddPosition(null)}>
        <DialogContent data-testid="position-dialog">
          <DialogHeader><DialogTitle>Add Position</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Position Name</Label>
            <Input data-testid="position-name-input" value={posName} onChange={e => setPosName(e.target.value)} placeholder="e.g. Senior Developer" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPosition(null)}>Cancel</Button>
            <Button data-testid="position-save-btn" onClick={handleAddPosition}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
