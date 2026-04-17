import { Outlet } from "react-router-dom";
import { GooeyFilter } from "@/components/ui/liquid-toggle";

export default function ChatLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground selection:bg-primary/20">
      <GooeyFilter />
      {/* 1. Main Layout Content (where ChatPage renders) */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <Outlet />
      </main>
    </div>
  );
}
