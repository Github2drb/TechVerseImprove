// client/src/components/NotifBell.tsx
// Drop-in notification bell for the Header component.
// Usage: import { NotifBell } from "@/components/NotifBell";
//        Then add <NotifBell /> inside your header JSX.

import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Bell } from "lucide-react";

interface Notification {
  id: string; title: string; message: string;
  type: "info"|"success"|"warning"|"alert";
  link?: string; isRead: boolean; createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  info:    "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  success: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  alert:   "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

export function NotifBell() {
  const [open,   setOpen]   = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/notifications");
      if (r.ok) setNotifs(await r.json());
    } catch {}
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = notifs.filter(n => !n.isRead).length;
  const recent = notifs.slice(0, 5);

  const markRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
      setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {}
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-red-500 text-white leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-background border rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>
            ) : recent.map(n => (
              <div
                key={n.id}
                onClick={() => { markRead(n.id); if (n.link) window.location.href = n.link; }}
                className={`px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${!n.isRead ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded ${TYPE_COLORS[n.type] ?? TYPE_COLORS.info}`}>
                    {n.type}
                  </span>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />}
                </div>
                <p className={`text-sm mt-1 ${!n.isRead ? "font-medium text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t px-4 py-2.5">
            <Link href="/notifications" onClick={() => setOpen(false)}
              className="text-xs text-primary hover:underline font-medium">
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
