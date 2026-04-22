import { useState } from "react";
import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const BACKEND_URL = import.meta.env.REACT_APP_BACKEND_URL;

const AVATAR_SIZE = 28;
const COLLAPSED_STEP = 18;
const EXPANDED_STEP = 34;

const PALETTE = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

function nameColor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return PALETTE[h % PALETTE.length];
}

function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function OnlineAvatar({ user, index, total, expanded }) {
  const x = expanded ? index * EXPANDED_STEP : index * COLLAPSED_STEP;
  const avatarSrc = user.avatar ? `${BACKEND_URL}${user.avatar}` : "";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          className="absolute top-0 left-0 cursor-default"
          style={{ zIndex: total - index }}
          animate={{ x }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
        >
          <Avatar className="ring-2 ring-background" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
            <AvatarImage src={avatarSrc} />
            <AvatarFallback
              className="text-[10px] font-semibold text-white"
              style={{ backgroundColor: nameColor(user.name), fontSize: 10 }}
            >
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          {/* online dot */}
          <span
            className="absolute bottom-0 right-0 rounded-full ring-1 ring-background bg-emerald-400"
            style={{ width: 8, height: 8 }}
          />
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs py-1 px-2">
        <span className="font-medium">{user.name}</span>
        <span className="text-muted-foreground ml-1.5">online</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function UserAvatars({ users = [], max = 5 }) {
  const [expanded, setExpanded] = useState(false);
  const visible = users.slice(0, max);
  const overflow = users.length > max ? users.length - max : 0;
  const count = visible.length + (overflow > 0 ? 1 : 0);

  const containerWidth = expanded
    ? (count - 1) * EXPANDED_STEP + AVATAR_SIZE
    : (count - 1) * COLLAPSED_STEP + AVATAR_SIZE;

  if (users.length === 0) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <motion.div
        className="relative flex items-center"
        style={{ height: AVATAR_SIZE }}
        animate={{ width: containerWidth }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        onHoverStart={() => setExpanded(true)}
        onHoverEnd={() => setExpanded(false)}
      >
        {visible.map((u, i) => (
          <OnlineAvatar
            key={u.id}
            user={u}
            index={i}
            total={count}
            expanded={expanded}
          />
        ))}
        {overflow > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.div
                className="absolute top-0 left-0 cursor-default"
                style={{ zIndex: 0 }}
                animate={{ x: expanded ? visible.length * EXPANDED_STEP : visible.length * COLLAPSED_STEP }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
              >
                <div
                  className="flex items-center justify-center rounded-full ring-2 ring-background bg-muted text-muted-foreground font-semibold"
                  style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, fontSize: 10 }}
                >
                  +{overflow}
                </div>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs py-1 px-2">
              {overflow} more online
            </TooltipContent>
          </Tooltip>
        )}
      </motion.div>
    </TooltipProvider>
  );
}
