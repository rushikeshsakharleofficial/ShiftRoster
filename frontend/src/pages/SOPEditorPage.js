import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { sopsApi, usersApi } from "@/lib/api";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  AlignJustify, List, ListOrdered, Quote, Undo, Redo, Minus,
  Strikethrough, Code, Palette, Highlighter, Table as TableIcon,
  Maximize, Play, Copy, Snowflake, LayoutGrid, Columns, Rows,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import TiptapLink from "@tiptap/extension-link";
import TiptapUnderline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Youtube from "@tiptap/extension-youtube";
import { TextStyle, FontSize, Color as TextColor, FontFamily } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";

// ── Constants ──

export const PREDEFINED_CATEGORIES = [
  "HR", "IT", "Operations", "Finance", "Legal",
  "Safety", "Training", "Quality", "Customer Service",
  "Compliance", "Marketing", "Others",
];

// ── Spreadsheet helpers ──

const COL_LETTER = (n) => {
  let s = "", i = n + 1;
  while (i > 0) { i--; s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26); }
  return s;
};

const colIndex = (str) => str.toUpperCase().split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;

const evalFormula = (formula, getCell) => {
  if (!formula || !formula.startsWith("=")) return formula;
  try {
    const expr = formula.slice(1).toUpperCase().trim();
    const rangeMatch = expr.match(/^(SUM|AVERAGE|AVG|COUNT|MAX|MIN)\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/);
    if (rangeMatch) {
      const [, fn, c1s, r1s, c2s, r2s] = rangeMatch;
      const col1 = colIndex(c1s), col2 = colIndex(c2s);
      const row1 = parseInt(r1s) - 1, row2 = parseInt(r2s) - 1;
      const vals = [];
      for (let r = row1; r <= row2; r++)
        for (let c = col1; c <= col2; c++) {
          const v = parseFloat(getCell(r, c)?.v ?? "");
          if (!isNaN(v)) vals.push(v);
        }
      if (!vals.length) return 0;
      if (fn === "SUM") return vals.reduce((a, b) => a + b, 0);
      if (fn === "AVERAGE" || fn === "AVG") return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(10).replace(/\.?0+$/, "");
      if (fn === "COUNT") return vals.length;
      if (fn === "MAX") return Math.max(...vals);
      if (fn === "MIN") return Math.min(...vals);
    }
    const cellRef = expr.match(/^([A-Z]+)(\d+)$/);
    if (cellRef) return getCell(parseInt(cellRef[2]) - 1, colIndex(cellRef[1]))?.v ?? "";
    return formula;
  } catch { return formula; }
};

// ── Shared small components ──

const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Calibri", value: "Calibri, sans-serif" },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: '"Courier New", Courier, monospace' },
];
const FONT_SIZES = [10, 12, 14, 16, 18, 24, 32];
const ZOOM_LEVELS = [75, 100, 125, 150];
const SWATCHES = [
  "#000000", "#374151", "#6b7280", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#0ea5e9", "#6366f1", "#a855f7",
];
const HIGHLIGHTS = [
  "#fef08a", "#fed7aa", "#fecaca", "#bbf7d0", "#bfdbfe",
  "#ddd6fe", "#fbcfe8", "#e5e7eb", "#a7f3d0", "#fde68a",
];

