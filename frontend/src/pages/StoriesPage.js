import { useAuth } from "@/contexts/AuthContext";
import { StoryStrip } from "@/components/chat/StoryStrip.jsx";

export default function StoriesPage() {
  const { user } = useAuth();
  return (
    <div className="flex-1 flex flex-col min-h-0 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight font-heading">Stories</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Share moments with your team — disappear after 24 hours</p>
      </div>
      <div className="flex-1 min-h-0">
        <StoryStrip currentUser={user} expanded />
      </div>
    </div>
  );
}
