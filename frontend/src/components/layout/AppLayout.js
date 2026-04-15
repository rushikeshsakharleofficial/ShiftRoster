import { useState, useEffect, useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { notificationsApi, orgApi } from "@/lib/api";
import {
  LayoutDashboard, Users, Building2, UserCog, CalendarDays,
  ClipboardList, Clock, ArrowLeftRight, StickyNote, Bell,
  BarChart3, ScrollText, Settings, LogOut, Menu, X, Check, LayoutTemplate
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [attendanceEnabled, setAttendanceEnabled] = useState(false);
  const wsRef = useRef(null);

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
    orgApi.get().then(({ data }) => setAttendanceEnabled(!!data.attendance_enabled)).catch(() => {});
    return () => clearInterval(interval);
  }, []);

  // WebSocket presence
  useEffect(() => {
    if (!user?.id) return;
    const wsUrl = BACKEND_URL.replace(/^http/, "ws") + "/api/ws";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ user_id: user.id }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "presence_update") {
          setOnlineUsers(msg.online_users || []);
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
    };
  }, [user?.id]);

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
    { to: "/sticky-notes", icon: StickyNote, label: "Sticky Notes", show: true },
    { to: "/notifications", icon: Bell, label: "Notifications", show: true },
    { to: "/reports", icon: BarChart3, label: "Reports", show: isAdmin || isManager },
    { to: "/audit-log", icon: ScrollText, label: "Audit Log", show: isAdmin },
    { to: "/settings", icon: Settings, label: "Settings", show: isAdmin || isManager },
  ].filter((n) => n.show);

  const initials = user?.full_name
    ? user.full_name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase()
    : "?";

  const roleBadge = isAdmin ? "Admin" : isManager ? "Manager" : level || "Employee";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        data-testid="app-sidebar"
        className={`
          fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border
          bg-[hsl(var(--sidebar-bg))] transition-all duration-300
          ${sidebarOpen ? "w-60" : "w-16"}
          ${mobileSidebar ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static
        `}
      >
        {/* Logo */}
        <div className="flex flex-row items-center gap-2 px-4 h-14 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <CalendarDays className="h-4 w-4 text-primary-foreground" />
          </div>
          {sidebarOpen && <span className="font-semibold text-sm tracking-tight truncate">ShiftRoster</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => (
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
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-border p-3 shrink-0">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{user?.full_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{roleBadge}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileSidebar && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setMobileSidebar(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          data-testid="app-header"
          className="glass-header h-14 border-b border-border bg-background/70 flex items-center justify-between px-4 shrink-0 z-20"
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
            {/* Online Presence Avatars */}
            <TooltipProvider>
              <div className="hidden md:flex items-center -space-x-2" data-testid="presence-bar">
                {onlineUsers.slice(0, 8).map((ou) => {
                  const uInitials = ou.name
                    ? ou.name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase()
                    : "?";
                  return (
                    <Tooltip key={ou.id}>
                      <TooltipTrigger>
                        <div className="relative">
                          <Avatar className="h-7 w-7 border-2 border-background">
                            <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                              {uInitials}
                            </AvatarFallback>
                          </Avatar>
                          <span className={`presence-dot ${ou.status === "active" ? "active" : ou.status === "idle" ? "idle" : "away"}`} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{ou.name} — {ou.system_role}{ou.view ? ` — viewing ${ou.view}` : ""}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
                {onlineUsers.length > 8 && (
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium border-2 border-background">
                    +{onlineUsers.length - 8}
                  </div>
                )}
              </div>
            </TooltipProvider>

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
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <div>
                    <p className="text-sm font-semibold">Notifications</p>
                    <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
                  </div>
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleMarkAllRead}>
                      <Check className="h-3 w-3 mr-1" /> Mark all read
                    </Button>
                  )}
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground">
                      <Bell className="h-6 w-6 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">No notifications</p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer border-b last:border-b-0 transition-colors ${
                          !n.is_read ? "bg-primary/[0.03]" : ""
                        }`}
                        onClick={() => !n.is_read && handleMarkRead(n.id)}
                      >
                        <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                          !n.is_read ? "bg-primary/10" : "bg-muted"
                        }`}>
                          <Bell className={`h-3 w-3 ${!n.is_read ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-xs line-clamp-1 ${!n.is_read ? "font-medium" : ""}`}>{n.title}</p>
                            {!n.is_read && <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                          </div>
                          {n.body && <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{n.body}</p>}
                          <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t px-4 py-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => navigate("/notifications")}>
                    View all notifications
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <ThemeToggle />

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={handleLogout}
              data-testid="logout-btn"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
