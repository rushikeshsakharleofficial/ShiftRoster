import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import { chatApi, orgApi, usersApi, cryptoApi, filesApi } from "@/lib/api";
import FilePickerModal from "@/components/FilePickerModal";
import { getAvatarColor, cn } from "@/lib/utils";
import { FileCard, getFileFormat } from "@/components/ui/file-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Hash, Lock, MessageSquare, Plus, Search, Users,
  Send, X, MoreHorizontal,
  LogOut, Info, UserPlus,
  UserCircle, Bell, Clock,
  LayoutDashboard, Globe, ShieldCheck,
  FileText, Download, Zap, LogIn, Loader2, Paperclip, FolderOpen,
  ChevronUp, User2, Settings, SquarePen, Pencil, Trash2, Check,
  Reply, Copy, Flag, MessageSquareDashed,
} from "lucide-react";
import MediaMenu from "@/components/chat/MediaMenu";
import { StoryStrip } from "@/components/chat/StoryStrip";
import ThemeToggle from "@/components/layout/ThemeToggle";
import * as crypto from "@/lib/crypto";
import { useMediaQuery } from "@/hooks/use-media-query";
import { format, isSameDay } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BACKEND_URL = import.meta.env.REACT_APP_BACKEND_URL;

// --- Sub-components ---

function DaySeparator({ date }) {
  return (
    <div className="flex items-center my-6 px-4">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      <span className="mx-3 text-[9px] font-mono font-semibold text-muted-foreground/50 uppercase tracking-[0.2em] px-2 py-0.5 rounded border border-border/30 bg-muted/20">
        {format(new Date(date), "EEE, MMM d")}
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
    </div>
  );
}

function FileAttachment({ fileUrl, fileName, fileSize, fileType }) {
  const fullUrl = fileUrl?.startsWith("http") ? fileUrl : `${BACKEND_URL}${fileUrl}`;
  const isImage = fileType?.startsWith("image/");
  return (
    <div className="mt-2 max-w-sm">
      {isImage ? (
        <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="block group relative overflow-hidden rounded-2xl border border-border/50 bg-muted/20 shadow-sm transition-all hover:shadow-md">
          <img src={fullUrl} alt={fileName} className="max-h-80 w-full object-cover" />
        </a>
      ) : (
        <a
          href={fullUrl}
          download={fileName}
          className="inline-flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/40 hover:bg-muted transition-colors max-w-xs"
        >
          <FileCard formatFile={getFileFormat(fileName, fileType)} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate text-foreground">{fileName}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
              {fileSize ? (fileSize / (1024 * 1024)).toFixed(2) : "0"} MB
            </p>
          </div>
          <Download className="h-4 w-4 text-muted-foreground shrink-0" />
        </a>
      )}
    </div>
  );
}

function SystemEvent({ message }) {
  const formatText = (text) => {
    const parts = text.match(/^([\w\s]+)( (created|joined|left|added|removed|renamed|archived)\b.*)?/);
    if (parts) {
      return (
        <>
          <span className="font-semibold text-foreground/70">{parts[1]}</span>
          {parts[2]}
        </>
      );
    }
    return text;
  };

  return (
    <div className="flex justify-center py-1.5">
      <span className="text-[10px] font-mono text-muted-foreground/40 bg-muted/20 px-3 py-0.5 rounded-full border border-border/20">
        {formatText(message.text)}
      </span>
    </div>
  );
}

function TypingIndicator({ names }) {
  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
      ? `${names[0]} and ${names[1]} are typing`
      : "Several people are typing";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3 px-4 py-1"
    >
      <div className="w-8 h-8 shrink-0" />
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 px-3 py-2 rounded-2xl rounded-bl-md msg-incoming">
          <span className="flex gap-0.5 items-center h-3">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="block w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
              />
            ))}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground/60">{label}</span>
      </div>
    </motion.div>
  );
}

const isOnlyEmojis = (text) => {
  if (!text) return false;
  const stripped = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}\uFE0F\u200D\s\n]/gu, '');
  return stripped.length === 0;
};

