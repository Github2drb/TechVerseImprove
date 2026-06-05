// client/src/pages/notifications.tsx
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bell, Plus, Trash2, CheckCheck, X, Lock, Unlock, Megaphone } from "lucide-react";

interface Notification {
  id: string; title: string; message: string;
  type: "info"|"success"|"warning"|"alert";
  link?: string; isRead: boolean; author: string; createdAt: string;
  isTicker?: boolean;
}

const TYPE_STYLE: Record<string, { badge:string; bar:string }> = {
  info:    { badge:"bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",   bar:"bg-blue-500"  },
  success: { badge:"bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",bar:"bg-green-500" },
  warning: { badge:"bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",bar:"bg-amber-500" },
  alert:   { badge:"bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",       bar:"bg-red-500"   },
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff/60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)} hours ago`;
  return new Date(iso).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
}

function getAdminHeader(): string {
  try {
    if (sessionStorage.getItem("drb_admin") !== "1") return "";
    const name = sessionStorage.getItem("drb_admin_name") ?? "admin";
    return btoa(JSON.stringify({ username: name.toLowerCase(), role:"admin" }));
  } catch { return ""; }
}
function isAdminSession(): boolean {
  // Check daily-report admin session
  if (sessionStorage.getItem("drb_admin") === "1") return true;
  // Check main app auth (stored in localStorage by the main login)
  try {
    const keys = ["user","currentUser","auth","drb_user","session"];
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const obj = JSON.parse(raw);
      if (obj?.role === "admin" || obj?.username?.toLowerCase() === "admin") return true;
    }
  } catch {}
  return false;
}

const EMPTY_NOTIF = { title:"", message:"", type:"info" as const, link:"" };

export default function NotificationsPage() {
  const [notifs,  setNotifs]  = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string|null>(null);
  const [compose, setCompose] = useState(false);
  const [draft,   setDraft]   = useState({ ...EMPTY_NOTIF });
  const [sending, setSending] = useState(false);
  const [filter,      setFilter]      = useState<"all"|"unread">("all");
  const [adminMode,   setAdminMode]   = useState(isAdminSession());
  const [showLogin,   setShowLogin]   = useState(false);
  const [loginUser,   setLoginUser]   = useState("");
  const [loginPass,   setLoginPass]   = useState("");
  const [loginErr,    setLoginErr]    = useState(false);
  const [loginLoading,setLoginLoading]= useState(false);
  const [adminUsers,  setAdminUsers]  = useState<{username:string;password:string;name?:string}[]>([]);

  const loadAdmins = async () => {
    setLoginLoading(true);
    try {
      const r = await fetch("https://raw.githubusercontent.com/Github2drb/Controls_Team_Tracker/main/engineers_auth.json?t="+Date.now());
      const data = await r.json();
      const list = data.engineers || data;
      const admins = list.filter((u:any) => u.role === "admin" && u.isActive !== false);
      setAdminUsers(admins.length ? admins : [{username:"admin",password:"admin@drb",name:"Admin"}]);
    } catch {
      setAdminUsers([{username:"admin",password:"admin@drb",name:"Admin"}]);
    } finally { setLoginLoading(false); }
  };

  const submitLogin = () => {
    const un = loginUser.trim().toLowerCase();
    const pw = loginPass;
    const match = adminUsers.find(u => u.username.toLowerCase()===un && u.password===pw);
    if (match) {
      sessionStorage.setItem("drb_admin","1");
      sessionStorage.setItem("drb_admin_name", match.name||match.username);
      setAdminMode(true);
      setShowLogin(false);
      setLoginUser(""); setLoginPass(""); setLoginErr(false);
    } else {
      setLoginErr(true); setLoginPass("");
    }
  };

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/notifications");
      if (!r.ok) throw new Error("HTTP " + r.status);
      setNotifs(await r.json());
    } catch(e:any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method:"PATCH" });
    setNotifs(prev => prev.map(n => n.id===id ? {...n, isRead:true} : n));
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", { method:"PATCH" });
    setNotifs(prev => prev.map(n => ({...n, isRead:true})));
  };

  const deleteNotif = async (id: string) => {
    await fetch(`/api/notifications/${id}`, {
      method:"DELETE", headers:{"x-admin-auth": getAdminHeader()},
    });
    setNotifs(prev => prev.filter(n => n.id !== id));
  };

  const toggleTicker = async (id: string, current: boolean) => {
    try {
      await fetch(`/api/notifications/${id}/ticker`, {
        method: "PATCH",
        headers: { "Content-Type":"application/json", "x-admin-auth": getAdminHeader() },
        body: JSON.stringify({ isTicker: !current }),
      });
      setNotifs(prev => prev.map(n => n.id===id ? {...n, isTicker: !current} : n));
    } catch(e:any) { alert("Failed: "+e.message); }
  };

  const send = async () => {
    if (!draft.title.trim() || !draft.message.trim()) return alert("Title and message are required");
    setSending(true);
    try {
      const r = await fetch("/api/notifications", {
        method:"POST",
        headers:{"Content-Type":"application/json","x-admin-auth": getAdminHeader()},
        body: JSON.stringify({ ...draft, author: sessionStorage.getItem("drb_admin_name")??"Admin" }),
      });
      if (!r.ok) { const j = await r.json(); throw new Error(j.message ?? "Failed"); }
      setCompose(false); setDraft({ ...EMPTY_NOTIF });
      await load();
    } catch(e:any) { alert("Failed: " + e.message); }
    finally { setSending(false); }
  };

  const displayed = filter === "unread" ? notifs.filter(n => !n.isRead) : notifs;
  const unreadCount = notifs.filter(n => !n.isRead).length;

  return (
    <>
      <Header searchQuery="" onSearchChange={()=>{}} />
      <main className="mx-auto max-w-2xl px-4 py-8 md:px-6 space-y-5">

        {/* Page header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
              <Bell className="h-7 w-7" /> Notifications
            </h1>
            <p className="text-muted-foreground text-sm">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={markAllRead} className="gap-2">
                <CheckCheck className="h-4 w-4" /> Mark all read
              </Button>
            )}
            {adminMode ? (
              <>
                <Button size="sm" onClick={() => setCompose(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> New notification
                </Button>
                <Button variant="destructive" size="sm" onClick={() => {
                  sessionStorage.removeItem("drb_admin");
                  setAdminMode(false);
                }}>Lock</Button>
              </>
            ) : (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                setShowLogin(true); setLoginErr(false); loadAdmins();
              }}>
                <Lock className="h-4 w-4" /> Admin Mode
              </Button>
            )}
            <Link href="/"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4"/></Button></Link>
          </div>
        </div>

        {/* Admin login modal */}
        {showLogin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background border rounded-xl shadow-2xl p-6 w-80 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4" /> Admin Login
              </h2>
              {loginLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"/>Loading…
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Username</label>
                    <input type="text" placeholder="e.g. admin" value={loginUser} autoFocus
                      onChange={e=>{setLoginUser(e.target.value);setLoginErr(false);}}
                      onKeyDown={e=>e.key==="Enter"&&submitLogin()}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Password</label>
                    <input type="password" placeholder="Enter password" value={loginPass}
                      onChange={e=>{setLoginPass(e.target.value);setLoginErr(false);}}
                      onKeyDown={e=>e.key==="Enter"&&submitLogin()}
                      className={`w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary ${loginErr?"border-red-500":"border-input"}`} />
                  </div>
                  {loginErr && <p className="text-xs text-red-500">Incorrect username or password.</p>}
                </>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={submitLogin} disabled={loginLoading} className="flex-1">Login</Button>
                <Button size="sm" variant="outline" onClick={()=>{setShowLogin(false);setLoginUser("");setLoginPass("");setLoginErr(false);}} className="flex-1">Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1.5">
          {(["all","unread"] as const).map(f => (
            <button key={f} onClick={()=>setFilter(f)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors capitalize
                ${filter===f?"bg-primary text-primary-foreground border-primary":"hover:bg-muted border-input text-muted-foreground"}`}>
              {f} {f==="unread"&&unreadCount>0?`(${unreadCount})`:""}
            </button>
          ))}
        </div>

        {/* Compose dialog */}
        {compose && (
          <div className="border rounded-xl p-5 bg-card space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Send notification to team</h2>
              <button onClick={()=>setCompose(false)}><X className="h-4 w-4 text-muted-foreground"/></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Title *</label>
                  <input value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}
                    placeholder="e.g. New procedure updated"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Message *</label>
                  <textarea value={draft.message} onChange={e=>setDraft(d=>({...d,message:e.target.value}))}
                    rows={3} placeholder="Details of the notification…"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input resize-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Type</label>
                  <select value={draft.type} onChange={e=>setDraft(d=>({...d,type:e.target.value as any}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input">
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                    <option value="alert">Alert</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Link (optional)</label>
                  <input value={draft.link} onChange={e=>setDraft(d=>({...d,link:e.target.value}))}
                    placeholder="/blog or /daily-report"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={send} disabled={sending} className="gap-2">
                  {sending ? "Sending…" : "Send to team"}
                </Button>
                <Button variant="outline" size="sm" onClick={()=>setCompose(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* Notifications list */}
        {loading && (
          <div className="flex items-center gap-3 py-8 justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"/>
            <span className="text-muted-foreground text-sm">Loading…</span>
          </div>
        )}
        {error && (
          <div className="border border-red-300 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 rounded-xl p-4 text-sm">⚠ {error}</div>
        )}

        {!loading && displayed.length === 0 && (
          <div className="text-center py-12">
            <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
          </div>
        )}

        <div className="space-y-2">
          {displayed.map(n => {
            const s = TYPE_STYLE[n.type] ?? TYPE_STYLE.info;
            return (
              <div key={n.id} className={`border rounded-xl overflow-hidden transition-all ${!n.isRead?"bg-primary/5 border-primary/20":"bg-card"}`}>
                <div className={`h-1 ${s.bar} ${n.isRead?"opacity-30":"opacity-100"}`}/>
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.badge}`}>{n.type}</span>
                        {n.isTicker && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Megaphone className="h-2.5 w-2.5"/>Scrolling</span>}
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"/>}
                        <span className="text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className={`text-sm font-medium ${n.isRead?"text-muted-foreground":"text-foreground"}`}>{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {n.link && (
                          <a href={n.link} className="text-xs text-primary hover:underline font-medium">
                            View →
                          </a>
                        )}
                        {!n.isRead && (
                          <button onClick={() => markRead(n.id)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                            Mark as read
                          </button>
                        )}
                        <span className="text-xs text-muted-foreground/50">— {n.author}</span>
                      </div>
                    </div>
                    {adminMode && (
                      <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                        <button
                          onClick={()=>toggleTicker(n.id, !!n.isTicker)}
                          title={n.isTicker ? "Remove from scrolling banner" : "Add to scrolling banner"}
                          className={`transition-colors ${n.isTicker
                            ? "text-amber-500 hover:text-amber-300"
                            : "text-muted-foreground/40 hover:text-amber-500"}`}>
                          <Megaphone className="h-4 w-4"/>
                        </button>
                        <button onClick={()=>deleteNotif(n.id)} className="text-muted-foreground/50 hover:text-red-500 transition-colors">
                          <Trash2 className="h-4 w-4"/>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!loading && notifs.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            {notifs.length} notification{notifs.length!==1?"s":""} total
          </p>
        )}
      </main>
    </>
  );
}
