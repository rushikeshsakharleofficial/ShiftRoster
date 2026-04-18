import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import { chatApi, orgApi } from "@/lib/api";
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
  LogOut, Info,
  Search as SearchIcon, UserCircle, Bell, Clock,
  LayoutDashboard, Globe, ShieldCheck,
  FileText, Download, Zap, LogIn, Loader2, Paperclip
} from "lucide-react";
import MediaMenu from "@/components/chat/MediaMenu";
import ThemeToggle from "@/components/layout/ThemeToggle";
import * as crypto from "@/lib/crypto";
import { useMediaQuery } from "@/hooks/use-media-query";
import { format, isSameDay } from "date-fns";

const BACKEND_URL = import.meta.env.REACT_APP_BACKEND_URL;

// --- Sub-components ---

function DaySeparator({ date }) {
  return (
    <div className="flex items-center my-8 px-8">
      <div className="flex-1 h-px bg-border/40" />
      <span className="mx-6 text-[10px] font-bold text-muted-foreground/60 bg-background px-3 uppercase tracking-[0.2em]">
        {format(new Date(date), "EEEE, MMMM do")}
      </span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}

function FileAttachment({ fileUrl, fileName, fileSize, fileType }) {
  const fullUrl = fileUrl?.startsWith("http") ? fileUrl : `${BACKEND_URL}${fileUrl}`;
  const isImage = fileType?.startsWith("image/");
  return (
    <div className="mt-3 max-w-sm">
      {isImage ? (
        <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="block group relative overflow-hidden rounded-2xl border border-border/50 bg-muted/20 shadow-sm transition-all hover:shadow-md">
          <img src={fullUrl} alt={fileName} className="max-h-80 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
        </a>
      ) : (
        <a
          href={fullUrl}
          download={fileName}
          className="flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-surface-container-lowest hover:bg-surface-container transition-all group shadow-sm hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-xl bg-primary-fixed text-primary flex items-center justify-center shrink-0 shadow-inner">
            <FileText className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold truncate text-foreground">{fileName}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-black mt-1">
              {fileSize ? (fileSize / (1024 * 1024)).toFixed(2) : "0"} MB • {fileType?.split("/")[1]?.toUpperCase() || "FILE"}
            </p>
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          </div>
        </a>
      )}
    </div>
  );
}

function SystemEvent({ message }) {
  // Use a regex to make the user's name bold, if present
  const formatText = (text) => {
    // This regex looks for a name at the start of the string, assuming it's followed by a verb
    const parts = text.match(/^([\w\s]+)( (created|joined|left|added|removed|renamed|archived)\b.*)/);
    if (parts) {
      return (
        <>
          <span className="font-bold">{parts[1]}</span>
          {parts[2]}
        </>
      );
    }
    return text;
  };

  return (
    <div className="flex justify-center py-2 animate-in fade-in duration-700">
      <div className="bg-surface-container-high/40 text-muted-foreground text-[10px] font-semibold px-5 py-2 rounded-full shadow-sm tracking-wide flex items-center gap-2.5 backdrop-blur-sm border border-border/20">
        <Zap className="h-3 w-3 text-primary/60" />
        <span className="leading-snug">{formatText(message.text)}</span>
      </div>
    </div>
  );
}

const isOnlyEmojis = (text) => {
  if (!text) return false;
  // Match emojis and whitespace. If after removing them nothing is left, it's emoji only.
  const stripped = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}\uFE0F\u200D\s\n]/gu, '');
  return stripped.length === 0;
};

