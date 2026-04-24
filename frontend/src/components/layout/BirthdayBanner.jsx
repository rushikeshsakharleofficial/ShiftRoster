import { X } from "lucide-react";

export default function BirthdayBanner({ user, onDismiss }) {
  const firstName = user?.full_name?.split(" ")[0] || user?.username || "there";

  return (
    <div
      className="relative w-full flex items-center justify-between px-4 py-2.5 overflow-hidden"
      style={{
        background: "linear-gradient(90deg, #f472b6 0%, #fbbf24 40%, #f472b6 80%, #fbbf24 100%)",
        backgroundSize: "200% 100%",
      }}
    >
      {/* Animated background shimmer */}
      <style>{`
        @keyframes birthdayShimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .birthday-shimmer {
          animation: birthdayShimmer 4s linear infinite;
          background: linear-gradient(90deg, #f472b6 0%, #fbbf24 33%, #f472b6 66%, #fbbf24 100%);
          background-size: 200% 100%;
        }
      `}</style>

      <div className="birthday-shimmer absolute inset-0 pointer-events-none" />

      <div className="relative flex-1 flex items-center justify-center gap-3">
        {/* Left balloons */}
        <span className="birthday-balloon text-xl select-none" aria-hidden="true">🎈</span>
        <span className="birthday-balloon text-xl select-none" style={{ animationDelay: "0.3s" }} aria-hidden="true">🎉</span>

        <p className="text-sm font-semibold text-white drop-shadow-sm text-center">
          Happy Birthday, {firstName}! 🎂 Wishing you an amazing day!
        </p>

        {/* Right balloons */}
        <span className="birthday-balloon text-xl select-none" style={{ animationDelay: "0.6s" }} aria-hidden="true">🎂</span>
        <span className="birthday-balloon text-xl select-none" style={{ animationDelay: "0.9s" }} aria-hidden="true">🎈</span>
      </div>

      <button
        type="button"
        aria-label="Dismiss birthday banner"
        onClick={onDismiss}
        className="relative shrink-0 ml-2 h-6 w-6 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