// Small palette popover used for text color + highlight.
function ColorSwatchPopover({ title, icon: Icon, colors, current, onPick, onClear, trigger }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <button type="button" title={title} onMouseDown={(e) => e.preventDefault()}
            className="h-7 min-w-[28px] px-1 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground relative">
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span className="absolute bottom-0.5 left-1 right-1 h-[2px] rounded" style={{ background: current || "transparent" }} />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="p-2 w-auto" side="bottom" align="start">
        <div className="grid grid-cols-5 gap-1 mb-2">
          {colors.map((c) => (
            <button key={c} type="button" title={c}
              className={`w-6 h-6 rounded border transition-transform hover:scale-110 ${current === c ? "ring-2 ring-primary" : "border-border"}`}
              style={{ background: c }}
              onMouseDown={(e) => { e.preventDefault(); onPick(c); setOpen(false); }} />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <input type="color" className="h-6 w-8 cursor-pointer border-none p-0 rounded"
            value={current || "#000000"}
            onChange={(e) => onPick(e.target.value)} />
          {onClear && (
            <button type="button" className="flex-1 text-xs px-2 py-1 rounded hover:bg-muted text-muted-foreground"
              onMouseDown={(e) => { e.preventDefault(); onClear(); setOpen(false); }}>
              Clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Document (TipTap) editor ──

function DocumentEditor({ content, onChange, editable, sopId }) {
  const fileRef = useRef();
  const [linkDialog, setLinkDialog] = useState(false);
  const [videoDialog, setVideoDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [ribbonTab, setRibbonTab] = useState("home");
  const [zoom, setZoom] = useState(100);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapUnderline,
      TextStyle,
      FontFamily.configure({ types: ["textStyle"] }),
      FontSize.configure({ types: ["textStyle"] }),
      TextColor.configure({ types: ["textStyle"] }),
      Highlight.configure({ multicolor: true }),
      TiptapImage.configure({ inline: false, allowBase64: true }),
      TiptapLink.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Youtube.configure({ controls: true, width: 640, height: 360 }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content?.html || "",
    editable,
    onUpdate: ({ editor }) => onChange({ html: editor.getHTML() }),
  });

  useEffect(() => { if (editor) editor.setEditable(editable); }, [editor, editable]);

  useEffect(() => {
    if (editor && !editable && content?.html !== undefined) {
      const current = editor.getHTML();
      if (current !== content.html) editor.commands.setContent(content.html || "");
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
      editor.chain().focus().setImage({ src: `${import.meta.env.REACT_APP_BACKEND_URL || ""}${data.url}` }).run();
    } catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
    setUploading(false);
    e.target.value = "";
  };

  const insertLink = () => {
    if (!linkUrl || !editor) return;
    editor.chain().focus().setLink({ href: linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}` }).run();
    setLinkUrl(""); setLinkDialog(false);
  };

  const insertVideo = () => {
    if (!videoUrl || !editor) return;
    editor.chain().focus().setYoutubeVideo({ src: videoUrl }).run();
    setVideoUrl(""); setVideoDialog(false);
  };

  const ToolBtn = ({ onClick, active, disabled, icon: Icon, label, className = "", children }) => (
    <button type="button" title={label} onMouseDown={e => { e.preventDefault(); onClick?.(); }} disabled={disabled}
      className={`h-7 min-w-[28px] px-1 flex items-center justify-center rounded text-xs transition-colors
        ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}
        ${disabled ? "opacity-30 cursor-not-allowed" : ""} ${className}`}>
      {Icon ? <Icon className="h-3.5 w-3.5" /> : (children || label)}
    </button>
  );

  const RibbonTab = ({ id, label }) => (
    <button type="button" onMouseDown={(e) => { e.preventDefault(); setRibbonTab(id); }}
      className={`px-3 py-1 text-xs font-medium transition-colors border-b-2
        ${ribbonTab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
      {label}
    </button>
  );

  const currentFontFamily = editor?.getAttributes("textStyle").fontFamily || "";
  const currentFontSize = (editor?.getAttributes("textStyle").fontSize || "").replace("px", "");

  const inTable = editor?.isActive("table");

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {editable && editor && (
        <>
          {/* Ribbon tab strip */}
          <div className="flex items-center gap-1 px-2 pt-1 border-b bg-muted/40">
            <RibbonTab id="home" label="Home" />
            <RibbonTab id="insert" label="Insert" />
            <RibbonTab id="view" label="View" />
            <div className="ml-auto flex items-center gap-1 pb-1">
              <ToolBtn icon={Undo} label="Undo" onClick={() => editor.chain().focus().undo().run()} />
              <ToolBtn icon={Redo} label="Redo" onClick={() => editor.chain().focus().redo().run()} />
            </div>
          </div>

          {/* Ribbon content */}
          <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/20 min-h-[44px]">
            {ribbonTab === "home" && (
              <>
                <select
                  className="h-7 text-xs border rounded px-1 bg-background cursor-pointer min-w-[110px]"
                  value={currentFontFamily}
                  onChange={(e) => {
                    if (e.target.value) editor.chain().focus().setFontFamily(e.target.value).run();
                    else editor.chain().focus().unsetFontFamily().run();
                  }}>
                  {FONT_FAMILIES.map((f) => (
                    <option key={f.label} value={f.value} style={{ fontFamily: f.value || "inherit" }}>{f.label}</option>
                  ))}
                </select>
                <select
                  className="h-7 text-xs border rounded px-1 bg-background cursor-pointer w-[60px]"
                  value={currentFontSize || "14"}
                  onChange={(e) => editor.chain().focus().setFontSize(`${e.target.value}px`).run()}>
                  {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <Separator orientation="vertical" className="h-5 mx-1" />
                <ToolBtn icon={Bold} label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
                <ToolBtn icon={Italic} label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
                <ToolBtn icon={Underline} label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
                <ToolBtn icon={Strikethrough} label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
                <ToolBtn icon={Code} label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} />
                <Separator orientation="vertical" className="h-5 mx-1" />
                <ColorSwatchPopover
                  title="Text color" icon={Palette} colors={SWATCHES}
                  current={editor.getAttributes("textStyle").color || ""}
                  onPick={(c) => editor.chain().focus().setColor(c).run()}
                  onClear={() => editor.chain().focus().unsetColor().run()} />
                <ColorSwatchPopover
                  title="Highlight" icon={Highlighter} colors={HIGHLIGHTS}
                  current={editor.getAttributes("highlight").color || ""}
                  onPick={(c) => editor.chain().focus().setHighlight({ color: c }).run()}
                  onClear={() => editor.chain().focus().unsetHighlight().run()} />
                <Separator orientation="vertical" className="h-5 mx-1" />
                <select
                  className="h-7 text-xs border rounded px-1 bg-background cursor-pointer"
                  value={[1,2,3].find(l => editor.isActive("heading",{level:l})) || "p"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "p") editor.chain().focus().setParagraph().run();
                    else editor.chain().focus().toggleHeading({ level: parseInt(v) }).run();
                  }}>
                  <option value="p">Normal</option>
                  <option value="1">Heading 1</option>
                  <option value="2">Heading 2</option>
                  <option value="3">Heading 3</option>
                </select>
                <Separator orientation="vertical" className="h-5 mx-1" />
                <ToolBtn icon={AlignLeft} label="Align Left" active={editor.isActive({textAlign:"left"})} onClick={() => editor.chain().focus().setTextAlign("left").run()} />
                <ToolBtn icon={AlignCenter} label="Align Center" active={editor.isActive({textAlign:"center"})} onClick={() => editor.chain().focus().setTextAlign("center").run()} />
                <ToolBtn icon={AlignRight} label="Align Right" active={editor.isActive({textAlign:"right"})} onClick={() => editor.chain().focus().setTextAlign("right").run()} />
                <ToolBtn icon={AlignJustify} label="Justify" active={editor.isActive({textAlign:"justify"})} onClick={() => editor.chain().focus().setTextAlign("justify").run()} />
                <Separator orientation="vertical" className="h-5 mx-1" />
                <ToolBtn icon={List} label="Bullet List" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
                <ToolBtn icon={ListOrdered} label="Ordered List" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
                <ToolBtn icon={Quote} label="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
              </>
            )}

            {ribbonTab === "insert" && (
              <>
                <ToolBtn icon={Image} label="Insert Image" disabled={uploading} onClick={() => fileRef.current?.click()} />
                <ToolBtn icon={Link} label="Insert Link" active={editor.isActive("link")} onClick={() => setLinkDialog(true)} />
                <ToolBtn icon={Video} label="Embed Video" onClick={() => setVideoDialog(true)} />
                <ToolBtn icon={Minus} label="Horizontal Rule" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
                <Separator orientation="vertical" className="h-5 mx-1" />
                <ToolBtn icon={TableIcon} label="Insert Table"
                  onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
                {inTable && (
                  <>
                    <ToolBtn label="+Row above" onClick={() => editor.chain().focus().addRowBefore().run()}>+Row</ToolBtn>
                    <ToolBtn label="+Row below" onClick={() => editor.chain().focus().addRowAfter().run()}>Row+</ToolBtn>
                    <ToolBtn label="-Row" onClick={() => editor.chain().focus().deleteRow().run()}>−Row</ToolBtn>
                    <ToolBtn label="+Col left" onClick={() => editor.chain().focus().addColumnBefore().run()}>+Col</ToolBtn>
                    <ToolBtn label="+Col right" onClick={() => editor.chain().focus().addColumnAfter().run()}>Col+</ToolBtn>
                    <ToolBtn label="-Col" onClick={() => editor.chain().focus().deleteColumn().run()}>−Col</ToolBtn>
                    <ToolBtn label="Toggle header" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Header</ToolBtn>
                    <ToolBtn label="Delete table" icon={Trash2} onClick={() => editor.chain().focus().deleteTable().run()} />
                  </>
                )}
              </>
            )}

            {ribbonTab === "view" && (
              <>
                <span className="text-xs text-muted-foreground mr-1">Zoom</span>
                <select className="h-7 text-xs border rounded px-1 bg-background cursor-pointer"
                  value={zoom} onChange={(e) => setZoom(parseInt(e.target.value))}>
                  {ZOOM_LEVELS.map((z) => <option key={z} value={z}>{z}%</option>)}
                </select>
                <button type="button" onClick={() => setZoom(100)}
                  className="h-7 px-2 text-xs rounded hover:bg-muted text-muted-foreground">Reset</button>
              </>
            )}
          </div>
        </>
      )}

      <div className="overflow-auto bg-muted/20" style={{ maxHeight: "70vh" }}>
        <div
          className={`mx-auto bg-background shadow-sm my-4 p-8 prose prose-sm max-w-[820px] dark:prose-invert focus:outline-none sop-doc-editor ${!editable ? "select-text cursor-default" : ""}`}
          style={{ transform: `scale(${zoom/100})`, transformOrigin: "top center", minHeight: 600 }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Table + placeholder CSS */}
      <style>{`
        .sop-doc-editor table { border-collapse: collapse; table-layout: fixed; width: 100%; margin: 0.5em 0; overflow: hidden; }
        .sop-doc-editor table td, .sop-doc-editor table th { border: 1px solid hsl(var(--border)); padding: 6px 8px; vertical-align: top; min-width: 60px; position: relative; }
        .sop-doc-editor table th { background: hsl(var(--muted)); font-weight: 600; }
        .sop-doc-editor table .selectedCell:after { content: ""; position: absolute; inset: 0; background: rgba(99,102,241,0.15); pointer-events: none; }
        .sop-doc-editor table .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: -2px; width: 4px; background: hsl(var(--primary) / 0.5); cursor: col-resize; }
        .sop-doc-editor .tableWrapper { overflow-x: auto; }
      `}</style>

      <input ref={fileRef} type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
      <Dialog open={linkDialog} onOpenChange={setLinkDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Insert Link</DialogTitle></DialogHeader>
          <Input placeholder="https://example.com" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && insertLink()} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(false)}>Cancel</Button>
            <Button onClick={insertLink}>Insert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={videoDialog} onOpenChange={setVideoDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Embed Video</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Paste a YouTube URL</p>
          <Input placeholder="https://youtube.com/watch?v=..." value={videoUrl} onChange={e => setVideoUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && insertVideo()} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVideoDialog(false)}>Cancel</Button>
            <Button onClick={insertVideo}>Embed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Custom Spreadsheet ──

function SpreadsheetEditor({ content, onChange, editable }) {
  const initCells = () => {
    if (content?.cells) return content.cells;
    // migrate old react-spreadsheet format
    if (content?.data && Array.isArray(content.data)) {
      const c = {};
      content.data.forEach((row, r) => row?.forEach((cell, col) => {
        if (cell?.value != null && cell.value !== "") c[`${r},${col}`] = { v: String(cell.value) };
      }));
      return c;
    }
    return {};
  };

  const [cells, setCells] = useState(initCells);
  const [numRows, setNumRows] = useState(() => Math.max(content?.numRows || 100, 100));
  const [numCols, setNumCols] = useState(() => Math.max(content?.numCols || 26, 26));
  const [sel, setSel] = useState({ r: 0, c: 0 });
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState("");
  const [colWidths, setColWidths] = useState(() => content?.colWidths || {});
  const [clipboard, setClipboard] = useState(null);
  const [freeze, setFreeze] = useState(() => !!content?.freeze);
  const inputRef = useRef();
  const gridRef = useRef();
  const lastContent = useRef(content);

  const ck = (r, c) => `${r},${c}`;
  const getCell = useCallback((r, c) => cells[ck(r, c)] || {}, [cells]);
  const getDisplay = useCallback((r, c) => {
    const cell = getCell(r, c);
    if (cell.v == null || cell.v === "") return "";
    const v = String(cell.v);
    return v.startsWith("=") ? String(evalFormula(v, getCell)) : v;
  }, [getCell]);
  const colW = (c) => colWidths[c] || 80;

  useEffect(() => {
    if (content && content !== lastContent.current && content.cells !== undefined) {
      lastContent.current = content;
      setCells(content.cells || {});
      if (content.numRows) setNumRows(Math.max(content.numRows, 100));
      if (content.numCols) setNumCols(Math.max(content.numCols, 26));
      if (content.colWidths) setColWidths(content.colWidths || {});
      if (content.freeze !== undefined) setFreeze(!!content.freeze);
    }
  }, [content]);

  const emit = useCallback((nc, nr, ncol, nw, nf) => {
    if (!editable) return;
    onChange({ cells: nc ?? cells, numRows: nr ?? numRows, numCols: ncol ?? numCols, colWidths: nw ?? colWidths, freeze: nf !== undefined ? nf : freeze });
  }, [editable, cells, numRows, numCols, colWidths, freeze, onChange]);

  const setCell = useCallback((r, c, updates) => {
    if (!editable) return;
    const k = ck(r, c);
    const newCells = { ...cells, [k]: { ...getCell(r, c), ...updates } };
    setCells(newCells); emit(newCells);
  }, [editable, cells, getCell, emit]);

  const clearCell = useCallback((r, c) => {
    if (!editable) return;
    const newCells = { ...cells };
    delete newCells[ck(r, c)];
    setCells(newCells); emit(newCells);
  }, [editable, cells, emit]);

  const gotoCell = useCallback((r, c) => {
    const nr = Math.max(0, r), nc = Math.max(0, c);
    let newRows = numRows, newCols = numCols;
    if (nr >= numRows - 5) { newRows = nr + 50; setNumRows(newRows); }
    if (nc >= numCols - 3) { newCols = nc + 10; setNumCols(newCols); }
    setSel({ r: nr, c: nc });
    if (newRows !== numRows || newCols !== numCols) emit(undefined, newRows, newCols);
  }, [numRows, numCols, emit]);

  const startEdit = (r, c, initial) => {
    if (!editable) return;
    setEditVal(initial !== undefined ? initial : (getCell(r, c).v || ""));
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = useCallback((r, c, val, moveTo) => {
    if (val !== "" && val != null) setCell(r, c, { v: val });
    else clearCell(r, c);
    setEditing(false);
    setEditVal("");
    if (moveTo) gotoCell(moveTo.r, moveTo.c);
    setTimeout(() => gridRef.current?.focus(), 0);
  }, [setCell, clearCell, gotoCell]);

  const selCell = getCell(sel.r, sel.c);
  const s = selCell.s || {};
  const applyFmt = (fk, val) => setCell(sel.r, sel.c, { s: { ...s, [fk]: val } });
  const toggleFmt = (fk) => applyFmt(fk, !s[fk]);

  // Row / col operations. Shift cell keys in the sparse map.
  const shiftCells = useCallback((predicate, shifter) => {
    const next = {};
    Object.entries(cells).forEach(([k, v]) => {
      const [r, c] = k.split(",").map(Number);
      if (predicate(r, c) === "drop") return;
      const [nr, nc] = shifter(r, c);
      next[`${nr},${nc}`] = v;
    });
    return next;
  }, [cells]);

  const insertRow = useCallback((atRow, where = "above") => {
    if (!editable) return;
    const target = where === "above" ? atRow : atRow + 1;
    const next = shiftCells(() => null, (r, c) => [r >= target ? r + 1 : r, c]);
    const nr = numRows + 1;
    setCells(next); setNumRows(nr); emit(next, nr);
  }, [editable, numRows, shiftCells, emit]);

  const insertCol = useCallback((atCol, where = "left") => {
    if (!editable) return;
    const target = where === "left" ? atCol : atCol + 1;
    const next = shiftCells(() => null, (r, c) => [r, c >= target ? c + 1 : c]);
    const nc = numCols + 1;
    setCells(next); setNumCols(nc); emit(next, undefined, nc);
  }, [editable, numCols, shiftCells, emit]);

  const deleteRow = useCallback((atRow) => {
    if (!editable || numRows <= 1) return;
    const next = shiftCells((r) => r === atRow ? "drop" : null, (r, c) => [r > atRow ? r - 1 : r, c]);
    const nr = Math.max(1, numRows - 1);
    setCells(next); setNumRows(nr); emit(next, nr);
    setSel((s) => ({ r: Math.min(s.r, nr - 1), c: s.c }));
  }, [editable, numRows, shiftCells, emit]);

  const deleteCol = useCallback((atCol) => {
    if (!editable || numCols <= 1) return;
    const next = shiftCells((r, c) => c === atCol ? "drop" : null, (r, c) => [r, c > atCol ? c - 1 : c]);
    const nc = Math.max(1, numCols - 1);
    setCells(next); setNumCols(nc); emit(next, undefined, nc);
    setSel((s) => ({ r: s.r, c: Math.min(s.c, nc - 1) }));
  }, [editable, numCols, shiftCells, emit]);

  const toggleFreeze = useCallback(() => {
    const nf = !freeze;
    setFreeze(nf); emit(undefined, undefined, undefined, undefined, nf);
  }, [freeze, emit]);

  const handleGridKey = (e) => {
    if (editing) return;
    const { r, c } = sel;
    if (e.key === "F2" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); startEdit(r, c); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && !e.ctrlKey) { e.preventDefault(); clearCell(r, c); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); gotoCell(r - 1, c); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); gotoCell(r + 1, c); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); gotoCell(r, c - 1); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); gotoCell(r, c + 1); return; }
    if (e.key === "Tab") { e.preventDefault(); gotoCell(r, e.shiftKey ? c - 1 : c + 1); return; }
    if (e.ctrlKey && e.key === "c") { setClipboard({ ...selCell }); toast.success("Copied"); return; }
    if (e.ctrlKey && e.key === "v" && clipboard) { setCell(r, c, { ...clipboard }); return; }
    if (e.ctrlKey && e.key === "b") { toggleFmt("bold"); return; }
    if (e.ctrlKey && e.key === "i") { e.preventDefault(); toggleFmt("italic"); return; }
    if (e.ctrlKey && e.key === "u") { e.preventDefault(); toggleFmt("underline"); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) startEdit(r, c, e.key);
  };

  const handleInputKey = (e) => {
    const { r, c } = sel;
    if (e.key === "Enter") { e.preventDefault(); commitEdit(r, c, editVal, { r: r + 1, c }); }
    else if (e.key === "Tab") { e.preventDefault(); commitEdit(r, c, editVal, { r, c: e.shiftKey ? c - 1 : c + 1 }); }
    else if (e.key === "Escape") { setEditing(false); setEditVal(""); setTimeout(() => gridRef.current?.focus(), 0); }
  };

  const startResize = (e, col) => {
    e.preventDefault();
    const startX = e.clientX, startW = colW(col);
    const onMove = (me) => setColWidths(prev => ({ ...prev, [col]: Math.max(30, startW + me.clientX - startX) }));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setColWidths(prev => { emit(undefined, undefined, undefined, prev); return prev; });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const TB = ({ active: act, onClick, children, title }) => (
    <button type="button" title={title} onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={`h-6 min-w-[24px] px-1 flex items-center justify-center rounded text-xs transition-colors
        ${act ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}>
      {children}
    </button>
  );

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden" style={{ minHeight: 520 }}>
      {/* Toolbar */}
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b bg-muted/30 text-xs">
          <TB act={s.bold} onClick={() => toggleFmt("bold")} title="Bold (Ctrl+B)"><Bold className="h-3 w-3" /></TB>
          <TB act={s.italic} onClick={() => toggleFmt("italic")} title="Italic (Ctrl+I)"><Italic className="h-3 w-3" /></TB>
          <TB act={s.underline} onClick={() => toggleFmt("underline")} title="Underline (Ctrl+U)"><Underline className="h-3 w-3" /></TB>
          <div className="h-4 w-px bg-border mx-1" />
          <TB act={!s.align || s.align === "left"} onClick={() => applyFmt("align","left")} title="Left"><AlignLeft className="h-3 w-3" /></TB>
          <TB act={s.align === "center"} onClick={() => applyFmt("align","center")} title="Center"><AlignCenter className="h-3 w-3" /></TB>
          <TB act={s.align === "right"} onClick={() => applyFmt("align","right")} title="Right"><AlignRight className="h-3 w-3" /></TB>
          <div className="h-4 w-px bg-border mx-1" />
          <select className="h-6 text-xs border rounded px-1 bg-background cursor-pointer"
            value={s.fontSize || 13} onChange={e => applyFmt("fontSize", parseInt(e.target.value))}>
            {[9,10,11,12,13,14,16,18,20,24,28,32,36,48,72].map(sz => <option key={sz} value={sz}>{sz}</option>)}
          </select>
          <div className="h-4 w-px bg-border mx-1" />
          <label title="Text color" className="flex items-center gap-0.5 cursor-pointer">
            <span className="font-bold text-xs" style={{ borderBottom: `3px solid ${s.color || "#000"}` }}>A</span>
            <input type="color" className="h-4 w-5 cursor-pointer border-none p-0" value={s.color || "#000000"} onChange={e => applyFmt("color", e.target.value)} />
          </label>
          <label title="Fill color" className="flex items-center gap-0.5 cursor-pointer ml-0.5">
            <div className="w-4 h-4 rounded border border-border" style={{ background: s.bg || "#ffffff" }} />
            <input type="color" className="h-4 w-5 cursor-pointer border-none p-0" value={s.bg || "#ffffff"} onChange={e => applyFmt("bg", e.target.value)} />
          </label>
          <div className="h-4 w-px bg-border mx-1" />
          <TB act={false} onClick={() => insertRow(sel.r, "above")} title="Insert row above"><Rows className="h-3 w-3 rotate-180" /></TB>
          <TB act={false} onClick={() => insertRow(sel.r, "below")} title="Insert row below"><Rows className="h-3 w-3" /></TB>
          <TB act={false} onClick={() => deleteRow(sel.r)} title="Delete current row">−Row</TB>
          <div className="h-4 w-px bg-border mx-1" />
          <TB act={false} onClick={() => insertCol(sel.c, "left")} title="Insert column left"><Columns className="h-3 w-3 rotate-180" /></TB>
          <TB act={false} onClick={() => insertCol(sel.c, "right")} title="Insert column right"><Columns className="h-3 w-3" /></TB>
          <TB act={false} onClick={() => deleteCol(sel.c)} title="Delete current column">−Col</TB>
          <div className="h-4 w-px bg-border mx-1" />
          <TB act={false} onClick={() => { const r = numRows + 100; setNumRows(r); emit(undefined, r); }} title="Add 100 rows">+100 rows</TB>
          <TB act={false} onClick={() => { const c = numCols + 26; setNumCols(c); emit(undefined, undefined, c); }} title="Add 26 cols">+26 cols</TB>
          <div className="h-4 w-px bg-border mx-1" />
          <TB act={freeze} onClick={toggleFreeze} title="Freeze top row + left column"><Snowflake className="h-3 w-3" /></TB>
        </div>
      )}
      {/* Formula bar */}
      <div className="flex items-center gap-2 px-2 py-1 border-b bg-background text-xs">
        <span className="font-mono font-semibold text-muted-foreground shrink-0 w-12 text-center bg-muted/30 rounded px-1 py-0.5">
          {COL_LETTER(sel.c)}{sel.r + 1}
        </span>
        <span className="text-muted-foreground font-italic shrink-0">fx</span>
        <input
          className="flex-1 font-mono outline-none bg-transparent text-xs"
          placeholder="Value or formula: =SUM(A1:B3)  =AVG  =COUNT  =MAX  =MIN"
          value={editing ? editVal : (selCell.v || "")}
          onFocus={() => { if (!editing && editable) startEdit(sel.r, sel.c, selCell.v || ""); }}
          onChange={e => editing ? setEditVal(e.target.value) : null}
          onKeyDown={handleInputKey}
        />
      </div>
      {/* Grid */}
      <div ref={gridRef} tabIndex={0} className="overflow-auto flex-1 outline-none bg-background" style={{ maxHeight: 560 }} onKeyDown={handleGridKey}>
        <table className="border-collapse text-xs select-none" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-muted border border-border" style={{ width: 44, minWidth: 44 }} />
              {Array.from({ length: numCols }, (_, c) => (
                <th key={c} className="sticky top-0 z-20 bg-muted border border-border text-center text-muted-foreground font-normal relative"
                  style={{ width: colW(c), minWidth: colW(c) }}>
                  {COL_LETTER(c)}
                  {editable && (
                    <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/40 z-10"
                      onMouseDown={e => startResize(e, c)} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: numRows }, (_, r) => {
              const freezeRow = freeze && r === 0;
              return (
              <tr key={r}>
                <td className="sticky left-0 z-10 bg-muted border border-border text-center text-muted-foreground"
                  style={{ width: 44, minWidth: 44, userSelect: "none", top: freezeRow ? 24 : undefined, zIndex: freezeRow ? 25 : 10, position: "sticky" }}>{r + 1}</td>
                {Array.from({ length: numCols }, (_, c) => {
                  const cell = getCell(r, c);
                  const cs = cell.s || {};
                  const isSel = sel.r === r && sel.c === c;
                  const isEdit = isSel && editing;
                  const freezeCol = freeze && c === 0;
                  const stickyStyle = freezeRow || freezeCol ? {
                    position: "sticky",
                    top: freezeRow ? 24 : undefined,
                    left: freezeCol ? 44 : undefined,
                    zIndex: (freezeRow && freezeCol) ? 22 : (freezeRow || freezeCol ? 15 : undefined),
                    background: cs.bg || "hsl(var(--background))",
                  } : {};
                  return (
                    <td key={c}
                      className={`border border-border p-0 relative ${isSel && !isEdit ? "outline outline-2 -outline-offset-1 outline-primary z-10" : ""}`}
                      style={{ width: colW(c), minWidth: colW(c), backgroundColor: cs.bg || "transparent", ...stickyStyle }}
                      onClick={() => {
                        if (editing) commitEdit(sel.r, sel.c, editVal);
                        setSel({ r, c });
                        setTimeout(() => gridRef.current?.focus(), 0);
                      }}
                      onDoubleClick={() => { setSel({ r, c }); startEdit(r, c); }}>
                      {isEdit ? (
                        <input ref={inputRef}
                          className="absolute inset-0 w-full h-full px-1 outline-none bg-white dark:bg-zinc-900 text-xs font-mono z-20 border-none"
                          value={editVal} onChange={e => setEditVal(e.target.value)}
                          onKeyDown={handleInputKey} onBlur={() => commitEdit(sel.r, sel.c, editVal)} />
                      ) : (
                        <div className="px-1 overflow-hidden whitespace-nowrap" style={{
                          fontWeight: cs.bold ? "bold" : "normal",
                          fontStyle: cs.italic ? "italic" : "normal",
                          textDecoration: cs.underline ? "underline" : "none",
                          textAlign: cs.align || "left",
                          color: cs.color || "inherit",
                          fontSize: (cs.fontSize || 13) + "px",
                          lineHeight: "20px", minHeight: 20,
                        }}>{getDisplay(r, c)}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Presentation editor ──

const BG_PRESETS = ["#1e293b","#0f172a","#ffffff","#f8fafc","#1d4ed8","#7c3aed","#059669","#dc2626","#d97706","#0891b2","#be185d","#374151"];

const isLightBg = (hex) => {
  const h = (hex || "#1e293b").replace("#","");
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return (r*299+g*587+b*114)/1000 > 128;
};

// Slide layout presets — each returns initial body HTML for a new slide.
const LAYOUT_TEMPLATES = {
  title: {
    label: "Title",
    body: "",
    getBody: () => "",
  },
  title_content: {
    label: "Title + Content",
    getBody: () => "<p>Click to add content…</p>",
  },
  two_column: {
    label: "Two Column",
    getBody: () =>
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">' +
      '<div><h3>Column 1</h3><p>Add content…</p></div>' +
      '<div><h3>Column 2</h3><p>Add content…</p></div>' +
      '</div>',
  },
};

function PresentationEditor({ content, onChange, editable }) {
  const slides = content?.slides || [{ id: 1, title: "Slide 1", body: "", bg: "#1e293b", layout: "title" }];
  const [activeIdx, setActiveIdx] = useState(0);
  const [preview, setPreview] = useState(false);
  const [layoutPicker, setLayoutPicker] = useState(false);
  const containerRef = useRef();
  const idx = Math.min(activeIdx, slides.length - 1);
  const active = slides[idx];

  const updateSlide = (field, val) => {
    if (!editable) return;
    onChange({ slides: slides.map((s, i) => i === idx ? { ...s, [field]: val } : s) });
  };

  const addSlideWithLayout = (layout) => {
    if (!editable) return;
    const tpl = LAYOUT_TEMPLATES[layout] || LAYOUT_TEMPLATES.title;
    const next = {
      id: Date.now(),
      title: `Slide ${slides.length + 1}`,
      body: tpl.getBody(),
      bg: active?.bg || "#1e293b",
      layout,
    };
    onChange({ slides: [...slides, next] });
    setActiveIdx(slides.length);
    setLayoutPicker(false);
  };

  const duplicateSlide = (i) => {
    if (!editable) return;
    const src = slides[i];
    const copy = { ...src, id: Date.now(), title: `${src.title} (copy)` };
    const updated = [...slides.slice(0, i + 1), copy, ...slides.slice(i + 1)];
    onChange({ slides: updated });
    setActiveIdx(i + 1);
  };

  const deleteSlide = (i) => {
    if (!editable || slides.length <= 1) return;
    const updated = slides.filter((_, j) => j !== i);
    onChange({ slides: updated });
    setActiveIdx(a => Math.min(a, updated.length - 1));
  };

  const moveSlide = (i, dir) => {
    if (!editable) return;
    const t = i + dir;
    if (t < 0 || t >= slides.length) return;
    const updated = [...slides];
    [updated[i], updated[t]] = [updated[t], updated[i]];
    onChange({ slides: updated });
    setActiveIdx(t);
  };

  const slideEditor = useEditor({
    extensions: [
      StarterKit, TiptapUnderline,
      TiptapImage.configure({ inline: false, allowBase64: true }),
      TiptapLink.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading","paragraph"] }),
      Youtube.configure({ controls: true }),
    ],
    content: active?.body || "",
    editable,
    onUpdate: ({ editor }) => updateSlide("body", editor.getHTML()),
  });

  const prevIdx = useRef(idx);
  useEffect(() => {
    if (slideEditor && prevIdx.current !== idx) {
      prevIdx.current = idx;
      slideEditor.commands.setContent(active?.body || "");
    }
  }, [idx, active?.body, slideEditor]);

  useEffect(() => { if (slideEditor) slideEditor.setEditable(editable); }, [slideEditor, editable]);

  const slideFileRef = useRef();
  const [slideImgUploading, setSlideImgUploading] = useState(false);
  const [slideLinkDialog, setSlideLinkDialog] = useState(false);
  const [slideLinkUrl, setSlideLinkUrl] = useState("");
  const [slideVideoDialog, setSlideVideoDialog] = useState(false);
  const [slideVideoUrl, setSlideVideoUrl] = useState("");

  const handleSlideImg = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !slideEditor) return;
    setSlideImgUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await sopsApi.upload(fd);
      slideEditor.chain().focus().setImage({ src: `${import.meta.env.REACT_APP_BACKEND_URL || ""}${data.url}` }).run();
    } catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
    setSlideImgUploading(false);
    e.target.value = "";
  };

  const insertSlideLink = () => {
    if (!slideLinkUrl || !slideEditor) return;
    slideEditor.chain().focus().setLink({ href: slideLinkUrl.startsWith("http") ? slideLinkUrl : `https://${slideLinkUrl}` }).run();
    setSlideLinkUrl(""); setSlideLinkDialog(false);
  };

  const insertSlideVideo = () => {
    if (!slideVideoUrl || !slideEditor) return;
    slideEditor.chain().focus().setYoutubeVideo({ src: slideVideoUrl }).run();
    setSlideVideoUrl(""); setSlideVideoDialog(false);
  };

  const light = isLightBg(active?.bg);
  const textColor = light ? "text-gray-900" : "text-white";

  // Present mode — true fullscreen via Fullscreen API + keyboard nav.
  const startPresent = useCallback(async () => {
    setPreview(true);
    // Defer: wait for the preview DOM to mount, then request fullscreen.
    setTimeout(async () => {
      try {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
      } catch {/* browser may block; preview still works inline */}
    }, 50);
  }, []);

  const exitPresent = useCallback(() => {
    setPreview(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, slides.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Escape") {
        exitPresent();
      }
    };
    const onFsChange = () => {
      if (!document.fullscreenElement) setPreview(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [preview, slides.length, exitPresent]);

  const STB = ({ act, onClick, children, title }) => (
    <button type="button" title={title} onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={`h-6 min-w-[24px] px-1 flex items-center justify-center rounded text-xs transition-colors
        ${act ? "bg-white/30 text-white" : "hover:bg-white/10 text-white/70 hover:text-white"}`}>
      {children}
    </button>
  );

  if (preview) {
    return (
      <div ref={containerRef} className="bg-black text-white min-h-screen flex flex-col">
        <div className="flex items-center justify-between p-3 bg-black/80 border-b border-white/10">
          <div className="flex gap-2 items-center">
            <Button size="sm" variant="outline" className="bg-transparent text-white border-white/30 hover:bg-white/10"
              disabled={idx === 0} onClick={() => setActiveIdx(i => i - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm text-white/80">{idx + 1} / {slides.length}</span>
            <Button size="sm" variant="outline" className="bg-transparent text-white border-white/30 hover:bg-white/10"
              disabled={idx === slides.length - 1} onClick={() => setActiveIdx(i => i + 1)}><ChevronRight className="h-4 w-4" /></Button>
            <span className="text-xs text-white/40 ml-3">← → / Space · Esc to exit</span>
          </div>
          <Button variant="outline" size="sm" className="bg-transparent text-white border-white/30 hover:bg-white/10"
            onClick={exitPresent}><EyeOff className="h-4 w-4 mr-1" />Exit</Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6" style={{ backgroundColor: "#000" }}>
        <div className="rounded-xl overflow-hidden shadow-2xl w-full max-w-[min(90vw,1600px)]"
          style={{ aspectRatio: "16/9", backgroundColor: active?.bg || "#1e293b" }}>
          <div className={`h-full flex flex-col p-16 ${textColor}`}>
            <h1 className="text-5xl font-bold mb-8 leading-tight">{active?.title}</h1>
            <div className={`flex-1 overflow-auto text-xl prose max-w-none ${light ? "" : "prose-invert"}`}
              dangerouslySetInnerHTML={{ __html: active?.body || "" }} />
          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4" style={{ minHeight: 640 }}>
      {/* Slide list panel */}
      <div className="w-48 shrink-0 flex flex-col gap-2">
        <ScrollArea className="flex-1 border rounded-lg p-1">
          {slides.map((slide, i) => (
            <div key={slide.id}
              className={`group relative rounded-lg border cursor-pointer mb-1 transition-all overflow-hidden
                ${idx === i ? "border-primary ring-1 ring-primary shadow-sm" : "border-transparent hover:border-border"}`}
              onClick={() => setActiveIdx(i)}>
              <div className="aspect-video flex items-center justify-center p-2"
                style={{ backgroundColor: slide.bg || "#1e293b" }}>
                <div className={`text-center w-full overflow-hidden ${isLightBg(slide.bg) ? "text-gray-900" : "text-white"}`}>
                  <div className="text-xs font-bold truncate">{slide.title || `Slide ${i+1}`}</div>
                  <div className="text-[8px] opacity-60 truncate mt-0.5"
                    dangerouslySetInnerHTML={{ __html: (slide.body || "").replace(/<[^>]+>/g,"").slice(0,50) }} />
                </div>
              </div>
              <div className="text-xs text-muted-foreground text-center py-0.5 bg-background">Slide {i+1}</div>
              {editable && (
                <div className="absolute top-0.5 right-0.5 hidden group-hover:flex gap-0.5 bg-background/90 rounded p-0.5 shadow">
                  <button title="Move up" disabled={i === 0} onClick={e => { e.stopPropagation(); moveSlide(i,-1); }}
                    className="disabled:opacity-30 hover:text-primary p-0.5"><ChevronLeft className="h-3 w-3" /></button>
                  <button title="Move down" disabled={i === slides.length-1} onClick={e => { e.stopPropagation(); moveSlide(i,1); }}
                    className="disabled:opacity-30 hover:text-primary p-0.5"><ChevronRight className="h-3 w-3" /></button>
                  <button title="Duplicate" onClick={e => { e.stopPropagation(); duplicateSlide(i); }}
                    className="hover:text-primary p-0.5"><Copy className="h-3 w-3" /></button>
                  {slides.length > 1 && (
                    <button title="Delete" onClick={e => { e.stopPropagation(); deleteSlide(i); }}
                      className="text-destructive hover:text-destructive/80 p-0.5"><Trash2 className="h-3 w-3" /></button>
                  )}
                </div>
              )}
            </div>
          ))}
        </ScrollArea>
        {editable && (
          <Popover open={layoutPicker} onOpenChange={setLayoutPicker}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="w-full">
                <Plus className="h-3 w-3 mr-1" />Add Slide
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-2 w-56" side="right" align="start">
              <p className="text-xs text-muted-foreground mb-2 px-1">Pick a layout</p>
              <div className="space-y-1">
                {Object.entries(LAYOUT_TEMPLATES).map(([key, tpl]) => (
                  <button key={key} type="button"
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left"
                    onClick={() => addSlideWithLayout(key)}>
                    <LayoutGrid className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="text-xs">{tpl.label}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Slide editor */}
      <div className="flex-1 flex flex-col gap-2">
        {/* Title row */}
        <div className="flex items-center gap-2">
          <Input placeholder="Slide title" value={active?.title || ""} onChange={e => updateSlide("title", e.target.value)}
            disabled={!editable} className="flex-1 text-base font-semibold" />
          <Button variant="outline" size="sm" onClick={() => { setPreview(true); }}><Eye className="h-4 w-4 mr-1" />Preview</Button>
          <Button size="sm" onClick={startPresent}><Play className="h-4 w-4 mr-1" />Present</Button>
        </div>

        {/* Background picker */}
        {editable && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Background:</span>
            {BG_PRESETS.map(c => (
              <button key={c} title={c} onClick={() => updateSlide("bg", c)}
                className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${active?.bg === c ? "border-primary scale-110 shadow" : "border-border"}`}
                style={{ backgroundColor: c }} />
            ))}
            <input type="color" className="w-6 h-6 cursor-pointer rounded border border-border"
              value={active?.bg || "#1e293b"} onChange={e => updateSlide("bg", e.target.value)} title="Custom" />
          </div>
        )}

        {/* Slide canvas */}
        <div className="rounded-xl border shadow-lg overflow-hidden flex-1 flex flex-col"
          style={{ backgroundColor: active?.bg || "#1e293b", minHeight: 440 }}>
          <div className={`flex flex-col h-full p-8 ${textColor}`}>
            <h2 className="text-3xl font-bold mb-4 shrink-0">{active?.title}</h2>

            {/* TipTap toolbar (inside canvas, styled for dark/light) */}
            {editable && slideEditor && (
              <div className="flex flex-wrap gap-0.5 mb-3 p-1.5 rounded-lg bg-black/20 shrink-0">
                <STB act={slideEditor.isActive("bold")} onClick={() => slideEditor.chain().focus().toggleBold().run()} title="Bold"><Bold className="h-3 w-3" /></STB>
                <STB act={slideEditor.isActive("italic")} onClick={() => slideEditor.chain().focus().toggleItalic().run()} title="Italic"><Italic className="h-3 w-3" /></STB>
                <STB act={slideEditor.isActive("underline")} onClick={() => slideEditor.chain().focus().toggleUnderline().run()} title="Underline"><Underline className="h-3 w-3" /></STB>
                <div className="w-px h-4 bg-white/20 mx-0.5 self-center" />
                {[1,2,3].map(l => <STB key={l} act={slideEditor.isActive("heading",{level:l})} onClick={() => slideEditor.chain().focus().toggleHeading({level:l}).run()} title={`H${l}`}>H{l}</STB>)}
                <div className="w-px h-4 bg-white/20 mx-0.5 self-center" />
                <STB act={slideEditor.isActive({textAlign:"left"})} onClick={() => slideEditor.chain().focus().setTextAlign("left").run()} title="Left"><AlignLeft className="h-3 w-3" /></STB>
                <STB act={slideEditor.isActive({textAlign:"center"})} onClick={() => slideEditor.chain().focus().setTextAlign("center").run()} title="Center"><AlignCenter className="h-3 w-3" /></STB>
                <STB act={slideEditor.isActive({textAlign:"right"})} onClick={() => slideEditor.chain().focus().setTextAlign("right").run()} title="Right"><AlignRight className="h-3 w-3" /></STB>
                <div className="w-px h-4 bg-white/20 mx-0.5 self-center" />
                <STB act={slideEditor.isActive("bulletList")} onClick={() => slideEditor.chain().focus().toggleBulletList().run()} title="Bullets"><List className="h-3 w-3" /></STB>
                <STB act={slideEditor.isActive("orderedList")} onClick={() => slideEditor.chain().focus().toggleOrderedList().run()} title="Numbered"><ListOrdered className="h-3 w-3" /></STB>
                <STB act={slideEditor.isActive("blockquote")} onClick={() => slideEditor.chain().focus().toggleBlockquote().run()} title="Quote"><Quote className="h-3 w-3" /></STB>
                <div className="w-px h-4 bg-white/20 mx-0.5 self-center" />
                <STB act={slideEditor.isActive("link")} onClick={() => setSlideLinkDialog(true)} title="Link"><Link className="h-3 w-3" /></STB>
                <STB act={false} onClick={() => slideFileRef.current?.click()} title="Image" disabled={slideImgUploading}><Image className="h-3 w-3" /></STB>
                <STB act={false} onClick={() => setSlideVideoDialog(true)} title="Video"><Video className="h-3 w-3" /></STB>
                <div className="w-px h-4 bg-white/20 mx-0.5 self-center" />
                <STB act={false} onClick={() => slideEditor.chain().focus().undo().run()} title="Undo"><Undo className="h-3 w-3" /></STB>
                <STB act={false} onClick={() => slideEditor.chain().focus().redo().run()} title="Redo"><Redo className="h-3 w-3" /></STB>
              </div>
            )}

            <div className={`flex-1 overflow-auto prose prose-sm max-w-none ${light ? "" : "prose-invert"} focus:outline-none`}>
              {editable ? <EditorContent editor={slideEditor} /> : (
                <div dangerouslySetInnerHTML={{ __html: active?.body || '<p class="opacity-40">Empty slide</p>' }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs + hidden inputs */}
      <input ref={slideFileRef} type="file" className="hidden" accept="image/*" onChange={handleSlideImg} />

      <Dialog open={slideLinkDialog} onOpenChange={setSlideLinkDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Insert Link</DialogTitle></DialogHeader>
          <Input placeholder="https://example.com" value={slideLinkUrl} onChange={e => setSlideLinkUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && insertSlideLink()} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlideLinkDialog(false)}>Cancel</Button>
            <Button onClick={insertSlideLink}>Insert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={slideVideoDialog} onOpenChange={setSlideVideoDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Embed YouTube Video</DialogTitle></DialogHeader>
          <Input placeholder="https://youtube.com/watch?v=..." value={slideVideoUrl} onChange={e => setSlideVideoUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && insertSlideVideo()} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlideVideoDialog(false)}>Cancel</Button>
            <Button onClick={insertSlideVideo}>Embed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    } catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
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
            <p className="text-xs text-muted-foreground">{sop.file_type} · {sop.file_size ? `${(sop.file_size/1024).toFixed(1)} KB` : ""}</p>
          </div>
          <a href={`${import.meta.env.REACT_APP_BACKEND_URL || ""}${sop.file_url}`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" />Download</Button>
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
      const effectiveCategory = categoryDraft === "Others" ? (customCategory || "Others") : categoryDraft;
      const payload = { content: draft, title: titleDraft, category: effectiveCategory || undefined, change_note: changeNote || undefined };
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
      toast.success(canDirectEdit(data) ? `Saved (v${data.current_version})` : "Edit proposed — awaiting owner approval");
    } catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
    setSaving(false);
  };

  const handleCategoryChange = async (val) => {
    setCategoryDraft(val);
    if (val === "Others" && !isEditing) {
      try {
        const { data } = await sopsApi.update(id, { category: "Others" });
        setSop(data); toast.success("Category saved");
      } catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
    }
  };

  const handleAcknowledge = async () => {
    try { await sopsApi.acknowledge(id); setAcked(true); toast.success("Acknowledged"); loadSop(); }
    catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
  };

  const handleApprove = async () => {
    try { const { data } = await sopsApi.approve(id); setSop(data); setDraft(data.content || {}); toast.success("Edit approved and published"); }
    catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
  };

  const handleReject = async () => {
    try { const { data } = await sopsApi.reject(id); setSop(data); toast.success("Edit rejected"); }
    catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
  };

  const handleRevert = async (versionId) => {
    try {
      const { data } = await sopsApi.revert(id, versionId);
      setSop(data); setDraft(data.content || {}); setTitleDraft(data.title); setShowHistory(false);
      toast.success(`Reverted to v${data.current_version}`);
    } catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
  };

  const handleArchive = async () => {
    try { const { data } = await sopsApi.archive(id); setSop(data); setShowArchiveConfirm(false); toast.success("SOP archived"); }
    catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
  };

  const handleTransfer = async () => {
    if (!transferTo) return;
    try { const { data } = await sopsApi.transfer(id, { new_owner_id: transferTo }); setSop(data); setShowTransfer(false); setTransferTo(""); toast.success("Ownership transferred"); }
    catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
  };

  const openHistory = async () => {
    try { const { data } = await sopsApi.versions(id); setVersions(data); setShowHistory(true); }
    catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
  };

  const openTransfer = async () => {
    try { const { data } = await usersApi.list(); setUsersList((data || []).filter(u => u.id !== user?.id)); }
    catch { setUsersList([]); }
    setShowTransfer(true);
  };

  const handlePublishStatusChange = async (newStatus) => {
    try {
      await sopsApi.setPublishStatus(id, newStatus);
      setSop(prev => ({ ...prev, publish_status: newStatus }));
      toast.success(`SOP ${newStatus}`);
    } catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
  };

  const csvImportRef = useRef();

  const handleExportPDF = () => {
    const win = window.open("", "_blank", "width=960,height=720");
    if (!win) { toast.error("Allow popups to export PDF"); return; }
    let body = "";
    if (sop.sop_type === "document") {
      body = draft?.html || "<p>Empty document</p>";
    } else if (sop.sop_type === "spreadsheet") {
      const cells = resolveCells();
      let maxR = 0, maxC = 0;
      Object.keys(cells).forEach(k => { const [r, c] = k.split(",").map(Number); maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); });
      if (!Object.keys(cells).length) { win.close(); toast.error("No data to export"); return; }
      const getV = (r, c) => { const cell = cells[`${r},${c}`]; if (!cell?.v) return ""; const v = String(cell.v); return v.startsWith("=") ? String(evalFormula(v, (r2, c2) => cells[`${r2},${c2}`])) : v; };
      let table = '<table border="1" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px;"><thead><tr><th style="background:#f0f0f0"></th>';
      for (let c = 0; c <= maxC; c++) table += `<th style="background:#f0f0f0">${COL_LETTER(c)}</th>`;
      table += "</tr></thead><tbody>";
      for (let r = 0; r <= maxR; r++) {
        table += `<tr><th style="background:#f0f0f0;text-align:center;font-size:11px">${r+1}</th>`;
        for (let c = 0; c <= maxC; c++) {
          const cell = cells[`${r},${c}`] || {}; const cs = cell.s || {};
          const st = [cs.bold?"font-weight:bold":"", cs.italic?"font-style:italic":"", cs.underline?"text-decoration:underline":"", cs.color?`color:${cs.color}`:"", cs.bg?`background:${cs.bg}`:"", cs.align?`text-align:${cs.align}`:"", cs.fontSize?`font-size:${cs.fontSize}px`:""].filter(Boolean).join(";");
          table += `<td style="${st}">${getV(r, c)}</td>`;
        }
        table += "</tr>";
      }
      body = table + "</tbody></table>";
    } else if (sop.sop_type === "presentation") {
      const slides = draft?.slides || [];
      body = slides.map((slide, i) => `<div style="page-break-after:${i<slides.length-1?"always":"avoid"};background:${slide.bg||"#1e293b"};color:${isLightBg(slide.bg)?"#111":"#fff"};padding:60px;min-height:480px;border-radius:8px;margin-bottom:24px;"><div style="font-size:10px;opacity:0.5;margin-bottom:8px">Slide ${i+1} / ${slides.length}</div><h1 style="font-size:36px;font-weight:bold;margin:0 0 24px">${slide.title||""}</h1><div style="font-size:18px;line-height:1.6">${slide.body||""}</div></div>`).join("");
    }
    win.document.write(`<!DOCTYPE html><html><head><title>${sop.title}</title><style>*{box-sizing:border-box}body{font-family:system-ui,sans-serif;padding:32px;max-width:960px;margin:0 auto}h1,h2,h3{margin:1em 0 .4em}p{margin:.5em 0;line-height:1.6}ul,ol{padding-left:1.5em}blockquote{border-left:4px solid #ccc;padding-left:16px;color:#666;margin:1em 0}pre,code{background:#f5f5f5;padding:2px 6px;border-radius:3px;font-family:monospace}img{max-width:100%}hr{border:none;border-top:1px solid #ddd;margin:1.5em 0}@media print{body{padding:0;max-width:none}@page{margin:15mm}}</style></head><body><h1 style="font-size:26px;border-bottom:2px solid #ddd;padding-bottom:8px;margin-bottom:24px">${sop.title}</h1>${body}<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    win.document.close();
  };

  const resolveCells = () => {
    if (draft?.cells) return draft.cells;
    if (draft?.data && Array.isArray(draft.data)) {
      const c = {};
      draft.data.forEach((row, r) => row?.forEach((cell, col) => {
        if (cell?.value != null && cell.value !== "") c[`${r},${col}`] = { v: String(cell.value) };
      }));
      return c;
    }
    return {};
  };

  const handleExportCSV = () => {
    const cells = resolveCells();
    if (!Object.keys(cells).length) { toast.error("No data to export"); return; }
    let maxR = 0, maxC = 0;
    Object.keys(cells).forEach(k => { const [r, c] = k.split(",").map(Number); maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); });
    const getV = (r, c) => { const cell = cells[`${r},${c}`]; if (!cell?.v) return ""; const v = String(cell.v); return v.startsWith("=") ? String(evalFormula(v, (r2,c2) => cells[`${r2},${c2}`])) : v; };
    let csv = "";
    for (let r = 0; r <= maxR; r++) {
      const row = [];
      for (let c = 0; c <= maxC; c++) { const v = getV(r, c); row.push(v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g,'""')}"` : v); }
      csv += row.join(",") + "\n";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `${sop.title || "spreadsheet"}.csv`; a.click();
  };

  const handleImportCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parseCSVLine = (line) => {
        const res = []; let cur = "", inQ = false;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"' && !inQ) inQ = true;
          else if (line[i] === '"' && inQ && line[i+1] === '"') { cur += '"'; i++; }
          else if (line[i] === '"' && inQ) inQ = false;
          else if (line[i] === ',' && !inQ) { res.push(cur); cur = ""; }
          else cur += line[i];
        }
        res.push(cur); return res;
      };
      const rows = ev.target.result.split(/\r?\n/).filter(l => l.trim());
      const newCells = {}; let maxC = 0;
      rows.forEach((line, r) => { const cols = parseCSVLine(line); maxC = Math.max(maxC, cols.length); cols.forEach((val, c) => { if (val.trim()) newCells[`${r},${c}`] = { v: val }; }); });
      setDraft({ cells: newCells, numRows: Math.max(rows.length + 20, 100), numCols: Math.max(maxC + 5, 26), colWidths: {} });
      toast.success(`Imported ${rows.length} rows`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  if (loading) return <div className="flex justify-center items-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!sop) return null;

  const isArchived = sop.status === "archived";
  const canEdit = !isArchived;
  const canDirect = canDirectEdit(sop);
  const showPendingBanner = sop.has_pending_edit && (isOwner(sop) || isPrivileged);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-2 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/sops")}><ArrowLeft className="h-4 w-4 mr-1" />SOPs</Button>
        <Separator orientation="vertical" className="h-5" />
        {isEditing ? (
          <Input value={titleDraft} onChange={e => setTitleDraft(e.target.value)} className="text-base font-semibold max-w-xs h-8" />
        ) : (
          <span className="text-base font-semibold max-w-xs truncate">{titleDraft}</span>
        )}
        <Badge variant="outline">v{sop.current_version}</Badge>
        <Badge variant={isArchived ? "secondary" : "default"}>{sop.status}</Badge>
        {/* Publish status badge */}
        <Badge
          variant="outline"
          className={
            (sop.publish_status === "published")
              ? "border-green-500 text-green-700 bg-green-50"
              : (sop.publish_status === "private")
              ? "border-gray-400 text-gray-600 bg-gray-50"
              : "border-amber-400 text-amber-700 bg-amber-50"
          }
        >
          {sop.publish_status === "published" ? "Published" : sop.publish_status === "private" ? "Private" : "Draft"}
        </Badge>
        {/* Publish status selector — owners/admins/managers only */}
        {(isOwner(sop) || isPrivileged) && !isArchived && (
          <select
            value={sop.publish_status || "draft"}
            onChange={(e) => handlePublishStatusChange(e.target.value)}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            <option value="draft">Draft</option>
            <option value="private">Private</option>
            <option value="published">Published</option>
          </select>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Export / Import */}
          <Button variant="outline" size="sm" onClick={handleExportPDF}><Download className="h-4 w-4 mr-1" />PDF</Button>
          {sop.sop_type === "spreadsheet" && (
            <>
              <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-4 w-4 mr-1" />CSV</Button>
              <Button variant="outline" size="sm" onClick={() => csvImportRef.current?.click()}><Upload className="h-4 w-4 mr-1" />Import CSV</Button>
              <input ref={csvImportRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCSV} />
            </>
          )}
          <Button variant={acked ? "secondary" : "outline"} size="sm" onClick={handleAcknowledge} disabled={acked}>
            {acked ? <><CheckCircle2 className="h-4 w-4 mr-1 text-green-600" />Acknowledged</> : <><Check className="h-4 w-4 mr-1" />Acknowledge</>}
          </Button>
          <Button variant="outline" size="sm" onClick={openHistory}><History className="h-4 w-4 mr-1" />History</Button>
          {(isOwner(sop) || isPrivileged) && <Button variant="outline" size="sm" onClick={openTransfer}><Users className="h-4 w-4 mr-1" />Transfer</Button>}
          {(isOwner(sop) || isPrivileged) && !isArchived && (
            <Button variant="outline" size="sm" onClick={() => setShowArchiveConfirm(true)}><Archive className="h-4 w-4 mr-1" />Archive</Button>
          )}
          {/* Edit controls */}
          {canEdit && !isEditing && <Button size="sm" onClick={enterEdit}><Pencil className="h-4 w-4 mr-1" />Edit</Button>}
          {canEdit && isEditing && (
            <>
              <Input placeholder="Change note" value={changeNote} onChange={e => setChangeNote(e.target.value)} className="w-36 h-8 text-sm" />
              <Button size="sm" variant="outline" onClick={cancelEdit}><X className="h-4 w-4 mr-1" />Cancel</Button>
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
            <span className="text-muted-foreground ml-2">{sop.pending_edit_at ? new Date(sop.pending_edit_at).toLocaleDateString() : ""}</span>
          </div>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleApprove}><Check className="h-4 w-4 mr-1" />Approve</Button>
          <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={handleReject}><X className="h-4 w-4 mr-1" />Reject</Button>
        </div>
      )}

      {/* Draft banner */}
      {(sop.publish_status === "draft" || !sop.publish_status) && !isArchived && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
          <span>Draft — auto-saved. Publish when ready.</span>
          {(isOwner(sop) || isPrivileged) && (
            <button
              onClick={() => handlePublishStatusChange("published")}
              className="ml-auto text-xs bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-700"
            >
              Publish
            </button>
          )}
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          {sop.description && <p className="text-muted-foreground text-sm flex-1">{sop.description}</p>}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">Category</Label>
            <Select value={categoryDraft} onValueChange={handleCategoryChange}>
              <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {PREDEFINED_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {categoryDraft === "Others" && isEditing && (
              <Input placeholder="Custom category" value={customCategory} onChange={e => setCustomCategory(e.target.value)} className="h-7 w-36 text-xs" />
            )}
          </div>
        </div>

        <>
          {sop.sop_type === "document" && <DocumentEditor content={draft} onChange={setDraft} editable={isEditing} sopId={id} />}
          {sop.sop_type === "spreadsheet" && <SpreadsheetEditor content={draft} onChange={setDraft} editable={isEditing} />}
          {sop.sop_type === "presentation" && <PresentationEditor content={draft} onChange={setDraft} editable={isEditing} />}
          {sop.sop_type === "file" && <FileEditor sop={sop} editable={isEditing} onFileUploaded={fileData => setDraft(fd => ({ ...fd, ...fileData }))} />}
        </>

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
                      <Button size="sm" variant="outline" onClick={() => handleRevert(v.id)}><RotateCcw className="h-3 w-3 mr-1" />Revert</Button>
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
                {usersList.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.username} ({u.email})</SelectItem>)}
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
