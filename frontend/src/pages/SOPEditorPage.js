import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { sopsApi, usersApi } from "@/lib/api";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Save, CheckCircle2, Clock, Archive, History,
  Users, Loader2, Check, X, AlertTriangle, RotateCcw,
  Plus, Trash2, ChevronLeft, ChevronRight, Eye, EyeOff, Upload, Download
} from "lucide-react";

// ── TipTap (loaded lazily to keep initial bundle small) ──
let EditorContent, useEditor, StarterKit;
try {
  ({ EditorContent, useEditor } = require("@tiptap/react"));
  ({ default: StarterKit } = require("@tiptap/starter-kit"));
} catch {
  // Tiptap not yet available - handled in render
}

// ── react-spreadsheet ──
let Spreadsheet;
try {
  ({ default: Spreadsheet } = require("react-spreadsheet"));
} catch {
  Spreadsheet = null;
}

// ── Document (TipTap) editor ──
function DocumentEditor({ content, onChange, editable }) {
  const editor = useEditor
    ? useEditor({
        extensions: StarterKit ? [StarterKit] : [],
        content: content?.html || "",
        editable,
        onUpdate: ({ editor }) => onChange({ html: editor.getHTML() }),
      })
    : null;

  if (!useEditor) return <Textarea value={content?.html || ""} onChange={e => onChange({ html: e.target.value })} disabled={!editable} className="min-h-[500px] font-mono text-sm" />;

  return (
    <div className="border rounded-lg overflow-hidden">
      {editable && editor && (
        <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/30">
          {[
            { label: "B", action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold"), className: "font-bold" },
            { label: "I", action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic"), className: "italic" },
            { label: "H1", action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive("heading", { level: 1 }) },
            { label: "H2", action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }) },
            { label: "• List", action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList") },
            { label: "1. List", action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList") },
            { label: "Quote", action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive("blockquote") },
            { label: "⟵", action: () => editor.chain().focus().undo().run() },
            { label: "⟶", action: () => editor.chain().focus().redo().run() },
          ].map((btn, i) => (
            <Button key={i} size="sm" variant={btn.active ? "secondary" : "ghost"}
              className={`h-7 px-2 text-xs ${btn.className || ""}`}
              onMouseDown={e => { e.preventDefault(); btn.action(); }}>
              {btn.label}
            </Button>
          ))}
        </div>
      )}
      <div className="p-4 min-h-[500px] prose prose-sm max-w-none dark:prose-invert focus:outline-none">
        {editor && <EditorContent editor={editor} />}
      </div>
    </div>
  );
}

// ── Spreadsheet editor ──
function SpreadsheetEditor({ content, onChange, editable }) {
  const data = content?.data || [[{ value: "" }]];
  if (!Spreadsheet) {
    return (
      <div className="border rounded-lg p-4 text-sm text-muted-foreground">
        Spreadsheet editor not available. Run <code>npm install react-spreadsheet</code>.
      </div>
    );
  }
  return (
    <div className={`border rounded-lg overflow-auto ${!editable ? "pointer-events-none opacity-70" : ""}`}>
      <Spreadsheet data={data} onChange={d => onChange({ data: d })} />
    </div>
  );
}

// ── Presentation editor ──
function PresentationEditor({ content, onChange, editable }) {
  const slides = content?.slides || [{ id: 1, title: "Slide 1", body: "" }];
  const [activeIdx, setActiveIdx] = useState(0);
  const [preview, setPreview] = useState(false);
  const active = slides[Math.min(activeIdx, slides.length - 1)];

  const updateSlide = (field, val) => {
    const updated = slides.map((s, i) => i === activeIdx ? { ...s, [field]: val } : s);
    onChange({ slides: updated });
  };

  const addSlide = () => {
    const next = { id: Date.now(), title: `Slide ${slides.length + 1}`, body: "" };
    onChange({ slides: [...slides, next] });
    setActiveIdx(slides.length);
  };

  const deleteSlide = (idx) => {
    if (slides.length <= 1) { toast.error("Cannot delete the only slide"); return; }
    const updated = slides.filter((_, i) => i !== idx);
    onChange({ slides: updated });
    setActiveIdx(Math.min(activeIdx, updated.length - 1));
  };

  if (preview) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setPreview(false)}>
            <EyeOff className="h-4 w-4 mr-1" /> Exit Preview
          </Button>
        </div>
        <div className="relative bg-slate-900 rounded-xl aspect-video flex flex-col items-center justify-center p-10 text-white">
          <p className="text-xs text-slate-400 mb-2">Slide {activeIdx + 1} / {slides.length}</p>
          <h2 className="text-3xl font-bold mb-4 text-center">{active?.title}</h2>
          <div className="text-lg text-center whitespace-pre-wrap opacity-90">{active?.body}</div>
          <div className="absolute bottom-4 flex gap-2">
            <Button size="sm" variant="ghost" className="text-white" disabled={activeIdx === 0}
              onClick={() => setActiveIdx(i => i - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="text-white" disabled={activeIdx === slides.length - 1}
              onClick={() => setActiveIdx(i => i + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 min-h-[500px]">
      {/* Slide list */}
      <div className="w-44 shrink-0 flex flex-col gap-1">
        <ScrollArea className="flex-1">
          {slides.map((slide, idx) => (
            <div key={slide.id}
              className={`group relative rounded-lg border p-2 cursor-pointer text-xs transition-colors mb-1 ${activeIdx === idx ? "bg-primary/10 border-primary" : "hover:bg-muted/50"}`}
              onClick={() => setActiveIdx(idx)}>
              <div className="font-medium truncate">{slide.title || `Slide ${idx + 1}`}</div>
              <div className="text-muted-foreground truncate">{slide.body?.slice(0, 40)}</div>
              {editable && slides.length > 1 && (
                <button className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-destructive"
                  onClick={e => { e.stopPropagation(); deleteSlide(idx); }}>
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </ScrollArea>
        {editable && (
          <Button size="sm" variant="outline" className="w-full" onClick={addSlide}>
            <Plus className="h-3 w-3 mr-1" /> Add Slide
          </Button>
        )}
      </div>

      {/* Slide editor */}
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Slide {activeIdx + 1} of {slides.length}</span>
          <Button variant="outline" size="sm" onClick={() => setPreview(true)}>
            <Eye className="h-4 w-4 mr-1" /> Preview
          </Button>
        </div>
        <Input
          placeholder="Slide title"
          value={active?.title || ""}
          onChange={e => updateSlide("title", e.target.value)}
          disabled={!editable}
          className="text-lg font-semibold"
        />
        <Textarea
          placeholder="Slide content…"
          value={active?.body || ""}
          onChange={e => updateSlide("body", e.target.value)}
          disabled={!editable}
          className="flex-1 min-h-[400px] resize-none text-base"
        />
      </div>
    </div>
  );
}

// ── File editor ──
function FileEditor({ sop, onFileUploaded, editable }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await sopsApi.upload(fd);
      onFileUploaded(data);
      toast.success("File uploaded");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
    setUploading(false);
    e.target.value = "";
  };

  return (
    <div className="border rounded-lg p-6 space-y-4">
      {sop.file_url ? (
        <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{sop.file_name}</p>
            <p className="text-xs text-muted-foreground">
              {sop.file_type} · {sop.file_size ? `${(sop.file_size / 1024).toFixed(1)} KB` : ""}
            </p>
          </div>
          <a href={`${import.meta.env.REACT_APP_BACKEND_URL}${sop.file_url}`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" /> Download</Button>
          </a>
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <Upload className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>No file attached yet</p>
        </div>
      )}
      {editable && (
        <>
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload}
            accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.png,.jpg,.jpeg,.csv" />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            {sop.file_url ? "Replace File" : "Upload File"}
          </Button>
        </>
      )}
    </div>
  );
}

// ── Main page ──
export default function SOPEditorPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sop, setSop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [versions, setVersions] = useState([]);
  const [users, setUsersData] = useState([]);
  const [transferTo, setTransferTo] = useState("");
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [acked, setAcked] = useState(false);

  const isOwner = useCallback(s => s && (s.owner === user?.id), [user]);
  const isPrivileged = user?.system_role === "admin" || user?.system_role === "manager";
  const canDirectEdit = useCallback(s => s && (isOwner(s) || isPrivileged), [isOwner, isPrivileged]);
  const isReadonly = user?.system_role === "employee"; // will be refined server-side

  const loadSop = useCallback(async () => {
    try {
      const { data } = await sopsApi.get(id);
      setSop(data);
      setDraft(data.content || {});
      setTitleDraft(data.title);
      setAcked(data.acknowledged_by?.some(a => a.user_id === user?.id) || false);
    } catch (err) {
      toast.error("SOP not found");
      navigate("/sops");
    }
    setLoading(false);
  }, [id, user?.id, navigate]);

  useEffect(() => { loadSop(); }, [loadSop]);

  const handleSave = async () => {
    if (!sop) return;
    setSaving(true);
    try {
      const payload = { content: draft, title: titleDraft, change_note: changeNote || undefined };
      if (sop.sop_type === "file" && draft?.file_url) {
        payload.file_url = draft.file_url;
        payload.file_name = draft.file_name;
        payload.file_size = draft.file_size;
        payload.file_type = draft.file_type;
      }
      const { data } = await sopsApi.update(id, payload);
      setSop(data);
      setChangeNote("");
      const isDirect = canDirectEdit(data);
      toast.success(isDirect ? `Saved (v${data.current_version})` : "Edit proposed — awaiting owner approval");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
    setSaving(false);
  };

  const handleAcknowledge = async () => {
    try {
      await sopsApi.acknowledge(id);
      setAcked(true);
      toast.success("Acknowledged");
      loadSop();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const handleApprove = async () => {
    try {
      const { data } = await sopsApi.approve(id);
      setSop(data);
      setDraft(data.content || {});
      toast.success("Edit approved and published");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const handleReject = async () => {
    try {
      const { data } = await sopsApi.reject(id);
      setSop(data);
      toast.success("Edit rejected");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const handleRevert = async (versionId) => {
    try {
      const { data } = await sopsApi.revert(id, versionId);
      setSop(data);
      setDraft(data.content || {});
      setTitleDraft(data.title);
      setShowHistory(false);
      toast.success(`Reverted to v${data.current_version}`);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const handleArchive = async () => {
    try {
      const { data } = await sopsApi.archive(id);
      setSop(data);
      setShowArchiveConfirm(false);
      toast.success("SOP archived");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const handleTransfer = async () => {
    if (!transferTo) return;
    try {
      const { data } = await sopsApi.transfer(id, { new_owner_id: transferTo });
      setSop(data);
      setShowTransfer(false);
      setTransferTo("");
      toast.success("Ownership transferred");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const openHistory = async () => {
    try {
      const { data } = await sopsApi.versions(id);
      setVersions(data);
      setShowHistory(true);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const openTransfer = async () => {
    try {
      const { data } = await usersApi.list();
      setUsersData(data.filter(u => u.id !== user?.id));
      setShowTransfer(true);
    } catch {
      setUsersData([]);
      setShowTransfer(true);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sop) return null;

  const canEdit = sop.status !== "archived";
  const canDirect = canDirectEdit(sop);
  const showPendingBanner = sop.has_pending_edit && (isOwner(sop) || isPrivileged);
  const isArchived = sop.status === "archived";

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-background border-b px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/sops")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> SOPs
        </Button>
        <Separator orientation="vertical" className="h-5" />

        {/* Title */}
        <Input
          value={titleDraft}
          onChange={e => setTitleDraft(e.target.value)}
          disabled={!canEdit || isArchived}
          className="text-lg font-semibold border-0 shadow-none focus-visible:ring-0 max-w-sm bg-transparent p-0 h-auto"
        />

        <Badge variant="outline">v{sop.current_version}</Badge>
        <Badge variant={isArchived ? "secondary" : "default"}>{sop.status}</Badge>

        <div className="ml-auto flex items-center gap-2">
          {/* Acknowledge */}
          <Button variant={acked ? "secondary" : "outline"} size="sm" onClick={handleAcknowledge} disabled={acked}>
            {acked ? <><CheckCircle2 className="h-4 w-4 mr-1 text-green-600" /> Acknowledged</> : <><Check className="h-4 w-4 mr-1" /> Acknowledge</>}
          </Button>

          {/* Version history */}
          <Button variant="outline" size="sm" onClick={openHistory}>
            <History className="h-4 w-4 mr-1" /> History
          </Button>

          {/* Transfer (owner/admin) */}
          {(isOwner(sop) || isPrivileged) && (
            <Button variant="outline" size="sm" onClick={openTransfer}>
              <Users className="h-4 w-4 mr-1" /> Transfer
            </Button>
          )}

          {/* Archive */}
          {(isOwner(sop) || isPrivileged) && !isArchived && (
            <Button variant="outline" size="sm" onClick={() => setShowArchiveConfirm(true)}>
              <Archive className="h-4 w-4 mr-1" /> Archive
            </Button>
          )}

          {/* Save */}
          {canEdit && (
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Change note (optional)"
                value={changeNote}
                onChange={e => setChangeNote(e.target.value)}
                className="w-44 h-8 text-sm"
              />
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                {canDirect ? "Save" : "Propose Edit"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Pending edit banner */}
      {showPendingBanner && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-6 py-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-medium">Pending edit</span>
            <span className="text-muted-foreground ml-2">
              Proposed on {sop.pending_edit_at ? new Date(sop.pending_edit_at).toLocaleDateString() : "—"}
            </span>
          </div>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleApprove}>
            <Check className="h-4 w-4 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={handleReject}>
            <X className="h-4 w-4 mr-1" /> Reject
          </Button>
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
        {sop.description && (
          <p className="text-muted-foreground text-sm mb-4">{sop.description}</p>
        )}

        {sop.sop_type === "document" && (
          <DocumentEditor content={draft} onChange={setDraft} editable={canEdit && !isArchived} />
        )}
        {sop.sop_type === "spreadsheet" && (
          <SpreadsheetEditor content={draft} onChange={setDraft} editable={canEdit && !isArchived} />
        )}
        {sop.sop_type === "presentation" && (
          <PresentationEditor content={draft} onChange={setDraft} editable={canEdit && !isArchived} />
        )}
        {sop.sop_type === "file" && (
          <FileEditor sop={sop} editable={canEdit && !isArchived}
            onFileUploaded={fileData => setDraft(fd => ({ ...fd, ...fileData }))} />
        )}

        {/* Acknowledgement list */}
        {sop.acknowledged_by?.length > 0 && (
          <div className="mt-8 border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> Acknowledged by {sop.acknowledged_by.length} user(s)
            </h3>
            <div className="flex flex-wrap gap-2">
              {sop.acknowledged_by.map((a, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {a.user_id} · {a.at ? new Date(a.at).toLocaleDateString() : ""}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Version history drawer */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Version History</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-96">
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No previous versions</p>
            ) : (
              <div className="space-y-2">
                {versions.map(v => (
                  <div key={v.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">v{v.version}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {v.changed_at ? new Date(v.changed_at).toLocaleString() : ""}
                        </span>
                      </div>
                      {v.change_note && <p className="text-xs text-muted-foreground mt-1 truncate">{v.change_note}</p>}
                    </div>
                    {(isOwner(sop) || isPrivileged) && (
                      <Button size="sm" variant="outline" onClick={() => handleRevert(v.id)}>
                        <RotateCcw className="h-3 w-3 mr-1" /> Revert
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistory(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer ownership dialog */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Transfer Ownership</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>New Owner</Label>
            <Select value={transferTo} onValueChange={setTransferTo}>
              <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || u.username} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={!transferTo}>Transfer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive "{sop.title}"?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground px-6">Archived SOPs cannot be edited. Version history is preserved.</p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
