// client/src/components/EngineerWorkspace.tsx
// Replaces BOTH WeeklyScheduleOverview AND WeeklyAssignmentsTable in dashboard.tsx
//
// In dashboard.tsx:
//   REMOVE: import { WeeklyScheduleOverview } from "@/components/weekly-schedule-overview";
//   REMOVE: import { WeeklyAssignmentsTable } from "@/components/weekly-assignments-table";
//   REMOVE: <WeeklyScheduleOverview />
//   REMOVE: <WeeklyAssignmentsTable teamMembers={teamMembers} />
//
//   ADD: import { EngineerWorkspace } from "@/components/EngineerWorkspace";
//   ADD: <EngineerWorkspace />  (in place of the two removed lines)

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertTriangle, Clock, Calendar, Send,
  Trash2, ChevronDown, ChevronUp, BookOpen, Zap, Target,
  LayoutDashboard, Loader2, X, Edit2, Users, Plus, Link2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WeeklyAssignment {
  id: string; engineerName: string; projectName: string;
  weekStart: string; currentStatus: string;
  resourceLockedFrom?: string; resourceLockedTill?: string;
  internalTarget?: string; customerTarget?: string;
  notes?: string; constraint?: string;
}
interface NBComment {
  id: string; text: string; date: string;
  type: "note"|"update"|"blocker"; createdAt: string;
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_GROUPS = [
  { group:"Phase",      items:[
    { v:"design_stage",              l:"Design Stage"              },
    { v:"electrical_design",         l:"Electrical Design"         },
    { v:"procurement_stage",         l:"Procurement Stage"         },
    { v:"waiting_for_materials",     l:"Waiting for Materials"     },
    { v:"mechanical_assembly",       l:"Mechanical Assembly"       },
    { v:"electrical_assembly",       l:"Electrical Assembly"       },
    { v:"installation_pending",      l:"Installation Pending"      },
    { v:"installation_in_progress",  l:"Installation in Progress"  },
    { v:"plc_power_up",              l:"PLC Power Up"              },
    { v:"io_check",                  l:"IO Check"                  },
    { v:"trials_stage",              l:"Trials Stage"              },
    { v:"fat",                       l:"F.A.T"                     },
    { v:"sat",                       l:"S.A.T"                     },
  ]},
  { group:"Outcome",    items:[
    { v:"in_progress",  l:"In Progress"  },
    { v:"on_hold",      l:"On Hold"      },
    { v:"blocked",      l:"Blocked"      },
    { v:"completed",    l:"Completed ✓"  },
    { v:"dispatch_stage",l:"Dispatch Stage"},
  ]},
];
const ALL_STATUSES = STATUS_GROUPS.flatMap(g => g.items);
function statusLabel(v: string) {
  return ALL_STATUSES.find(s => s.v === v)?.l ?? v;
}

const COMMENT_TYPES = [
  { v:"note",    l:"Note",    icon:"📝", bg:"bg-blue-500/10",   text:"text-blue-600 dark:text-blue-400"   },
  { v:"update",  l:"Update",  icon:"✅", bg:"bg-green-500/10",  text:"text-green-600 dark:text-green-400" },
  { v:"blocker", l:"Blocker", icon:"🚧", bg:"bg-red-500/10",    text:"text-red-600 dark:text-red-400"     },
];

// ── Date helpers ──────────────────────────────────────────────────────────────
const todayStr  = () => new Date().toISOString().split("T")[0];
function todayD()  { const d=new Date();d.setHours(0,0,0,0);return d; }
function weekBounds() {
  const d=todayD(),day=d.getDay();
  const mon=new Date(d);mon.setDate(d.getDate()-(day===0?6:day-1));
  const sun=new Date(mon);sun.setDate(mon.getDate()+6);
  return { mon, sun };
}
type Range="missed"|"active"|"upcoming"|"none";
function inRange(from?:string,till?:string):Range {
  const now=todayD();
  const s=from?new Date(from):null; if(s)s.setHours(0,0,0,0);
  const e=till?new Date(till):null; if(e)e.setHours(0,0,0,0);
  if(e&&e<now) return "missed";
  if(s&&s>now) return "upcoming";
  if((!s||s<=now)&&(!e||e>=now)) return "active";
  return "none";
}
function isThisWeek(from?:string,till?:string):boolean {
  const {mon,sun}=weekBounds();
  const s=from?new Date(from):todayD(); s.setHours(0,0,0,0);
  const e=till?new Date(till):todayD(); e.setHours(0,0,0,0);
  return s<=sun&&e>=mon;
}
function overdueDays(till?:string):number {
  if(!till)return 0;
  const e=new Date(till);e.setHours(0,0,0,0);
  return Math.max(0,Math.ceil((todayD().getTime()-e.getTime())/86400000));
}
function fmtDate(d?:string){
  if(!d)return"—";
  return new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short"});
}
function timeAgo(iso:string):string {
  const diff=(Date.now()-new Date(iso).getTime())/1000;
  if(diff<60)return"just now";
  if(diff<3600)return`${Math.floor(diff/60)}m ago`;
  if(diff<86400)return`${Math.floor(diff/3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN",{day:"numeric",month:"short"});
}

// ── Inline status picker ──────────────────────────────────────────────────────
function StatusPicker({ current, onSelect, onClose }: {
  current:string; onSelect:(v:string)=>void; onClose:()=>void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h=(e:MouseEvent)=>{ if(ref.current&&!ref.current.contains(e.target as Node))onClose(); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);
  return (
    <div ref={ref}
      className="absolute right-0 top-full mt-1 z-50 bg-background border rounded-xl shadow-2xl p-2 w-52 max-h-72 overflow-y-auto">
      {STATUS_GROUPS.map(g=>(
        <div key={g.group}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-1.5 bg-muted/50">
            {g.group}
          </p>
          {g.items.map(s=>(
            <button key={s.v} onClick={()=>{onSelect(s.v);onClose();}}
              className={`w-full text-left text-xs px-3 py-1.5 rounded-lg hover:bg-muted transition-colors
                ${s.v===current?"bg-primary/10 text-primary font-semibold":"text-foreground"}`}>
              {s.l}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({ a, variant, onStatusUpdate, onDismiss }: {
  a:WeeklyAssignment; variant:"missed"|"active"|"week";
  onStatusUpdate:(id:string,status:string)=>void;
  onDismiss?:()=>void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded,   setExpanded]   = useState(false);
  const od = overdueDays(a.resourceLockedTill);

  const STYLES = {
    missed:{ wrap:"border-red-500/30 bg-red-950/10", dot:"bg-red-500", badge:"bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
    active:{ wrap:"border-blue-500/30 bg-blue-950/10", dot:"bg-blue-500", badge:"bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
    week:  { wrap:"border-border bg-card", dot:"bg-muted-foreground/30", badge:"bg-muted text-muted-foreground" },
  };
  const st = STYLES[variant];

  return (
    <div className={`border rounded-xl overflow-hidden ${st.wrap}`}>
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${st.dot}`}/>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {variant==="missed" && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.badge}`}>
                  ⚠ Overdue {od}d
                </span>
              )}
              {variant==="active" && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.badge}`}>
                  ⚡ Active today
                </span>
              )}
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {statusLabel(a.currentStatus)}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-1" title={a.projectName}>
              {a.projectName}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {a.resourceLockedFrom && `From ${fmtDate(a.resourceLockedFrom)} · `}
              {a.resourceLockedTill && `Till ${fmtDate(a.resourceLockedTill)}`}
              {a.customerTarget && ` · Customer: ${fmtDate(a.customerTarget)}`}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {(a.notes || a.constraint) && (
              <button onClick={()=>setExpanded(e=>!e)}
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
                {expanded ? <ChevronUp className="h-3.5 w-3.5"/> : <ChevronDown className="h-3.5 w-3.5"/>}
              </button>
            )}
            {variant==="missed" && onDismiss && (
              <button onClick={onDismiss} title="Dismiss overdue"
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5"/>
              </button>
            )}
            {/* Mark done */}
            <button
              onClick={()=>onStatusUpdate(a.id,"completed")}
              title="Mark as completed"
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg
                bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300
                hover:bg-green-200 dark:hover:bg-green-900 transition-colors border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-3.5 w-3.5"/>Done
            </button>
            {/* Update status */}
            <div className="relative">
              <button
                onClick={()=>setPickerOpen(o=>!o)}
                title="Update status"
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg
                  border border-input hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <Edit2 className="h-3.5 w-3.5"/>Status
              </button>
              {pickerOpen && (
                <StatusPicker
                  current={a.currentStatus}
                  onSelect={v=>onStatusUpdate(a.id,v)}
                  onClose={()=>setPickerOpen(false)}
                />
              )}
            </div>
          </div>
        </div>

        {expanded && (
          <div className="mt-2 pl-5 space-y-1.5 text-xs">
            {a.notes && (
              <div className="p-2 rounded-lg bg-muted/50">
                <span className="font-medium text-muted-foreground">Notes: </span>
                <span>{a.notes}</span>
              </div>
            )}
            {a.constraint && (
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                ⚠ Constraint: {a.constraint}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ── Quick Assign modal ────────────────────────────────────────────────────────
function QuickAssignModal({ onClose, onSaved }: { onClose:()=>void; onSaved:()=>void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    engineerName:"", projectName:"", currentStatus:"not_started",
    resourceLockedFrom:"", resourceLockedTill:"",
    internalTarget:"", customerTarget:"", constraint:"",
  });

  const { data: masterEngineers = [] } = useQuery<Array<{id:string;name:string;initials:string}>>({
    queryKey:["/api/engineers-master-list"],
    queryFn:async()=>{ const r=await fetch("/api/engineers-master-list"); return r.ok?r.json():[]; },
  });
  const { data: projectNames = [] } = useQuery<string[]>({
    queryKey:["/api/project-names"],
    queryFn:async()=>{ const r=await fetch("/api/project-names"); return r.ok?r.json():[]; },
  });

  const save = async() => {
    if(!form.engineerName||!form.projectName){
      toast({title:"Engineer and Project are required",variant:"destructive"}); return;
    }
    setSaving(true);
    try {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate()-(weekStart.getDay()===0?6:weekStart.getDay()-1));
      const r = await apiRequest("POST","/api/weekly-assignments",{
        ...form,
        weekStart: weekStart.toISOString().split("T")[0],
        tasks:[],
      },true);
      toast({title:"Assignment added successfully"});
      onSaved();
      onClose();
    } catch(e:any){
      toast({title:e?.message||"Failed to add assignment",variant:"destructive"});
    } finally { setSaving(false); }
  };

  const field = "w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary"/>Assign Task
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Add a new project assignment to an engineer</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4"/>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Engineer */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Engineer *</label>
            <select value={form.engineerName} onChange={e=>setForm(f=>({...f,engineerName:e.target.value}))} className={field}>
              <option value="">Select engineer…</option>
              {masterEngineers.map(e=>(
                <option key={e.id} value={e.name}>{e.name}</option>
              ))}
            </select>
          </div>

          {/* Project */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Project *</label>
            <input list="qs-projects" value={form.projectName}
              onChange={e=>setForm(f=>({...f,projectName:e.target.value}))}
              placeholder="Type or select project…" className={field}/>
            <datalist id="qs-projects">
              {projectNames.map(n=><option key={n} value={n}/>)}
            </datalist>
          </div>

          {/* Dates grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Locked From</label>
              <input type="date" value={form.resourceLockedFrom}
                onChange={e=>setForm(f=>({...f,resourceLockedFrom:e.target.value}))} className={field}/>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Locked Till</label>
              <input type="date" value={form.resourceLockedTill}
                onChange={e=>setForm(f=>({...f,resourceLockedTill:e.target.value}))} className={field}/>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Internal Target</label>
              <input type="date" value={form.internalTarget}
                onChange={e=>setForm(f=>({...f,internalTarget:e.target.value}))} className={field}/>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Customer Target</label>
              <input type="date" value={form.customerTarget}
                onChange={e=>setForm(f=>({...f,customerTarget:e.target.value}))} className={field}/>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Current Status</label>
            <select value={form.currentStatus} onChange={e=>setForm(f=>({...f,currentStatus:e.target.value}))} className={field}>
              {STATUS_GROUPS.map(g=>(
                <optgroup key={g.group} label={g.group}>
                  {g.items.map(s=><option key={s.v} value={s.v}>{s.l}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Constraint */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Constraints / Notes</label>
            <textarea value={form.constraint} rows={2}
              onChange={e=>setForm(f=>({...f,constraint:e.target.value}))}
              placeholder="Any blockers, dependencies or notes…"
              className={`${field} resize-none`}/>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t bg-muted/20">
          <Button onClick={save} disabled={saving} className="flex-1 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>}
            {saving ? "Saving…" : "Add Assignment"}
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function EngineerWorkspace() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const engineerName = user?.name ?? user?.username ?? "";

  const [commentText,  setCommentText]  = useState("");
  const [commentType,  setCommentType]  = useState<"note"|"update"|"blocker">("note");
  const [submitting,   setSubmitting]   = useState(false);
  const [comments,     setComments]     = useState<NBComment[]>([]);
  const [dismissed,    setDismissed]    = useState<string[]>([]);
  const [nbLoaded,     setNbLoaded]     = useState(false);
  const [showAllWeek,  setShowAllWeek]  = useState(false);
  const [updatingIds,  setUpdatingIds]  = useState<Set<string>>(new Set());
  const [showAssign,   setShowAssign]   = useState(false);

  // ── Fetch assignments ──────────────────────────────────────────────────────
  const { data: allAssignments = [], isLoading } = useQuery<WeeklyAssignment[]>({
    queryKey: ["/api/weekly-assignments"],
    staleTime: 60000,
  });

  const myAssignments = useMemo(()=>
    allAssignments.filter(a=>
      a.engineerName?.trim().toLowerCase() === engineerName.trim().toLowerCase()
    ),
    [allAssignments, engineerName]
  );

  const missed = useMemo(()=>
    myAssignments.filter(a=>{
      if(["completed","dispatch_stage"].includes(a.currentStatus))return false;
      if(dismissed.includes(a.id))return false;
      return inRange(a.resourceLockedFrom,a.resourceLockedTill)==="missed";
    }),
    [myAssignments,dismissed]
  );
  const active = useMemo(()=>
    myAssignments.filter(a=>{
      if(["completed","dispatch_stage"].includes(a.currentStatus))return false;
      return inRange(a.resourceLockedFrom,a.resourceLockedTill)==="active";
    }),
    [myAssignments]
  );
  const weekTasks = useMemo(()=>
    myAssignments.filter(a=>{
      if(["completed","dispatch_stage"].includes(a.currentStatus))return false;
      const r=inRange(a.resourceLockedFrom,a.resourceLockedTill);
      if(r==="active"||r==="missed")return false;
      return isThisWeek(a.resourceLockedFrom,a.resourceLockedTill);
    }),
    [myAssignments]
  );
  const completedCount = useMemo(()=>
    myAssignments.filter(a=>a.currentStatus==="completed"||a.currentStatus==="dispatch_stage").length,
    [myAssignments]
  );

  // ── Update status mutation ─────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async({id,status}:{id:string;status:string})=>
      apiRequest("PATCH",`/api/weekly-assignments/${encodeURIComponent(id)}`,{currentStatus:status},true),
    onSuccess:()=>queryClient.invalidateQueries({queryKey:["/api/weekly-assignments"]}),
  });

  const handleStatusUpdate = async(id:string,status:string)=>{
    setUpdatingIds(s=>new Set([...s,id]));
    try {
      await updateMutation.mutateAsync({id,status});
      toast({title: status==="completed" ? "✓ Marked as completed!" : "Status updated"});
    } catch {
      toast({title:"Failed to update status",variant:"destructive"});
    } finally {
      setUpdatingIds(s=>{ const n=new Set(s); n.delete(id); return n; });
    }
  };

  // ── Load notice board ──────────────────────────────────────────────────────
  useEffect(()=>{
    if(!engineerName)return;
    (async()=>{
      try {
        const r=await fetch(`/api/notice-board/${encodeURIComponent(engineerName)}`);
        if(r.ok){ const d=await r.json(); setComments(d.comments??[]); setDismissed(d.dismissedMissed??[]); }
      } catch {} finally { setNbLoaded(true); }
    })();
  },[engineerName]);

  const addComment=async()=>{
    if(!commentText.trim()||!engineerName)return;
    setSubmitting(true);
    try {
      const r=await fetch(`/api/notice-board/${encodeURIComponent(engineerName)}/comment`,{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text:commentText.trim(),type:commentType,date:todayStr()}),
      });
      if(r.ok){const c=await r.json(); setComments(p=>[...p,c]); setCommentText("");}
    } catch {} finally{setSubmitting(false);}
  };

  const deleteComment=async(id:string)=>{
    try {
      await fetch(`/api/notice-board/${encodeURIComponent(engineerName)}/comment/${id}`,{method:"DELETE"});
      setComments(p=>p.filter(c=>c.id!==id));
    } catch {}
  };

  const dismissMissed=async(id:string)=>{
    setDismissed(p=>[...p,id]);
    try {
      await fetch(`/api/notice-board/${encodeURIComponent(engineerName)}/dismiss/${id}`,{method:"PATCH"});
    } catch {}
  };

  const todayComments  = comments.filter(c=>c.date===todayStr());
  const olderComments  = comments.filter(c=>c.date!==todayStr()).slice(-8).reverse();
  const visibleWeek    = showAllWeek ? weekTasks : weekTasks.slice(0,3);
  const todayFormatted = new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"});

  // ── Admin view — show all engineers summary ────────────────────────────────
  if(isAdmin && !engineerName) return null;

  // ── Not logged in ──────────────────────────────────────────────────────────
  if(!user) return (
    <div className="border rounded-2xl p-10 text-center bg-card">
      <LayoutDashboard className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3"/>
      <p className="text-sm font-semibold">Log in to see your workspace</p>
      <p className="text-xs text-muted-foreground mt-1">Your personal tasks, status updates and daily log appear here.</p>
    </div>
  );

  if(isLoading) return (
    <div className="border rounded-2xl p-8 flex items-center justify-center gap-3 bg-card">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/>
      <span className="text-sm text-muted-foreground">Loading your workspace…</span>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary"/>My Workspace
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="font-semibold text-foreground">{user.name??engineerName}</span>
            {" · "}{todayFormatted}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {missed.length>0 && <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-semibold">{missed.length} overdue</span>}
          {active.length>0 && <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">{active.length} active</span>}
          {weekTasks.length>0 && <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">{weekTasks.length} this week</span>}
          {completedCount>0 && <span className="px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-medium">{completedCount} done</span>}
          {isAdmin && (
            <button onClick={()=>setShowAssign(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity text-xs ml-2">
              <Plus className="h-3.5 w-3.5"/>Assign Task
            </button>
          )}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

        {/* Left: tasks */}
        <div className="space-y-3 min-w-0">

          {/* All clear */}
          {missed.length===0 && active.length===0 && weekTasks.length===0 && (
            <div className="border rounded-2xl p-10 text-center bg-card">
              <CheckCircle2 className="h-10 w-10 mx-auto text-green-500/50 mb-3"/>
              <p className="text-sm font-semibold">All clear for now!</p>
              <p className="text-xs text-muted-foreground mt-1">No active assignments. Check with your lead for new tasks.</p>
            </div>
          )}

          {/* MISSED */}
          {missed.length>0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0"/>
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">Overdue — take action</span>
                <span className="text-xs text-muted-foreground ml-auto">{missed.length} task{missed.length>1?"s":""}</span>
              </div>
              {missed.map(a=>(
                <div key={a.id} className={updatingIds.has(a.id)?"opacity-50 pointer-events-none":""}>
                  <TaskCard a={a} variant="missed" onStatusUpdate={handleStatusUpdate} onDismiss={()=>dismissMissed(a.id)}/>
                </div>
              ))}
            </div>
          )}

          {/* ACTIVE */}
          {active.length>0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Zap className="h-4 w-4 text-blue-500 flex-shrink-0"/>
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">Active today — focus here</span>
                <span className="text-xs text-muted-foreground ml-auto">{active.length} task{active.length>1?"s":""}</span>
              </div>
              {active.map(a=>(
                <div key={a.id} className={updatingIds.has(a.id)?"opacity-50 pointer-events-none":""}>
                  <TaskCard a={a} variant="active" onStatusUpdate={handleStatusUpdate}/>
                </div>
              ))}
            </div>
          )}

          {/* THIS WEEK */}
          {weekTasks.length>0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Target className="h-4 w-4 text-muted-foreground flex-shrink-0"/>
                <span className="text-sm font-semibold text-muted-foreground">Coming this week</span>
                <span className="text-xs text-muted-foreground ml-auto">{weekTasks.length} task{weekTasks.length>1?"s":""}</span>
              </div>
              {visibleWeek.map(a=>(
                <div key={a.id} className={updatingIds.has(a.id)?"opacity-50 pointer-events-none":""}>
                  <TaskCard a={a} variant="week" onStatusUpdate={handleStatusUpdate}/>
                </div>
              ))}
              {weekTasks.length>3 && (
                <button onClick={()=>setShowAllWeek(e=>!e)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-colors">
                  {showAllWeek ? "▲ Show less" : `▼ Show ${weekTasks.length-3} more`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: daily log + summary */}
        <div className="space-y-3">

          {/* Daily log */}
          <div className="border rounded-2xl overflow-hidden bg-card">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground"/>
              <span className="text-sm font-semibold">Daily Log</span>
              <span className="text-xs text-muted-foreground ml-auto">{new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span>
            </div>

            <div className="px-4 py-3 space-y-2 max-h-52 overflow-y-auto">
              {!nbLoaded && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin"/>Loading…
                </div>
              )}
              {nbLoaded && todayComments.length===0 && (
                <p className="text-xs text-muted-foreground italic">No entries today. Log your progress below.</p>
              )}
              {todayComments.map(c=>{
                const ct=COMMENT_TYPES.find(t=>t.v===c.type)??COMMENT_TYPES[0];
                return (
                  <div key={c.id} className={`flex items-start gap-2 p-2.5 rounded-xl ${ct.bg}`}>
                    <span className="text-sm flex-shrink-0 mt-0.5">{ct.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug ${ct.text}`}>{c.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(c.createdAt)}</p>
                    </div>
                    <button onClick={()=>deleteComment(c.id)}
                      className="text-muted-foreground/30 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5">
                      <Trash2 className="h-3 w-3"/>
                    </button>
                  </div>
                );
              })}
              {olderComments.length>0 && (
                <details>
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground py-1 select-none">
                    ▶ Previous entries ({olderComments.length})
                  </summary>
                  <div className="space-y-1.5 mt-1.5">
                    {olderComments.map(c=>{
                      const ct=COMMENT_TYPES.find(t=>t.v===c.type)??COMMENT_TYPES[0];
                      return (
                        <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 opacity-70">
                          <span className="text-xs flex-shrink-0">{ct.icon}</span>
                          <div className="min-w-0">
                            <p className="text-xs text-foreground">{c.text}</p>
                            <p className="text-[10px] text-muted-foreground">{c.date} · {timeAgo(c.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>

            <div className="px-4 py-3 border-t bg-muted/20 space-y-2">
              <div className="flex gap-1.5">
                {COMMENT_TYPES.map(t=>(
                  <button key={t.v} onClick={()=>setCommentType(t.v as any)}
                    className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border transition-all
                      ${commentType===t.v ? `${t.bg} ${t.text} border-current/20` : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"}`}>
                    {t.icon} {t.l}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={commentText} onChange={e=>setCommentText(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addComment();}}}
                  placeholder={commentType==="note"?"What are you working on?":commentType==="update"?"Share a progress update…":"Describe the blocker…"}
                  className="flex-1 border rounded-lg px-3 py-2 text-xs bg-background outline-none focus:ring-2 focus:ring-primary border-input"/>
                <Button size="sm" onClick={addComment} disabled={submitting||!commentText.trim()} className="flex-shrink-0 gap-1.5">
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Send className="h-3.5 w-3.5"/>}
                </Button>
              </div>
            </div>
          </div>

          {/* Weekly summary */}
          <div className="border rounded-2xl p-4 bg-card space-y-2.5">
            <p className="text-xs font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground"/>Week at a glance
            </p>
            {[
              { l:"Assigned",  v: myAssignments.length,  c:"text-foreground"                              },
              { l:"Overdue",   v: missed.length,          c: missed.length>0 ? "text-red-500" : "text-foreground" },
              { l:"Active",    v: active.length,          c: active.length>0 ? "text-blue-500":"text-foreground" },
              { l:"This week", v: weekTasks.length,       c:"text-muted-foreground"                       },
              { l:"Completed", v: completedCount,         c: completedCount>0 ? "text-green-500":"text-foreground" },
              { l:"Log entries today", v:todayComments.length, c:"text-muted-foreground"                  },
            ].map(r=>(
              <div key={r.l} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{r.l}</span>
                <span className={`font-bold ${r.c}`}>{r.v}</span>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Quick assign modal */}
      {showAssign && isAdmin && (
        <QuickAssignModal
          onClose={()=>setShowAssign(false)}
          onSaved={()=>queryClient.invalidateQueries({queryKey:["/api/weekly-assignments"]})}
        />
      )}
    </div>
  );
}