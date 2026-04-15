import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import { chatApi } from "@/lib/api";
import { getAvatarColor } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Hash, Lock, MessageSquare, Plus, Search, Users, ChevronDown,
  ChevronRight, Send, Smile, Pencil, Trash2, Reply, X, MoreHorizontal,
  UserPlus, LogIn, LogOut, PanelRightOpen, PanelRightClose, Loader2,
  Paperclip, FileText, Download, Image as ImageIcon,
} from "lucide-react";

const BACKEND_URL = import.meta.env.REACT_APP_BACKEND_URL;
const MAX_CHARS = 50_000;
const WARN_CHARS = 40_000;

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderMessageText(text, userCache = {}) {
  if (!text) return null;
  // Highlight @mentions (including @all, @anyone, @username)
  const parts = text.split(/(@[\w.]+)/g);
  return parts.map((part, i) => {
    if (/^@[\w.]+$/.test(part)) {
      const username = part.slice(1);
      if (username === "all" || username === "anyone") {
        return <span key={i} className="bg-primary/15 text-primary font-semibold rounded px-0.5">{part}</span>;
      }
      const cached = userCache[username];
      const displayName = cached ? `@${cached.full_name}` : part;
      return (
        <span key={i} className="bg-primary/15 text-primary font-semibold rounded px-0.5 cursor-default" title={`@${username}`}>
          {displayName}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function FileAttachment({ fileUrl, fileName, fileSize, fileType }) {
  const fullUrl = fileUrl?.startsWith("http") ? fileUrl : `${BACKEND_URL}${fileUrl}`;
  const isImage = fileType?.startsWith("image/");
  return (
    <div className="mt-1.5 max-w-xs">
      {isImage ? (
        <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img src={fullUrl} alt={fileName} className="max-h-48 rounded-lg border border-border object-cover" />
        </a>
      ) : (
        <a
          href={fullUrl}
          download={fileName}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-muted/60 hover:bg-muted transition-colors group"
        >
          <FileText className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{fileName}</p>
            {fileSize > 0 && <p className="text-[10px] text-muted-foreground">{formatFileSize(fileSize)}</p>}
          </div>
          <Download className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
        </a>
      )}
    </div>
  );
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👎"];

// ── Helpers ──
function timeAgo(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTime(isoStr) {
  if (!isoStr) return "";
  return new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return da.toDateString() === db.toDateString();
}

// ── TypingDots ──
function TypingDots() {
  return (
    <span className="flex gap-1 items-center">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
    </span>
  );
}

// ── Message Bubble ──
function MessageBubble({ msg, prevMsg, currentUserId, onReact, onEdit, onDelete, onReply, wsRef, channelId, userCache }) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isOwn = msg.sender_id === currentUserId;
  const isSystem = msg.type === "system";
  const isDeleted = !!msg.deleted_at;

  // Group consecutive messages from same sender
  const sameAsPrev = prevMsg &&
    prevMsg.sender_id === msg.sender_id &&
    !prevMsg.deleted_at &&
    prevMsg.type !== "system" &&
    new Date(msg.created_at) - new Date(prevMsg.created_at) < 5 * 60 * 1000;

  const showDaySep = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at);

  if (isSystem) {
    return (
      <>
        {showDaySep && <DaySeparator date={msg.created_at} />}
        <div className="flex items-center justify-center py-1.5">
          <span className="text-[11px] text-muted-foreground bg-muted px-3 py-0.5 rounded-full">
            {renderMessageText(msg.text, userCache)}
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      {showDaySep && <DaySeparator date={msg.created_at} />}
      <div
        className={`group flex gap-3 px-4 py-0.5 hover:bg-accent/30 transition-colors ${sameAsPrev ? "mt-0" : "mt-3"}`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false); }}
      >
        {/* Avatar column — only shown for first in group */}
        <div className="w-9 shrink-0 pt-0.5">
          {!sameAsPrev ? (
            <Avatar className="h-9 w-9">
              {msg?.sender_avatar && (
                <AvatarImage src={`${BACKEND_URL || ""}${msg.sender_avatar}`} />
              )}
              <AvatarFallback className={`text-xs font-semibold ${getAvatarColor(msg.sender_username || msg.sender_name)}`}>
                {msg.sender_initials || "?"}
              </AvatarFallback>
            </Avatar>
          ) : null}
        </div>

        {/* Message content */}
        <div className="flex-1 min-w-0">
          {!sameAsPrev && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-sm font-semibold">{msg.sender_name}</span>
              <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
            </div>
          )}

          {/* Reply preview */}
          {msg.reply_to && (
            <div className="border-l-2 border-primary/50 pl-2 mb-1 rounded-sm bg-primary/5 py-0.5 pr-2">
              <span className="text-[10px] font-semibold text-primary">{msg.reply_to.sender_name}</span>
              <p className="text-[11px] text-muted-foreground line-clamp-1">{msg.reply_to.text}</p>
            </div>
          )}

          {/* Message text */}
          {isDeleted ? (
            <p className="text-sm italic text-muted-foreground">Message deleted</p>
          ) : (
            <>
              {msg.text && (
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {renderMessageText(msg.text, userCache)}
                </p>
              )}
              {msg.file_url && (
                <FileAttachment
                  fileUrl={msg.file_url}
                  fileName={msg.file_name}
                  fileSize={msg.file_size}
                  fileType={msg.file_type}
                />
              )}
            </>
          )}

          {/* Edit badge */}
          {msg.edited_at && !isDeleted && (
            <span className="text-[10px] text-muted-foreground ml-1">(edited)</span>
          )}

          {/* Reactions */}
          {!isDeleted && msg.reactions && msg.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {msg.reactions.filter((r) => r.user_ids.length > 0).map((r) => (
                <button
                  key={r.emoji}
                  onClick={() => onReact(msg.id, r.emoji)}
                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    r.user_ids.includes(currentUserId)
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-muted/60 border-border hover:bg-muted text-foreground"
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="text-[10px] font-medium">{r.user_ids.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hover action bar */}
        {showActions && !isDeleted && (
          <div className="flex items-center gap-0.5 shrink-0 self-start mt-0.5 bg-background border border-border rounded-md shadow-sm px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Emoji picker */}
            <div className="relative">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowEmojiPicker((v) => !v)}
                    >
                      <Smile className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>React</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {showEmojiPicker && (
                <div className="absolute right-0 top-7 z-50 bg-background border border-border rounded-lg shadow-lg p-2 flex gap-1.5">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => { onReact(msg.id, emoji); setShowEmojiPicker(false); }}
                      className="text-lg hover:scale-125 transition-transform p-0.5 rounded"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onReply(msg)}>
                    <Reply className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reply</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {isOwn && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(msg)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onDelete(msg.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function DaySeparator({ date }) {
  return (
    <div className="flex items-center gap-3 px-4 my-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] font-medium text-muted-foreground px-1">{formatDate(date)}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ── Create Channel Dialog ──
function CreateChannelDialog({ open, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("public");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Channel name is required"); return; }
    setLoading(true);
    setError("");
    try {
      await onCreate({ name: name.trim(), description: description.trim(), type });
      setName(""); setDescription(""); setType("public");
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to create channel");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a Channel</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Channel Name</label>
            <Input
              placeholder="e.g. general, announcements"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">Lowercase, no spaces (dashes OK)</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description (optional)</label>
            <Input
              placeholder="What's this channel about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <div className="flex gap-3">
              {[["public", "Public", Hash], ["private", "Private", Lock]].map(([val, label, Icon]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setType(val)}
                  className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors ${
                    type === val ? "border-primary bg-primary/5" : "border-border hover:border-border/80"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
            {type === "private" && (
              <p className="text-[11px] text-muted-foreground">Only invited members can see this channel.</p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create Channel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── New DM Dialog ──
function NewDMDialog({ open, onClose, onOpenDM }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setUsers([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await chatApi.listUsers({ q: query });
        setUsers(res.data.users || []);
      } catch {}
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Direct Message</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search people..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="max-h-64 overflow-y-auto space-y-1 mt-2">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                onClick={() => { onOpenDM(u.id); onClose(); }}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors"
              >
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    {u?.avatar_url && (
                      <AvatarImage src={`${BACKEND_URL || ""}${u.avatar_url}`} />
                    )}
                    <AvatarFallback className={`text-xs font-semibold ${getAvatarColor(u.username || u.full_name)}`}>
                      {u.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${u.is_online ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">{u.full_name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{u.system_role}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Invite User Dialog ──
function InviteUserDialog({ open, onClose, channelId }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(null);

  useEffect(() => {
    if (!open) return;
    setQuery(""); setUsers([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await chatApi.listUsers({ q: query });
        setUsers(res.data.users || []);
      } catch {}
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  const handleInvite = async (userId) => {
    setInviting(userId);
    try {
      await chatApi.inviteToChannel(channelId, { user_id: userId });
    } catch {}
    setInviting(null);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite People</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search people..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="max-h-64 overflow-y-auto space-y-1 mt-2">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
                <Avatar className="h-8 w-8">
                  {u?.avatar_url && (
                    <AvatarImage src={`${BACKEND_URL || ""}${u.avatar_url}`} />
                  )}
                  <AvatarFallback className={`text-xs font-semibold ${getAvatarColor(u.username || u.full_name)}`}>
                    {u.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium">{u.full_name}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handleInvite(u.id)}
                  disabled={inviting === u.id}
                >
                  {inviting === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Invite"}
                </Button>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main ChatPage ──
export default function ChatPage() {
  const { user } = useAuth();
  const {
    channels, dms, activeChannelId, setActiveChannelId,
    messages, loadMessages, loadMoreMessages, sendMessage, editMessage, deleteMessage,
    reactToMessage, typingUsers, unreadCounts, markRead, createChannel, joinChannel, openDM,
    loadChannels, userCache, updateCache,
  } = useChat();

  const [channelsSectionOpen, setChannelsSectionOpen] = useState(true);
  const [dmsSectionOpen, setDmsSectionOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showMemberPanel, setShowMemberPanel] = useState(true);
  const [members, setMembers] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [inputText, setInputText] = useState("");
  const [editingMsg, setEditingMsg] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [pendingFile, setPendingFile] = useState(null); // {url, file_name, file_size, file_type}
  const [uploadingFile, setUploadingFile] = useState(false);
  const [mention, setMention] = useState({ show: false, query: "", users: [], idx: 0 });

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const mentionTimerRef = useRef(null);
  const wsRef = useRef(null);
  const scrollAreaRef = useRef(null);

  const currentMessages = messages[activeChannelId] || [];

  // Determine if active is a DM or channel
  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;
  const activeDM = dms.find((d) => d.id === activeChannelId) || null;
  const isActiveDM = !!activeDM;
  const activeItem = activeChannel || activeDM;

  // Get WS ref from AppLayout via a hidden lookup
  useEffect(() => {
    // We use window._appLayoutWsRef set by AppLayout
    wsRef.current = window._appLayoutWsRef;
  }, [activeChannelId]);

  // Switch channel
  const switchChannel = useCallback(async (id, isDM) => {
    setActiveChannelId(id);
    setInputText("");
    setEditingMsg(null);
    setReplyingTo(null);
    setHasMore(true);

    setLoadingMessages(true);
    const msgs = await loadMessages(id, !isDM);
    setLoadingMessages(false);

    if (msgs.length < 50) setHasMore(false);

    // Mark as read
    await markRead(id, !isDM);

    // Load members for channels (not DMs)
    if (!isDM) {
      try {
        const res = await chatApi.getChannelMembers(id);
        const membersList = res.data.members || [];
        setMembers(membersList);
        updateCache(membersList);
      } catch {
        setMembers([]);
      }
    } else {
      setMembers([]);
    }
  }, [loadMessages, markRead, setActiveChannelId, updateCache]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (!loadingMessages && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentMessages.length, activeChannelId, loadingMessages]);

  // Load more messages on scroll
  const handleScrollTop = useCallback(async (e) => {
    if (e.target.scrollTop > 50 || loadingMore || !hasMore || !activeChannelId) return;
    setLoadingMore(true);
    const older = await loadMoreMessages(activeChannelId, !isActiveDM);
    if (older.length < 50) setHasMore(false);
    setLoadingMore(false);
  }, [loadingMore, hasMore, activeChannelId, isActiveDM, loadMoreMessages]);

  // Typing indicator
  const sendTyping = useCallback((isTyping) => {
    const ws = window._appLayoutWsRef;
    if (!ws || ws.readyState !== WebSocket.OPEN || !activeChannelId) return;
    ws.send(JSON.stringify({
      type: "chat_typing",
      channel_id: activeChannelId,
      user_name: user?.full_name || "",
      is_typing: isTyping,
    }));
  }, [activeChannelId, user]);

  const getMentionQuery = (text, cursorPos) => {
    const before = text.slice(0, cursorPos);
    const m = before.match(/@([\w.]*)$/);
    return m ? m[1] : null;
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    if (val.length > MAX_CHARS) return; // hard block
    setInputText(val);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sendTyping(true);
    typingTimerRef.current = setTimeout(() => sendTyping(false), 3000);

    // @mention autocomplete
    const cursor = e.target.selectionStart ?? val.length;
    const q = getMentionQuery(val, cursor);
    if (q !== null) {
      if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
      mentionTimerRef.current = setTimeout(async () => {
        try {
          const res = await chatApi.mentionUsers(q);
          const users = res.data.users || [];
          setMention({ show: users.length > 0, query: q, users, idx: 0 });
          updateCache(users);
        } catch {
          setMention(s => ({ ...s, show: false }));
        }
      }, 150);
    } else {
      setMention(s => ({ ...s, show: false }));
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_FILE = 100 * 1024 * 1024;
    if (file.size > MAX_FILE) {
      alert("File too large (max 100 MB)");
      return;
    }
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await chatApi.uploadFile(formData);
      setPendingFile(res.data);
    } catch (err) {
      alert("Upload failed: " + (err?.response?.data?.detail || err.message));
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Submit message
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text && !pendingFile) return;
    if (!activeChannelId) return;

    if (editingMsg) {
      await editMessage(editingMsg.id, text);
      setEditingMsg(null);
    } else {
      await sendMessage(activeChannelId, text, replyingTo?.id || null, !isActiveDM, pendingFile);
    }
    setInputText("");
    setReplyingTo(null);
    setPendingFile(null);
    sendTyping(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, [inputText, pendingFile, activeChannelId, editingMsg, replyingTo, isActiveDM, sendMessage, editMessage, sendTyping]);

  const insertMention = (username) => {
    const cursor = inputRef.current?.selectionStart ?? inputText.length;
    const before = inputText.slice(0, cursor);
    const after = inputText.slice(cursor);
    const replaced = before.replace(/@([\w.]*)$/, `@${username} `);
    setInputText(replaced + after);
    setMention(s => ({ ...s, show: false }));
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if (mention.show) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMention(s => ({ ...s, idx: Math.min(s.idx + 1, s.users.length - 1) })); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMention(s => ({ ...s, idx: Math.max(s.idx - 1, 0) })); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        const u = mention.users[mention.idx];
        if (u) { e.preventDefault(); insertMention(u.username); return; }
      }
      if (e.key === "Escape") { setMention(s => ({ ...s, show: false })); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReact = useCallback(async (msgId, emoji) => {
    await reactToMessage(msgId, emoji);
  }, [reactToMessage]);

  const handleEdit = useCallback((msg) => {
    setEditingMsg(msg);
    setReplyingTo(null);
    setInputText(msg.text);
    inputRef.current?.focus();
  }, []);

  const handleDelete = useCallback(async (msgId) => {
    await deleteMessage(msgId);
  }, [deleteMessage]);

  const handleReply = useCallback((msg) => {
    setReplyingTo(msg);
    setEditingMsg(null);
    inputRef.current?.focus();
  }, []);

  const handleCreateChannel = useCallback(async (data) => {
    const ch = await createChannel(data);
    await switchChannel(ch.id, false);
  }, [createChannel, switchChannel]);

  const handleOpenDM = useCallback(async (userId) => {
    const dm = await openDM(userId);
    await switchChannel(dm.id, true);
  }, [openDM, switchChannel]);

  const handleJoinChannel = useCallback(async (channelId) => {
    await joinChannel(channelId);
    await switchChannel(channelId, false);
    await loadChannels();
  }, [joinChannel, switchChannel, loadChannels]);

  // Filter sidebar
  const filteredChannels = channels.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredDMs = dms.filter((d) =>
    (d.other_user?.full_name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const typingList = typingUsers[activeChannelId] || [];

  // Header info
  let headerTitle = "";
  let headerSubtitle = "";
  let headerIcon = null;
  if (activeChannel) {
    headerIcon = activeChannel.type === "private" ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />;
    headerTitle = activeChannel.name;
    headerSubtitle = activeChannel.description
      ? activeChannel.description
      : `${(activeChannel.members || []).length} members`;
  } else if (activeDM) {
    headerTitle = activeDM.other_user?.full_name || "Direct Message";
    headerIcon = <MessageSquare className="h-4 w-4" />;
    headerSubtitle = activeDM.other_user?.is_online ? "Active now" : "Offline";
  }

  return (
    <TooltipProvider>
      <div className="flex h-full overflow-hidden bg-background">

        {/* ── Left Sidebar ── */}
        <aside className="w-64 shrink-0 flex flex-col border-r border-border bg-[hsl(var(--sidebar-bg))] overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search channels..."
                className="pl-8 h-8 text-sm bg-background/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2">

              {/* Channels section */}
              <div className="mb-1">
                <button
                  onClick={() => setChannelsSectionOpen((v) => !v)}
                  className="flex items-center gap-1 w-full px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  {channelsSectionOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Channels
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 ml-auto"
                    onClick={(e) => { e.stopPropagation(); setShowCreateChannel(true); }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </button>

                {channelsSectionOpen && (
                  <div className="mt-0.5 space-y-0.5">
                    {filteredChannels.map((ch) => {
                      const isActive = ch.id === activeChannelId;
                      const unread = unreadCounts[ch.id] || 0;
                      return (
                        <button
                          key={ch.id}
                          onClick={() => switchChannel(ch.id, false)}
                          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                            isActive
                              ? "bg-primary/15 text-primary font-medium"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          }`}
                        >
                          {ch.type === "private"
                            ? <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            : <Hash className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          }
                          <span className="truncate flex-1 text-left">{ch.name}</span>
                          {!ch.is_member && (
                            <span className="text-[9px] font-medium text-muted-foreground border border-border rounded px-1">Join</span>
                          )}
                          {unread > 0 && (
                            <Badge variant="destructive" className="h-4 min-w-[1rem] px-1 text-[10px] shrink-0">
                              {unread > 99 ? "99+" : unread}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                    {filteredChannels.length === 0 && (
                      <p className="text-[11px] text-muted-foreground px-2 py-1">No channels</p>
                    )}
                  </div>
                )}
              </div>

              <Separator className="my-2 opacity-50" />

              {/* DMs section */}
              <div>
                <button
                  onClick={() => setDmsSectionOpen((v) => !v)}
                  className="flex items-center gap-1 w-full px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  {dmsSectionOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Direct Messages
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 ml-auto"
                    onClick={(e) => { e.stopPropagation(); setShowNewDM(true); }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </button>

                {dmsSectionOpen && (
                  <div className="mt-0.5 space-y-0.5">
                    {filteredDMs.map((dm) => {
                      const isActive = dm.id === activeChannelId;
                      const unread = unreadCounts[dm.id] || 0;
                      const other = dm.other_user;
                      return (
                        <button
                          key={dm.id}
                          onClick={() => switchChannel(dm.id, true)}
                          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                            isActive
                              ? "bg-primary/15 text-primary font-medium"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          }`}
                        >
                          <div className="relative shrink-0">
                            <Avatar className="h-5 w-5">
                              {other?.avatar_url && (
                                <AvatarImage src={`${BACKEND_URL || ""}${other.avatar_url}`} />
                              )}
                              <AvatarFallback className={`text-[9px] font-semibold ${getAvatarColor(other?.username || other?.full_name)}`}>
                                {other?.initials || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${other?.is_online ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                          </div>
                          <span className="truncate flex-1 text-left">{other?.full_name || "Unknown"}</span>
                          {unread > 0 && (
                            <Badge variant="destructive" className="h-4 min-w-[1rem] px-1 text-[10px] shrink-0">
                              {unread > 99 ? "99+" : unread}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                    {filteredDMs.length === 0 && (
                      <p className="text-[11px] text-muted-foreground px-2 py-1">No direct messages</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* ── Main Content ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {!activeChannelId ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-1">Welcome to Chat</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Select a channel from the sidebar, or start a direct message with a teammate.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setShowCreateChannel(true)} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-1" /> New Channel
                </Button>
                <Button onClick={() => setShowNewDM(true)} size="sm">
                  <MessageSquare className="h-4 w-4 mr-1" /> New Message
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Channel Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-muted-foreground">{headerIcon}</div>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-sm truncate">{headerTitle}</h2>
                    {headerSubtitle && (
                      <p className="text-[11px] text-muted-foreground truncate">{headerSubtitle}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {activeChannel && !activeChannel.is_member && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleJoinChannel(activeChannel.id)}>
                      <LogIn className="h-3.5 w-3.5 mr-1" /> Join
                    </Button>
                  )}
                  {activeChannel?.is_member && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowInvite(true)}>
                        <UserPlus className="h-3.5 w-3.5 mr-1" />
                        <span className="hidden sm:inline">Invite</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={async () => {
                              await chatApi.leaveChannel(activeChannel.id);
                              setActiveChannelId(null);
                              loadChannels();
                            }}
                          >
                            <LogOut className="h-3.5 w-3.5 mr-2" /> Leave Channel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                  {!isActiveDM && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setShowMemberPanel((v) => !v)}
                    >
                      {showMemberPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Messages area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Scrollable messages */}
                  <div
                    className="flex-1 overflow-y-auto"
                    onScroll={handleScrollTop}
                  >
                    {loadingMore && (
                      <div className="flex justify-center py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {loadingMessages ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : currentMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          {isActiveDM ? <MessageSquare className="h-6 w-6 text-primary" /> : <Hash className="h-6 w-6 text-primary" />}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">
                            {isActiveDM ? `Start a conversation with ${activeDM?.other_user?.full_name}` : `Welcome to #${activeChannel?.name}`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {isActiveDM ? "This is the beginning of your direct message history." : "This is the beginning of this channel. Say hello!"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="py-2">
                        {currentMessages.map((msg, idx) => (
                          <MessageBubble
                            key={msg.id}
                            msg={msg}
                            prevMsg={idx > 0 ? currentMessages[idx - 1] : null}
                            currentUserId={user?.id}
                            onReact={handleReact}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onReply={handleReply}
                            wsRef={wsRef}
                            channelId={activeChannelId}
                            userCache={userCache}
                          />
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>

                  {/* Typing indicator */}
                  {typingList.length > 0 && (
                    <div className="px-4 py-1.5 flex items-center gap-2 text-xs text-muted-foreground border-t border-border/50">
                      <TypingDots />
                      <span>
                        {typingList.length === 1
                          ? `${typingList[0].user_name} is typing...`
                          : typingList.length === 2
                          ? `${typingList[0].user_name} and ${typingList[1].user_name} are typing...`
                          : "Several people are typing..."}
                      </span>
                    </div>
                  )}

                  {/* Input area */}
                  <div className="p-3 border-t border-border bg-background shrink-0 relative">
                    {/* Reply / Edit banner */}
                    {(replyingTo || editingMsg) && (
                      <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-muted rounded-lg border border-border">
                        {replyingTo ? (
                          <>
                            <Reply className="h-3.5 w-3.5 text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-[11px] font-semibold text-primary">{replyingTo.sender_name}</span>
                              <p className="text-[11px] text-muted-foreground truncate">{replyingTo.text}</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <Pencil className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span className="text-[11px] font-semibold text-amber-600 flex-1">Editing message</span>
                          </>
                        )}
                        <button
                          onClick={() => { setReplyingTo(null); setEditingMsg(null); setInputText(""); }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* @mention autocomplete popup */}
                    {mention.show && mention.users.length > 0 && (
                      <div className="absolute bottom-full left-3 right-3 mb-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 max-h-48 overflow-y-auto">
                        {mention.users.map((u, i) => (
                          <button
                            key={u.id}
                            onMouseDown={(e) => { e.preventDefault(); insertMention(u.username); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${i === mention.idx ? "bg-accent" : "hover:bg-accent/60"}`}
                          >
                            <Avatar className="w-6 h-6 shrink-0">
                              {u?.avatar_url && (
                                <AvatarImage src={`${BACKEND_URL || ""}${u.avatar_url}`} />
                              )}
                              <AvatarFallback className={`text-[9px] font-bold ${getAvatarColor(u.username || u.full_name)}`}>
                                {u.initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <span className="text-sm font-medium">@{u.username}</span>
                              <span className="text-xs text-muted-foreground ml-1.5 truncate">{u.full_name}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Pending file preview */}
                    {pendingFile && (
                      <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-muted rounded-lg border border-border">
                        <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium truncate">{pendingFile.file_name}</p>
                          <p className="text-[10px] text-muted-foreground">{formatFileSize(pendingFile.file_size)}</p>
                        </div>
                        <button onClick={() => setPendingFile(null)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="flex items-end gap-2">
                      {/* Hidden file input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="sr-only"
                        onChange={handleFileSelect}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFile || (activeChannel && !activeChannel.is_member)}
                        title="Attach file (max 100 MB)"
                      >
                        {uploadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                      </Button>
                      <Textarea
                        ref={inputRef}
                        value={inputText}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          isActiveDM
                            ? `Message ${activeDM?.other_user?.full_name || ""}`
                            : activeChannel?.is_member
                            ? `Message #${activeChannel?.name} — use @all or @anyone to mention`
                            : "Join this channel to send messages"
                        }
                        disabled={activeChannel && !activeChannel.is_member}
                        rows={1}
                        className="min-h-[40px] max-h-[160px] resize-none flex-1 text-sm py-2.5"
                        style={{ overflow: "auto" }}
                      />
                      <Button
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={handleSend}
                        disabled={(!inputText.trim() && !pendingFile) || (activeChannel && !activeChannel.is_member)}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 ml-0.5">
                      <p className="text-[10px] text-muted-foreground">
                        Enter to send · Shift+Enter for new line
                      </p>
                      {inputText.length > WARN_CHARS && (
                        <p className={`text-[10px] font-medium ${inputText.length >= MAX_CHARS ? "text-destructive" : "text-amber-500"}`}>
                          {inputText.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Member Panel */}
                {showMemberPanel && !isActiveDM && (
                  <aside className="w-56 shrink-0 border-l border-border flex flex-col overflow-hidden bg-[hsl(var(--sidebar-bg))]">
                    <div className="px-4 py-3 border-b border-border">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Members ({members.length})
                        </p>
                      </div>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-2 space-y-0.5">
                        {members.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors"
                          >
                            <div className="relative shrink-0">
                              <Avatar className="h-7 w-7">
                                {m.avatar_url && (
                                  <AvatarImage src={`${BACKEND_URL || ""}${m.avatar_url}`} />
                                )}
                                <AvatarFallback className={`text-[10px] font-semibold ${getAvatarColor(m.username || m.full_name)}`}>
                                  {m.initials}
                                </AvatarFallback>
                              </Avatar>
                              <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${m.is_online ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{m.full_name}</p>
                              <p className="text-[10px] text-muted-foreground capitalize">{m.is_admin ? "admin" : m.system_role}</p>
                            </div>
                          </div>
                        ))}
                        {members.length === 0 && (
                          <p className="text-xs text-muted-foreground px-2 py-2">No members yet</p>
                        )}
                      </div>
                    </ScrollArea>
                  </aside>
                )}
              </div>
            </>
          )}
        </div>

        {/* Dialogs */}
        <CreateChannelDialog
          open={showCreateChannel}
          onClose={() => setShowCreateChannel(false)}
          onCreate={handleCreateChannel}
        />
        <NewDMDialog
          open={showNewDM}
          onClose={() => setShowNewDM(false)}
          onOpenDM={handleOpenDM}
        />
        {activeChannelId && !isActiveDM && (
          <InviteUserDialog
            open={showInvite}
            onClose={() => setShowInvite(false)}
            channelId={activeChannelId}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
