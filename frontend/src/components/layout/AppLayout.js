import { useState, useEffect, useRef } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ThemeToggle from "@/components/layout/ThemeToggle";
import AnnouncementBanner from "@/components/layout/AnnouncementBanner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notificationsApi, orgApi, usersApi } from "@/lib/api";
import { useChat } from "@/contexts/ChatContext";
import { getAvatarColor, cn } from "@/lib/utils";
import FlipClock from "@/components/ui/flip-clock";
import { UserAvatars } from "@/components/ui/user-avatars";
import { Toggle, GooeyFilter } from "@/components/ui/liquid-toggle";
import {
  LayoutDashboard, Users, Building2, UserCog, CalendarDays,
  ClipboardList, Clock, ArrowLeftRight, StickyNote, Bell,
  BarChart3, ScrollText, Settings, LogOut, Menu, X, Check, LayoutTemplate,
  MessageSquare, Coffee, Plane, CircleDot, UserCircle, Camera, Loader2, ListChecks, FileText
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const BACKEND_URL = import.meta.env.REACT_APP_BACKEND_URL;

export default function AppLayout() {
  const { user, logout, checkAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isFullBleed = location.pathname.startsWith("/chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [attendanceEnabled, setAttendanceEnabled] = useState(false);
  const [chatFeatures, setChatFeatures] = useState({ encryption_enabled: false, gifs_enabled: false, disappearing_mode_enabled: false });
  const [orgBrand, setOrgBrand] = useState({ name: "ShiftRoster", logo_url: "" });
  const wsRef = useRef(null);

  const { totalUnread: chatUnread } = useChat();
  const [myStatus, setMyStatus] = useState("active"); // active | break | leave
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: "", username: "" });
  const [profileAvatar, setProfileAvatar] = useState(""); // current saved avatar
  const [profileAvatarFile, setProfileAvatarFile] = useState(null); // pending file (not yet uploaded)
  const [profileAvatarPreview, setProfileAvatarPreview] = useState(""); // local blob preview
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const profileAvatarRef = useRef(null);
  const isAdmin = user?.system_role === "admin";
  const isManager = user?.system_role === "manager";
  const isEmployee = user?.system_role === "employee";
  const level = user?.employee_level;

  const fetchNotifs = async () => {
    try {
      const { data } = await notificationsApi.list({ unread_only: true });
      setUnreadCount(data.unread_count || 0);
      setNotifications((data.notifications || []).slice(0, 5));
    } catch {}
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    orgApi.get().then(({ data }) => {
      setAttendanceEnabled(!!data.attendance_enabled);
      const logoUrl = data.logo_url || "";
      setOrgBrand({ name: data.brand_name || data.name || "ShiftRoster", logo_url: logoUrl });

      // Update favicon to brand logo, or remove it if no logo
      const link = document.querySelector("link[rel='icon']") || (() => {
        const el = document.createElement("link");
        el.rel = "icon";
        document.head.appendChild(el);
        return el;
      })();
      if (logoUrl) {
        link.href = logoUrl;
        link.type = "image/png";
      } else {
        link.href = "data:,";
      }
    }).catch(() => {});
    return () => clearInterval(interval);
  }, []);

  // WebSocket presence
  useEffect(() => {
    if (!user?.id || !BACKEND_URL) return;
    try {
      const wsUrl = BACKEND_URL.replace(/^http/, "ws") + "/api/ws";
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Expose to ChatPage / ChatContext for typing events (set immediately, before open)
      window._appLayoutWsRef = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ user_id: user.id }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "presence_update") {
            setOnlineUsers(msg.online_users || []);
          } else if (msg.type && msg.type.startsWith("chat_")) {
            // Dispatch to ChatContext via CustomEvent
            window.dispatchEvent(new CustomEvent("ws:chat", { detail: msg }));
          }
        } catch {}
      };

      const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "heartbeat", current_view: window.location.pathname }));
        }
      }, 30000);

      return () => {
        clearInterval(heartbeat);
        ws.close();
        if (window._appLayoutWsRef === ws) {
          window._appLayoutWsRef = null;
        }
      };
    } catch (err) {
      console.error("WebSocket setup failed:", err);
    }
  }, [user?.id]);

  const openProfile = () => {
    setProfileForm({ full_name: user?.full_name || "", username: user?.username || "" });
    setProfileAvatar(user?.avatar_url || "");
    setProfileAvatarFile(null);
    setProfileAvatarPreview("");
    setProfileError("");
    setProfileOpen(true);
  };

  const handleProfileAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileAvatarFile(file);
    setProfileAvatarPreview(URL.createObjectURL(file));
  };

  const handleProfileSave = async () => {
    setProfileError("");
    setProfileSaving(true);
    try {
      // Upload avatar first if a new file was selected
      if (profileAvatarFile) {
        const fd = new FormData();
        fd.append("file", profileAvatarFile);
        await usersApi.uploadAvatar(user.id, fd);
      }
      // Update profile fields
      const payload = {};
      if (profileForm.full_name.trim()) payload.full_name = profileForm.full_name.trim();
      if (profileForm.username.trim()) payload.username = profileForm.username.trim().toLowerCase();
      if (Object.keys(payload).length > 0) {
        await usersApi.update(user.id, payload);
      }
      await checkAuth();
      setProfileOpen(false);
      window.location.reload();
    } catch (err) {
      setProfileError(err?.response?.data?.detail || "Save failed");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleMarkRead = async (id) => {
    try {
      await notificationsApi.markRead(id);
      fetchNotifs();
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      fetchNotifs();
    } catch {}
  };

  const handleSetStatus = (status) => {
    setMyStatus(status);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "set_status", status }));
    }
  };

  const timeAgo = (date) => {
    if (!date) return "";
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", show: true },
    { to: "/shifts", icon: CalendarDays, label: "Shift Calendar", show: true },
    { to: "/employees", icon: Users, label: "Employees", show: isAdmin || isManager },
    { to: "/departments", icon: Building2, label: "Departments", show: isAdmin },
    { to: "/manager-groups", icon: UserCog, label: "Manager Groups", show: isAdmin },
    { to: "/leave", icon: ClipboardList, label: "Leave Management", show: isAdmin || isManager || level !== "L1" },
    { to: "/attendance", icon: Clock, label: "Attendance", show: attendanceEnabled },
    { to: "/swap-requests", icon: ArrowLeftRight, label: "Swap Requests", show: isAdmin || isManager || level !== "L1" },
    { to: "/shift-templates", icon: LayoutTemplate, label: "Shift Templates", show: isAdmin || isManager },
    { to: "/handovers", icon: ClipboardList, label: "Handovers", show: true },
    { to: "/tasks", icon: ListChecks, label: "Tasks", show: true },
    { to: "/sops", icon: FileText, label: "SOPs", show: true },
    { to: "/sticky-notes", icon: StickyNote, label: "Sticky Notes", show: true },
    { to: "/chat", icon: MessageSquare, label: "Chat", show: true, external: true },
    { to: "/notifications", icon: Bell, label: "Notifications", show: true },
    { to: "/reports", icon: BarChart3, label: "Reports", show: isAdmin || isManager },
    { to: "/audit-log", icon: ScrollText, label: "Audit Log", show: isAdmin },
    { to: "/settings", icon: Settings, label: "Settings", show: true },
  ].filter((n) => n.show);

  const initials = user?.full_name
    ? user.full_name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase()
    : "?";

  const roleBadge = isAdmin ? "Admin" : isManager ? "Manager" : level || "Employee";

  // Helper to render status icon
  const renderStatusIcon = (status, className = "h-3.5 w-3.5") => {
    switch (status) {
      case "active":
        return <CircleDot className={cn(className, "text-green-500")} />;
      case "break":
        return <Coffee className={cn(className, "text-yellow-500")} />;
      case "leave":
        return <Plane className={cn(className, "text-red-400")} />;
      default:
        return <CircleDot className={cn(className, "text-muted-foreground/40")} />;
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <GooeyFilter />
      {/* Decorative mesh — provides colour blobs for backdrop-blur to frost against on AMOLED */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vh] rounded-full opacity-0 dark:opacity-100 bg-primary/[0.07] blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50vw] h-[50vh] rounded-full opacity-0 dark:opacity-100 bg-secondary/[0.05] blur-[100px]" />
        <div className="absolute top-[35%] left-[25%] w-[40vw] h-[45vh] rounded-full opacity-0 dark:opacity-100 bg-chart-5/[0.04] blur-[140px]" />
      </div>
      {/* Sidebar */}
      <aside
        data-testid="app-sidebar"
        className={`
          fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border/50 dark:border-white/[0.06]
          bg-[hsl(var(--sidebar-bg))]/80 backdrop-blur-xl transition-all duration-300
          ${sidebarOpen ? "w-64" : "w-16"}
          ${mobileSidebar ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static
        `}
      >
        {/* Logo */}
        <div className="flex flex-row items-center gap-2 px-4 h-14 border-b border-border shrink-0">
          {orgBrand.logo_url && (
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 overflow-hidden">
              <img src={orgBrand.logo_url} alt="logo" className="w-full h-full object-cover rounded-lg" />
            </div>
          )}
          {sidebarOpen && <span className="font-bold text-base tracking-tight truncate">{orgBrand.name}</span>}
        </div>

        {/* Nav & Team Status */}
        <ScrollArea className="flex-1">
          <nav className="py-3 px-2 space-y-0.5">
            {navItems.map((item) => (
              item.external ? (
                <button
                  key={item.to}
                  onClick={() => window.open(item.to, "_blank", "noopener,noreferrer")}
                  className={`w-full flex flex-row items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200 group text-muted-foreground hover:bg-accent hover:text-accent-foreground`}
                >
                  <item.icon className={`h-4 w-4 shrink-0 transition-transform duration-200 ${sidebarOpen ? "" : "mx-auto"} group-hover:scale-110`} />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                  {item.to === "/chat" && chatUnread > 0 && sidebarOpen && (
                    <Badge variant="destructive" className="ml-auto text-[10px] h-5 px-1.5 animate-in zoom-in">{chatUnread > 99 ? "99+" : chatUnread}</Badge>
                  )}
                </button>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setMobileSidebar(false)}
                  className={({ isActive }) =>
                    `flex flex-row items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200 group ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium shadow-sm ring-1 ring-primary/20"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`
                  }
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <item.icon className={`h-4 w-4 shrink-0 transition-transform duration-200 ${sidebarOpen ? "" : "mx-auto"} group-hover:scale-110`} />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                  {item.to === "/notifications" && unreadCount > 0 && sidebarOpen && (
                    <Badge variant="destructive" className="ml-auto text-[10px] h-5 px-1.5 animate-in zoom-in">{unreadCount}</Badge>
                  )}
                  {item.to === "/chat" && chatUnread > 0 && sidebarOpen && (
                    <Badge variant="destructive" className="ml-auto text-[10px] h-5 px-1.5 animate-in zoom-in">{chatUnread > 99 ? "99+" : chatUnread}</Badge>
                  )}
                </NavLink>
              )
            ))}
          </nav>

          {/* Team Status Panel */}
          {sidebarOpen && (
            <div className="flex flex-col border-t border-border/50 min-h-0">
              <div className="px-5 py-3 flex items-center justify-between shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Team Status</span>
                <Badge variant="outline" className="text-[9px] h-4 px-1">{onlineUsers.length}</Badge>
              </div>
              <div className="px-2 pb-4 space-y-0.5">
                {onlineUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-accent/30 transition-colors group">
                    <div className="relative shrink-0">
                      <Avatar className="h-6 w-6">
                        {u.avatar && <AvatarImage src={`${BACKEND_URL || ""}${u.avatar}`} />}
                        <AvatarFallback className={`text-[8px] font-bold ${getAvatarColor(u.name || "User")}`}>
                          {(u.name || "User").split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 bg-[hsl(var(--sidebar-bg))] rounded-full p-0.5">
                        {renderStatusIcon(u.status, "h-2 w-2")}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate leading-none">{u.name || "Unknown User"}</p>
                      <p className="text-[9px] text-muted-foreground truncate mt-1 capitalize">{u.status === "active" ? (u.system_role || "Employee") : `On ${u.status}`}</p>
                    </div>
                  </div>
                ))}
                {onlineUsers.length === 0 && (
                  <div className="px-3 py-4 text-center">
                    <p className="text-[10px] text-muted-foreground italic">No one else online</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </ScrollArea>

        {/* User section */}
        <div className="border-t border-border p-3 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-2 cursor-pointer rounded-md hover:bg-accent/50 px-1 py-1 transition-colors">
                <div className="relative shrink-0">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={`${BACKEND_URL || ""}${user?.avatar_url}`} />
                    <AvatarFallback className={`text-xs font-semibold ${getAvatarColor(user?.username || user?.full_name)}`}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  {/* My own status icon */}
                  <div className="absolute -bottom-1 -right-1 bg-[hsl(var(--sidebar-bg))] rounded-full p-0.5 shadow-sm">
                    {renderStatusIcon(myStatus, "h-2.5 w-2.5")}
                  </div>
                </div>
                {sidebarOpen && (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{user?.full_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate capitalize">
                      {myStatus === "active" ? roleBadge : `On ${myStatus}`}
                    </p>
                  </div>
                )}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-48">
              <DropdownMenuLabel className="text-[11px] text-muted-foreground">Set Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleSetStatus("active")} className={myStatus === "active" ? "text-primary font-medium" : ""}>
                {renderStatusIcon("active", "h-3.5 w-3.5 mr-2 shrink-0")} Active
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSetStatus("break")} className={myStatus === "break" ? "text-primary font-medium" : ""}>
                {renderStatusIcon("break", "h-3.5 w-3.5 mr-2 shrink-0")} On Break
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSetStatus("leave")} className={myStatus === "leave" ? "text-primary font-medium" : ""}>
                {renderStatusIcon("leave", "h-3.5 w-3.5 mr-2 shrink-0")} On Leave
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileSidebar && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setMobileSidebar(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Header */}
        <header
          data-testid="app-header"
          className="h-14 border-b border-border/50 dark:border-white/[0.06] bg-background/60 backdrop-blur-xl flex items-center justify-between px-4 shrink-0 z-20 shadow-sm shadow-black/[0.04]"
        >
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8"
              onClick={() => setMobileSidebar(!mobileSidebar)}
              data-testid="mobile-menu-btn"
            >
              {mobileSidebar ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex h-8 w-8"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              data-testid="sidebar-toggle-btn"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <FlipClock />

            <UserAvatars users={onlineUsers} max={6} />

            {/* Notification Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 relative"
                  data-testid="header-notifications-btn"
                >
                  <Bell className="h-4 w-4" />
                  {(unreadCount + chatUnread) > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                      {(unreadCount + chatUnread) > 9 ? "9+" : (unreadCount + chatUnread)}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0 shadow-xl border-border" align="end">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div>
                    <p className="text-sm font-semibold">Notifications</p>
                    <p className="text-xs text-muted-foreground">{unreadCount + chatUnread} unread</p>
                  </div>
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleMarkAllRead}>
                      <Check className="h-3 w-3 mr-1" /> Mark all read
                    </Button>
                  )}
                </div>
                {chatUnread > 0 && (
                  <div
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer border-b border-border/50 bg-primary/[0.03] transition-colors"
                    onClick={() => navigate("/chat")}
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        {chatUnread} unread chat message{chatUnread > 1 ? "s" : ""}
                        <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Tap to open Messages</p>
                    </div>
                  </div>
                )}
                <div className="max-h-[350px] overflow-y-auto">
                  {notifications.length === 0 && chatUnread === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs">No new notifications</p>
                    </div>
                  ) : notifications.length === 0 ? null : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer border-b border-border/50 last:border-b-0 transition-colors ${
                          !n.is_read ? "bg-primary/[0.02]" : ""
                        }`}
                        onClick={() => !n.is_read && handleMarkRead(n.id)}
                      >
                        <div className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                          !n.is_read ? "bg-primary/10" : "bg-muted"
                        }`}>
                          <Bell className={`h-3.5 w-3.5 ${!n.is_read ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-xs line-clamp-1 ${!n.is_read ? "font-bold text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                            {!n.is_read && <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                          </div>
                          {n.body && <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">{n.body}</p>}
                          <p className="text-[9px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-border px-4 py-2 bg-muted/20">
                  <Button variant="ghost" size="sm" className="w-full text-xs h-8" onClick={() => navigate("/notifications")}>
                    View all notifications
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <ThemeToggle />

            {/* User profile button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={openProfile}>
                    <Avatar className="h-7 w-7 ring-1 ring-border">
                      {user?.avatar_url && (
                        <AvatarImage src={`${BACKEND_URL || ""}${user.avatar_url}`} />
                      )}
                      <AvatarFallback className={`text-[10px] font-semibold ${getAvatarColor(user?.username || user?.full_name)}`}>
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>My Profile</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive transition-colors"
              onClick={handleLogout}
              data-testid="logout-btn"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* My Profile Dialog */}
        <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>My Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={profileAvatarPreview || (profileAvatar ? `${BACKEND_URL || ""}${profileAvatar}` : "")} />
                    <AvatarFallback className={`text-2xl font-semibold ${getAvatarColor(user?.username || user?.full_name)}`}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    onClick={() => profileAvatarRef.current?.click()}
                    className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90"
                  >
                    <Camera className="h-3 w-3" />
                  </button>
                  <input ref={profileAvatarRef} type="file" accept="image/*" className="hidden" onChange={handleProfileAvatarChange} />
                </div>
                <p className="text-xs text-muted-foreground">Click camera to change avatar</p>
              </div>
              {/* Full name */}
              <div className="space-y-1">
                <Label className="text-xs">Full Name</Label>
                <Input
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Your full name"
                />
              </div>
              {/* Username */}
              <div className="space-y-1">
                <Label className="text-xs">Username</Label>
                <Input
                  value={profileForm.username}
                  onChange={(e) => setProfileForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "") }))}
                  placeholder="e.g. john.doe"
                />
                <p className="text-[11px] text-muted-foreground">Used for @mentions and login. Letters, numbers, dots, underscores only.</p>
              </div>
              {profileError && <p className="text-xs text-destructive">{profileError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setProfileOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleProfileSave} disabled={profileSaving}>
                {profileSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Page content */}
        <main className={`flex-1 flex flex-col min-h-0 w-full ${isFullBleed ? "" : "p-0"}`}>
          <div className={`animate-fade-in flex-1 min-h-0 w-full ${isFullBleed ? "overflow-hidden" : "relative overflow-auto p-4 md:p-6 lg:p-8"}`}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
