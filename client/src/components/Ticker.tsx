// client/src/components/Ticker.tsx
// Add <Ticker /> to dashboard.tsx just below <Header />
//
// Two sources feed this bar:
//  1. Admin-authored messages — managed from /notifications, click 📢 Ticker on any notification.
//  2. Live task pills — every engineer's Pending ("not_started") and In Progress task for
//     the current week, pulled straight from /api/weekly-assignments (same data source
//     My Workspace uses), so the ticker always mirrors what's on the board — no manual entry.

import { useState, useEffect, useMemo } from "react";
import { Megaphone, AlertTriangle, Clock, Circle } from "lucide-react";

interface TickerMessage {
  id:        string;
  title:     string;
  message:   string;
  type:      string;
  isTicker?: boolean;
}

interface AssignmentTask {
  id:             string;
  taskName:       string;
  status:         string;       // "not_started" | "in_progress" | "completed"
  type?:          "daily" | "weekly";
  assignedDate?:  string;
  targetDate?:    string;
  completionDate?:string;
}
interface WeeklyAssignment {
  id:            string;
  engineerName:  string;
  projectName:   string;
  weekStart:     string;
  tasks:         AssignmentTask[];
}

interface TaskPill {
  id:         string;
  engineer:   string;
  initials:   string;
  project:    string;
  taskName:   string;
  status:     "not_started" | "in_progress";
  overdueDays: number;
}

// Per-type text + background colors for each admin message pill
const TYPE_COLORS: Record<string, { text: string; bg: string; dot: string }> = {
  alert:   { text:"text-red-100",    bg:"bg-red-700",    dot:"🔴" },
  warning: { text:"text-amber-100",  bg:"bg-amber-600",  dot:"🟡" },
  success: { text:"text-green-100",  bg:"bg-green-700",  dot:"🟢" },
  info:    { text:"text-blue-100",   bg:"bg-blue-700",   dot:"🔵" },
};

const PRIORITY = ["alert","warning","success","info"];

