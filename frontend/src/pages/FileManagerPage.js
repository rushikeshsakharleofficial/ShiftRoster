import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { filesApi, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Folder, FolderOpen, FolderPlus, File, FileText, FileImage, FileVideo, FileAudio,
  Upload, Download, Trash2, Edit2, MoreVertical, Grid3x3, List,
  ChevronRight, Home, Loader2, Search, Move, X, ExternalLink,
} from "lucide-react";

// Pick icon by mime type
const iconForMime = (mime) => {
  if (!mime) return File;
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime.startsWith("text/") || mime.includes("document")) return FileText;
  return File;
};

const formatBytes = (n) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// Simple move-picker: reuses the same nav pattern in-place
function MovePickerDialog({ open, onClose, item, onMoved }) {
  const [scope, setScope] = useState("private");
  const [path, setPath] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);

  const currentParentId = path.length ? path[path.length - 1].id : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await filesApi.list(scope, currentParentId);
      // Only show folders for move target (and skip the item being moved)
      const folders = (data || []).filter((i) => i.is_folder && i.id !== item?.id);
      setItems(folders);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
    setLoading(false);
  }, [scope, currentParentId, item]);

  useEffect(() => {
    if (open) {
      setPath([]);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope]);

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentParentId]);

  const openFolder = (f) => setPath((p) => [...p, { id: f.id, name: f.name }]);
  const jumpTo = (idx) => setPath((p) => p.slice(0, idx + 1));
  const goHome = () => setPath([]);

  const handleMove = async () => {
    if (!item) return;
    setMoving(true);
    try {
      await filesApi.move(item.id, { scope, parent_id: currentParentId });
      toast.success(`Moved "${item.name}"`);
      onMoved && onMoved();
      onClose();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
    setMoving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Move "{item?.name}"</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Tabs value={scope} onValueChange={setScope}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="private">My Files</TabsTrigger>
              <TabsTrigger value="shared">Shared</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
            <button className="hover:text-foreground inline-flex items-center gap-1" onClick={goHome}>
              <Home className="h-3 w-3" /> Root
            </button>
            {path.map((p, i) => (
              <span key={p.id} className="inline-flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button className="hover:text-foreground" onClick={() => jumpTo(i)}>{p.name}</button>
              </span>
            ))}
          </div>

          <div className="border rounded-md min-h-[240px] max-h-[320px] overflow-y-auto divide-y">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">No subfolders here. Move into this location.</p>
            ) : (
              items.map((f) => (
                <button
                  key={f.id}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/60 text-left"
                  onClick={() => openFolder(f)}
                >
                  <Folder className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate flex-1">{f.name}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </button>
              ))
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Destination: <span className="font-medium text-foreground">{scope === "private" ? "My Files" : "Shared"}{path.length ? " / " + path.map((p) => p.name).join(" / ") : ""}</span>
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleMove} disabled={moving}>
            {moving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Move className="h-4 w-4 mr-2" />}
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FileManagerPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scope, setScope] = useState("private");
  const [path, setPath] = useState([]); // [{id, name}, ...]
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState([]); // [{ id, name, progress, error }]
  const [viewMode, setViewMode] = useState("grid");
  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const fileInputRef = useRef(null);
  const uploadIdRef = useRef(0);

  const currentParentId = path.length ? path[path.length - 1].id : null;

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await filesApi.list(scope, currentParentId);
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
    setLoading(false);
  }, [scope, currentParentId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // When scope switches, reset the path to root
  useEffect(() => {
    setPath([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const openFolder = (folder) => {
    setPath((p) => [...p, { id: folder.id, name: folder.name }]);
  };
  const jumpTo = (index) => setPath((p) => p.slice(0, index + 1));
  const goHome = () => setPath([]);

  const startUpload = async (file) => {
    const id = ++uploadIdRef.current;
    setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await filesApi.upload(fd, scope, currentParentId, (evt) => {
        if (!evt.total) return;
        const pct = Math.round((evt.loaded * 100) / evt.total);
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: pct } : x)));
      });
      setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: 100, done: true } : x)));
      // remove after a moment
      setTimeout(() => setUploads((u) => u.filter((x) => x.id !== id)), 1500);
    } catch (err) {
      setUploads((u) => u.map((x) => (x.id === id ? { ...x, error: true } : x)));
      toast.error(`Upload failed: ${file.name}`);
    }
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    await Promise.all(files.map(startUpload));
    loadItems();
  };

  const handleFileInput = (e) => {
    handleFiles(e.target.files);
    // reset so selecting the same file again re-triggers
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Drag + Drop
  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error("Folder name required");
      return;
    }
    setCreatingFolder(true);
    try {
      await filesApi.createFolder({ name: newFolderName.trim(), scope, parent_id: currentParentId });
      toast.success("Folder created");
      setShowNewFolder(false);
      setNewFolderName("");
      loadItems();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
    setCreatingFolder(false);
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setRenameSaving(true);
    try {
      await filesApi.rename(renameTarget.id, renameValue.trim());
      toast.success("Renamed");
      setRenameTarget(null);
      setRenameValue("");
      loadItems();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
    setRenameSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await filesApi.delete(confirmDelete.id);
      toast.success("Deleted");
      setConfirmDelete(null);
      loadItems();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const handleDownload = (file) => {
    // api uses withCredentials: cookies travel with direct link
    window.open(filesApi.downloadUrl(file.id), "_blank", "noopener,noreferrer");
  };

  // SOP-linked → SOP editor. Everything with a previewer → modal. Else → download.
  const handleOpen = (file) => {
    if (file.sop_id) {
      navigate(`/sops/${file.sop_id}`);
      return;
    }
    const mime = file.mime || "";
    const name = file.name || "";
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    const isOODoc = ["docx", "xlsx", "pptx"].includes(ext);
    const previewable =
      isOODoc ||
      mime.startsWith("image/") ||
      mime.startsWith("video/") ||
      mime.startsWith("audio/") ||
      mime === "application/pdf" ||
      mime.startsWith("text/");
    if (previewable) {
      setPreviewFile(file);
    } else {
      handleDownload(file);
    }
  };

  const filtered = items.filter((it) => !search || it.name.toLowerCase().includes(search.toLowerCase()));
  const folders = filtered.filter((i) => i.is_folder);
  const files = filtered.filter((i) => !i.is_folder);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Files</h1>
          <p className="text-muted-foreground text-sm mt-1">Organize, upload, and share files across the team</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 w-52"
            />
          </div>
        </div>
      </div>

      {/* Scope tabs */}
      <div className="mb-4">
        <Tabs value={scope} onValueChange={setScope}>
          <TabsList>
            <TabsTrigger value="private">My Files</TabsTrigger>
            <TabsTrigger value="shared">Shared</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Breadcrumb + Actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
          <button className="hover:text-foreground inline-flex items-center gap-1" onClick={goHome}>
            <Home className="h-3.5 w-3.5" /> {scope === "private" ? "My Files" : "Shared"}
          </button>
          {path.map((p, i) => (
            <span key={p.id} className="inline-flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5" />
              <button
                className={`hover:text-foreground ${i === path.length - 1 ? "text-foreground font-medium" : ""}`}
                onClick={() => jumpTo(i)}
              >
                {p.name}
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
          <Button variant="outline" size="sm" onClick={() => { setNewFolderName(""); setShowNewFolder(true); }}>
            <FolderPlus className="h-4 w-4 mr-2" /> New Folder
          </Button>
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              className={`px-2 py-1.5 ${viewMode === "grid" ? "bg-accent" : "hover:bg-accent/50"}`}
              onClick={() => setViewMode("grid")}
              title="Grid view"
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              className={`px-2 py-1.5 ${viewMode === "list" ? "bg-accent" : "hover:bg-accent/50"}`}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative rounded-xl border-2 border-dashed transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-transparent"
        }`}
      >
        {dragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none bg-primary/10 rounded-xl">
            <div className="text-primary font-medium flex items-center gap-2">
              <Upload className="h-5 w-5" /> Drop files here to upload
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>This folder is empty</p>
            <p className="text-xs mt-1">Drag &amp; drop files, or use the Upload button</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 p-1">
            {folders.map((f) => (
              <FolderCard
                key={f.id}
                folder={f}
                onOpen={() => openFolder(f)}
                onRename={() => { setRenameTarget(f); setRenameValue(f.name); }}
                onMove={() => setMoveTarget(f)}
                onDelete={() => setConfirmDelete(f)}
              />
            ))}
            {files.map((f) => (
              <FileCardItem
                key={f.id}
                file={f}
                onOpen={() => handleOpen(f)}
                onDownload={f.sop_id ? null : () => handleDownload(f)}
                onRename={() => { setRenameTarget(f); setRenameValue(f.name); }}
                onMove={() => setMoveTarget(f)}
                onDelete={() => setConfirmDelete(f)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium">Size</th>
                  <th className="text-right px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {folders.map((f) => (
                  <tr
                    key={f.id}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => openFolder(f)}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-medium truncate">{f.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">Folder</td>
                    <td className="px-4 py-2 text-muted-foreground">—</td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <ItemMenu
                        file={f}
                        onRename={() => { setRenameTarget(f); setRenameValue(f.name); }}
                        onMove={() => setMoveTarget(f)}
                        onDelete={() => setConfirmDelete(f)}
                      />
                    </td>
                  </tr>
                ))}
                {files.map((f) => {
                  const Icon = iconForMime(f.mime);
                  return (
                    <tr key={f.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => handleOpen(f)}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{f.mime || "File"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{formatBytes(f.size)}</td>
                      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <ItemMenu
                          file={f}
                          onOpen={f.sop_id ? () => handleOpen(f) : null}
                          onDownload={f.sop_id ? null : () => handleDownload(f)}
                          onRename={f.sop_id ? null : () => { setRenameTarget(f); setRenameValue(f.name); }}
                          onMove={f.sop_id ? null : () => setMoveTarget(f)}
                          onDelete={f.sop_id ? null : () => setConfirmDelete(f)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload progress strip */}
      {uploads.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 w-80 bg-background border rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 text-xs font-medium">
            <span>Uploads ({uploads.length})</span>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y">
            {uploads.map((u) => (
              <div key={u.id} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium truncate flex-1">{u.name}</p>
                  <span className={`text-[10px] ${u.error ? "text-destructive" : "text-muted-foreground"}`}>
                    {u.error ? "Failed" : `${u.progress}%`}
                  </span>
                </div>
                <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                  <div
                    className={`h-full ${u.error ? "bg-destructive" : u.done ? "bg-green-500" : "bg-primary"} transition-all`}
                    style={{ width: `${u.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Folder Dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Folder name</Label>
            <Input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Reports"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolder(false)}>Cancel</Button>
            <Button onClick={handleCreateFolder} disabled={creatingFolder}>
              {creatingFolder ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FolderPlus className="h-4 w-4 mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>New name</Label>
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={renameSaving}>
              {renameSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Edit2 className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <MovePickerDialog
        open={!!moveTarget}
        onClose={() => setMoveTarget(null)}
        item={moveTarget}
        onMoved={loadItems}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDelete?.name}"?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground px-6">
            {confirmDelete?.is_folder
              ? "This folder and everything inside it will be deleted."
              : "This file will be permanently deleted."}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Inline preview (image / video / audio / pdf / text) */}
      <FilePreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={() => { if (previewFile) handleDownload(previewFile); }}
      />
    </div>
  );
}

function FilePreviewDialog({ file, onClose, onDownload }) {
  if (!file) return null;
  const mime = file.mime || "";
  const name = file.name || "";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const isOODoc = ["docx", "xlsx", "pptx"].includes(ext);
  const url = filesApi.downloadUrl(file.id);
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[95vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{file.name}</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={onDownload}>
              <Download className="h-4 w-4 mr-1" /> Download
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-muted/30 flex items-center justify-center">
          {isOODoc ? (
            <FileOOEmbed itemId={file.id} />
          ) : mime.startsWith("image/") ? (
            <img src={url} alt={file.name} className="max-w-full max-h-[80vh] object-contain" />
          ) : mime.startsWith("video/") ? (
            <video src={url} controls className="max-w-full max-h-[80vh]" />
          ) : mime.startsWith("audio/") ? (
            <audio src={url} controls className="w-full max-w-lg" />
          ) : mime === "application/pdf" ? (
            <iframe src={url} title={file.name} className="w-full h-[80vh] border-0 bg-white" />
          ) : mime.startsWith("text/") ? (
            <iframe src={url} title={file.name} className="w-full h-[80vh] border-0 bg-white" />
          ) : (
            <div className="text-center p-8">
              <p className="text-sm text-muted-foreground mb-3">Preview not available for this file type.</p>
              <Button onClick={onDownload}><Download className="h-4 w-4 mr-1" /> Download</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Embed OnlyOffice for a file-manager item (uploaded docx/xlsx/pptx).
function FileOOEmbed({ itemId }) {
  const editorRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const saveTimerRef = useRef(null);
  const docKeyRef = useRef(null);

  useEffect(() => {
    let alive = true;
    let loadingTimeout = null;

    const triggerForceSave = async () => {
      if (!alive || !docKeyRef.current) return;
      try { await filesApi.forceSave(itemId, docKeyRef.current); } catch (e) { console.warn(e); }
    };

    const initEditor = (config) => {
      if (!alive) return;
      try { editorRef.current?.destroyEditor?.(); } catch {}
      editorRef.current = null;
      docKeyRef.current = config?.document?.key || null;
      loadingTimeout = setTimeout(() => { if (alive) setLoading(false); }, 3000);
      editorRef.current = new window.DocsAPI.DocEditor("fm-oo-editor", {
        ...config,
        events: {
          onDocumentReady: () => { if (alive) setLoading(false); },
          onError: (e) => console.warn("OO error:", e?.data),
          onDocumentStateChange: (e) => {
            if (e?.data === true) {
              if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
              saveTimerRef.current = setTimeout(triggerForceSave, 2000);
            }
          },
        },
      });
    };

    filesApi.getEditorConfig(itemId).then(({ data: config }) => {
      if (!alive) return;
      if (window.DocsAPI) { initEditor(config); return; }
      const existing = document.getElementById("oo-api-js");
      if (existing) { existing.addEventListener("load", () => initEditor(config)); return; }
      const s = document.createElement("script");
      s.id = "oo-api-js";
      s.src = "/onlyoffice/web-apps/apps/api/documents/api.js";
      s.onload = () => initEditor(config);
      s.onerror = () => { if (alive) { setLoading(false); setError(true); } };
      document.head.appendChild(s);
    }).catch((e) => {
      console.error("files editor-config failed", e);
      if (alive) { setLoading(false); setError(true); }
    });

    return () => {
      alive = false;
      if (loadingTimeout) clearTimeout(loadingTimeout);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (docKeyRef.current) filesApi.forceSave(itemId, docKeyRef.current).catch(() => {});
      try { editorRef.current?.destroyEditor?.(); } catch {}
      editorRef.current = null;
    };
  }, [itemId]);

  return (
    <div className="relative w-full h-[85vh] bg-background">
      <div id="fm-oo-editor" style={{ width: "100%", height: "100%" }} />
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 pointer-events-none">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Loading editor…</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Editor unavailable. Try refreshing.</p>
        </div>
      )}
    </div>
  );
}

function ItemMenu({ file, onOpen, onDownload, onRename, onMove, onDelete }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {onOpen && (
          <DropdownMenuItem onClick={onOpen}>
            <ExternalLink className="h-4 w-4 mr-2" /> Open in editor
          </DropdownMenuItem>
        )}
        {onDownload && (
          <DropdownMenuItem onClick={onDownload}>
            <Download className="h-4 w-4 mr-2" /> Download
          </DropdownMenuItem>
        )}
        {onRename && (
          <DropdownMenuItem onClick={onRename}>
            <Edit2 className="h-4 w-4 mr-2" /> Rename
          </DropdownMenuItem>
        )}
        {onMove && (
          <DropdownMenuItem onClick={onMove}>
            <Move className="h-4 w-4 mr-2" /> Move
          </DropdownMenuItem>
        )}
        {onDelete && <DropdownMenuSeparator />}
        {onDelete && (
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolderCard({ folder, onOpen, onRename, onMove, onDelete }) {
  return (
    <Card
      className="group relative p-3 cursor-pointer hover:shadow-md transition-all hover:border-primary/40"
      onDoubleClick={onOpen}
    >
      <div className="flex flex-col items-center gap-2" onClick={onOpen}>
        <Folder className="h-12 w-12 text-primary" />
        <p className="text-xs font-medium truncate w-full text-center">{folder.name}</p>
      </div>
      <div
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <ItemMenu
          file={folder}
          onRename={onRename}
          onMove={onMove}
          onDelete={onDelete}
        />
      </div>
    </Card>
  );
}

function FileCardItem({ file, onOpen, onDownload, onRename, onMove, onDelete }) {
  const Icon = iconForMime(file.mime);
  const isSop = !!file.sop_id;
  // SOP files: single click opens editor. Regular files: double click downloads.
  const cardProps = isSop
    ? { onClick: onOpen }
    : { onDoubleClick: onDownload };
  return (
    <Card
      className="group relative p-3 cursor-pointer hover:shadow-md transition-all hover:border-primary/40"
      {...cardProps}
    >
      <div className="flex flex-col items-center gap-2">
        <Icon className="h-12 w-12 text-muted-foreground" />
        <p className="text-xs font-medium truncate w-full text-center" title={file.name}>{file.name}</p>
        <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
        {isSop && <p className="text-[9px] uppercase tracking-wide text-primary/70">SOP</p>}
      </div>
      <div
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <ItemMenu
          file={file}
          onOpen={isSop ? onOpen : null}
          onDownload={onDownload}
          onRename={isSop ? null : onRename}
          onMove={isSop ? null : onMove}
          onDelete={isSop ? null : onDelete}
        />
      </div>
    </Card>
  );
}
