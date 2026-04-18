import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import { chatApi, orgApi, usersApi } from "@/lib/api";
import { getAvatarColor, cn } from "@/lib/utils";
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
  FileText, Download, Zap, LogIn, Loader2, Paperclip,
  ChevronUp, User2, Settings, SquarePen, Pencil, Trash2, Check,
} from "lucide-react";
import MediaMenu from "@/components/chat/MediaMenu";
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
    <div className="flex items-center my-4">
      <div className="flex-1 h-px bg-border/50" />
      <span className="mx-3 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-[0.15em]">
        {format(new Date(date), "EEEE, MMMM do")}
      </span>
      <div className="flex-1 h-px bg-border/50" />
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
          className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/40 hover:bg-muted transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4" />
          </div>
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
    const parts = text.match(/^([\w\s]+)( (created|joined|left|added|removed|renamed|archived)\b.*)/);
    if (parts) {
      return (
        <>
          <span className="font-medium">{parts[1]}</span>
          {parts[2]}
        </>
      );
    }
    return text;
  };

  return (
    <div className="flex justify-center py-1">
      <span className="text-[10px] text-muted-foreground/60 leading-snug">
        {formatText(message.text)}
      </span>
    </div>
  );
}

const isOnlyEmojis = (text) => {
  if (!text) return false;
  const stripped = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}\uFE0F\u200D\s\n]/gu, '');
  return stripped.length === 0;
};