function UserMessageBubble({ message, isOwn, user }) {
  const emojiOnly = isOnlyEmojis(message.text);

  return (
    <div className={cn(
      "group flex gap-4 px-8 py-1.5 transition-all",
      isOwn ? "flex-row-reverse" : "flex-row"
    )}>
      <Avatar className={cn("h-10 w-10 border-2 border-white shadow-sm ring-1 ring-black/5 flex-shrink-0 mt-0.5", isOwn && "hidden")}>
        <AvatarImage src={`${BACKEND_URL}${message.avatar_url}`} />
        <AvatarFallback className={cn("text-xs font-bold", getAvatarColor(message.sender_name))}>{message.sender_initials}</AvatarFallback>
      </Avatar>

      <div className={cn("flex flex-col max-w-[75%]", isOwn ? "items-end" : "items-start")}>
        <div className={cn("flex items-center gap-2 mb-1.5", isOwn ? "flex-row-reverse" : "flex-row")}>
          {!isOwn && <span className="text-[11px] font-black text-foreground uppercase tracking-wider opacity-80">{message.sender_name}</span>}
          <span className="text-[9px] font-bold text-muted-foreground/40 tracking-widest">{format(new Date(message.created_at), "h:mm aa")}</span>
        </div>

        {emojiOnly && !message.file_url ? (
          <div className="text-5xl leading-none py-1">
            {message.text}
          </div>
        ) : (
          <div className={cn(
            "px-5 py-3.5 rounded-3xl text-[13px] leading-relaxed shadow-sm font-medium transition-all",
            isOwn 
              ? "bg-primary text-white rounded-tr-none shadow-primary/20" 
              : "bg-white text-on-surface-variant rounded-tl-none border border-border/30 hover:shadow-md"
          )}>
            {message.text}
          </div>
        )}

        {message.file_url && (
          <FileAttachment 
            fileUrl={message.file_url} 
            fileName={message.file_name} 
            fileSize={message.file_size} 
            fileType={message.file_type} 
          />
        )}
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

  // Layout State
  const [leftPanelOpen, setLeftPanelOpen] = useState(isDesktop);
  const [rightPanelOpen, setRightPanelOpen] = useState(isDesktop);
  const [inputText, setInputText] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [isE2EEnabled, setIsE2EEnabled] = useState(false);
  const [myKeyPair, setMyKeyPair] = useState(null);
  const [orgGifsEnabled, setOrgGifsEnabled] = useState(false);

  // Dialogs
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setForm] = useState({ name: "", description: "", type: "public" });

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Computed
  const joinedChannels = useMemo(() => {
    return channels.filter(ch => ch.is_member);
  }, [channels]);

  const activeChannel = useMemo(() => {
    return [...channels, ...dms].find(c => c.id === activeChannelId);
  }, [channels, dms, activeChannelId]);

  const isActiveDM = useMemo(() => {
    return dms.some(d => d.id === activeChannelId);
  }, [dms, activeChannelId]);

  const currentMessages = useMemo(() => {
    return messages[activeChannelId] || [];
  }, [messages, activeChannelId]);

  // Search Logic
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

  // Sync URL with active channel
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

  // Init crypto and features
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
      } catch (err) { console.error("Chat init failed:", err); }
    };
    init();
  }, [myKeyPair]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentMessages]);

  // Auto-expand textarea logic
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      const scrollHeight = inputRef.current.scrollHeight;
      // 10 lines approx: lineHeight (20px) * 10 + padding (24px) = 224px
      // Using a slightly safer calculation based on actual scrollHeight
      const maxHeight = 224; 
      inputRef.current.style.height = (scrollHeight > maxHeight ? maxHeight : scrollHeight) + "px";
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
    
    // Defer setting cursor until after state update
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(start + emoji.length, start + emoji.length);
      }
    }, 0);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text && !pendingFile) return;
    if (!activeChannelId) return;

    try {
      let payload = { text, is_encrypted: false };
      if (isE2EEnabled && myKeyPair) {
        const keyRes = await chatApi.getChannelMembers(activeChannelId);
        const members = keyRes.data.members || [];
        const recipientKeys = {};
        members.forEach(m => { if (m.public_key) recipientKeys[m.id] = m.public_key; });
        const myPubKey = await crypto.exportPublicKey(myKeyPair.publicKey);
        recipientKeys[user.id] = myPubKey;

        if (Object.keys(recipientKeys).length > 0) {
          const encrypted = await crypto.encryptMessage(text, recipientKeys);
          payload = { text: encrypted.ciphertext, iv: encrypted.iv, encrypted_keys: encrypted.encryptedKeys, is_encrypted: true };
        }
      }
      await sendMessage(activeChannelId, payload.text, null, !isActiveDM, pendingFile, payload);
      setInputText("");
      setPendingFile(null);
    } catch (err) { console.error("Send failed:", err); }
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
      loadChannels(); // Refresh list to update membership
    } catch (err) {
      toast.error("Failed to join channel");
    }
  };

  const handleLeaveChannel = async (id) => {
    if (!confirm(`Are you sure you want to leave this channel?`)) return;
    try {
      await leaveChannel(id);
      toast.success("Left channel");
      loadChannels(); // Refresh list
      if (activeChannelId === id) navigate("/chat");
    } catch (err) {
      toast.error("Failed to leave channel");
    }
  };
  const onChannelClick = (id) => {
    navigate(`/chat/${id}`);
    setActiveChannelId(id);
    setShowDiscovery(false);
  };

