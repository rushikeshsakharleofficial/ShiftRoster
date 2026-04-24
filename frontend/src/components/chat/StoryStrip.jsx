import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { storiesApi, chatApi } from "@/lib/api";
import * as e2ee from "@/lib/crypto";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { X, Plus, ChevronLeft, ChevronRight, Trash2, Loader2, ImagePlus, Type, Smile } from "lucide-react";
import { toast } from "sonner";
import EmojiPicker from "./EmojiPicker";

const BACKEND_URL = import.meta.env.REACT_APP_BACKEND_URL;
const STORY_DURATION_MS = 5000;

const BG_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f59e0b", "#10b981", "#3b82f6", "#06b6d4",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupByUser(stories) {
  const map = new Map();
  for (const s of stories) {
    const uid = s.user_id;
    if (!map.has(uid)) {
      map.set(uid, {
        user_id: uid,
        user_name: s.user_name,
        user_avatar: s.user_avatar,
        user_initials: s.user_initials,
        stories: [],
      });
    }
    map.get(uid).stories.push(s);
  }
  return Array.from(map.values());
}

function avatarSrc(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : `${BACKEND_URL}${path}`;
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBars({ count, active, progress }) {
  return (
    <div className="flex gap-1 px-3 pt-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex-1 h-0.5 rounded-full overflow-hidden bg-white/30">
          <motion.div
            className="h-full bg-white"
            initial={{ width: i < active ? "100%" : "0%" }}
            animate={{
              width: i < active ? "100%" : i === active ? `${progress}%` : "0%",
            }}
            transition={{ duration: 0, ease: "linear" }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Story Content ─────────────────────────────────────────────────────────────

function StoryContent({ story, currentUserId }) {
  const [displayText, setDisplayText] = useState(story.text || "");

  useEffect(() => {
    if (!story.ciphertext || !story.e2ee_keys?.[currentUserId] || !currentUserId) return;
    (async () => {
      try {
        const privKey = await e2ee.getPrivateKey(currentUserId);
        if (!privKey) return;
        const entry = story.e2ee_keys[currentUserId];
        const rawB64 = await e2ee.unwrapKeyFromMember(entry.wrapped, entry.eph_pub, privKey);
        const storyKey = await e2ee.importChannelKey(rawB64);
        setDisplayText(await e2ee.aesDecrypt(storyKey, story.ciphertext));
      } catch {
        setDisplayText("🔒 Encrypted story");
      }
    })();
  }, [story.ciphertext, story.e2ee_keys, currentUserId]);

  if (story.type === "image") {
    return (
      <img
        src={avatarSrc(story.file_url)}
        alt="story"
        className="w-full h-full object-contain"
        draggable={false}
      />
    );
  }
  if (story.type === "video") {
    return (
      <video
        src={avatarSrc(story.file_url)}
        className="w-full h-full object-contain"
        autoPlay
        muted
        loop={false}
        playsInline
      />
    );
  }
  return (
    <div
      className="w-full h-full flex items-center justify-center p-8"
      style={{ backgroundColor: story.bg_color || "#6366f1" }}
    >
      <p className="text-white text-2xl font-semibold text-center leading-snug break-words max-w-sm whitespace-pre-wrap">
        {displayText}
      </p>
    </div>
  );
}

// ── Viewer Modal ──────────────────────────────────────────────────────────────

function StoryViewer({ groups, startGroupIdx, currentUserId, onClose, onDelete }) {
  const [groupIdx, setGroupIdx] = useState(startGroupIdx);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  const lastTickRef = useRef(null);
  const progressRef = useRef(0);

  // Clamp indices when groups mutate (e.g. after deletion)
  const safeGroupIdx = groups.length > 0 ? Math.min(groupIdx, groups.length - 1) : 0;
  const safeGroup = groups[safeGroupIdx];
  const safeStoryIdx = safeGroup ? Math.min(storyIdx, safeGroup.stories.length - 1) : 0;
  const story = safeGroup?.stories[safeStoryIdx];
  const group = safeGroup;
  const totalStories = safeGroup?.stories.length || 1;

  // Sync state if indices drifted
  useEffect(() => {
    if (safeGroupIdx !== groupIdx) { setGroupIdx(safeGroupIdx); setStoryIdx(0); }
    else if (safeStoryIdx !== storyIdx) setStoryIdx(safeStoryIdx);
  }, [safeGroupIdx, safeStoryIdx, groupIdx, storyIdx]);

  // Mark viewed
  useEffect(() => {
    if (story?.id) storiesApi.view(story.id).catch(() => {});
  }, [story?.id]);

  const goNext = useCallback(() => {
    if (storyIdx < totalStories - 1) {
      setStoryIdx((i) => i + 1);
      setProgress(0);
      progressRef.current = 0;
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx((i) => i + 1);
      setStoryIdx(0);
      setProgress(0);
      progressRef.current = 0;
    } else {
      onClose();
    }
  }, [storyIdx, totalStories, groupIdx, groups.length, onClose]);

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx((i) => i - 1);
      setProgress(0);
      progressRef.current = 0;
    } else if (groupIdx > 0) {
      setGroupIdx((i) => i - 1);
      setStoryIdx(0);
      setProgress(0);
      progressRef.current = 0;
    }
  }, [storyIdx, groupIdx]);

  // Auto-advance timer
  useEffect(() => {
    if (paused) {
      clearInterval(timerRef.current);
      return;
    }
    lastTickRef.current = Date.now();
    const startPct = progressRef.current;
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / STORY_DURATION_MS) * 100);
      progressRef.current = pct;
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timerRef.current);
        goNext();
      }
    }, 50);
    return () => clearInterval(timerRef.current);
  }, [storyIdx, groupIdx, paused, goNext]);

  if (!group || !story) return null;

  const isOwn = String(story.user_id) === String(currentUserId);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Story card */}
      <motion.div
        key={`${groupIdx}-${storyIdx}`}
        className="relative w-full max-w-sm h-[85vh] rounded-2xl overflow-hidden bg-black shadow-2xl select-none"
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ duration: 0.2 }}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        <StoryContent story={story} currentUserId={currentUserId} />

        {/* Progress + header overlay — z-20 so it sits above tap zones */}
        <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/50 to-transparent pb-6">
          <ProgressBars count={totalStories} active={storyIdx} progress={progress} />
          <div className="flex items-center justify-between px-3 pt-2">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8 ring-2 ring-white/60">
                <AvatarImage src={avatarSrc(group.user_avatar)} />
                <AvatarFallback className="text-[10px] font-bold text-white bg-white/20">
                  {group.user_initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-white text-xs font-semibold leading-none">{group.user_name}</p>
                <p className="text-white/60 text-[10px] mt-0.5">
                  {new Date(story.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isOwn && (
                <button
                  className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  onClick={() => onDelete(story.id)}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Tap zones — z-10, below header overlay (z-20) */}
        <div role="button" tabIndex={0} className="absolute inset-y-0 left-0 w-1/3 z-10" onClick={goPrev} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goPrev(e); }} />
        <div role="button" tabIndex={0} className="absolute inset-y-0 right-0 w-1/3 z-10" onClick={goNext} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goNext(e); }} />
      </motion.div>

      {/* Prev/Next group arrows */}
      {groupIdx > 0 && (
        <button
          className="absolute left-4 text-white/70 hover:text-white transition-colors"
          onClick={() => { setGroupIdx((i) => i - 1); setStoryIdx(0); setProgress(0); progressRef.current = 0; }}
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}
      {groupIdx < groups.length - 1 && (
        <button
          className="absolute right-4 text-white/70 hover:text-white transition-colors"
          onClick={() => { setGroupIdx((i) => i + 1); setStoryIdx(0); setProgress(0); progressRef.current = 0; }}
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}
    </motion.div>
  );
}

