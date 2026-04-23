import { useState, useEffect, useCallback } from "react";
import { filesApi, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Folder, File, FileText, FileImage, FileVideo, FileAudio,
  ChevronRight, Home, Loader2,
} from "lucide-react";

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

export default function FilePickerModal({ open, onClose, onPick, multiple = false }) {
  const [scope, setScope] = useState("private");
  const [path, setPath] = useState([]); // [{id, name}, ...]
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]); // array of files
  const [singleSelectedId, setSingleSelectedId] = useState("");

  const currentParentId = path.length ? path[path.length - 1].id : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await filesApi.list(scope, currentParentId);
      setItems(data || []);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
    setLoading(false);
  }, [scope, currentParentId]);

  // When modal opens, reset selection and navigation
  useEffect(() => {
    if (open) {
      setPath([]);
      setSelected([]);
      setSingleSelectedId("");
    }
  }, [open]);

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, currentParentId]);

  // reset path when scope changes
  useEffect(() => {
    if (open) setPath([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const openFolder = (folder) => setPath((p) => [...p, { id: folder.id, name: folder.name }]);
  const jumpTo = (index) => setPath((p) => p.slice(0, index + 1));
  const goHome = () => setPath([]);

  const isSelected = (file) => {
    if (multiple) return selected.some((s) => s.id === file.id);
    return singleSelectedId === file.id;
  };

  const toggleSelect = (file) => {
    if (file.is_folder) return;
    if (multiple) {
      setSelected((prev) =>
        prev.some((s) => s.id === file.id)
          ? prev.filter((s) => s.id !== file.id)
          : [...prev, file]
      );
    } else {
      setSingleSelectedId(file.id);
    }
  };

  const handleUse = () => {
    let picked = [];
    if (multiple) {
      picked = selected;
    } else {
      const f = items.find((i) => i.id === singleSelectedId);
      if (f) picked = [f];
    }
    if (picked.length === 0) {
      toast.error("Select at least one file");
      return;
    }
    onPick && onPick(picked);
    onClose && onClose();
  };

  const folders = items.filter((i) => i.is_folder);
  const files = items.filter((i) => !i.is_folder);

  const selectedCount = multiple ? selected.length : (singleSelectedId ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select file{multiple ? "s" : ""} from Files</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Scope tabs */}
          <Tabs value={scope} onValueChange={setScope}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="private">My Files</TabsTrigger>
              <TabsTrigger value="shared">Shared</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
            <button className="hover:text-foreground inline-flex items-center gap-1" onClick={goHome}>
              <Home className="h-3 w-3" /> {scope === "private" ? "My Files" : "Shared"}
            </button>
            {path.map((p, i) => (
              <span key={p.id} className="inline-flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button
                  className={`hover:text-foreground ${i === path.length - 1 ? "text-foreground font-medium" : ""}`}
                  onClick={() => jumpTo(i)}
                >
                  {p.name}
                </button>
              </span>
            ))}
          </div>

          {/* Item list */}
          <div className="border rounded-md min-h-[320px] max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-12">This folder is empty</p>
            ) : (
              <div className="divide-y">
                {folders.map((f) => (
                  <button
                    key={f.id}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/60 text-left"
                    onClick={() => openFolder(f)}
                    type="button"
                  >
                    <Folder className="h-4 w-4 text-primary shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </button>
                ))}
                {multiple ? (
                  files.map((f) => {
                    const Icon = iconForMime(f.mime);
                    return (
                      <label
                        key={f.id}
                        className={`flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/60 cursor-pointer ${isSelected(f) ? "bg-primary/5" : ""}`}
                      >
                        <Checkbox
                          checked={isSelected(f)}
                          onCheckedChange={() => toggleSelect(f)}
                        />
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1">{f.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                      </label>
                    );
                  })
                ) : (
                  <RadioGroup value={singleSelectedId} onValueChange={setSingleSelectedId}>
                    {files.map((f) => {
                      const Icon = iconForMime(f.mime);
                      return (
                        <label
                          key={f.id}
                          className={`flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/60 cursor-pointer ${isSelected(f) ? "bg-primary/5" : ""}`}
                        >
                          <RadioGroupItem value={f.id} />
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate flex-1">{f.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                        </label>
                      );
                    })}
                  </RadioGroup>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleUse} disabled={selectedCount === 0}>
            Use selected ({selectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
