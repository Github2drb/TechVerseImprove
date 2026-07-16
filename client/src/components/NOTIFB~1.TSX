// client/src/components/NotifBell.tsx
import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Bell } from "lucide-react";

interface Notification {
  id: string; title: string; message: string;
  type: string; link?: string; isRead: boolean; createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  info:    "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  success: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  alert:   "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

// Get current logged-in user from all auth sources
function getCurrentUser(): string {
  try {
    const adminName = sessionStorage.getItem("drb_admin_name");
    if (adminName) return adminName.toLowerCase();
    for (const key of ["user","currentUser","auth","drb_user","session","authUser"]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const obj = JSON.parse(raw);
      if (obj?.username) return obj.username.toLowerCase();
      if (obj?.name)     return obj.name.toLowerCase().replace(/\s+/g,"-");
    }
  } catch {}
  let id = localStorage.getItem("drb_device_id");
  if (!id) { id = "device-" + (len => { const a = new Uint8Array(len); crypto.getRandomValues(a); return Array.from(a, b => (b % 36).toString(36)).join(""); })(9); localStorage.setItem("drb_device_id", id); }
  return id;
}

export function NotifBell() {
  const [open,   setOpen]   = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const user = getCurrentUser();
      const r = await fetch("/api/notifications", {
        headers: { "x-current-user": user },
      });
      if (r.ok) setNotifs(await r.json());
    } catch {}
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  // Re-check user when sessionStorage changes (login/logout)
  useEffect(() => {
    const onStorage = () => load();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
    const user = getCurrentUser();
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: { "x-current-user": user },
      });
      setNotifs(prev => prev.map(n => n.id===id ? {...n, isRead:true} : n));
    } catch {}
  };

  const markAllRead = async () => {
    const user = getCurrentUser();
    try {
      await fetch("/api/notifications/read-all", {
        method: "PATCH",
        headers: { "x-current-user": user },
      });
      setNotifs(prev => prev.map(n => ({...n, isRead:true})));
    } catch {}
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        aria-label={`Notifications — ${unread} unread for ${getCurrentUser()}`}
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center
            min-w-[16px] h-4 px-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-background border rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <span className="text-sm font-semibold">Notifications</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Showing for: <span className="font-medium text-primary">{getCurrentUser()}</span>
              </p>
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>
            ) : recent.map(n => (
              <div key={n.id}
                onClick={() => { markRead(n.id); if (n.link) window.location.href = n.link; }}
                className={`px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors
                  ${!n.isRead ? "bg-primary/5" : ""}`}>
                <div className="flex items-start gap-2 mb-1">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TYPE_COLORS[n.type] ?? TYPE_COLORS.info}`}>
                    {n.type}
                  </span>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />}
                  <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(n.createdAt)}</span>
                </div>
                <p className={`text-sm leading-snug ${!n.isRead ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                  {n.title}
                </p>
                {n.message && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{n.message}</p>
                )}
              </div>
            ))}
          </div>

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
