import { useState, useEffect, useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { notificationsApi } from "@/lib/api";
import {
  LayoutDashboard, Users, Building2, UserCog, CalendarDays,
  ClipboardList, Clock, ArrowLeftRight, StickyNote, Bell,
  BarChart3, ScrollText, Settings, LogOut, Menu, X, ChevronDown
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const wsRef = useRef(null);

  const isAdmin = user?.system_role === "admin";
  const isManager = user?.system_role === "manager";
  const isEmployee = user?.system_role === "employee";
  const level = user?.employee_level;

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const { data } = await notificationsApi.list({ unread_only: true });
        setUnreadCount(data.unread_count || 0);
      } catch {}
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
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

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", show: true },
    { to: "/shifts", icon: CalendarDays, label: "Shift Calendar", show: true },
    { to: "/employees", icon: Users, label: "Employees", show: isAdmin || isManager },
    { to: "/departments", icon: Building2, label: "Departments", show: isAdmin },
    { to: "/manager-groups", icon: UserCog, label: "Manager Groups", show: isAdmin },
    { to: "/leave", icon: ClipboardList, label: "Leave Management", show: isAdmin || isManager || level !== "L1" },
    { to: "/attendance", icon: Clock, label: "Attendance", show: true },
    { to: "/swap-requests", icon: ArrowLeftRight, label: "Swap Requests", show: isAdmin || isManager || level !== "L1" },
    { to: "/notifications", icon: Bell, label: "Notifications", show: true },
    { to: "/reports", icon: BarChart3, label: "Reports", show: isAdmin || isManager },
    { to: "/audit-log", icon: ScrollText, label: "Audit Log", show: isAdmin },
    { to: "/settings", icon: Settings, label: "Settings", show: isAdmin },
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
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <CalendarDays className="h-4 w-4 text-primary-foreground" />
          </div>
          {sidebarOpen && <span className="font-semibold text-sm tracking-tight">ShiftMaster</span>}
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
                `sidebar-link ${isActive ? "active" : "text-[hsl(var(--sidebar-text))]"}`
              }
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
              {item.to === "/notifications" && unreadCount > 0 && sidebarOpen && (
                <Badge variant="destructive" className="ml-auto text-[10px] h-5 px-1.5">{unreadCount}</Badge>
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

            {/* Notifications */}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 relative"
              onClick={() => navigate("/notifications")}
              data-testid="header-notifications-btn"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>

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
