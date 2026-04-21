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
  ArrowLeft, Save, CheckCircle2, Archive, History,
  Users, Loader2, Check, X, AlertTriangle, RotateCcw,
  Plus, Trash2, ChevronLeft, ChevronRight, Eye, EyeOff,
  Upload, Download, Pencil, Link, Image, Video, Bold,
  Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Quote, Undo, Redo, Minus
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import TiptapLink from "@tiptap/extension-link";
import TiptapUnderline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Youtube from "@tiptap/extension-youtube";
import Spreadsheet from "react-spreadsheet";

// ── Constants ──

export const PREDEFINED_CATEGORIES = [
  "HR", "IT", "Operations", "Finance", "Legal",
  "Safety", "Training", "Quality", "Customer Service",
  "Compliance", "Marketing", "Others",
];

// ── Document (TipTap) editor ──

function DocumentEditor({ content, onChange, editable, sopId }) {
  const fileRef = useRef();
  const [linkDialog, setLinkDialog] = useState(false);
  const [videoDialog, setVideoDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapUnderline,
      TiptapImage.configure({ inline: false, allowBase64: true }),
      TiptapLink.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Youtube.configure({ controls: true, width: 640, height: 360 }),
    ],
    content: content?.html || "",
    editable,
    onUpdate: ({ editor }) => onChange({ html: editor.getHTML() }),
  });

  // Sync editable state
  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  // Sync content when switching view→edit
  useEffect(() => {
    if (editor && !editable && content?.html !== undefined) {
      const current = editor.getHTML();
      if (current !== content.html) {
        editor.commands.setContent(content.html || "");
      }
    }
  }, [editor, content?.html, editable]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await sopsApi.upload(fd);
      const src = `${import.meta.env.REACT_APP_BACKEND_URL || ""}${data.url}`;
      editor.chain().focus().setImage({ src }).run();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
    setUploading(false);
    e.target.value = "";
  };

  const insertLink = () => {
    if (!linkUrl || !editor) return;
    const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;
    editor.chain().focus().setLink({ href: url }).run();
    setLinkUrl("");
    setLinkDialog(false);
  };

  const insertVideo = () => {
    if (!videoUrl || !editor) return;
    editor.chain().focus().setYoutubeVideo({ src: videoUrl }).run();
    setVideoUrl("");
    setVideoDialog(false);
  };

  const ToolBtn = ({ onClick, active, disabled, icon: Icon, label, className = "" }) => (
    <button
      type="button"
      title={label}
      onMouseDown={e => { e.preventDefault(); onClick?.(); }}
      disabled={disabled}
      className={`h-7 w-7 flex items-center justify-center rounded text-xs transition-colors
        ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}
        ${disabled ? "opacity-30 cursor-not-allowed" : ""}
        ${className}`}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : label}
    </button>
  );

  return (
    <div className="border rounded-lg overflow-hidden">
      {editable && editor && (
        <div className="flex flex-wrap items-center gap-0.5 p-2 border-b bg-muted/30">
          {/* History */}
          <ToolBtn icon={Undo} label="Undo" onClick={() => editor.chain().focus().undo().run()} />
          <ToolBtn icon={Redo} label="Redo" onClick={() => editor.chain().focus().redo().run()} />
          <Separator orientation="vertical" className="h-5 mx-1" />
          {/* Text style */}
          <ToolBtn icon={Bold} label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolBtn icon={Italic} label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <ToolBtn icon={Underline} label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <Separator orientation="vertical" className="h-5 mx-1" />
          {/* Headings */}
          {[1, 2, 3].map(l => (
            <ToolBtn key={l} label={`H${l}`} active={editor.isActive("heading", { level: l })}
              onClick={() => editor.chain().focus().toggleHeading({ level: l }).run()} />
          ))}
          <Separator orientation="vertical" className="h-5 mx-1" />
          {/* Align */}
          <ToolBtn icon={AlignLeft} label="Align Left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} />
          <ToolBtn icon={AlignCenter} label="Align Center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} />
          <ToolBtn icon={AlignRight} label="Align Right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} />
          <Separator orientation="vertical" className="h-5 mx-1" />
          {/* Lists */}
          <ToolBtn icon={List} label="Bullet List" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolBtn icon={ListOrdered} label="Ordered List" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolBtn icon={Quote} label="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <ToolBtn icon={Minus} label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
          <Separator orientation="vertical" className="h-5 mx-1" />
          {/* Media */}
          <ToolBtn icon={Link} label="Insert Link" active={editor.isActive("link")} onClick={() => setLinkDialog(true)} />
          <ToolBtn icon={Image} label="Insert Image" disabled={uploading} onClick={() => fileRef.current?.click()} />
          <ToolBtn icon={Video} label="Embed Video" onClick={() => setVideoDialog(true)} />
        </div>
      )}
      <div className={`p-4 min-h-[500px] prose prose-sm max-w-none dark:prose-invert focus:outline-none ${!editable ? "select-text cursor-default" : ""}`}>
        <EditorContent editor={editor} />
      </div>
      <input ref={fileRef} type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />

      {/* Link dialog */}
      <Dialog open={linkDialog} onOpenChange={setLinkDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Insert Link</DialogTitle></DialogHeader>
          <Input placeholder="https://example.com" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && insertLink()} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(false)}>Cancel</Button>
            <Button onClick={insertLink}>Insert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video embed dialog */}
      <Dialog open={videoDialog} onOpenChange={setVideoDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Embed Video</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Paste a YouTube URL</p>
          <Input placeholder="https://youtube.com/watch?v=..." value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && insertVideo()} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVideoDialog(false)}>Cancel</Button>
            <Button onClick={insertVideo}>Embed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Spreadsheet editor ──

