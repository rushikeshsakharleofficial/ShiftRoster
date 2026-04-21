import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { sopsApi } from "@/lib/api";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Loader2, FileText, Table2, Presentation, Upload,
  Clock, Trash2, ExternalLink, Check, X
} from "lucide-react";
import { PREDEFINED_CATEGORIES } from "./SOPEditorPage";

const TYPE_ICONS = { document: FileText, spreadsheet: Table2, presentation: Presentation, file: Upload };
const TYPE_LABELS = { document: "Document", spreadsheet: "Spreadsheet", presentation: "Presentation", file: "File" };

export default function SOPsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sops, setSops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [form, setForm] = useState({
    title: "", description: "", category: "", tags: "", sop_type: "document",
  });

  const loadSops = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await sopsApi.list();
      setSops(data);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSops(); }, [loadSops]);

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const effectiveCategory = form.category === "Others"
        ? (customCategory || "Others")
        : form.category;
      const payload = {
        ...form,
        category: effectiveCategory || undefined,
        tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        content: form.sop_type === "document" ? { html: "" }
          : form.sop_type === "spreadsheet" ? { data: [[{ value: "" }]] }
          : form.sop_type === "presentation" ? { slides: [{ id: 1, title: "Slide 1", body: "" }] }
          : {},
      };
      const { data } = await sopsApi.create(payload);
      toast.success("SOP created");
      setShowCreate(false);
      setForm({ title: "", description: "", category: "", tags: "", sop_type: "document" });
      setCustomCategory("");
      navigate(`/sops/${data.id}`);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await sopsApi.delete(confirmDelete.id);
      toast.success("SOP deleted");
      setConfirmDelete(null);
      loadSops();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const handleApprove = async (sop, e) => {
    e.stopPropagation();
    try { await sopsApi.approve(sop.id); toast.success("Edit approved"); loadSops(); }
    catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
  };

  const handleReject = async (sop, e) => {
    e.stopPropagation();
    try { await sopsApi.reject(sop.id); toast.success("Edit rejected"); loadSops(); }
    catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
  };

  const isOwner = (sop) => sop.owner === user?.id;
  const canDelete = (sop) => ["admin", "manager"].includes(user?.system_role) || isOwner(sop);

  const filtered = sops.filter(s => {
    if (filterType !== "all" && s.sop_type !== filterType) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">SOPs</h1>
          <p className="text-muted-foreground text-sm mt-1">Standard Operating Procedures</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" /> New SOP</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input placeholder="Search by title…" value={search} onChange={e => setSearch(e.target.value)} className="w-56" />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="document">Document</SelectItem>
            <SelectItem value="spreadsheet">Spreadsheet</SelectItem>
            <SelectItem value="presentation">Presentation</SelectItem>
            <SelectItem value="file">File</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No SOPs found</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Title</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Version</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Acks</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(sop => {
                const TypeIcon = TYPE_ICONS[sop.sop_type] || FileText;
                const pendingForMe = sop.has_pending_edit && (isOwner(sop) || ["admin", "manager"].includes(user?.system_role));
                return (
                  <tr key={sop.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/sops/${sop.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">{sop.title}</span>
                        {pendingForMe && (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs ml-1">
                            <Clock className="h-3 w-3 mr-1" /> Pending edit
                          </Badge>
                        )}
                      </div>
                      {sop.description && <p className="text-muted-foreground text-xs mt-0.5 truncate max-w-xs">{sop.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{TYPE_LABELS[sop.sop_type]}</td>
                    <td className="px-4 py-3 text-muted-foreground">{sop.category || "—"}</td>
                    <td className="px-4 py-3"><Badge variant="outline">v{sop.current_version}</Badge></td>
                    <td className="px-4 py-3"><Badge variant={sop.status === "archived" ? "secondary" : "default"}>{sop.status}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{sop.acknowledged_by?.length || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {pendingForMe && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-green-600 border-green-300 hover:bg-green-50" onClick={e => handleApprove(sop, e)}><Check className="h-3 w-3" /></Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-red-600 border-red-300 hover:bg-red-50" onClick={e => handleReject(sop, e)}><X className="h-3 w-3" /></Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => navigate(`/sops/${sop.id}`)}><ExternalLink className="h-3 w-3" /></Button>
                        {canDelete(sop) && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(sop)}><Trash2 className="h-3 w-3" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New SOP</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Enter SOP title" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.sop_type} onValueChange={v => setForm(f => ({ ...f, sop_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="document">📄 Document (Wordpad)</SelectItem>
                  <SelectItem value="spreadsheet">📊 Spreadsheet (Sheets)</SelectItem>
                  <SelectItem value="presentation">📑 Presentation (Slides)</SelectItem>
                  <SelectItem value="file">📎 File Upload</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description…" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {PREDEFINED_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.category === "Others" && (
                  <Input placeholder="Custom category name" value={customCategory}
                    onChange={e => setCustomCategory(e.target.value)} className="mt-1 text-sm" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Tags (comma-separated)</Label>
                <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="tag1, tag2" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create & Open Editor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete "{confirmDelete?.title}"?</AlertDialogTitle></AlertDialogHeader>
          <p className="text-sm text-muted-foreground px-6">Permanently deletes SOP and all version history.</p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
