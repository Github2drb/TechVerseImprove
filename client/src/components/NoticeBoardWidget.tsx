// client/src/components/NoticeBoardWidget.tsx
// Replaces WeeklySchedule / "This Week's Schedule" in dashboard.tsx
//
// Usage:
//   import { NoticeBoardWidget } from "@/components/NoticeBoardWidget";
//   <NoticeBoardWidget />
//
// Routes needed in server/routes.ts — paste from routes-noticeboard.ts

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import {
  AlertTriangle, CheckCircle2, Clock, Calendar, Send,
  Trash2, ChevronDown, ChevronUp, Bell, BookOpen, Target,
  X, Loader2, StickyNote, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WeeklyAssignment {
  id: string; engineerName: string; projectName: string;
  weekStart: string; currentStatus: string;
  resourceLockedFrom?: string; resourceLockedTill?: string;
  internalTarget?: string; customerTarget?: string;
  notes?: string; constraint?: string;
}
interface NBComment {
  id: string; text: string; date: string; type: "note"|"update"|"blocker"; createdAt: string;
}

// ── Date helpers ──────────────────────────────────────────────────────────────
const today     = () => new Date().toISOString().split("T")[0];
const todayDate = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };

function weekBounds() {
  const d   = new Date(); d.setHours(0,0,0,0);
  const day = d.getDay(); // 0=Sun
  const mon = new Date(d); mon.setDate(d.getDate() - (day===0?6:day-1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { mon, sun };
}

function inRange(from?: string, till?: string): "active"|"missed"|"upcoming"|"none" {
  if (!from && !till) return "none";
  const now   = todayDate();
  const start = from  ? new Date(from)  : null;
  const end   = till  ? new Date(till)  : null;
  if (start) start.setHours(0,0,0,0);
  if (end)   end.setHours(0,0,0,0);
  if (end   && end   < now) return "missed";
  if (start && start > now) return "upcoming";
  if ((!start || start <= now) && (!end || end >= now)) return "active";
  return "none";
}

function isThisWeek(from?: string, till?: string): boolean {
  const { mon, sun } = weekBounds();
  const start = from ? new Date(from) : null;
  const end   = till ? new Date(till) : null;
  if (start) start.setHours(0,0,0,0);
  if (end)   end.setHours(0,0,0,0);
  const effectiveStart = start ?? todayDate();
  const effectiveEnd   = end   ?? todayDate();
  return effectiveStart <= sun && effectiveEnd >= mon;
}

function daysOverdue(till?: string): number {
  if (!till) return 0;
  const end = new Date(till); end.setHours(0,0,0,0);
  const now = todayDate();
  const diff = Math.ceil((now.getTime() - end.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN",{ day:"numeric", month:"short", year:"numeric" });
}

function fmtRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

const STATUS_LABEL: Record<string,string> = {
  not_started:"Not Started", in_progress:"In Progress", completed:"Completed",
  on_hold:"On Hold", blocked:"Blocked",
  design_stage:"Design Stage", electrical_design:"Electrical Design",
  procurement_stage:"Procurement Stage", waiting_for_materials:"Waiting for Materials",
  mechanical_assembly:"Mechanical Assembly", electrical_assembly:"Electrical Assembly",
  installation_pending:"Installation Pending", installation_in_progress:"Installation in Progress",
  plc_power_up:"PLC Power Up", io_check:"IO Check", trials_stage:"Trials Stage",
  fat:"F.A.T", sat:"S.A.T", dispatch_stage:"Dispatch Stage",
};

const COMMENT_TYPES = [
  { value:"note",    label:"Note",    color:"text-blue-500",   bg:"bg-blue-500/10",   icon:"📝" },
  { value:"update",  label:"Update",  color:"text-green-500",  bg:"bg-green-500/10",  icon:"✅" },
  { value:"blocker", label:"Blocker", color:"text-red-500",    bg:"bg-red-500/10",    icon:"🚧" },
];

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({
  assignment, variant, overdueDays, onDismiss,
}: {
  assignment: WeeklyAssignment;
  variant: "missed" | "today" | "week";
  overdueDays?: number;
  onDismiss?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const VARIANT_STYLES = {
    missed: {
      border: "border-red-500/40",
      bg:     "bg-red-950/20 dark:bg-red-950/30",
      badge:  "bg-red-500 text-white",
      icon:   <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0"/>,
      label:  `Overdue ${overdueDays}d`,
    },
    today: {
      border: "border-blue-500/40",
      bg:     "bg-blue-950/10 dark:bg-blue-950/20",
      badge:  "bg-blue-500 text-white",
      icon:   <Clock className="h-4 w-4 text-blue-400 flex-shrink-0"/>,
      label:  "Active Today",
    },
    week: {
      border: "border-border",
      bg:     "bg-card",
      badge:  "bg-muted text-muted-foreground",
      badge2: "",
      icon:   <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0"/>,
      label:  "This Week",
    },
  };

  const s = VARIANT_STYLES[variant];

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${s.border} ${s.bg}`}>
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          {s.icon}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
                {s.label}
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {STATUS_LABEL[assignment.currentStatus] ?? assignment.currentStatus}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground leading-snug">
              {assignment.projectName}
            </p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              {assignment.resourceLockedFrom && (
                <span>From: {fmtDate(assignment.resourceLockedFrom)}</span>
              )}
              {assignment.resourceLockedTill && (
                <span className={variant==="missed"?"text-red-400 font-medium":""}>
                  Till: {fmtDate(assignment.resourceLockedTill)}
                </span>
              )}
              {assignment.customerTarget && (
                <span>Customer: {fmtDate(assignment.customerTarget)}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {assignment.notes || assignment.constraint ? (
              <button onClick={() => setExpanded(e => !e)}
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
                {expanded ? <ChevronUp className="h-3.5 w-3.5"/> : <ChevronDown className="h-3.5 w-3.5"/>}
              </button>
            ) : null}
            {variant === "missed" && onDismiss && (
              <button onClick={onDismiss} title="Dismiss"
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5"/>
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pl-7 space-y-1.5 text-xs">
            {assignment.notes && (
              <div className="p-2 rounded-lg bg-muted/50">
                <span className="font-medium text-muted-foreground">Notes: </span>
                <span className="text-foreground">{assignment.notes}</span>
              </div>
            )}
            {assignment.constraint && (
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <span className="font-medium">⚠ Constraint: </span>{assignment.constraint}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({
  icon, title, count, color, description,
}: {
  icon: React.ReactNode; title: string; count: number;
  color: string; description: string;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl ${color}`}>
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <p className="text-sm font-bold">{title}</p>
          <p className="text-[10px] opacity-70">{description}</p>
        </div>
      </div>
      <span className="text-lg font-bold opacity-80">{count}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function NoticeBoardWidget() {
  const { user } = useAuth();
  const engineerName = user?.name ?? user?.username ?? "";

  const [commentText,   setCommentText]   = useState("");
  const [commentType,   setCommentType]   = useState<"note"|"update"|"blocker">("note");
  const [submitting,    setSubmitting]    = useState(false);
  const [comments,      setComments]      = useState<NBComment[]>([]);
  const [dismissed,     setDismissed]     = useState<string[]>([]);
  const [commentsLoaded,setCommentsLoaded]= useState(false);
  const [showAllWeek,   setShowAllWeek]   = useState(false);

  // ── Fetch all assignments ──────────────────────────────────────────────────
  const { data: allAssignments = [] } = useQuery<WeeklyAssignment[]>({
    queryKey: ["/api/weekly-assignments"],
    staleTime: 60000,
  });

  // Filter to this engineer only
  const myAssignments = useMemo(() =>
    allAssignments.filter(a =>
      a.engineerName?.trim().toLowerCase() === engineerName.trim().toLowerCase()
    ),
    [allAssignments, engineerName]
  );

  // Categorise
  const missed = useMemo(() =>
    myAssignments.filter(a => {
      if (["completed","dispatch_stage"].includes(a.currentStatus)) return false;
      if (dismissed.includes(a.id)) return false;
      return inRange(a.resourceLockedFrom, a.resourceLockedTill) === "missed";
    }),
    [myAssignments, dismissed]
  );

  const todayTasks = useMemo(() =>
    myAssignments.filter(a => {
      if (["completed","dispatch_stage"].includes(a.currentStatus)) return false;
      return inRange(a.resourceLockedFrom, a.resourceLockedTill) === "active";
    }),
    [myAssignments]
  );

  const weekTasks = useMemo(() =>
    myAssignments.filter(a => {
      if (["completed","dispatch_stage"].includes(a.currentStatus)) return false;
      if (inRange(a.resourceLockedFrom, a.resourceLockedTill) === "active") return false;
      return isThisWeek(a.resourceLockedFrom, a.resourceLockedTill);
    }),
    [myAssignments]
  );

  const visibleWeek = showAllWeek ? weekTasks : weekTasks.slice(0, 3);

  // ── Load notice board data ─────────────────────────────────────────────────
  useEffect(() => {
    if (!engineerName) return;
    (async () => {
      try {
        const r = await fetch(`/api/notice-board/${encodeURIComponent(engineerName)}`);
        if (r.ok) {
          const d = await r.json();
          setComments(d.comments ?? []);
          setDismissed(d.dismissedMissed ?? []);
          setCommentsLoaded(true);
        }
      } catch {}
    })();
  }, [engineerName]);

  const addComment = async () => {
    if (!commentText.trim() || !engineerName) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/notice-board/${encodeURIComponent(engineerName)}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: commentText.trim(), type: commentType, date: today() }),
      });
      if (r.ok) {
        const c = await r.json();
        setComments(prev => [...prev, c]);
        setCommentText("");
      }
    } catch {}
    finally { setSubmitting(false); }
  };

  const deleteComment = async (id: string) => {
    try {
      await fetch(`/api/notice-board/${encodeURIComponent(engineerName)}/comment/${id}`, {
        method: "DELETE",
      });
      setComments(prev => prev.filter(c => c.id !== id));
    } catch {}
  };

  const dismissMissed = async (assignmentId: string) => {
    setDismissed(prev => [...prev, assignmentId]);
    try {
      await fetch(`/api/notice-board/${encodeURIComponent(engineerName)}/dismiss/${assignmentId}`, {
        method: "PATCH",
      });
    } catch {}
  };

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!engineerName) return (
    <div className="border rounded-2xl p-8 text-center bg-card">
      <Bell className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3"/>
      <p className="text-muted-foreground text-sm font-medium">Log in to see your personal notice board</p>
    </div>
  );

  const todayStr = new Date().toLocaleDateString("en-IN",{ weekday:"long", day:"numeric", month:"long" });
  const todayComments = comments.filter(c => c.date === today());
  const olderComments = comments.filter(c => c.date !== today()).slice(-5).reverse();

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-primary"/>
            Notice Board
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="font-semibold text-foreground">{user?.name ?? engineerName}</span>
            {" · "}{todayStr}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {missed.length   > 0 && <span className="px-2 py-1 rounded-full bg-red-500/15 text-red-500 font-bold">{missed.length} overdue</span>}
          {todayTasks.length > 0 && <span className="px-2 py-1 rounded-full bg-blue-500/15 text-blue-500 font-bold">{todayTasks.length} active</span>}
          {weekTasks.length  > 0 && <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium">{weekTasks.length} this week</span>}
        </div>
      </div>

      {/* ── Empty state ── */}
      {missed.length === 0 && todayTasks.length === 0 && weekTasks.length === 0 && (
        <div className="border rounded-2xl p-8 text-center bg-card">
          <CheckCircle2 className="h-10 w-10 mx-auto text-green-500/50 mb-3"/>
          <p className="text-sm font-semibold text-foreground">All clear!</p>
          <p className="text-xs text-muted-foreground mt-1">No tasks assigned this week. Check with your lead.</p>
        </div>
      )}

      {/* ── MISSED ── */}
      {missed.length > 0 && (
        <div className="space-y-2">
          <SectionHeader
            icon={<AlertTriangle className="h-5 w-5 text-red-300"/>}
            title="Overdue Tasks"
            count={missed.length}
            color="bg-red-500/15 text-red-300"
            description="Past deadline — take action immediately"
          />
          {missed.map(a => (
            <TaskCard
              key={a.id} assignment={a} variant="missed"
              overdueDays={daysOverdue(a.resourceLockedTill)}
              onDismiss={() => dismissMissed(a.id)}
            />
          ))}
        </div>
      )}

      {/* ── TODAY ── */}
      {todayTasks.length > 0 && (
        <div className="space-y-2">
          <SectionHeader
            icon={<Zap className="h-5 w-5 text-blue-300"/>}
            title="Active Today"
            count={todayTasks.length}
            color="bg-blue-500/15 text-blue-300"
            description="Tasks active right now — focus here"
          />
          {todayTasks.map(a => (
            <TaskCard key={a.id} assignment={a} variant="today"/>
          ))}
        </div>
      )}

      {/* ── THIS WEEK ── */}
      {weekTasks.length > 0 && (
        <div className="space-y-2">
          <SectionHeader
            icon={<Target className="h-5 w-5 text-muted-foreground"/>}
            title="This Week"
            count={weekTasks.length}
            color="bg-muted/50 text-muted-foreground"
            description="Upcoming this week — plan ahead"
          />
          {visibleWeek.map(a => (
            <TaskCard key={a.id} assignment={a} variant="week"/>
          ))}
          {weekTasks.length > 3 && (
            <button onClick={() => setShowAllWeek(e => !e)}
              className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors">
              {showAllWeek ? "▲ Show less" : `▼ Show ${weekTasks.length - 3} more`}
            </button>
          )}
        </div>
      )}

      {/* ── COMMENTS / DAILY LOG ── */}
      <div className="border rounded-2xl overflow-hidden bg-card">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground"/>
          <span className="text-sm font-semibold">Daily Log</span>
          <span className="text-xs text-muted-foreground ml-auto">{todayStr}</span>
        </div>

        {/* Today's comments */}
        <div className="px-4 py-3 space-y-2 max-h-48 overflow-y-auto">
          {!commentsLoaded && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin"/>Loading…
            </div>
          )}
          {commentsLoaded && todayComments.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No entries yet today. Log your progress below.</p>
          )}
          {todayComments.map(c => {
            const ct = COMMENT_TYPES.find(t => t.value === c.type) ?? COMMENT_TYPES[0];
            return (
              <div key={c.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl ${ct.bg}`}>
                <span className="text-base flex-shrink-0 mt-0.5">{ct.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">{c.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{fmtRelative(c.createdAt)}</p>
                </div>
                <button onClick={() => deleteComment(c.id)}
                  className="text-muted-foreground/40 hover:text-red-500 transition-colors flex-shrink-0">
                  <Trash2 className="h-3.5 w-3.5"/>
                </button>
              </div>
            );
          })}

          {/* Older comments */}
          {olderComments.length > 0 && (
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none py-1">
                ▶ Previous entries ({olderComments.length})
              </summary>
              <div className="space-y-1.5 mt-1.5">
                {olderComments.map(c => {
                  const ct = COMMENT_TYPES.find(t => t.value === c.type) ?? COMMENT_TYPES[0];
                  return (
                    <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 opacity-70">
                      <span className="text-sm flex-shrink-0">{ct.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground">{c.text}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {c.date} · {fmtRelative(c.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>

        {/* Comment input */}
        <div className="px-4 py-3 border-t bg-muted/20 space-y-2">
          {/* Type selector */}
          <div className="flex gap-1.5">
            {COMMENT_TYPES.map(t => (
              <button key={t.value} onClick={() => setCommentType(t.value as any)}
                className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-all
                  ${commentType === t.value
                    ? `${t.bg} ${t.color} border-current/30`
                    : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          {/* Text input + send */}
          <div className="flex gap-2">
            <input
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
              placeholder={
                commentType === "note"    ? "What are you working on today?" :
                commentType === "update"  ? "Share a progress update…"       :
                                            "Describe a blocker or issue…"
              }
              className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background outline-none
                focus:ring-2 focus:ring-primary border-input"
            />
            <Button size="sm" onClick={addComment} disabled={submitting || !commentText.trim()} className="gap-1.5 flex-shrink-0">
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Send className="h-3.5 w-3.5"/>}
              Log
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Press Enter to log · visible only to you</p>
        </div>
      </div>

    </div>
  );
}