function SpreadsheetEditor({ content, onChange, editable }) {
  const data = content?.data || [[{ value: "" }]];
  return (
    <div className={`border rounded-lg overflow-auto ${!editable ? "pointer-events-none opacity-80" : ""}`}>
      <Spreadsheet data={data} onChange={d => editable && onChange({ data: d })} />
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
    if (!editable) return;
    onChange({ slides: slides.map((s, i) => i === activeIdx ? { ...s, [field]: val } : s) });
  };

  const addSlide = () => {
    if (!editable) return;
    const next = { id: Date.now(), title: `Slide ${slides.length + 1}`, body: "" };
    onChange({ slides: [...slides, next] });
    setActiveIdx(slides.length);
  };

  const deleteSlide = (idx) => {
    if (!editable || slides.length <= 1) { toast.error("Cannot delete the only slide"); return; }
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
            <Button size="sm" variant="ghost" className="text-white" disabled={activeIdx === 0} onClick={() => setActiveIdx(i => i - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="text-white" disabled={activeIdx === slides.length - 1} onClick={() => setActiveIdx(i => i + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 min-h-[500px]">
      <div className="w-44 shrink-0 flex flex-col gap-1">
        <ScrollArea className="flex-1">
          {slides.map((slide, idx) => (
            <div key={slide.id}
              className={`group relative rounded-lg border p-2 cursor-pointer text-xs mb-1 transition-colors
                ${activeIdx === idx ? "bg-primary/10 border-primary" : "hover:bg-muted/50"}`}
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
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Slide {activeIdx + 1} of {slides.length}</span>
          <Button variant="outline" size="sm" onClick={() => setPreview(true)}>
            <Eye className="h-4 w-4 mr-1" /> Preview
          </Button>
        </div>
        <Input placeholder="Slide title" value={active?.title || ""} onChange={e => updateSlide("title", e.target.value)}
          disabled={!editable} className="text-lg font-semibold" />
        <Textarea placeholder="Slide content…" value={active?.body || ""} onChange={e => updateSlide("body", e.target.value)}
          disabled={!editable} className="flex-1 min-h-[400px] resize-none text-base" />
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
          <a href={`${import.meta.env.REACT_APP_BACKEND_URL || ""}${sop.file_url}`} target="_blank" rel="noreferrer">
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
  const [categoryDraft, setCategoryDraft] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [changeNote, setChangeNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [versions, setVersions] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [transferTo, setTransferTo] = useState("");
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [acked, setAcked] = useState(false);

  const isOwner = useCallback(s => s && s.owner === user?.id, [user]);
  const isPrivileged = user?.system_role === "admin" || user?.system_role === "manager";
  const canDirectEdit = useCallback(s => s && (isOwner(s) || isPrivileged), [isOwner, isPrivileged]);

  const loadSop = useCallback(async () => {
    try {
      const { data } = await sopsApi.get(id);
      setSop(data);
      setDraft(data.content || {});
      setTitleDraft(data.title);
      setCategoryDraft(data.category || "");
      setCustomCategory(data.category && !PREDEFINED_CATEGORIES.includes(data.category) ? data.category : "");
      setAcked(data.acknowledged_by?.some(a => a.user_id === user?.id) || false);
    } catch {
      toast.error("SOP not found");
      navigate("/sops");
    }
    setLoading(false);
  }, [id, user?.id, navigate]);

  useEffect(() => { loadSop(); }, [loadSop]);

  const enterEdit = () => {
    setEditSnapshot({ draft, title: titleDraft, category: categoryDraft });
    setIsEditing(true);
  };

  const cancelEdit = () => {
    if (editSnapshot) {
      setDraft(editSnapshot.draft);
      setTitleDraft(editSnapshot.title);
      setCategoryDraft(editSnapshot.category);
    }
    setIsEditing(false);
    setChangeNote("");
  };

  const handleSave = async () => {
    if (!sop) return;
    setSaving(true);
    try {
      const effectiveCategory = categoryDraft === "Others"
        ? (customCategory || "Others")
        : categoryDraft;

      const payload = {
        content: draft,
        title: titleDraft,
        category: effectiveCategory || undefined,
        change_note: changeNote || undefined,
      };
      if (sop.sop_type === "file" && draft?.file_url) {
        payload.file_url = draft.file_url;
        payload.file_name = draft.file_name;
        payload.file_size = draft.file_size;
        payload.file_type = draft.file_type;
      }
      const { data } = await sopsApi.update(id, payload);
      setSop(data);
      setChangeNote("");
      setIsEditing(false);
      const isDirect = canDirectEdit(data);
      toast.success(isDirect ? `Saved (v${data.current_version})` : "Edit proposed — awaiting owner approval");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
    setSaving(false);
  };

  const handleCategoryChange = async (val) => {
    setCategoryDraft(val);
    if (val === "Others" && !isEditing) {
      // auto-save "Others" immediately
      try {
        const { data } = await sopsApi.update(id, { category: "Others" });
        setSop(data);
        toast.success("Category saved");
      } catch (err) {
        toast.error(formatApiError(err?.response?.data?.detail));
      }
    }
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
      setSop(data); setDraft(data.content || {});
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
      setSop(data); setDraft(data.content || {}); setTitleDraft(data.title);
      setShowHistory(false);
      toast.success(`Reverted to v${data.current_version}`);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const handleArchive = async () => {
    try {
      const { data } = await sopsApi.archive(id);
      setSop(data); setShowArchiveConfirm(false);
      toast.success("SOP archived");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const handleTransfer = async () => {
    if (!transferTo) return;
    try {
      const { data } = await sopsApi.transfer(id, { new_owner_id: transferTo });
      setSop(data); setShowTransfer(false); setTransferTo("");
      toast.success("Ownership transferred");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const openHistory = async () => {
    try {
      const { data } = await sopsApi.versions(id);
      setVersions(data); setShowHistory(true);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const openTransfer = async () => {
    try {
      const { data } = await usersApi.list();
      setUsersList((data || []).filter(u => u.id !== user?.id));
    } catch { setUsersList([]); }
    setShowTransfer(true);
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!sop) return null;

  const isArchived = sop.status === "archived";
  const canEdit = !isArchived;
  const canDirect = canDirectEdit(sop);
  const showPendingBanner = sop.has_pending_edit && (isOwner(sop) || isPrivileged);
  const effectiveCategory = categoryDraft === "Others" ? (customCategory || "Others") : categoryDraft;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-2 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/sops")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> SOPs
        </Button>
        <Separator orientation="vertical" className="h-5" />

        {/* Title */}
        {isEditing ? (
          <Input value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
            className="text-base font-semibold max-w-xs h-8" />
        ) : (
          <span className="text-base font-semibold max-w-xs truncate">{titleDraft}</span>
        )}

        <Badge variant="outline">v{sop.current_version}</Badge>
        <Badge variant={isArchived ? "secondary" : "default"}>{sop.status}</Badge>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Acknowledge */}
          <Button variant={acked ? "secondary" : "outline"} size="sm" onClick={handleAcknowledge} disabled={acked}>
            {acked ? <><CheckCircle2 className="h-4 w-4 mr-1 text-green-600" />Acknowledged</> : <><Check className="h-4 w-4 mr-1" />Acknowledge</>}
          </Button>

          <Button variant="outline" size="sm" onClick={openHistory}>
            <History className="h-4 w-4 mr-1" /> History
          </Button>

          {(isOwner(sop) || isPrivileged) && (
            <Button variant="outline" size="sm" onClick={openTransfer}>
              <Users className="h-4 w-4 mr-1" /> Transfer
            </Button>
          )}

          {(isOwner(sop) || isPrivileged) && !isArchived && (
            <Button variant="outline" size="sm" onClick={() => setShowArchiveConfirm(true)}>
              <Archive className="h-4 w-4 mr-1" /> Archive
            </Button>
          )}

          {/* Edit / Save / Cancel */}
          {canEdit && !isEditing && (
            <Button size="sm" onClick={enterEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
          {canEdit && isEditing && (
            <>
              <Input placeholder="Change note" value={changeNote} onChange={e => setChangeNote(e.target.value)}
                className="w-36 h-8 text-sm" />
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                {canDirect ? "Save" : "Propose Edit"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Pending edit banner */}
      {showPendingBanner && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 px-4 py-2 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-medium">Pending edit</span>
            <span className="text-muted-foreground ml-2">
              {sop.pending_edit_at ? new Date(sop.pending_edit_at).toLocaleDateString() : ""}
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
      <div className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-4">
        {/* Meta row */}
        <div className="flex flex-wrap gap-3 items-end">
          {sop.description && <p className="text-muted-foreground text-sm flex-1">{sop.description}</p>}
          {/* Category */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">Category</Label>
            {isEditing || (!PREDEFINED_CATEGORIES.includes(categoryDraft) && categoryDraft) ? (
              <Select value={categoryDraft} onValueChange={handleCategoryChange}>
                <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {PREDEFINED_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Select value={categoryDraft} onValueChange={handleCategoryChange}>
                <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {PREDEFINED_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {categoryDraft === "Others" && isEditing && (
              <Input placeholder="Custom category" value={customCategory}
                onChange={e => setCustomCategory(e.target.value)}
                className="h-7 w-36 text-xs" />
            )}
          </div>
        </div>

        {/* Editors */}
        {sop.sop_type === "document" && (
          <DocumentEditor content={draft} onChange={setDraft} editable={isEditing} sopId={id} />
        )}
        {sop.sop_type === "spreadsheet" && (
          <SpreadsheetEditor content={draft} onChange={setDraft} editable={isEditing} />
        )}
        {sop.sop_type === "presentation" && (
          <PresentationEditor content={draft} onChange={setDraft} editable={isEditing} />
        )}
        {sop.sop_type === "file" && (
          <FileEditor sop={sop} editable={isEditing}
            onFileUploaded={fileData => setDraft(fd => ({ ...fd, ...fileData }))} />
        )}

        {/* Acknowledgements */}
        {sop.acknowledged_by?.length > 0 && (
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Acknowledged by {sop.acknowledged_by.length} user(s)
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

      {/* Version history */}
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
                        <span className="text-xs text-muted-foreground">{v.changed_at ? new Date(v.changed_at).toLocaleString() : ""}</span>
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
          <DialogFooter><Button variant="outline" onClick={() => setShowHistory(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer ownership */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Transfer Ownership</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>New Owner</Label>
            <Select value={transferTo} onValueChange={setTransferTo}>
              <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
              <SelectContent>
                {usersList.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.username} ({u.email})</SelectItem>
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
          <AlertDialogHeader><AlertDialogTitle>Archive "{sop.title}"?</AlertDialogTitle></AlertDialogHeader>
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
