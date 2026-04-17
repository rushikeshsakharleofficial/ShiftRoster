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
  Paperclip, FileText, Download, Image as ImageIcon, Zap, Info,
  Search as SearchIcon, UserCircle, Settings, Bell, Pin, Clock, AlertCircle, CheckCircle2
} from "lucide-react";
import MediaMenu from "@/components/chat/MediaMenu";
import * as crypto from "@/lib/crypto";
import { format, isSameDay } from "date-fns";

const BACKEND_URL = import.meta.env.REACT_APP_BACKEND_URL;
const MAX_CHARS = 50_000;

// --- Sub-components ---

function DaySeparator({ date }) {
  return (
    <div className="flex items-center my-6 px-4">
      <div className="flex-1 h-px bg-border" />
      <span className="mx-4 text-[11px] font-bold text-muted-foreground bg-background px-2 uppercase tracking-widest">
        {format(new Date(date), "EEEE, MMMM do")}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function FileAttachment({ fileUrl, fileName, fileSize, fileType }) {
  const fullUrl = fileUrl?.startsWith("http") ? fileUrl : `${BACKEND_URL}${fileUrl}`;
  const isImage = fileType?.startsWith("image/");
  return (
    <div className="mt-2 max-w-sm">
      {isImage ? (
        <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="block group relative overflow-hidden rounded-xl border border-border bg-muted/20">
          <img src={fullUrl} alt={fileName} className="max-h-72 w-full object-cover transition-transform group-hover:scale-[1.02]" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
        </a>
      ) : (
        <a
          href={fullUrl}
          download={fileName}
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate text-foreground">{fileName}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-tight font-medium mt-0.5">
              {fileSize ? (fileSize / (1024 * 1024)).toFixed(2) : "0"} MB
            </p>
          </div>
          <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </a>
      )}
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
  } = useChat();

  // Layout State
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [inputText, setInputText] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [isE2EEnabled, setIsE2EEnabled] = useState(false);
  const [myKeyPair, setMyKeyPair] = useState(null);
  const [orgGifsEnabled, setOrgGifsEnabled] = useState(false);
  
  // Dialogs
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [createForm, setForm] = useState({ name: "", description: "", type: "public" });

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Computed
  const activeChannel = useMemo(() => {
    return [...channels, ...dms].find(c => c.id === activeChannelId);
  }, [channels, dms, activeChannelId]);

  const isActiveDM = useMemo(() => {
    return dms.some(d => d.id === activeChannelId);
  }, [dms, activeChannelId]);

  const currentMessages = useMemo(() => {
    return messages[activeChannelId] || [];
  }, [messages, activeChannelId]);

  // Sync URL with active channel
  useEffect(() => {
    if (urlChannelId && urlChannelId !== activeChannelId) {
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
  }, [user.id, myKeyPair]);

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
const onChannelClick = (id) => {
  navigate(`/chat/${id}`);
  setActiveChannelId(id);
};

return (
  <div className="flex h-full w-full overflow-hidden bg-background">
    {/* 1. SIDEBAR (Left Panel) */}
    <div className="w-[300px] border-r border-border bg-muted/10 flex flex-col shrink-0 overflow-hidden">
      <div className="p-4 border-b border-border shrink-0 flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-lg font-bold tracking-tight">Messages</h2>
          <button 
            onClick={() => navigate("/")}
            className="text-[10px] text-primary hover:underline flex items-center gap-1 font-bold uppercase tracking-wider mt-0.5"
          >
            <LayoutDashboard className="h-2.5 w-2.5" /> Back to Dashboard
          </button>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setShowCreateChannel(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="px-4 py-3 shrink-0">
...
          <div className="relative group">
            <SearchIcon className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input placeholder="Search messages..." className="pl-9 h-9 bg-muted/40 border-none focus-visible:ring-1 focus-visible:ring-primary/30 rounded-lg text-xs" />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-3 pb-6 space-y-6 mt-2">
            {/* Channels */}
            <div className="space-y-1">
              <div className="px-3 flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Channels</span>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 opacity-50">{channels.length}</Badge>
              </div>
              {channels.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => onChannelClick(ch.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative",
                    activeChannelId === ch.id ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    activeChannelId === ch.id ? "bg-primary/20" : "bg-muted group-hover:bg-muted-foreground/10"
                  )}>
                    {ch.type === "private" ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-semibold truncate leading-none">{ch.name}</p>
                    <p className="text-[10px] opacity-60 truncate mt-1">{ch.last_message_preview || "No messages yet"}</p>
                  </div>
                  {unreadCounts[ch.id] > 0 && (
                    <Badge variant="destructive" className="ml-auto text-[9px] h-4.5 px-1.5 min-w-[18px] justify-center">{unreadCounts[ch.id]}</Badge>
                  )}
                </button>
              ))}
            </div>

            {/* Direct Messages */}
            <div className="space-y-1">
              <div className="px-3 flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Direct Messages</span>
              </div>
              {dms.map(dm => (
                <button
                  key={dm.id}
                  onClick={() => onChannelClick(dm.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                    activeChannelId === dm.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <div className="relative">
                    <Avatar className="h-8 w-8 border border-border shadow-sm">
                      <AvatarImage src={`${BACKEND_URL}${dm.avatar_url}`} />
                      <AvatarFallback className={cn("text-[10px]", getAvatarColor(dm.name))}>{dm.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-background border-2 border-background">
                      <div className={cn("w-full h-full rounded-full", dm.is_online ? "bg-green-500" : "bg-muted-foreground/30")} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-semibold truncate leading-none">{dm.name}</p>
                    <p className="text-[10px] opacity-60 truncate mt-1">@{dm.username}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* 2. MAIN CHAT AREA (Center Panel) */}
      <div className="flex-1 flex flex-col min-w-0 bg-background relative">
        {/* Chat Header */}
        <header className="h-16 border-b border-border px-6 flex items-center justify-between bg-background/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
              {isActiveDM ? (
                <UserCircle className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Hash className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate flex items-center gap-2">
                {activeChannel?.name || "Select a conversation"}
                {activeChannel?.type === "private" && <Lock className="h-3 w-3 text-muted-foreground" />}
              </h3>
              <p className="text-[10px] text-muted-foreground truncate font-medium">
                {isActiveDM ? "Direct Message" : activeChannel?.description || "No topic set"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => setRightPanelOpen(!rightPanelOpen)}>
              <Info className={cn("h-5 w-5 transition-colors", rightPanelOpen ? "text-primary" : "text-muted-foreground")} />
            </Button>
          </div>
        </header>

        {/* Messages List */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar">
          <div className="max-w-4xl mx-auto py-8">
            {!activeChannelId ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 mt-20">
                <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
                  <MessageSquare className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-2">Welcome to ShiftMaster Chat</h3>
                <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
                  Connect with your team instantly. Choose a channel from the left to start messaging.
                </p>
              </div>
            ) : currentMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 mt-10">
                <AlertCircle className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-sm font-medium text-muted-foreground">This is the start of the conversation.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {currentMessages.map((msg, idx) => {
                  const prevMsg = currentMessages[idx - 1];
                  const showSep = !prevMsg || !isSameDay(new Date(prevMsg.created_at), new Date(msg.created_at));
                  const isOwn = msg.sender_id === user.id;
                  
                  return (
                    <div key={msg.id}>
                      {showSep && <DaySeparator date={msg.created_at} />}
                      <div className={cn(
                        "group flex gap-4 px-6 py-2 transition-colors",
                        isOwn ? "hover:bg-primary/[0.02]" : "hover:bg-muted/50"
                      )}>
                        <Avatar className="h-9 w-9 border border-border mt-0.5">
                          <AvatarImage src={`${BACKEND_URL}${msg.avatar_url}`} />
                          <AvatarFallback className={getAvatarColor(msg.sender_name)}>{msg.sender_initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[13px] font-bold text-foreground cursor-pointer hover:underline">
                              {msg.sender_name}
                            </span>
                            <span className="text-[10px] font-medium text-muted-foreground/60">
                              {format(new Date(msg.created_at), "h:mm aa")}
                            </span>
                          </div>
                          <div className="text-sm text-foreground/90 leading-relaxed break-words whitespace-pre-wrap">
                            {msg.text}
                          </div>
                          {msg.file_url && (
                            <FileAttachment 
                              fileUrl={msg.file_url} 
                              fileName={msg.file_name} 
                              fileSize={msg.file_size} 
                              fileType={msg.file_type} 
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-6 border-t border-border shrink-0 bg-background">
          <div className="max-w-4xl mx-auto relative">
            <div className="absolute -top-12 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
            
            <div className="relative bg-muted/30 rounded-2xl border border-border/50 focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5 transition-all p-1.5 shadow-sm">
              <div className="flex items-end gap-1.5">
                <div className="flex gap-0.5 pb-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-muted/80" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="h-4.5 w-4.5" />
                  </Button>
                  <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => setPendingFile(e.target.files[0])} />
                  
                  {orgGifsEnabled && (
                    <MediaMenu 
                      onEmojiSelect={(emoji) => setInputText(prev => prev + emoji)}
                      onGifSelect={(gif) => { /* already handled in prev logic */ }}
                    />
                  )}
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
                  placeholder={activeChannel ? `Message ${activeChannel.name}` : "Select a channel to chat"}
                  disabled={!activeChannelId}
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
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-3 h-10 rounded-xl text-xs font-semibold group border-dashed text-rose-500 hover:text-rose-600 hover:bg-rose-50 border-rose-100"
                  onClick={async () => {
                    if (confirm(`Are you sure you want to leave #${activeChannel.name}?`)) {
                      await leaveChannel(activeChannelId);
                      navigate("/chat");
                    }
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Leave Channel
                </Button>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={showCreateChannel} onOpenChange={setShowCreateChannel}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Channel</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4 text-sm font-medium">
            <div className="space-y-1.5"><Input placeholder="channel-name" value={createForm.name} onChange={e => setForm({...createForm, name: e.target.value.toLowerCase().replace(/\s+/g, '-')})} /></div>
            <div className="space-y-1.5"><Textarea placeholder="What's this channel about?" value={createForm.description} onChange={e => setForm({...createForm, description: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateChannel(false)}>Cancel</Button>
            <Button onClick={async () => { await createChannel(createForm); setShowCreateChannel(false); }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
