import { useState, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import { orgApi, notificationsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Hash, MessageSquare, Bell, LayoutDashboard, Settings, 
  LogOut, Menu, X, CircleDot, Coffee, Plane, UserCircle
} from "lucide-react";
import { getAvatarColor, cn } from "@/lib/utils";

const BACKEND_URL = import.meta.env.REACT_APP_BACKEND_URL;

export default function ChatLayout() {
  const { user, logout } = useAuth();
  const { totalUnread: chatUnread } = useChat();
  const navigate = useNavigate();
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [orgBrand, setOrgBrand] = useState({ name: "ShiftMaster", logo_url: "" });
  const [mobileSidebar, setMobileSidebar] = useState(false);
  
  useEffect(() => {
    orgApi.get().then(({ data }) => {
      setOrgBrand({ name: data.brand_name || data.name || "ShiftMaster", logo_url: data.logo_url || "" });
    }).catch(() => {});
  }, []);

  // Sync online users via global WS ref exposed by AppLayout (or similar logic)
  useEffect(() => {
    const handlePresence = (e) => {
      if (e.detail?.type === "presence_update") {
        setOnlineUsers(e.detail.online_users || []);
      }
    };
    window.addEventListener("ws:presence", handlePresence);
    return () => window.removeEventListener("ws:presence", handlePresence);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const renderStatusIcon = (status, className = "h-2 w-2") => {
    switch (status) {
      case "active": return <CircleDot className={cn(className, "text-green-500")} />;
      case "break": return <Coffee className={cn(className, "text-yellow-500")} />;
      case "leave": return <Plane className={cn(className, "text-red-400")} />;
      default: return <CircleDot className={cn(className, "text-muted-foreground/40")} />;
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground selection:bg-primary/20">
      {/* 1. App Navigation Rail (Slim Sidebar) */}
      <aside className="w-16 flex flex-col items-center py-4 border-r border-border bg-muted/30 shrink-0 z-50">
        <Link to="/" className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-6 hover:scale-105 transition-transform shadow-lg shadow-primary/20">
          {orgBrand.logo_url ? (
            <img src={orgBrand.logo_url} alt="logo" className="w-full h-full object-cover rounded-xl" />
          ) : (
            <Hash className="h-5 w-5 text-primary-foreground" />
          )}
        </Link>

        <div className="flex-1 w-full flex flex-col items-center gap-4">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => navigate("/")}>
                  <LayoutDashboard className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Dashboard</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon" className="h-10 w-10 rounded-xl relative shadow-sm">
                  <MessageSquare className="h-5 w-5" />
                  {chatUnread > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center animate-in zoom-in">
                      {chatUnread > 9 ? "9+" : chatUnread}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Chat</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => navigate("/settings")}>
                  <Settings className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="mt-auto flex flex-col items-center gap-4">
          <Avatar className="h-10 w-10 ring-2 ring-background border border-border shadow-sm">
            <AvatarImage src={`${BACKEND_URL}${user?.avatar_url}`} />
            <AvatarFallback className={getAvatarColor(user?.full_name)}>{user?.full_name?.charAt(0)}</AvatarFallback>
          </Avatar>
          
          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-destructive" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </aside>

      {/* 2. Main Layout Content (where ChatPage renders) */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <Outlet />
      </main>
    </div>
  );
}
