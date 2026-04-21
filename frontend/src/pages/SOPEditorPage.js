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
  List, ListOrdered, Quote, Undo, Redo, Minus
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import TiptapLink from "@tiptap/extension-link";
import TiptapUnderline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Youtube from "@tiptap/extension-youtube";

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

  const ToolBtn = ({ onClick, active, disabled, icon: Icon, label, className = "" }) => (
    <button type="button" title={label} onMouseDown={e => { e.preventDefault(); onClick?.(); }} disabled={disabled}
      className={`h-7 w-7 flex items-center justify-center rounded text-xs transition-colors
        ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}
        ${disabled ? "opacity-30 cursor-not-allowed" : ""} ${className}`}>
      {Icon ? <Icon className="h-3.5 w-3.5" /> : label}
    </button>
  );

  return (
    <div className="border rounded-lg overflow-hidden">
      {editable && editor && (
        <div className="flex flex-wrap items-center gap-0.5 p-2 border-b bg-muted/30">
          <ToolBtn icon={Undo} label="Undo" onClick={() => editor.chain().focus().undo().run()} />
          <ToolBtn icon={Redo} label="Redo" onClick={() => editor.chain().focus().redo().run()} />
          <Separator orientation="vertical" className="h-5 mx-1" />
          <ToolBtn icon={Bold} label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolBtn icon={Italic} label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <ToolBtn icon={Underline} label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <Separator orientation="vertical" className="h-5 mx-1" />
          {[1,2,3].map(l => <ToolBtn key={l} label={`H${l}`} active={editor.isActive("heading",{level:l})} onClick={() => editor.chain().focus().toggleHeading({level:l}).run()} />)}
          <Separator orientation="vertical" className="h-5 mx-1" />
          <ToolBtn icon={AlignLeft} label="Align Left" active={editor.isActive({textAlign:"left"})} onClick={() => editor.chain().focus().setTextAlign("left").run()} />
          <ToolBtn icon={AlignCenter} label="Align Center" active={editor.isActive({textAlign:"center"})} onClick={() => editor.chain().focus().setTextAlign("center").run()} />
          <ToolBtn icon={AlignRight} label="Align Right" active={editor.isActive({textAlign:"right"})} onClick={() => editor.chain().focus().setTextAlign("right").run()} />
          <Separator orientation="vertical" className="h-5 mx-1" />
          <ToolBtn icon={List} label="Bullet List" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolBtn icon={ListOrdered} label="Ordered List" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolBtn icon={Quote} label="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <ToolBtn icon={Minus} label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
          <Separator orientation="vertical" className="h-5 mx-1" />
          <ToolBtn icon={Link} label="Insert Link" active={editor.isActive("link")} onClick={() => setLinkDialog(true)} />
          <ToolBtn icon={Image} label="Insert Image" disabled={uploading} onClick={() => fileRef.current?.click()} />
          <ToolBtn icon={Video} label="Embed Video" onClick={() => setVideoDialog(true)} />
        </div>
      )}
      <div className={`p-4 min-h-[500px] prose prose-sm max-w-none dark:prose-invert focus:outline-none ${!editable ? "select-text cursor-default" : ""}`}>
        <EditorContent editor={editor} />
      </div>
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
    }
  }, [content]);

  const emit = useCallback((nc, nr, ncol, nw) => {
    if (!editable) return;
    onChange({ cells: nc ?? cells, numRows: nr ?? numRows, numCols: ncol ?? numCols, colWidths: nw ?? colWidths });
  }, [editable, cells, numRows, numCols, colWidths, onChange]);

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
          <TB act={false} onClick={() => { const r = numRows + 100; setNumRows(r); emit(undefined, r); }} title="Add 100 rows">+100 rows</TB>
          <TB act={false} onClick={() => { const c = numCols + 26; setNumCols(c); emit(undefined, undefined, c); }} title="Add 26 cols">+26 cols</TB>
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
            {Array.from({ length: numRows }, (_, r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 bg-muted border border-border text-center text-muted-foreground"
                  style={{ width: 44, minWidth: 44, userSelect: "none" }}>{r + 1}</td>
                {Array.from({ length: numCols }, (_, c) => {
                  const cell = getCell(r, c);
                  const cs = cell.s || {};
                  const isSel = sel.r === r && sel.c === c;
                  const isEdit = isSel && editing;
                  return (
                    <td key={c}
                      className={`border border-border p-0 relative ${isSel && !isEdit ? "outline outline-2 -outline-offset-1 outline-primary z-10" : ""}`}
                      style={{ width: colW(c), minWidth: colW(c), backgroundColor: cs.bg || "transparent" }}
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
            ))}
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

function PresentationEditor({ content, onChange, editable }) {
  const slides = content?.slides || [{ id: 1, title: "Slide 1", body: "", bg: "#1e293b" }];
  const [activeIdx, setActiveIdx] = useState(0);
  const [preview, setPreview] = useState(false);
  const idx = Math.min(activeIdx, slides.length - 1);
  const active = slides[idx];

  const updateSlide = (field, val) => {
    if (!editable) return;
    onChange({ slides: slides.map((s, i) => i === idx ? { ...s, [field]: val } : s) });
  };

  const addSlide = () => {
    if (!editable) return;
    const next = { id: Date.now(), title: `Slide ${slides.length + 1}`, body: "", bg: "#1e293b" };
    onChange({ slides: [...slides, next] });
    setActiveIdx(slides.length);
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

  const STB = ({ act, onClick, children, title }) => (
    <button type="button" title={title} onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={`h-6 min-w-[24px] px-1 flex items-center justify-center rounded text-xs transition-colors
        ${act ? "bg-white/30 text-white" : "hover:bg-white/10 text-white/70 hover:text-white"}`}>
      {children}
    </button>
  );

  if (preview) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2 items-center">
            <Button size="sm" variant="outline" disabled={idx === 0} onClick={() => setActiveIdx(i => i - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm text-muted-foreground">{idx + 1} / {slides.length}</span>
            <Button size="sm" variant="outline" disabled={idx === slides.length - 1} onClick={() => setActiveIdx(i => i + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPreview(false)}><EyeOff className="h-4 w-4 mr-1" />Exit Preview</Button>
        </div>
        <div className="rounded-xl overflow-hidden shadow-2xl" style={{ aspectRatio: "16/9", backgroundColor: active?.bg || "#1e293b" }}>
          <div className={`h-full flex flex-col p-16 ${textColor}`}>
            <h1 className="text-5xl font-bold mb-8 leading-tight">{active?.title}</h1>
            <div className={`flex-1 overflow-auto text-xl prose max-w-none ${light ? "" : "prose-invert"}`}
              dangerouslySetInnerHTML={{ __html: active?.body || "" }} />
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
          <Button size="sm" variant="outline" className="w-full" onClick={addSlide}>
            <Plus className="h-3 w-3 mr-1" />Add Slide
          </Button>
        )}
      </div>

      {/* Slide editor */}
      <div className="flex-1 flex flex-col gap-2">
        {/* Title row */}
        <div className="flex items-center gap-2">
          <Input placeholder="Slide title" value={active?.title || ""} onChange={e => updateSlide("title", e.target.value)}
            disabled={!editable} className="flex-1 text-base font-semibold" />
          <Button variant="outline" size="sm" onClick={() => setPreview(true)}><Eye className="h-4 w-4 mr-1" />Preview</Button>
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

  const csvImportRef = useRef();

  const handleExportPDF = () => {
    const win = window.open("", "_blank", "width=960,height=720");
    if (!win) { toast.error("Allow popups to export PDF"); return; }
    let body = "";
    if (sop.sop_type === "document") {
      body = draft?.html || "<p>Empty document</p>";
    } else if (sop.sop_type === "spreadsheet") {
      const { cells = {} } = draft || {};
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

  const handleExportCSV = () => {
    const { cells = {} } = draft || {};
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

        {sop.sop_type === "document" && <DocumentEditor content={draft} onChange={setDraft} editable={isEditing} sopId={id} />}
        {sop.sop_type === "spreadsheet" && <SpreadsheetEditor content={draft} onChange={setDraft} editable={isEditing} />}
        {sop.sop_type === "presentation" && <PresentationEditor content={draft} onChange={setDraft} editable={isEditing} />}
        {sop.sop_type === "file" && <FileEditor sop={sop} editable={isEditing} onFileUploaded={fileData => setDraft(fd => ({ ...fd, ...fileData }))} />}

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