// Renders a contiguous block of messages from the same author. Avatar + name
// appear once at the top; subsequent bubbles are tightly stacked.
function MessageGroup({ messages, isOwn, user, userCache, isDM, onEdit, onDelete, onReply, onOpenThread, decryptedCache, onReact, threadReplyCounts }) {
  const first = messages[0];
  const cached = userCache?.[first.sender_username] || userCache?.[first.sender_id];
  const displayName =
    first.sender_name?.trim() ||
    cached?.full_name?.trim() ||
    first.sender_username?.trim() ||
    "Unknown";

  const showHeader = !isOwn && !isDM;

  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const startEdit = (msg) => {
    setEditingId(msg.id);
    setEditText(decryptedCache?.[msg.id] ?? msg.text ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const submitEdit = async (msg) => {
    if (!editText.trim() || editText.trim() === msg.text) { cancelEdit(); return; }
    await onEdit(msg.id, editText.trim());
    cancelEdit();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn("group flex gap-3 px-4", isOwn ? "flex-row-reverse" : "flex-row")}
    >
      {!isOwn && (
        <Avatar className="h-8 w-8 shrink-0 mt-1">
          <AvatarImage src={`${BACKEND_URL}${first.avatar_url}`} />
          <AvatarFallback className={cn("text-[10px] font-semibold text-white", getAvatarColor(displayName))}>
            {first.sender_initials || displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={cn("flex flex-col max-w-[75%] gap-0.5", isOwn ? "items-end" : "items-start")}>
        {showHeader && (
          <span className="text-xs font-semibold text-foreground ml-1 mb-0.5 leading-none">{displayName}</span>
        )}
        {messages.map((msg, idx) => {
          if (msg.deleted_at) return null;
          const displayText = decryptedCache?.[msg.id] ?? msg.text;
          const emojiOnly = isOnlyEmojis(displayText);
          const isLast = idx === messages.length - 1;
          const isEditing = editingId === msg.id;
          return (
            <div key={msg.id} className={cn("relative flex flex-col", isOwn ? "items-end" : "items-start")}>
              {isEditing ? (
                <div className="flex flex-col gap-1 min-w-[200px]">
                  <Textarea
                    className="text-sm resize-none rounded-xl border-primary focus-visible:ring-1"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(msg); }
                      if (e.key === "Escape") cancelEdit();
                    }}
                    rows={2}
                    autoFocus
                  />
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEdit}><X className="h-3 w-3" /></Button>
                    <Button size="icon" className="h-6 w-6" onClick={() => submitEdit(msg)}><Check className="h-3 w-3" /></Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Reply context — quoted block above bubble */}
                  {msg.reply_to && (
                    <div className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg mb-0.5 border-l-2 border-primary/50",
                      "bg-muted/50 max-w-[85%] cursor-default",
                      isOwn ? "self-end" : "self-start"
                    )}>
                      <Reply className="h-2.5 w-2.5 text-primary/60 shrink-0" />
                      <p className="text-[10px] font-semibold text-primary/70 shrink-0 truncate max-w-[60px]">
                        {msg.reply_to.sender_name?.split(" ")[0] || "Someone"}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {msg.reply_to.text || "a message"}
                      </p>
                    </div>
                  )}
                  <div className={cn("flex items-center gap-1.5 group/msg", isOwn ? "flex-row-reverse" : "flex-row")}>
                    {displayText && (emojiOnly && !msg.file_url ? (
                      <div className="text-4xl leading-none py-1 select-none">{displayText}</div>
                    ) : (
                      <div
                        className={cn(
                          "px-4 py-2.5 text-[13.5px] leading-relaxed",
                          isOwn
                            ? cn("bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20",
                               "rounded-2xl", isLast && "rounded-br-[4px]")
                            : cn("bg-muted/70 text-foreground border border-border/30 backdrop-blur-sm",
                               "rounded-2xl", isLast && "rounded-bl-[4px]")
                        )}
                      >
                        {displayText}
                        {msg.edited && <span className="text-[10px] opacity-50 ml-1.5 font-mono">(edited)</span>}
                      </div>
                    ))}
                    {/* Hover action bar */}
                    <div className={cn(
                      "flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity shrink-0",
                      "bg-background border border-border rounded-full px-1 py-0.5 shadow-sm"
                    )}>
                      {/* Quick emoji shortcuts */}
                      {["👍","❤️","😄"].map(emoji => (
                        <button key={emoji}
                          onClick={() => onReact && onReact(msg.id, emoji)}
                          className="p-1 rounded-full hover:bg-muted text-base leading-none transition-colors"
                          title={emoji}
                        >{emoji}</button>
                      ))}
                      <div className="w-px h-3 bg-border/60 mx-0.5" />
                      <button
                        onClick={() => onReply && onReply(msg)}
                        className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Reply"
                      ><Reply className="h-3 w-3" /></button>
                      <button
                        onClick={() => onOpenThread && onOpenThread(msg)}
                        className="p-1 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                        title="Open thread"
                      ><MessageSquareDashed className="h-3 w-3" /></button>
                      {displayText && (
                        <button
                          onClick={() => { navigator.clipboard.writeText(displayText); toast.success("Copied"); }}
                          className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy"
                        ><Copy className="h-3 w-3" /></button>
                      )}
                      {isOwn ? (
                        <>
                          <button
                            onClick={() => startEdit(msg)}
                            className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit"
                          ><Pencil className="h-3 w-3" /></button>
                          <button
                            onClick={() => onDelete(msg.id)}
                            className="p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete"
                          ><Trash2 className="h-3 w-3" /></button>
                        </>
                      ) : (
                        <button
                          onClick={() => toast.info("Message reported")}
                          className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Report"
                        ><Flag className="h-3 w-3" /></button>
                      )}
                    </div>
                  </div>
                  {msg.file_url && (
                    <FileAttachment
                      fileUrl={msg.file_url}
                      fileName={msg.file_name}
                      fileSize={msg.file_size}
                      fileType={msg.file_type}
                    />
                  )}
                  {(threadReplyCounts?.[msg.id] ?? 0) > 0 && (
                    <button
                      onClick={() => onOpenThread && onOpenThread(msg)}
                      className={cn(
                        "flex items-center gap-1.5 mt-1 text-[11px] font-mono text-primary hover:underline",
                        isOwn ? "self-end" : "self-start"
                      )}
                    >
                      <MessageSquareDashed className="h-3 w-3" />
                      {threadReplyCounts[msg.id]} {threadReplyCounts[msg.id] === 1 ? "reply" : "replies"}
                    </button>
                  )}
                  {msg.reactions && msg.reactions.filter(r => r.user_ids?.length > 0).length > 0 && (
                    <div className={cn("flex gap-1 flex-wrap mt-1", isOwn ? "justify-end" : "justify-start")}>
                      {msg.reactions.filter(r => r.user_ids?.length > 0).map((r) => {
                        const iMine = r.user_ids?.includes(String(user?.id));
                        return (
                          <button key={r.emoji}
                            onClick={() => onReact && onReact(msg.id, r.emoji)}
                            className={cn(
                              "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono border transition-colors",
                              iMine
                                ? "bg-primary/15 border-primary/40 text-primary"
                                : "bg-muted/50 border-border/40 text-muted-foreground hover:border-primary/30"
                            )}
                          >
                            {r.emoji} {r.user_ids.length}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              {isLast && !isEditing && (
                <span className={cn(
                  "text-[10px] font-mono text-muted-foreground/40 mt-1",
                  isOwn ? "mr-1 text-right" : "ml-1"
                )}>
                  {format(new Date(msg.created_at), "HH:mm")}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// --- Thread Panel ---
function MessageThread({ rootMsg, allMessages, user, userCache, decryptedCache, onClose, onSend }) {
  const [text, setText] = useState("");
  const replies = (allMessages || []).filter(m => m.reply_to?.id === rootMsg?.id && !m.deleted_at);
  const rootText = decryptedCache?.[rootMsg?.id] ?? rootMsg?.text;
  const rootName = rootMsg?.sender_name || "Unknown";

  return (
    <div className="w-[300px] shrink-0 border-l border-border/40 flex flex-col bg-background dark:bg-[#0a0c0f]">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border/40 shrink-0 bg-background/95 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <MessageSquareDashed className="h-4 w-4 text-primary" />
          <span className="font-heading text-sm font-semibold">Thread</span>
          {replies.length > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded-full">
              {replies.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Root message */}
      <div className="px-4 py-3 border-b border-border/30 bg-primary/5 shrink-0">
        <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground/60 mb-1">{rootName}</p>
        <p className="text-sm text-foreground leading-relaxed">{rootText}</p>
        <span className="text-[9px] font-mono text-muted-foreground/40 mt-1.5 block">
          {rootMsg?.created_at ? format(new Date(rootMsg.created_at), "MMM d, HH:mm") : ""}
        </span>
      </div>

      {/* Section label */}
      <div className="px-4 pt-3 pb-1 shrink-0">
        <span className="text-[9.5px] font-mono uppercase tracking-[0.12em] text-muted-foreground/50">
          {replies.length === 0 ? "Start the thread" : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
        </span>
      </div>

      {/* Replies */}
      <ScrollArea className="flex-1">
        <div className="px-3 pb-3 space-y-3">
          {replies.length === 0 && (
            <p className="text-xs text-muted-foreground/40 text-center py-6 italic">No replies yet</p>
          )}
          {replies.map(msg => {
            const isOwn = msg.sender_id === user?.id;
            const name = msg.sender_name || "Unknown";
            const msgText = decryptedCache?.[msg.id] ?? msg.text;
            return (
              <div key={msg.id} className={cn("flex gap-2", isOwn && "flex-row-reverse")}>
                <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                  <AvatarFallback className={cn("text-[8px] font-bold text-white", getAvatarColor(name))}>
                    {name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className={cn("flex flex-col max-w-[78%]", isOwn && "items-end")}>
                  <span className="text-[10px] font-semibold mb-0.5 text-foreground">{isOwn ? "You" : name}</span>
                  <div className={cn(
                    "px-3 py-1.5 text-[12.5px] rounded-xl leading-relaxed",
                    isOwn
                      ? "bg-primary/90 text-primary-foreground rounded-br-[3px]"
                      : "bg-muted/70 border border-border/30 text-foreground rounded-bl-[3px]"
                  )}>
                    {msgText}
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">
                    {msg.created_at ? format(new Date(msg.created_at), "HH:mm") : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Thread composer */}
      <div className="border-t border-border/40 p-3 shrink-0 bg-background/95 backdrop-blur-md">
        <div className="flex gap-2 items-end bg-muted/50 rounded-xl px-3 py-2 border border-border/40">
          <Textarea
            className="flex-1 text-sm resize-none bg-transparent border-0 focus-visible:ring-0 p-0 min-h-[34px] max-h-20 placeholder:text-muted-foreground/40"
            placeholder="Reply in thread…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) { onSend(text.trim(), rootMsg?.id); setText(""); }
              }
            }}
            rows={1}
          />
          <button
            onClick={() => { if (text.trim()) { onSend(text.trim(), rootMsg?.id); setText(""); } }}
            disabled={!text.trim()}
            className="h-7 w-7 rounded-full bg-primary flex items-center justify-center disabled:opacity-30 transition-opacity shrink-0"
          >
            <Send className="h-3 w-3 text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main Component ---
export default function ChatPage() {
  const { channelId: urlChannelId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    channels, dms, activeChannelId, setActiveChannelId, messages,
    loadMessages, loadMoreMessages, sendMessage, editMessage, deleteMessage,
    reactToMessage, typingUsers, unreadCounts, markRead, createChannel,
    joinChannel, openDM, loadChannels, userCache, updateCache,
    leaveChannel, muteChannel,
  } = useChat();

  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [inputText, setInputText] = useState("");
  const [isE2EEnabled, setIsE2EEnabled] = useState(false);
  const [orgGifsEnabled, setOrgGifsEnabled] = useState(false);
  const [myPrivKey, setMyPrivKey] = useState(null);
  const [peerPubKeyCache, setPeerPubKeyCache] = useState({});    // userId → jwk string
  const [channelKeyCache, setChannelKeyCache] = useState({});    // channelId → AES CryptoKey
  const [decryptedCache, setDecryptedCache] = useState({});      // msgId → plaintext

  const [pendingFiles, setPendingFiles] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [threadMsg, setThreadMsg] = useState(null);

  const handleFileSelect = (e) => {
    const MAX_FILES = 10;
    const MAX_SIZE = 50 * 1024 * 1024;
    const selected = Array.from(e.target.files || []);
    const valid = [];
    for (const f of selected) {
      if (f.size > MAX_SIZE) { toast.error(`${f.name} exceeds 50 MB`); continue; }
      valid.push(f);
    }
    setPendingFiles((prev) => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES) {
        toast.warning(`Max ${MAX_FILES} files allowed`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
    e.target.value = "";
  };

  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setForm] = useState({ name: "", description: "", type: "public" });
  const [chatListFilter, setChatListFilter] = useState("");

  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [addingMember, setAddingMember] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const joinedChannels = useMemo(() => channels.filter((ch) => ch.is_member), [channels]);

  // Sort channels so a channel literally named "general" pins to the top.
  const sortedChannels = useMemo(() => {
    return [...joinedChannels].sort((a, b) => {
      const aGen = a.name?.toLowerCase() === "general";
      const bGen = b.name?.toLowerCase() === "general";
      if (aGen && !bGen) return -1;
      if (bGen && !aGen) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [joinedChannels]);

  const filteredChannels = useMemo(() => {
    if (!chatListFilter.trim()) return sortedChannels;
    const q = chatListFilter.toLowerCase();
    return sortedChannels.filter((c) => c.name?.toLowerCase().includes(q));
  }, [sortedChannels, chatListFilter]);

  const filteredDms = useMemo(() => {
    if (!chatListFilter.trim()) return dms;
    const q = chatListFilter.toLowerCase();
    return dms.filter(
      (d) => d.name?.toLowerCase().includes(q) || d.username?.toLowerCase().includes(q)
    );
  }, [dms, chatListFilter]);

  const activeChannel = useMemo(
    () => [...channels, ...dms].find((c) => c.id === activeChannelId),
    [channels, dms, activeChannelId]
  );

  const isActiveDM = useMemo(
    () => dms.some((d) => d.id === activeChannelId),
    [dms, activeChannelId]
  );

  const currentMessages = useMemo(
    () => messages[activeChannelId] || [],
    [messages, activeChannelId]
  );

  // Group consecutive same-sender, same-day messages into blocks.
  const messageBlocks = useMemo(() => {
    const blocks = [];
    let currentBlock = null;
    let lastDay = null;

    for (const msg of currentMessages) {
      const day = format(new Date(msg.created_at), "yyyy-MM-dd");
      if (day !== lastDay) {
        if (currentBlock) blocks.push(currentBlock);
        blocks.push({ kind: "day", date: msg.created_at });
        currentBlock = null;
        lastDay = day;
      }
      if (msg.type === "system") {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        blocks.push({ kind: "system", message: msg });
        continue;
      }
      if (
        currentBlock &&
        currentBlock.kind === "msgs" &&
        currentBlock.senderId === msg.sender_id
      ) {
        currentBlock.messages.push(msg);
      } else {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { kind: "msgs", senderId: msg.sender_id, messages: [msg] };
      }
    }
    if (currentBlock) blocks.push(currentBlock);
    return blocks;
  }, [currentMessages]);

  // Discovery search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        const { data } = await chatApi.searchChannels(searchQuery);
        setSearchResults(data.channels || []);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // URL sync
  useEffect(() => {
    if (!urlChannelId) {
      setActiveChannelId(null);
    } else if (urlChannelId !== activeChannelId) {
      setActiveChannelId(urlChannelId);
    }
  }, [urlChannelId, activeChannelId, setActiveChannelId]);

  useEffect(() => {
    if (activeChannelId) {
      loadMessages(activeChannelId, !isActiveDM);
      markRead(activeChannelId, !isActiveDM);
    }
  }, [activeChannelId, isActiveDM, loadMessages, markRead]);

  // Org feature flags
  useEffect(() => {
    orgApi.get().then(({ data }) => {
      setIsE2EEnabled(data.chat_features?.encryption_enabled || false);
      setOrgGifsEnabled(data.chat_features?.gifs_enabled || false);
    }).catch(() => {});
  }, []);

  // Load own private key from IndexedDB; if missing, generate + publish now (AuthContext retry)
  useEffect(() => {
    if (!user?.id) return;
    crypto.getPrivateKey(user.id).then(async (k) => {
      if (k) {
        setMyPrivKey(k);
      } else {
        const result = await crypto.initCrypto(user.id, (jwk) => cryptoApi.publishKey(jwk), true);
        if (result?.privateKey) setMyPrivKey(result.privateKey);
      }
    }).catch(console.error);
  }, [user?.id]);

  // Unwrap channel AES key when switching to an E2EE-enabled channel
  useEffect(() => {
    if (!activeChannelId || !myPrivKey || isActiveDM) return;
    if (channelKeyCache[activeChannelId]) return;
    const ch = channels.find((c) => c.id === activeChannelId);
    const myEntry = ch?.e2ee_keys?.[user?.id];
    if (!myEntry) return;
    crypto.unwrapKeyFromMember(myEntry.wrapped, myEntry.eph_pub, myPrivKey)
      .then((rawB64) => crypto.importChannelKey(rawB64))
      .then((key) => setChannelKeyCache((prev) => ({ ...prev, [activeChannelId]: key })))
      .catch(console.error);
  }, [activeChannelId, myPrivKey, isActiveDM, channels]);

  // Decrypt incoming encrypted messages
  useEffect(() => {
    if (!myPrivKey) return;
    const allMsgs = Object.values(currentMessages ?? {}).flat();
    const pending = allMsgs.filter((m) => m.ciphertext && !decryptedCache[m.id]);
    if (!pending.length) return;

    (async () => {
      const updates = {};
      for (const msg of pending) {
        try {
          if (isActiveDM) {
            const activeDM = dms.find((d) => d.id === activeChannelId);
            const peerId = activeDM?.members?.find((m) => m !== user.id);
            if (!peerId) { updates[msg.id] = "🔒 Encrypted"; continue; }
            let peerJwk = peerPubKeyCache[peerId];
            if (!peerJwk) {
              const r = await cryptoApi.getPublicKey(peerId);
              peerJwk = r.data.public_key;
              setPeerPubKeyCache((prev) => ({ ...prev, [peerId]: peerJwk }));
            }
            updates[msg.id] = await crypto.decryptDM(myPrivKey, peerJwk, msg.ciphertext);
          } else {
            const chKey = channelKeyCache[activeChannelId];
            if (chKey) updates[msg.id] = await crypto.aesDecrypt(chKey, msg.ciphertext);
          }
        } catch {
          updates[msg.id] = "🔒 Encrypted";
        }
      }
      if (Object.keys(updates).length) setDecryptedCache((prev) => ({ ...prev, ...updates }));
    })();
  }, [currentMessages, myPrivKey, activeChannelId, isActiveDM, channelKeyCache]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentMessages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      const scrollHeight = inputRef.current.scrollHeight;
      const maxHeight = 160;
      inputRef.current.style.height =
        (scrollHeight > maxHeight ? maxHeight : scrollHeight) + "px";
      inputRef.current.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
    }
  }, [inputText]);

  const handleEmojiSelect = (emoji) => {
    if (!inputRef.current) {
      setInputText((prev) => prev + emoji);
      return;
    }
    const start = inputRef.current.selectionStart;
    const end = inputRef.current.selectionEnd;
    const text = inputText;
    const newText = text.substring(0, start) + emoji + text.substring(end);
    setInputText(newText);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(
          start + emoji.length,
          start + emoji.length
        );
      }
    }, 0);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text && pendingFiles.length === 0) return;
    if (!activeChannelId) return;

    try {
      // Upload all files in parallel (library references are not re-uploaded)
      let uploadedFiles = [];
      if (pendingFiles.length > 0) {
        uploadedFiles = await Promise.all(
          pendingFiles.map(async (f) => {
            if (f.fromLibrary) {
              // Already in file manager; reference it directly, don't re-upload
              return {
                url: f.url,
                file_name: f.file_name,
                file_size: f.file_size,
                file_type: f.file_type,
              };
            }
            const fd = new FormData();
            fd.append("file", f);
            const res = await chatApi.uploadFile(fd);
            return res.data; // { url, file_name, file_size, file_type }
          })
        );
      }

      let basePayload = { text, is_encrypted: false };
      if (myPrivKey && text) {
        if (isActiveDM) {
          // Phase 2: ECDH DM encryption
          const activeDM = dms.find((d) => d.id === activeChannelId);
          const peerId = activeDM?.members?.find((m) => m !== user.id);
          if (peerId) {
            let peerJwk = peerPubKeyCache[peerId];
            if (!peerJwk) {
              try {
                const r = await cryptoApi.getPublicKey(peerId);
                peerJwk = r.data.public_key;
                setPeerPubKeyCache((prev) => ({ ...prev, [peerId]: peerJwk }));
              } catch {}
            }
            if (peerJwk) {
              const ciphertext = await crypto.encryptDM(myPrivKey, peerJwk, text);
              basePayload = { text: "🔒 Encrypted message", ciphertext, is_encrypted: true };
            }
          }
        } else {
          // Phase 3: Channel AES key encryption
          const chKey = channelKeyCache[activeChannelId];
          if (chKey) {
            const ciphertext = await crypto.aesEncrypt(chKey, text);
            basePayload = { text: "🔒 Encrypted message", ciphertext, is_encrypted: true };
          }
        }
      }

      const replyId = replyTo?.id || null;
      if (uploadedFiles.length === 0) {
        // text-only message
        await sendMessage(activeChannelId, basePayload.text, replyId, !isActiveDM, null, basePayload);
      } else {
        // one message per file; text goes on first message only
        for (let i = 0; i < uploadedFiles.length; i++) {
          const msgText = i === 0 ? basePayload.text : "";
          await sendMessage(activeChannelId, msgText, i === 0 ? replyId : null, !isActiveDM, uploadedFiles[i], { ...basePayload, text: msgText });
        }
      }

      setInputText("");
      setPendingFiles([]);
      setReplyTo(null);
    } catch (err) {
      console.error("Send failed:", err);
      toast.error("Failed to send — check file size or connection");
    }
  };

  const handleCreateChannel = async () => {
    if (!createForm.name.trim()) return toast.error("Channel name is required");
    setCreating(true);
    try {
      let form = { ...createForm };
      // Phase 3: wrap a channel key for the creator so messages can be encrypted
      if (myPrivKey) {
        try {
          const { raw: channelKeyRaw } = await crypto.generateChannelKey();
          const myPubJwk = await crypto.getPublicKeyJwk(user.id);
          if (myPubJwk) {
            const wrapped = await crypto.wrapKeyForMember(channelKeyRaw, myPubJwk);
            form = { ...form, e2ee_keys: { [user.id]: wrapped } };
          }
        } catch {}
      }
      const ch = await createChannel(form);
      // Cache the channel key locally so we can encrypt immediately
      if (myPrivKey && ch?.e2ee_keys?.[user.id]) {
        crypto.unwrapKeyFromMember(ch.e2ee_keys[user.id].wrapped, ch.e2ee_keys[user.id].eph_pub, myPrivKey)
          .then((rawB64) => crypto.importChannelKey(rawB64))
          .then((key) => setChannelKeyCache((prev) => ({ ...prev, [ch.id]: key })))
          .catch(console.error);
      }
      toast.success(`Channel #${ch.name} created`);
      setShowCreateChannel(false);
      setForm({ name: "", description: "", type: "public" });
      onChannelClick(ch.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create channel");
    } finally {
      setCreating(false);
    }
  };

  const handleJoinChannel = async (id) => {
    try {
      await joinChannel(id);
      toast.success("Joined channel");
      loadChannels();
    } catch (err) {
      toast.error("Failed to join channel");
    }
  };

  const handleLeaveChannel = async (id) => {
    if (!confirm(`Are you sure you want to leave this channel?`)) return;
    try {
      await leaveChannel(id);
      toast.success("Left channel");
      loadChannels();
      if (activeChannelId === id) navigate("/chat");
    } catch (err) {
      toast.error("Failed to leave channel");
    }
  };

  // Add member search
  useEffect(() => {
    if (!showAddMember) { setMemberResults([]); setMemberSearch(""); return; }
    if (!memberSearch.trim()) { setMemberResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const { data } = await chatApi.listUsers({ search: memberSearch, limit: 20 });
        const existing = new Set((activeChannel?.members || []).map(String));
        setMemberResults((data.users || []).filter((u) => !existing.has(u.id)));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch, showAddMember, activeChannel]);

  const handleAddMember = async (userId) => {
    setAddingMember(true);
    try {
      await chatApi.inviteToChannel(activeChannelId, { user_id: userId });
      // Phase 3: wrap channel key for the new member if we hold it
      const chKey = channelKeyCache[activeChannelId];
      if (chKey && myPrivKey) {
        try {
          const r = await cryptoApi.getPublicKey(userId);
          const theirJwk = r.data.public_key;
          // Export our channel key raw bytes to re-wrap for the new member
          const myEntry = channels.find((c) => c.id === activeChannelId)?.e2ee_keys?.[user.id];
          if (myEntry && theirJwk) {
            const rawB64 = await crypto.unwrapKeyFromMember(myEntry.wrapped, myEntry.eph_pub, myPrivKey);
            const newWrapped = await crypto.wrapKeyForMember(rawB64, theirJwk);
            await chatApi.updateChannelE2eeKeys(activeChannelId, { [userId]: newWrapped });
          }
        } catch {}
      }
      toast.success("Member added");
      loadChannels();
      setMemberResults((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  };

  const onChannelClick = (id) => {
    navigate(`/chat/${id}`);
    setActiveChannelId(id);
    setShowDiscovery(false);
  };

  const inputDisabled =
    !activeChannelId || (activeChannel && !activeChannel.is_member && !isActiveDM);
  const userName = user?.full_name || user?.email || "Account";

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* === LEFT ASIDE — fixed 280px === */}
      <aside className="w-[280px] shrink-0 flex flex-col border-r border-border/20 bg-card dark:bg-gradient-to-b dark:from-[#0f1117] dark:to-[#141720]">
        {/* Top: title + quick actions */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-border/20 shrink-0">
          <h2 className="text-base font-semibold tracking-tight dark:text-white/90">Messages</h2>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowCreateChannel(true)}
              title="New channel"
            >
              <SquarePen className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowDiscovery(true)}
              title="Discover channels"
            >
              <Globe className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate("/")}
              title="Back to dashboard"
            >
              <LayoutDashboard className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search"
              value={chatListFilter}
              onChange={(e) => setChatListFilter(e.target.value)}
              className="pl-8 h-8 text-xs rounded-lg bg-muted/40 border-transparent dark:bg-white/5 dark:border-white/10 dark:text-white/80 dark:placeholder:text-white/30 focus-visible:bg-background dark:focus-visible:bg-white/10"
            />
          </div>
        </div>

        {/* Chat list — Channels + DMs */}
        <ScrollArea className="flex-1">
          {/* Channels */}
          <div className="pt-3">
            <div className="flex items-center justify-between px-4 pb-1">
              <span className="text-[9.5px] font-mono font-medium uppercase tracking-[0.12em] text-muted-foreground/50">Channels</span>
              <button
                onClick={() => setShowCreateChannel(true)}
                className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                title="New channel"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="px-2 space-y-0.5">
              {filteredChannels.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/40 px-2 py-2 italic">No channels yet</p>
              ) : filteredChannels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => onChannelClick(ch.id)}
                  className={cn(
                    "w-full flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-[5px] text-left transition-colors text-[13px] border-l-2",
                    activeChannelId === ch.id
                      ? "border-primary bg-primary/8 text-foreground font-semibold"
                      : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground dark:text-white/50 dark:hover:text-white/80"
                  )}
                >
                  {ch.type === "private"
                    ? <Lock className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    : <Hash className="h-3.5 w-3.5 shrink-0 opacity-50" />}
                  <span className="flex-1 truncate">{ch.name}</span>
                  {unreadCounts[ch.id] > 0 && (
                    <span className="font-mono text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 leading-none">
                      {unreadCounts[ch.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Direct messages */}
          <div className="pt-4 pb-3">
            <div className="flex items-center justify-between px-4 pb-1">
              <span className="text-[9.5px] font-mono font-medium uppercase tracking-[0.12em] text-muted-foreground/50">Direct Messages</span>
            </div>
            <div className="px-2 space-y-0.5">
              {filteredDms.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/40 px-2 py-2 italic">No conversations</p>
              ) : filteredDms.map((dm) => (
                <button
                  key={dm.id}
                  onClick={() => onChannelClick(dm.id)}
                  className={cn(
                    "w-full flex items-center gap-2 pl-2 pr-2 py-1.5 rounded-[5px] text-left transition-colors text-[13px] border-l-2",
                    activeChannelId === dm.id
                      ? "border-primary bg-primary/8 text-foreground font-semibold"
                      : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground dark:text-white/50 dark:hover:text-white/80"
                  )}
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={`${BACKEND_URL}${dm.avatar_url}`} />
                      <AvatarFallback className={cn("text-[9px] font-bold text-white", getAvatarColor(dm.name))}>
                        {dm.name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    {dm.is_online && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 ring-1 ring-card" />
                    )}
                  </div>
                  <span className="flex-1 truncate text-[13px] font-medium">{dm.name}</span>
                </button>
              ))}
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border/20 px-2 py-2 shrink-0 flex items-center gap-1 dark:bg-black/20 backdrop-blur-sm !bg-black/20">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => navigate("/settings")}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full h-9 px-2 gap-2 text-xs font-medium justify-start min-w-0 dark:text-white/70 dark:hover:text-white dark:hover:bg-white/5">
                <Avatar className="h-6 w-6">
                  <AvatarFallback
                    className={cn("text-[10px] text-white", getAvatarColor(userName))}
                  >
                    {userName?.charAt(0)?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate max-w-[140px]">{userName}</span>
                <ChevronUp className="h-3 w-3 opacity-60 ml-auto" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-44">
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <User2 className="h-4 w-4 mr-2" /> Account
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/notifications")}>
                <Bell className="h-4 w-4 mr-2" /> Notifications
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/login")}>
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* === MAIN + THREAD PANEL === */}
      <div className="flex-1 flex min-w-0">
      <main className="flex-1 flex flex-col min-w-0 bg-background dark:bg-[#0e1117]">
        {/* Header */}
        <header className="h-14 border-b border-border/40 px-5 flex items-center gap-3 shrink-0 bg-background/90 dark:bg-[#0e1117]/90 backdrop-blur-md sticky top-0 z-10">
          {activeChannel ? (
            <>
              {isActiveDM ? (
                <Avatar className="h-9 w-9">
                  <AvatarImage src={`${BACKEND_URL}${activeChannel.avatar_url}`} />
                  <AvatarFallback className={cn("text-[11px] font-semibold text-white", getAvatarColor(activeChannel.name))}>
                    {activeChannel.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
                  {activeChannel.type === "private" ? (
                    <Lock className="h-4 w-4 text-primary" />
                  ) : (
                    <Hash className="h-4 w-4 text-primary" />
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold truncate flex items-center gap-1.5 leading-tight">
                  {activeChannel.name}
                  {activeChannel.type === "private" && (
                    <Lock className="h-3 w-3 text-muted-foreground/60" />
                  )}
                </h3>
                <p className="text-[11px] text-muted-foreground/70 truncate">
                  {isActiveDM
                    ? `@${activeChannel.username || activeChannel.name}`
                    : activeChannel.description || `${activeChannel.members?.length || 0} members`}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem disabled>
                    <Info className="h-4 w-4 mr-2" />
                    {activeChannel.members?.length || 0} members
                  </DropdownMenuItem>
                  {!isActiveDM && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowAddMember(true)}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add member
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => muteChannel(activeChannelId, !activeChannel.is_muted)}
                      >
                        <Bell className="h-4 w-4 mr-2" />
                        {activeChannel.is_muted ? "Unmute" : "Mute"}
                      </DropdownMenuItem>
                      {activeChannel.is_member ? (
                        <DropdownMenuItem
                          onClick={() => handleLeaveChannel(activeChannelId)}
                          className="text-rose-500 focus:text-rose-600"
                        >
                          <LogOut className="h-4 w-4 mr-2" />
                          Leave channel
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => handleJoinChannel(activeChannelId)}
                        >
                          <LogIn className="h-4 w-4 mr-2" />
                          Join channel
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <span className="text-sm text-muted-foreground/70">Select a conversation</span>
          )}
        </header>

        {/* Stories strip */}
        <StoryStrip currentUser={user} />

        {/* Body — discovery / empty / join / messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar bg-background dark:bg-[#0e1117]">
          {!activeChannelId && !showDiscovery ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12">
              <div className="relative mb-8">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                  <MessageSquare className="h-9 w-9 text-primary/60" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary/30 ring-2 ring-background" />
              </div>
              <h3 className="font-heading text-xl font-bold mb-2 tracking-tight">No conversation selected</h3>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8">
                Pick a channel or start a direct message.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setShowCreateChannel(true)}
                  className="rounded-md h-9 px-5 text-xs font-semibold"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> New Channel
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDiscovery(true)}
                  className="rounded-xl h-9 px-5 text-xs font-semibold"
                >
                  <Search className="h-3.5 w-3.5 mr-1.5" /> Browse
                </Button>
              </div>
            </div>
          ) : showDiscovery ? (
            <div className="max-w-2xl mx-auto w-full p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Discover Channels</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Public spaces in your organization
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setShowDiscovery(false)}
                  className="rounded-lg h-9 px-3 text-xs"
                >
                  Back
                </Button>
              </div>
              <div className="relative mb-6">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or topic"
                  className="pl-10 h-10 rounded-xl"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {searching ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 text-primary/50 animate-spin" />
                </div>
              ) : searchQuery && searchResults.length === 0 ? (
                <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border">
                  <p className="text-sm text-muted-foreground">
                    No channels found matching "{searchQuery}"
                  </p>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((ch) => (
                    <div
                      key={ch.id}
                      className="p-4 bg-card rounded-xl border border-border flex items-center justify-between hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          {ch.type === "private" ? (
                            <Lock className="h-4 w-4 text-primary" />
                          ) : (
                            <Hash className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-sm truncate">{ch.name}</h4>
                          <p className="text-xs text-muted-foreground truncate">
                            {ch.description || "Public channel"}
                          </p>
                        </div>
                      </div>
                      {ch.is_member ? (
                        <Button
                          variant="ghost"
                          disabled
                          className="rounded-lg h-9 px-4 text-xs opacity-60"
                        >
                          Joined
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleJoinChannel(ch.id)}
                          className="rounded-lg h-9 px-4 text-xs"
                        >
                          Join
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border">
                  <Globe className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Type to search
                  </p>
                </div>
              )}
            </div>
          ) : !activeChannel?.is_member && !isActiveDM ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12">
              <div className="w-20 h-20 rounded-2xl bg-primary/5 flex items-center justify-center mb-5 ring-1 ring-primary/10">
                <LogIn className="h-9 w-9 text-primary/50" />
              </div>
              <h3 className="text-xl font-semibold mb-1.5 tracking-tight">
                Join #{activeChannel?.name}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                Public channel — join to participate and see history.
              </p>
              <Button
                onClick={() => handleJoinChannel(activeChannelId)}
                className="rounded-lg h-10 px-6 text-sm font-semibold"
              >
                Join channel
              </Button>
            </div>
          ) : currentMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-12">
              <Clock className="h-7 w-7 text-muted-foreground/30 mb-3" />
              <p className="text-xs text-muted-foreground/70 uppercase tracking-wider">
                Start of conversation
              </p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto py-4 space-y-4">
              <AnimatePresence initial={false}>
                {messageBlocks.map((block, idx) => {
                  if (block.kind === "day") {
                    return <DaySeparator key={`day-${idx}`} date={block.date} />;
                  }
                  if (block.kind === "system") {
                    return <SystemEvent key={`sys-${block.message.id}`} message={block.message} />;
                  }
                  const isOwn = block.senderId === user.id;
                  return (
                    <MessageGroup
                      key={`grp-${block.messages[0].id}`}
                      messages={block.messages}
                      isOwn={isOwn}
                      user={user}
                      userCache={userCache}
                      isDM={isActiveDM}
                      onEdit={editMessage}
                      onDelete={deleteMessage}
                      onReply={(msg) => setReplyTo(msg)}
                      onOpenThread={(msg) => setThreadMsg(msg)}
                      decryptedCache={decryptedCache}
                      onReact={(msgId, emoji) => reactToMessage(msgId, emoji)}
                      threadReplyCount={0}
                    />
                  );
                })}
              </AnimatePresence>
              {/* Typing indicator */}
              {(() => {
                const typers = (typingUsers[activeChannelId] || []).filter(
                  (u) => u.user_id !== user?.id
                );
                return (
                  <AnimatePresence>
                    {typers.length > 0 && (
                      <TypingIndicator names={typers.map((u) => u.user_name)} />
                    )}
                  </AnimatePresence>
                );
              })()}
            </div>
          )}
        </div>

        {/* Composer */}
        {activeChannel && (
          <div
            className={cn(
              "border-t border-border/40 bg-background/95 dark:bg-[#0e1117]/95 backdrop-blur-md shrink-0",
              inputDisabled && "opacity-60"
            )}
          >
            <div className="max-w-2xl mx-auto px-4 py-3">
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-xl border-l-2 border-primary animate-in slide-in-from-bottom-2">
                  <Reply className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-xs text-muted-foreground">Replying to</span>
                  <span className="text-xs font-medium truncate flex-1">{replyTo.text?.slice(0, 80) || "a message"}</span>
                  <button onClick={() => setReplyTo(null)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-muted-foreground hover:bg-muted shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={inputDisabled}
                  title="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-muted-foreground hover:bg-muted shrink-0"
                  onClick={() => setPickerOpen(true)}
                  disabled={inputDisabled}
                  title="Attach from Files"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  onChange={handleFileSelect}
                />

                <div className="flex-1 flex items-end bg-muted/40 border border-border/60 dark:bg-white/5 dark:border-white/10 rounded-2xl min-h-[40px] focus-within:border-indigo-400/50 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all shadow-sm">
                  <Textarea
                    ref={inputRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={
                      activeChannel
                        ? `Message ${isActiveDM ? activeChannel.name : "#" + activeChannel.name}`
                        : "Select a channel"
                    }
                    disabled={inputDisabled}
                    rows={1}
                    className="flex-1 min-h-[40px] max-h-[160px] bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm py-2.5 px-4 resize-none custom-scrollbar"
                  />
                  <div className="pb-1 pr-1.5 shrink-0">
                    <MediaMenu
                      onEmojiSelect={handleEmojiSelect}
                      onGifSelect={() => {}}
                      gifsEnabled={orgGifsEnabled}
                      disabled={inputDisabled}
                    />
                  </div>
                </div>

                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={inputDisabled || (!inputText.trim() && pendingFiles.length === 0)}
                  className="h-9 w-9 rounded-full shadow-lg shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 border-0 text-white disabled:opacity-30"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {pendingFiles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 animate-in slide-in-from-bottom-2">
                  {pendingFiles.map((file, idx) => {
                    const displayName = file.fromLibrary ? file.file_name : file.name;
                    const displaySize = file.fromLibrary ? (file.file_size || 0) : file.size;
                    return (
                    <div key={idx} className="flex items-center gap-2 px-2.5 py-2 bg-muted/40 rounded-xl border border-border max-w-[200px]">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        {file.fromLibrary ? <FolderOpen className="h-3.5 w-3.5 text-primary" /> : <FileText className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate">{displayName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {displaySize >= 1024 * 1024
                            ? (displaySize / (1024 * 1024)).toFixed(1) + " MB"
                            : (displaySize / 1024).toFixed(0) + " KB"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    );
                  })}
                  <p className="w-full text-[10px] text-muted-foreground/60 mt-0.5">
                    {pendingFiles.length}/10 files · max 50 MB each
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Thread panel */}
      {threadMsg && (
        <MessageThread
          rootMsg={threadMsg}
          allMessages={currentMessages}
          user={user}
          userCache={userCache}
          decryptedCache={decryptedCache}
          onClose={() => setThreadMsg(null)}
          onSend={(text, parentId) => {
            sendMessage(activeChannelId, text, parentId, !isActiveDM);
          }}
        />
      )}
      </div>

      {/* Create Channel dialog */}
      <Dialog open={showCreateChannel} onOpenChange={setShowCreateChannel}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Create Channel
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Name
              </Label>
              <Input
                placeholder="e.g. engineering-team"
                value={createForm.name}
                onChange={(e) =>
                  setForm({
                    ...createForm,
                    name: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                  })
                }
                className="rounded-lg h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Description (optional)
              </Label>
              <Textarea
                placeholder="What's this channel about?"
                value={createForm.description}
                onChange={(e) =>
                  setForm({ ...createForm, description: e.target.value })
                }
                className="rounded-lg min-h-[80px] resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Type
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...createForm, type: "public" })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-colors text-left",
                    createForm.type === "public"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80 bg-background"
                  )}
                >
                  <Globe className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold">Public</p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...createForm, type: "private" })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-colors text-left",
                    createForm.type === "private"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80 bg-background"
                  )}
                >
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold">Private</p>
                </button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateChannel(false)}
              className="rounded-lg h-10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateChannel}
              disabled={creating || !createForm.name.trim()}
              className="rounded-lg h-10 px-6"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member dialog */}
      <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Add Member
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name or username..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="pl-9 h-9 rounded-lg"
                autoFocus
              />
            </div>
            <ScrollArea className="h-[260px]">
              {memberResults.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  {memberSearch.trim() ? "No users found" : "Type to search users"}
                </div>
              ) : (
                <div className="space-y-1 pr-2">
                  {memberResults.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={`${BACKEND_URL}${u.avatar_url}`} />
                        <AvatarFallback className={cn("text-[10px] font-semibold text-white", getAvatarColor(u.full_name || u.username))}>
                          {(u.full_name || u.username || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.full_name || u.username}</p>
                        <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 px-3 text-xs rounded-lg shrink-0"
                        disabled={addingMember}
                        onClick={() => handleAddMember(u.id)}
                      >
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* File picker: attach refs from Files library */}
      <FilePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple
        onPick={(picked) => {
          const refs = picked.map((p) => ({
            fromLibrary: true,
            id: p.id,
            url: filesApi.downloadUrl(p.id),
            file_name: p.name,
            file_size: p.size,
            file_type: p.mime,
          }));
          setPendingFiles((prev) => [...prev, ...refs]);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
