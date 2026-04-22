import { useState, useEffect } from "react";
import { notificationsApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const { data } = await notificationsApi.list();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleMarkRead = async (id) => {
    try {
      await notificationsApi.markRead(id);
      loadData();
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      loadData();
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

  return (
    <div data-testid="notifications-page" className="space-y-6 dispatch-stagger">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[2rem] leading-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} data-testid="mark-all-read-btn">
            <CheckCheck className="h-4 w-4 mr-1" /> Mark All Read
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : notifications.length === 0 ? (
        <Card className="border">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No notifications yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <Card
              key={n.id}
              className={`border transition-all hover:-translate-y-0.5 cursor-pointer ${!n.is_read ? "bg-primary/[0.03] border-primary/20" : ""}`}
              onClick={() => !n.is_read && handleMarkRead(n.id)}
              data-testid={`notification-${n.id}`}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${!n.is_read ? "bg-primary/10" : "bg-muted"}`}>
                  <Bell className={`h-4 w-4 ${!n.is_read ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm ${!n.is_read ? "font-medium" : ""}`}>{n.title}</p>
                    {!n.is_read && <div className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                  </div>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