return (
  <div className="flex h-full w-full overflow-hidden bg-background">
    {/* 1. SIDEBAR (Left Panel) */}
    <div className="w-[300px] border-r border-border bg-surface-container-low/30 flex flex-col shrink-0 overflow-hidden">
      <div className="p-6 border-b border-border/50 shrink-0 flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold tracking-tight text-primary">Messages</h2>
          <button 
            onClick={() => navigate("/")}
            className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 font-black uppercase tracking-[0.15em] mt-1"
          >
            <LayoutDashboard className="h-2.5 w-2.5" /> Dashboard
          </button>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-all" onClick={() => setShowCreateChannel(true)}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="px-4 py-4 shrink-0">
        <div className="relative group">
          <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input 
            placeholder="Search conversations..." 
            className="pl-10 h-10 bg-surface-container border-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded-xl text-xs font-medium" 
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 pb-6 space-y-6">
          {/* Channels */}
          <div className="space-y-1">
            <div className="px-3 flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Channels</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-5 px-1.5 text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 rounded-md"
                onClick={() => setShowDiscovery(true)}
              >
                Find <Globe className="h-2.5 w-2.5 ml-1" />
              </Button>
            </div>
            {joinedChannels.map(ch => (
              <button
                key={ch.id}
                onClick={() => onChannelClick(ch.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-300 group relative",
                  activeChannelId === ch.id ? "bg-white text-primary shadow-md scale-[1.02] ring-1 ring-black/5" : "text-muted-foreground hover:bg-white/60 hover:text-foreground",
                )}
              >
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all shadow-sm",
                  activeChannelId === ch.id ? "bg-primary text-white" : "bg-surface-container group-hover:bg-white"
                )}>
                  {ch.type === "private" ? <Lock className="h-4.5 w-4.5" /> : <Hash className="h-4.5 w-4.5" />}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[13px] font-bold truncate leading-tight">{ch.name}</p>
                  <p className="text-[10px] opacity-60 truncate mt-0.5 font-medium">{ch.last_message_preview || "No messages yet"}</p>
                </div>
                {unreadCounts[ch.id] > 0 && (
                  <Badge className="ml-auto bg-primary text-white text-[9px] h-4.5 px-1.5 min-w-[18px] justify-center rounded-full border-2 border-white shadow-sm">{unreadCounts[ch.id]}</Badge>
                )}
              </button>
            ))}
          </div>

          {/* Direct Messages */}
          <div className="space-y-1">
            <div className="px-3 flex items-center justify-between mb-3 pt-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Direct Messages</span>
            </div>
            {dms.map(dm => (
              <button
                key={dm.id}
                onClick={() => onChannelClick(dm.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-300 group",
                  activeChannelId === dm.id ? "bg-white text-primary shadow-md scale-[1.02] ring-1 ring-black/5" : "text-muted-foreground hover:bg-white/60 hover:text-foreground"
                )}
              >
                <div className="relative">
                  <Avatar className="h-9 w-9 border-2 border-white shadow-sm ring-1 ring-black/5">
                    <AvatarImage src={`${BACKEND_URL}${dm.avatar_url}`} />
                    <AvatarFallback className={cn("text-[10px] font-bold", getAvatarColor(dm.name))}>{dm.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-white flex items-center justify-center">
                    <div className={cn("w-2 h-2 rounded-full", dm.is_online ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-muted-foreground/30")} />
                  </div>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[13px] font-bold truncate leading-tight">{dm.name}</p>
                  <p className="text-[10px] opacity-60 truncate mt-0.5 font-medium">@{dm.username}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>

    {/* 2. MAIN CHAT AREA (Center Panel) */}
      <div className="flex-1 flex flex-col min-w-0 bg-background relative shadow-2xl z-10">
        {/* Chat Header */}
        <header className="h-20 border-b border-border/40 px-8 flex items-center justify-between bg-white/80 backdrop-blur-xl sticky top-0 z-20">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-primary-fixed/30 flex items-center justify-center shrink-0 shadow-inner">
              {isActiveDM ? (
                <UserCircle className="h-6 w-6 text-primary" />
              ) : (
                <Hash className="h-6 w-6 text-primary" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black truncate flex items-center gap-2 tracking-tight text-foreground">
                {activeChannel?.name || "Select a conversation"}
                {activeChannel?.type === "private" && <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />}
              </h3>
              <p className="text-[11px] text-muted-foreground truncate font-bold uppercase tracking-wider opacity-70">
                {isActiveDM ? "Direct Messaging" : activeChannel?.description || "Professional workspace"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-muted" onClick={() => setRightPanelOpen(!rightPanelOpen)}>
              <Info className={cn("h-5 w-5 transition-colors", rightPanelOpen ? "text-primary" : "text-muted-foreground")} />
            </Button>
          </div>
        </header>

        {/* Messages List */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar bg-[#fcfcfd]">
          <div className="max-w-4xl mx-auto py-10">
            {!activeChannelId && !showDiscovery ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 mt-20">
                <div className="w-24 h-24 rounded-[32px] bg-primary/5 flex items-center justify-center mb-8 animate-pulse">
                  <MessageSquare className="h-12 w-12 text-primary/40" />
                </div>
                <h3 className="text-2xl font-black mb-3 tracking-tight">ShiftMaster Connect</h3>
                <p className="text-muted-foreground max-w-sm text-sm leading-relaxed font-medium opacity-80">
                  Select a team channel or colleague to start a professional conversation.
                </p>
              </div>
            ) : showDiscovery ? (
              <div className="px-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="max-w-2xl mx-auto py-10">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-black tracking-tight">Discover Channels</h2>
                      <p className="text-sm text-muted-foreground font-medium mt-1">Explore public spaces in your organization</p>
                    </div>
                    <Button variant="ghost" onClick={() => setShowDiscovery(false)} className="rounded-xl h-10 px-4">Back to Chat</Button>
                  </div>

                  <div className="relative mb-10 group">
                    <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input 
                      placeholder="Search by channel name or topic..." 
                      className="pl-12 h-12 bg-white border-border/50 focus-visible:ring-primary/20 rounded-2xl text-sm shadow-sm"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {searching ? (
                    <div className="flex justify-center py-20">
                      <Loader2 className="h-8 w-8 text-primary/40 animate-spin" />
                    </div>
                  ) : searchQuery && searchResults.length === 0 ? (
                    <div className="text-center py-20 bg-muted/20 rounded-3xl border-2 border-dashed border-border/50">
                      <p className="text-muted-foreground font-bold">No channels found matching "{searchQuery}"</p>
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="grid gap-4">
                      {searchResults.map(ch => (
                        <div key={ch.id} className="p-6 bg-white rounded-3xl border border-border/50 shadow-sm flex items-center justify-between group hover:border-primary/20 transition-all hover:shadow-md">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-12 h-12 rounded-2xl bg-primary/5 text-primary flex items-center justify-center shrink-0">
                              <Hash className="h-6 w-6" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-base truncate">{ch.name}</h4>
                              <p className="text-xs text-muted-foreground truncate font-medium">{ch.description || "Public team channel"}</p>
                            </div>
                          </div>
                          {ch.is_member ? (
                            <Button variant="ghost" disabled className="rounded-xl h-10 px-6 font-bold text-xs opacity-50">Joined</Button>
                          ) : (
                            <Button onClick={() => handleJoinChannel(ch.id)} className="rounded-xl h-10 px-6 font-bold text-xs shadow-lg shadow-primary/20">Join Channel</Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6 opacity-60">
                      <div className="p-8 rounded-3xl bg-muted/30 border-2 border-dashed border-border/40 flex flex-col items-center text-center gap-3">
                        <Zap className="h-8 w-8 text-muted-foreground" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Type to search</p>
                      </div>
                      <div className="p-8 rounded-3xl bg-muted/30 border-2 border-dashed border-border/40 flex flex-col items-center text-center gap-3">
                        <Globe className="h-8 w-8 text-muted-foreground" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Explore Organization</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : !activeChannel?.is_member && !isActiveDM ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 mt-20 animate-in zoom-in-95 duration-500">
                <div className="w-28 h-28 rounded-[40px] bg-primary/5 flex items-center justify-center mb-8 shadow-inner ring-1 ring-primary/10">
                  <LogIn className="h-12 w-12 text-primary/40" />
                </div>
                <h3 className="text-3xl font-black mb-3 tracking-tight">Join #{activeChannel?.name}</h3>
                <p className="text-muted-foreground max-w-sm text-base mb-8 font-medium leading-relaxed opacity-80">
                  This is a public channel. Join the conversation to participate and view historical messages.
                </p>
                <Button onClick={() => handleJoinChannel(activeChannelId)} className="rounded-2xl h-14 px-12 font-bold text-base shadow-2xl shadow-primary/30 active:scale-95 transition-all">
                  Join Workspace Channel
                </Button>
              </div>
            ) : currentMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 mt-10">
                <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-6">
                  <Clock className="h-8 w-8 text-muted-foreground/20" />
                </div>
                <p className="text-sm font-bold text-muted-foreground/50 uppercase tracking-[0.2em]">Start of conversation</p>
              </div>
            ) : (
              <div className="space-y-1 pb-4">
                {currentMessages.map((msg, idx) => {
                  const prevMsg = currentMessages[idx - 1];
                  const showSep = !prevMsg || !isSameDay(new Date(prevMsg.created_at), new Date(msg.created_at));
                  const isOwn = msg.sender_id === user.id;

                  return (
                    <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                      {showSep && <DaySeparator date={msg.created_at} />}
                      {msg.type === 'system' 
                        ? <SystemEvent message={msg} />
                        : <UserMessageBubble message={msg} isOwn={isOwn} user={user} />
                      }
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-border shrink-0 bg-background">
          <div className="max-w-4xl mx-auto relative">
            <div className="absolute -top-12 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
            
            <div className="relative bg-muted/30 rounded-2xl border border-border/50 focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5 transition-all p-1.5 shadow-sm">
              <div className="flex items-end gap-1.5">
                <div className="flex gap-0.5 pb-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-muted/80" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="h-4.5 w-4.5" />
                  </Button>
                  <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => setPendingFile(e.target.files[0])} />
                  
                  <MediaMenu 
                    onEmojiSelect={handleEmojiSelect}
                    onGifSelect={(gif) => { /* already handled in prev logic */ }}
                    gifsEnabled={orgGifsEnabled}
                  />
                </div>

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
                  placeholder={activeChannel ? `Message #${activeChannel.name}` : "Select a channel"}
                  disabled={!activeChannelId || (activeChannel && !activeChannel.is_member && !isActiveDM)}
                  className="flex-1 min-h-[44px] max-h-[200px] bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm py-3 px-2 resize-none custom-scrollbar"
                />

                <div className="pb-1 pr-1">
                  <Button 
                    size="icon" 
                    onClick={handleSend}
                    disabled={!inputText.trim() && !pendingFile}
                    className="h-9 w-9 rounded-xl shadow-lg shadow-primary/20"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {pendingFile && (
                <div className="m-2 p-3 bg-background/50 rounded-xl border border-border flex items-center gap-3 animate-in slide-in-from-bottom-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{pendingFile.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">{(pendingFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setPendingFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. INFO PANEL (Right Panel) */}
      {rightPanelOpen && activeChannel && (
        <div className="w-[320px] border-l border-border bg-muted/5 flex flex-col shrink-0 overflow-hidden animate-in slide-in-from-right-full duration-300">
          <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">About</h4>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setRightPanelOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-[32px] bg-primary/10 flex items-center justify-center mb-4 ring-8 ring-primary/5">
                {isActiveDM ? (
                  <UserCircle className="h-10 w-10 text-primary" />
                ) : (
                  <Hash className="h-10 w-10 text-primary" />
                )}
              </div>
              <h3 className="text-lg font-bold truncate w-full px-2">{activeChannel.name}</h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                {activeChannel.description || "Connect, collaborate, and share within this space."}
              </p>
            </div>

            <Separator className="mx-6 w-auto opacity-50" />

            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <h5 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Details</h5>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Created {format(new Date(activeChannel.created_at), "MMM d, yyyy")}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span>{activeChannel.members?.length || 0} Members</span>
                  </div>
                </div>
              </div>

              {!isActiveDM && (
                <div className="space-y-3 pt-4 border-t border-border/50">
                  <Button 
                    variant="outline" 
                    className={cn(
                      "w-full justify-start gap-3 h-10 rounded-xl text-xs font-semibold group border-dashed",
                      activeChannel.is_muted && "bg-muted text-muted-foreground"
                    )}
                    onClick={() => muteChannel(activeChannelId, !activeChannel.is_muted)}
                  >
                    <Bell className={cn("h-4 w-4 transition-colors", activeChannel.is_muted ? "text-muted-foreground" : "text-muted-foreground group-hover:text-primary")} />
                    {activeChannel.is_muted ? "Unmute Notifications" : "Mute Notifications"}
                  </Button>
                  
                  {activeChannel.is_member ? (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start gap-3 h-10 rounded-xl text-xs font-semibold group border-dashed text-rose-500 hover:text-rose-600 hover:bg-rose-50 border-rose-100"
                      onClick={() => handleLeaveChannel(activeChannelId)}
                    >
                      <LogOut className="h-4 w-4" />
                      Leave Channel
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start gap-3 h-10 rounded-xl text-xs font-semibold group border-dashed text-primary hover:bg-primary/5 border-primary/20"
                      onClick={() => handleJoinChannel(activeChannelId)}
                    >
                      <LogIn className="h-4 w-4" />
                      Join Channel
                    </Button>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={showCreateChannel} onOpenChange={setShowCreateChannel}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Create Channel
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-6 text-sm font-medium">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input 
                placeholder="e.g. engineering-team" 
                value={createForm.name} 
                onChange={e => setForm({...createForm, name: e.target.value.toLowerCase().replace(/\s+/g, '-')})} 
                className="rounded-xl h-11"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Description (Optional)</Label>
              <Textarea 
                placeholder="What's this channel about?" 
                value={createForm.description} 
                onChange={e => setForm({...createForm, description: e.target.value})} 
                className="rounded-xl min-h-[100px] resize-none"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Channel Type</Label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setForm({ ...createForm, type: "public" })}
                  className={cn(
                    "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left",
                    createForm.type === "public" ? "border-primary bg-primary/5" : "border-border hover:border-border/80 bg-background"
                  )}
                >
                  <div className={cn("p-2 rounded-lg", createForm.type === "public" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                    <Globe className="h-5 w-5" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold">Public</p>
                    <p className="text-[10px] opacity-60 font-medium">Anyone in org can join</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setForm({ ...createForm, type: "private" })}
                  className={cn(
                    "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left",
                    createForm.type === "private" ? "border-primary bg-primary/5" : "border-border hover:border-border/80 bg-background"
                  )}
                >
                  <div className={cn("p-2 rounded-lg", createForm.type === "private" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold">Private</p>
                    <p className="text-[10px] opacity-60 font-medium">Invite only access</p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateChannel(false)} className="rounded-xl h-11">Cancel</Button>
            <Button 
              onClick={handleCreateChannel} 
              disabled={creating || !createForm.name.trim()}
              className="rounded-xl h-11 px-8"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Channel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
