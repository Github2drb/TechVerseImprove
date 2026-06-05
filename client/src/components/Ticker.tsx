// client/src/components/Ticker.tsx
// Add <Ticker /> to dashboard.tsx just below <Header />
// Messages managed from /notifications page — click 📢 Ticker button on any notification

import { useState, useEffect } from "react";
import { Megaphone } from "lucide-react";

interface TickerMessage {
  id:       string;
  title:    string;
  message:  string;
  type:     string;
  isTicker?: boolean;
}

// Per-type text + background colors for each message pill
const TYPE_COLORS: Record<string, { text: string; bg: string; dot: string }> = {
  alert:   { text:"text-red-100",    bg:"bg-red-700",    dot:"🔴" },
  warning: { text:"text-amber-100",  bg:"bg-amber-600",  dot:"🟡" },
  success: { text:"text-green-100",  bg:"bg-green-700",  dot:"🟢" },
  info:    { text:"text-blue-100",   bg:"bg-blue-700",   dot:"🔵" },
};

// Banner background — use highest priority type present
const BANNER_BG: Record<string, string> = {
  alert:   "bg-slate-900 border-red-800",
  warning: "bg-slate-900 border-amber-800",
  success: "bg-slate-900 border-green-800",
  info:    "bg-slate-900 border-blue-800",
};

const PRIORITY = ["alert","warning","success","info"];

export function Ticker() {
  const [messages, setMessages] = useState<TickerMessage[]>([]);
  const [loading,  setLoading]  = useState(true);

  const load = async () => {
    try {
      const r = await fetch("/api/notifications");
      if (!r.ok) return;
      const all: TickerMessage[] = await r.json();
      setMessages(all.filter(n => n.isTicker === true));
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  if (loading || messages.length === 0) return null;

  const topType  = PRIORITY.find(t => messages.some(m => m.type === t)) ?? "info";
  const bannerBg = BANNER_BG[topType] ?? BANNER_BG.info;

  // Render each message as a colored pill — duplicated for seamless loop
  const renderMessages = () =>
    messages.map((m, i) => {
      const c   = TYPE_COLORS[m.type] ?? TYPE_COLORS.info;
      const sep = i < messages.length - 1;
      return (
        <span key={m.id} className="inline-flex items-center gap-2 mx-3">
          {/* Colored pill for this message */}
          <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
            <span>{c.dot}</span>
            <span>{m.title}</span>
            {m.message && (
              <span className="opacity-80 font-normal">— {m.message}</span>
            )}
          </span>
          {/* Separator between messages */}
          {sep && <span className="text-slate-600 font-bold text-sm select-none">◆</span>}
        </span>
      );
    });

  // Calculate scroll duration based on total content length
  const totalChars = messages.reduce((s, m) => s + m.title.length + (m.message?.length ?? 0), 0);
  const duration   = Math.max(25, totalChars * 0.15);

  return (
    <div className={`w-full border-b ${bannerBg} overflow-hidden`} style={{ height:"40px" }}>
      <div className="flex items-center h-full">

        {/* Fixed label */}
        <div className="flex items-center gap-2 px-3 h-full flex-shrink-0
          border-r border-slate-700 bg-slate-800 text-slate-300 text-xs font-bold uppercase tracking-widest">
          <Megaphone className="h-3.5 w-3.5 text-amber-400"/>
          <span className="hidden sm:inline text-amber-400">Live</span>
        </div>

        {/* Scrolling strip */}
        <div className="flex-1 overflow-hidden relative h-full flex items-center">
          <div
            className="ticker-track flex items-center whitespace-nowrap"
            style={{ animation:`ticker-scroll ${duration}s linear infinite` }}>
            {/* First copy */}
            {renderMessages()}
            {/* Duplicate for seamless loop */}
            <span className="inline-block w-24"/>
            {renderMessages()}
            <span className="inline-block w-24"/>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
        .ticker-track { will-change: transform; }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>
    </div>
  );
}