// ── Add Story Dialog ──────────────────────────────────────────────────────────

function AddStoryDialog({ onClose, onAdded, currentUserId }) {
  const [mode, setMode] = useState("text"); // text | media
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (mode === "text" && !text.trim()) return;
    if (mode === "media" && !file) return;
    setUploading(true);
    try {
      let story;
      if (mode === "text") {
        let payload = { text: text.trim(), bg_color: bgColor };
        // Phase 4: E2EE — encrypt story text and wrap key for all org members
        try {
          const privKey = currentUserId ? await e2ee.getPrivateKey(currentUserId) : null;
          if (privKey) {
            const { key: storyKey, raw: storyKeyRaw } = await e2ee.generateChannelKey();
            const ciphertext = await e2ee.aesEncrypt(storyKey, text.trim());
            const { data: { users } } = await chatApi.listUsers();
            const allUsers = [
              ...(users || []),
              // include self — fetch own pubkey from IndexedDB
            ];
            const myPubJwk = currentUserId ? await e2ee.getPublicKeyJwk(currentUserId) : null;
            const e2ee_keys = {};
            if (myPubJwk) {
              e2ee_keys[currentUserId] = await e2ee.wrapKeyForMember(storyKeyRaw, myPubJwk);
            }
            for (const u of allUsers) {
              if (u.public_key) {
                e2ee_keys[u.id] = await e2ee.wrapKeyForMember(storyKeyRaw, u.public_key);
              }
            }
            payload = { ...payload, ciphertext, e2ee_keys };
          }
        } catch {}
        const res = await storiesApi.create(payload);
        story = res.data;
      } else {
        const fd = new FormData();
        fd.append("file", file);
        const res = await storiesApi.upload(fd);
        story = res.data;
      }
      onAdded(story);
      onClose();
      toast.success("Story posted — visible for 24 hours");
    } catch {
      toast.error("Failed to post story");
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="bg-background rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        initial={{ scale: 0.94, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 12 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="font-semibold text-sm">Add Story</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 p-3 border-b border-border">
          <button
            onClick={() => setMode("text")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors",
              mode === "text" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            <Type className="h-3.5 w-3.5" /> Text
          </button>
          <button
            onClick={() => setMode("media")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors",
              mode === "media" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            <ImagePlus className="h-3.5 w-3.5" /> Photo / Video
          </button>
        </div>

        <div className="p-4 space-y-3">
          {mode === "text" ? (
            <>
              {/* Preview */}
              <div
                className="w-full h-40 rounded-xl flex items-center justify-center p-4 transition-colors"
                style={{ backgroundColor: bgColor }}
              >
                <p className="text-white text-lg font-semibold text-center break-words leading-snug whitespace-pre-wrap">
                  {text || <span className="opacity-40">Your story text…</span>}
                </p>
              </div>
              <div className="relative">
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={3}
                  maxLength={280}
                  className="resize-none text-sm pr-10"
                  autoFocus
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="absolute right-2 bottom-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Add emoji"
                    >
                      <Smile className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[352px] p-0 overflow-hidden rounded-xl border border-border bg-background" align="end" side="top">
                    <EmojiPicker onEmojiSelect={(emoji) => setText((prev) => prev + emoji)} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {BG_COLORS.map((c) => (
                  <button
                    key={c}
                    className={cn(
                      "w-7 h-7 rounded-full transition-transform",
                      bgColor === c && "ring-2 ring-offset-2 ring-primary scale-110"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setBgColor(c)}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div
                role="button"
                tabIndex={0}
                className="w-full h-48 rounded-xl border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary transition-colors overflow-hidden"
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
              >
                {preview ? (
                  file?.type.startsWith("video/") ? (
                    <video src={preview} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={preview} alt="preview" className="w-full h-full object-cover" />
                  )
                ) : (
                  <div className="text-center text-muted-foreground">
                    <ImagePlus className="h-8 w-8 mx-auto mb-1 opacity-50" />
                    <p className="text-xs">Click to pick image or video</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
            </>
          )}
        </div>

        <div className="px-4 pb-4">
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={uploading || (mode === "text" ? !text.trim() : !file)}
          >
            {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Posting…</> : "Post Story"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────

function StoryThumbnail({ group, hasUnread, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 shrink-0 group"
    >
      <div className={cn(
        "p-0.5 rounded-full",
        hasUnread
          ? "bg-gradient-to-br from-violet-500 via-pink-500 to-orange-400"
          : "bg-muted"
      )}>
        <div className="p-0.5 bg-background rounded-full">
          <Avatar className="h-12 w-12">
            <AvatarImage src={avatarSrc(group.user_avatar)} />
            <AvatarFallback className="text-sm font-semibold bg-muted-foreground/20">
              {group.user_initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors max-w-[56px] truncate">
        {group.user_name.split(" ")[0]}
      </span>
    </button>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function StoryStrip({ currentUser }) {
  const [stories, setStories] = useState([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerGroupIdx, setViewerGroupIdx] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [seenIds, setSeenIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("story_seen") || "[]")); }
    catch { return new Set(); }
  });

  const load = useCallback(async () => {
    try {
      const res = await storiesApi.list();
      setStories(res.data.stories || []);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = groupByUser(stories);

  const openViewer = (idx) => {
    setViewerGroupIdx(idx);
    setViewerOpen(true);
  };

  const handleSeen = useCallback((storyId) => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      next.add(storyId);
      localStorage.setItem("story_seen", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleDelete = async (storyId) => {
    try {
      await storiesApi.delete(storyId);
      setStories((prev) => {
        const next = prev.filter((s) => s.id !== storyId);
        // Close viewer if no stories remain at all
        if (next.length === 0) setViewerOpen(false);
        return next;
      });
      toast.success("Story deleted");
    } catch {
      toast.error("Failed to delete story");
    }
  };

  const handleAdded = (story) => {
    setStories((prev) => [...prev, story]);
  };

  return (
    <>
      <div className="flex items-center gap-4 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-border bg-background/60 shrink-0">
        {/* Add your story */}
        <button
          onClick={() => setAddOpen(true)}
          className="flex flex-col items-center gap-1.5 shrink-0 group"
        >
          <div className="relative h-12 w-12 rounded-full bg-muted flex items-center justify-center ring-2 ring-border group-hover:ring-primary transition-colors">
            <Avatar className="h-12 w-12 opacity-60">
              <AvatarImage src={avatarSrc(currentUser?.avatar_url)} />
              <AvatarFallback className="text-sm font-semibold">
                {currentUser?.full_name?.slice(0, 2).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
              <Plus className="h-3 w-3 text-white" />
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
            Your story
          </span>
        </button>

        {/* Divider */}
        {groups.length > 0 && <div className="h-12 w-px bg-border shrink-0" />}

        {groups.map((group, idx) => {
          const hasUnread = group.stories.some((s) => !seenIds.has(s.id));
          return (
            <StoryThumbnail
              key={group.user_id}
              group={group}
              hasUnread={hasUnread}
              onClick={() => openViewer(idx)}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {viewerOpen && (
          <StoryViewer
            groups={groups}
            startGroupIdx={viewerGroupIdx}
            currentUserId={currentUser?.id}
            onClose={() => setViewerOpen(false)}
            onDelete={handleDelete}
          />
        )}
        {addOpen && (
          <AddStoryDialog onClose={() => setAddOpen(false)} onAdded={handleAdded} currentUserId={currentUser?.id} />
        )}
      </AnimatePresence>
    </>
  );
}