// Renders a contiguous block of messages from the same author. Avatar + name
// appear once at the top; subsequent bubbles are tightly stacked.
function MessageGroup({ messages, isOwn, user, userCache, isDM, onEdit, onDelete }) {
  const first = messages[0];
  const cached = userCache?.[first.sender_id];
  const displayName =
    first.sender_name?.trim() ||
    cached?.full_name?.trim() ||
    cached?.username?.trim() ||
    first.sender_username?.trim() ||
    "Unknown";

  const showHeader = !isOwn && !isDM;

  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const startEdit = (msg) => {
    setEditingId(msg.id);
    setEditText(msg.text || "");
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
    <div className={cn("group flex gap-3 px-4", isOwn ? "flex-row-reverse" : "flex-row")}>
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
          const emojiOnly = isOnlyEmojis(msg.text);
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
                  <div className="relative group/msg">
                    {emojiOnly && !msg.file_url ? (
                      <div className="text-4xl leading-none py-0.5">{msg.text}</div>
                    ) : (
                      <div
                        className={cn(
                          "px-4 py-2 text-[14px] leading-snug shadow-sm",
                          isOwn ? "msg-outgoing text-white" : "msg-incoming",
                          isOwn
                            ? cn("rounded-2xl", isLast && "rounded-br-md")
                            : cn("rounded-2xl", isLast && "rounded-bl-md")
                        )}
                      >
                        {msg.text}
                        {msg.edited && <span className="text-[10px] opacity-60 ml-1">(edited)</span>}
                      </div>
                    )}
                    {isOwn && (
                      <div className={cn(
                        "absolute top-1/2 -translate-y-1/2 hidden group-hover/msg:flex gap-0.5 items-center",
                        "right-full mr-1.5"
                      )}>
                        <button
                          onClick={() => startEdit(msg)}
                          className="p-1 rounded-md bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => onDelete(msg.id)}
                          className="p-1 rounded-md bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
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
              {isLast && !isEditing && (
                <span className={cn(
                  "text-[10px] text-muted-foreground/60 mt-0.5",
                  isOwn ? "mr-1" : "ml-1"
                )}>
                  {format(new Date(msg.created_at), "h:mm a")}
                </span>
              )}
            </div>
          );
        })}
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
  const [myKeyPair, setMyKeyPair] = useState(null);
  const [orgGifsEnabled, setOrgGifsEnabled] = useState(false);

  const [pendingFiles, setPendingFiles] = useState([]);

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

  // Crypto + features init
  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await orgApi.get();
        setIsE2EEnabled(data.chat_features?.encryption_enabled || false);
        setOrgGifsEnabled(data.chat_features?.gifs_enabled || false);
        if (data.chat_features?.encryption_enabled && !myKeyPair) {
          const keys = await crypto.generateKeyPair();
          setMyKeyPair(keys);
        }
      } catch (err) {
        console.error("Chat init failed:", err);
      }
    };
    init();
  }, [myKeyPair]);

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
      // Upload all files in parallel
      let uploadedFiles = [];
      if (pendingFiles.length > 0) {
        uploadedFiles = await Promise.all(
          pendingFiles.map(async (file) => {
            const fd = new FormData();
            fd.append("file", file);
            const res = await chatApi.uploadFile(fd);
            return res.data; // { url, file_name, file_size, file_type }
          })
        );
      }

      let basePayload = { text, is_encrypted: false };
      if (isE2EEnabled && myKeyPair) {
        const keyRes = await chatApi.getChannelMembers(activeChannelId);
        const members = keyRes.data.members || [];
        const recipientKeys = {};
        members.forEach((m) => {
          if (m.public_key) recipientKeys[m.id] = m.public_key;
        });
        const myPubKey = await crypto.exportPublicKey(myKeyPair.publicKey);
        recipientKeys[user.id] = myPubKey;
        if (Object.keys(recipientKeys).length > 0) {
          const encrypted = await crypto.encryptMessage(text, recipientKeys);
          basePayload = { text: encrypted.ciphertext, iv: encrypted.iv, encrypted_keys: encrypted.encryptedKeys, is_encrypted: true };
        }
      }

      if (uploadedFiles.length === 0) {
        // text-only message
        await sendMessage(activeChannelId, basePayload.text, null, !isActiveDM, null, basePayload);
      } else {
        // one message per file; text goes on first message only
        for (let i = 0; i < uploadedFiles.length; i++) {
          const msgText = i === 0 ? basePayload.text : "";
          await sendMessage(activeChannelId, msgText, null, !isActiveDM, uploadedFiles[i], { ...basePayload, text: msgText });
        }
      }

      setInputText("");
      setPendingFiles([]);
    } catch (err) {
      console.error("Send failed:", err);
      toast.error("Failed to send — check file size or connection");
    }
  };

  const handleCreateChannel = async () => {
    if (!createForm.name.trim()) return toast.error("Channel name is required");
    setCreating(true);
    try {
      const ch = await createChannel(createForm);
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
      <aside className="w-[280px] shrink-0 flex flex-col border-r border-border bg-card/60">
        {/* Top: title + quick actions */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-border/60 shrink-0">
          <h2 className="text-base font-semibold tracking-tight">Messages</h2>
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
              className="pl-8 h-8 text-xs rounded-lg bg-muted/40 border-transparent focus-visible:bg-background"
            />
          </div>
        </div>

        {/* Tabs: Chats / Groups */}
        <Tabs defaultValue="groups" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-3 mb-1 grid grid-cols-2 rounded-lg bg-muted/40 p-0.5 h-8 shrink-0">
            <TabsTrigger
              value="chats"
              className="rounded-md text-[11px] font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              Chats
            </TabsTrigger>
            <TabsTrigger
              value="groups"
              className="rounded-md text-[11px] font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              Groups
            </TabsTrigger>
          </TabsList>

          {/* Direct messages */}
          <TabsContent value="chats" className="flex-1 mt-0 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="px-2 pb-3 pt-1 space-y-0.5">
                {filteredDms.length === 0 ? (
                  <div className="px-3 py-8 text-center text-[11px] text-muted-foreground/60">
                    No direct messages
                  </div>
                ) : (
                  filteredDms.map((dm) => (
                    <button
                      key={dm.id}
                      onClick={() => onChannelClick(dm.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors",
                        activeChannelId === dm.id
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={`${BACKEND_URL}${dm.avatar_url}`} />
                          <AvatarFallback
                            className={cn("text-[11px] font-semibold text-white", getAvatarColor(dm.name))}
                          >
                            {dm.name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        {dm.is_online && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-card" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate leading-tight text-foreground">
                          {dm.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
                          @{dm.username}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Channels */}
          <TabsContent value="groups" className="flex-1 mt-0 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="px-2 pb-3 pt-1 space-y-0.5">
                {filteredChannels.length === 0 ? (
                  <div className="px-3 py-8 text-center text-[11px] text-muted-foreground/60">
                    No groups
                  </div>
                ) : (
                  filteredChannels.map((ch) => {
                    const isGeneral = ch.name?.toLowerCase() === "general";
                    return (
                      <button
                        key={ch.id}
                        onClick={() => onChannelClick(ch.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors",
                          activeChannelId === ch.id
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                        )}
                      >
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 channel-avatar text-sm">
                          {ch.type === "private" ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Hash className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[13px] font-medium truncate leading-tight text-foreground">
                              {ch.name}
                            </p>
                            {isGeneral && (
                              <Badge
                                variant="outline"
                                className="h-4 px-1 text-[8px] font-bold uppercase tracking-wide border-primary/40 text-primary/80"
                              >
                                Pinned
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
                            {ch.last_message_preview || "No messages yet"}
                          </p>
                        </div>
                        {unreadCounts[ch.id] > 0 && (
                          <Badge className="bg-primary text-primary-foreground text-[10px] h-4 px-1.5 min-w-[18px] justify-center rounded-full">
                            {unreadCounts[ch.id]}
                          </Badge>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="border-t border-border/60 px-2 py-2 shrink-0 flex flex-col gap-1">
          <div className="flex items-center gap-1">
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
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full h-9 px-2 gap-2 text-xs font-medium justify-start">
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
      </aside>

      {/* === MAIN — chat surface === */}
      <main className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Header */}
        <header className="h-14 border-b border-border px-5 flex items-center gap-3 shrink-0 bg-card/40 backdrop-blur-sm">
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
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 channel-avatar text-sm">
                  {activeChannel.type === "private" ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Hash className="h-4 w-4" />
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

        {/* Body — discovery / empty / join / messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
          {!activeChannelId && !showDiscovery ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12">
              <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-5 ring-1 ring-primary/10">
                <MessageSquare className="h-9 w-9 text-primary/50" />
              </div>
              <h3 className="text-lg font-semibold mb-1.5 tracking-tight">Pick a conversation</h3>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-6">
                Choose a group or direct message from the left to get started.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowCreateChannel(true)}
                  className="rounded-lg h-9 px-4 text-xs font-semibold"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> New Channel
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDiscovery(true)}
                  className="rounded-lg h-9 px-4 text-xs font-semibold"
                >
                  <Search className="h-3.5 w-3.5 mr-1.5" /> Discover
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
                        <div className="w-10 h-10 rounded-lg channel-avatar flex items-center justify-center shrink-0 text-sm">
                          {ch.type === "private" ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Hash className="h-4 w-4" />
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
            <div className="max-w-3xl mx-auto py-4 space-y-3">
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
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        {activeChannel && (
          <div
            className={cn(
              "border-t border-border bg-background shrink-0",
              inputDisabled && "opacity-60"
            )}
          >
            <div className="max-w-3xl mx-auto px-4 py-3">
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
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  onChange={handleFileSelect}
                />

                <div className="flex-1 flex items-end bg-muted/50 rounded-2xl min-h-[40px] focus-within:bg-muted/70 transition-colors">
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
                  className="h-9 w-9 rounded-full shadow-sm shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {pendingFiles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 animate-in slide-in-from-bottom-2">
                  {pendingFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-2.5 py-2 bg-muted/40 rounded-xl border border-border max-w-[200px]">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate">{file.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {file.size >= 1024 * 1024
                            ? (file.size / (1024 * 1024)).toFixed(1) + " MB"
                            : (file.size / 1024).toFixed(0) + " KB"}
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
                  ))}
                  <p className="w-full text-[10px] text-muted-foreground/60 mt-0.5">
                    {pendingFiles.length}/10 files · max 50 MB each
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

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
    </div>
  );
}