// ── Date helpers (mirrors the Monday-start week logic used in My Workspace) ──
function todayStr() { return new Date().toISOString().split("T")[0]; }
function currentWeekStart(): string {
  const d = new Date(); d.setHours(0,0,0,0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split("T")[0];
}
function overdueDays(due?: string): number {
  if (!due) return 0;
  const today = new Date(); today.setHours(0,0,0,0);
  const e = new Date(due); e.setHours(0,0,0,0);
  return Math.max(0, Math.ceil((today.getTime() - e.getTime()) / 86400000));
}
function initialsOf(name: string): string {
  return name.split(" ").filter(Boolean).slice(0,2).map(n => n[0]).join("").toUpperCase();
}
// engineerName can be a comma-separated team e.g. "Praveen Kumar C, Veeresh" — use the first
function primaryName(engineerName: string): string {
  return (engineerName || "Unassigned").split(",")[0].trim();
}
// Trim long project names for the pill, keeping any leading [CODE] tag intact
function shortProject(name: string): string {
  if (!name) return "";
  return name.length > 46 ? name.slice(0, 44).trim() + "…" : name;
}

export function Ticker() {
  const [messages, setMessages] = useState<TickerMessage[]>([]);
  const [assignments, setAssignments] = useState<WeeklyAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [notifRes, assignRes] = await Promise.all([
        fetch("/api/notifications"),
        fetch(`/api/weekly-assignments?weekStart=${currentWeekStart()}`),
      ]);
      if (notifRes.ok) {
        const all: TickerMessage[] = await notifRes.json();
        setMessages(all.filter(n => n.isTicker === true));
      }
      if (assignRes.ok) {
        const all: WeeklyAssignment[] = await assignRes.json();
        setAssignments(all);
      }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  // Flatten every non-completed task across all engineers for the current week
  const taskPills = useMemo<TaskPill[]>(() => {
    const today = todayStr();
    const pills: TaskPill[] = [];
    for (const a of assignments) {
      for (const t of (a.tasks ?? [])) {
        if (t.status === "completed") continue;
        if (t.status !== "not_started" && t.status !== "in_progress") continue;
        const due = t.assignedDate ?? t.targetDate;
        const od = due && due < today ? overdueDays(due) : 0;
        pills.push({
          id: t.id,
          engineer: primaryName(a.engineerName),
          initials: initialsOf(primaryName(a.engineerName)),
          project: shortProject(a.projectName),
          taskName: t.taskName,
          status: t.status as "not_started" | "in_progress",
          overdueDays: od,
        });
      }
    }
    // Overdue first, then In Progress, then Pending
    return pills.sort((x, y) => {
      if (x.overdueDays !== y.overdueDays) return y.overdueDays - x.overdueDays;
      if (x.status !== y.status) return x.status === "in_progress" ? -1 : 1;
      return 0;
    });
  }, [assignments]);

  if (loading || (messages.length === 0 && taskPills.length === 0)) return null;

  const topType  = PRIORITY.find(t => messages.some(m => m.type === t)) ?? (taskPills.some(p=>p.overdueDays>0) ? "alert" : "info");
  const BANNER_BG: Record<string, string> = {
    alert:   "bg-slate-900 border-red-800",
    warning: "bg-slate-900 border-amber-800",
    success: "bg-slate-900 border-green-800",
    info:    "bg-slate-900 border-blue-800",
  };
  const bannerBg = BANNER_BG[topType] ?? BANNER_BG.info;

  // Admin-authored message pills
  const renderMessages = () =>
    messages.map((m) => {
      const c = TYPE_COLORS[m.type] ?? TYPE_COLORS.info;
      return (
        <span key={`msg-${m.id}`} className="inline-flex items-center gap-2 mx-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
            <span>{c.dot}</span>
            <span>{m.title}</span>
            {m.message && <span className="opacity-80 font-normal">— {m.message}</span>}
          </span>
          <span className="text-slate-600 font-bold text-sm select-none">◆</span>
        </span>
      );
    });

  // Live task pills — one per pending/in-progress task, engineer + project + status
  const renderTaskPills = () =>
    taskPills.map((p, i) => {
      const isProgress = p.status === "in_progress";
      const isOverdue  = p.overdueDays > 0;
      const pillBg   = isOverdue ? "bg-red-700" : isProgress ? "bg-blue-700" : "bg-slate-700";
      const pillText = isOverdue ? "text-red-100" : isProgress ? "text-blue-100" : "text-slate-100";
      const StatusIcon = isOverdue ? AlertTriangle : isProgress ? Clock : Circle;
      const sep = i < taskPills.length - 1;
      return (
        <span key={`task-${p.id}`} className="inline-flex items-center gap-2 mx-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold ${pillBg} ${pillText}`}>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-black/20 text-[9px] font-bold flex-shrink-0">
              {p.initials}
            </span>
            <StatusIcon className="h-3 w-3 flex-shrink-0"/>
            <span>{p.taskName}</span>
            <span className="opacity-80 font-normal">— {p.project}</span>
            <span className="opacity-70 font-normal">· {p.engineer}</span>
            {isOverdue && <span className="font-bold">· {p.overdueDays}d overdue</span>}
          </span>
          {sep && <span className="text-slate-600 font-bold text-sm select-none">◆</span>}
        </span>
      );
    });

  // Calculate scroll duration based on total content length (messages + task pills)
  const msgChars  = messages.reduce((s, m) => s + m.title.length + (m.message?.length ?? 0), 0);
  const taskChars = taskPills.reduce((s, p) => s + p.taskName.length + p.project.length + p.engineer.length + 20, 0);
  const duration  = Math.max(25, (msgChars + taskChars) * 0.15);

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
            {/* First copy — admin messages, then live task pills */}
            {renderMessages()}
            {renderTaskPills()}
            <span className="inline-block w-24"/>
            {/* Duplicate for seamless loop */}
            {renderMessages()}
            {renderTaskPills()}
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
