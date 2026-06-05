// client/src/components/Ticker.tsx
// Scrolling announcement banner — add <Ticker /> to dashboard.tsx
// Messages managed from /notifications page by admin

import { useState, useEffect } from "react";
import { Megaphone } from "lucide-react";

interface TickerMessage {
  id: string;
  title: string;
  message: string;
  type: string;
  isTicker?: boolean;
}

const TYPE_BG: Record<string, string> = {
  alert:   "from-red-950  to-red-900  border-red-800  text-red-100",
  warning: "from-amber-950 to-amber-900 border-amber-800 text-amber-100",
  success: "from-green-950 to-green-900 border-green-800 text-green-100",
  info:    "from-blue-950  to-blue-900  border-blue-800  text-blue-100",
};

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
    const interval = setInterval(load, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  // Don't render anything if no ticker messages
  if (loading || messages.length === 0) return null;

  // Pick background based on highest priority type present
  const priority = ["alert","warning","success","info"];
  const topType  = priority.find(t => messages.some(m => m.type === t)) ?? "info";
  const bgClass  = TYPE_BG[topType] ?? TYPE_BG.info;

  // Build ticker text — join all messages with separator
  const tickerText = messages
    .map(m => `${m.title}${m.message ? "  —  " + m.message : ""}`)
    .join("     ★     ");

  return (
    <div className={`w-full border-b bg-gradient-to-r ${bgClass} overflow-hidden`}
      style={{ height: "36px" }}>
      <div className="flex items-center h-full">

        {/* Fixed label */}
        <div className={`flex items-center gap-1.5 px-3 h-full flex-shrink-0
          border-r border-current/20 bg-black/20 text-xs font-bold uppercase tracking-widest`}>
          <Megaphone className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Alerts</span>
        </div>

        {/* Scrolling text */}
        <div className="flex-1 overflow-hidden relative h-full flex items-center">
          <div className="ticker-track flex items-center whitespace-nowrap text-xs font-medium"
            style={{ animation: `ticker-scroll ${Math.max(20, tickerText.length * 0.12)}s linear infinite` }}>
            <span>{tickerText}</span>
            <span className="mx-8 opacity-40">|</span>
            <span>{tickerText}</span>
            <span className="mx-8 opacity-40">|</span>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
        .ticker-track {
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
