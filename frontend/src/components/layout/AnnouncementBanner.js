import { useState, useEffect } from "react";
import { announcementsApi } from "@/lib/api";
import { AlertCircle, Info, X, Megaphone, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fetchActive = async () => {
      try {
        const { data } = await announcementsApi.listActive();
        setAnnouncements(data || []);
      } catch (err) {
        console.error("Failed to fetch announcements:", err);
      }
    };
    fetchActive();
    // Refresh every 5 minutes
    const interval = setInterval(fetchActive, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!visible || announcements.length === 0) return null;

  const current = announcements[currentIndex];

  const getLevelStyles = (level) => {
    switch (level) {
      case "critical": return "bg-destructive text-destructive-foreground border-destructive/20";
      case "warning": return "bg-amber-500 text-amber-950 border-amber-600/20";
      case "success": return "bg-emerald-500 text-emerald-950 border-emerald-600/20";
      default: return "bg-primary text-primary-foreground border-primary/20";
    }
  };

  const getIcon = (level) => {
    switch (level) {
      case "critical": return <AlertCircle className="h-4 w-4" />;
      case "warning": return <AlertTriangle className="h-4 w-4" />;
      case "success": return <CheckCircle2 className="h-4 w-4" />;
      default: return <Megaphone className="h-4 w-4" />;
    }
  };

  return (
    <div className={cn(
      "relative w-full border-b px-4 py-2 flex items-center justify-between transition-all animate-in slide-in-from-top duration-500",
      getLevelStyles(current.level)
    )}>
      <div className="flex-1 flex items-center justify-center gap-3 px-8">
        <div className="flex items-center gap-2 font-bold text-sm uppercase tracking-tight shrink-0">
          {getIcon(current.level)}
          <span>{current.title}:</span>
        </div>
        <p className="text-sm font-medium line-clamp-1">{current.content}</p>
        
        {announcements.length > 1 && (
          <div className="flex items-center gap-1.5 ml-4">
            <span className="text-[10px] opacity-70">{currentIndex + 1} / {announcements.length}</span>
            <button 
              onClick={() => setCurrentIndex((currentIndex + 1) % announcements.length)}
              className="text-[10px] hover:underline font-bold"
            >
              Next
            </button>
          </div>
        )}
      </div>
      
      <button 
        onClick={() => setVisible(false)}
        className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
