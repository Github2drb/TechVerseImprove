// client/src/components/EngineerWorkspace.tsx
// Replaces WeeklyScheduleOverview + WeeklyAssignmentsTable in dashboard.tsx

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, AlertTriangle, Circle, Clock, Calendar,
  Send, Trash2, ChevronDown, ChevronUp, BookOpen, Zap,
  LayoutDashboard, Loader2, X, Edit2, Plus, Link2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Task {
  id: string;
  taskName: string;
  type: "weekly" | "daily";
  assignedDate?: string;   // for daily tasks: "YYYY-MM-DD"
  targetDate?: string;
  completionDate?: string;
  status: "not_started" | "in_progress" | "completed";
}
interface WeeklyAssignment {
  id: string; engineerName: string; projectName: string;
  weekStart: string; currentStatus: string;
  resourceLockedFrom?: string; resourceLockedTill?: string;
  internalTarget?: string; customerTarget?: string;
  notes?: string; constraint?: string;
  tasks: Task[];
}
interface NBComment {
  id: string; text: string; date: string;
  type: "note"|"update"|"blocker"; createdAt: string;
}

// ── Task status options ────────────────────────────────────────────────────────
const TASK_STATUSES = [
  { v:"not_started", l:"Not Started",  bg:"bg-muted",             text:"text-muted-foreground",                         icon:<Circle className="h-3 w-3"/>        },
  { v:"in_progress", l:"In Progress",  bg:"bg-blue-500/10",       text:"text-blue-600 dark:text-blue-400",              icon:<Clock className="h-3 w-3"/>         },
  { v:"completed",   l:"Completed",    bg:"bg-green-500/10",      text:"text-green-600 dark:text-green-400",            icon:<CheckCircle2 className="h-3 w-3"/>  },
];

// ── Project phase statuses ─────────────────────────────────────────────────────
const PHASE_GROUPS = [
  { group:"Phase", items:[
    {v:"design_stage",l:"Design Stage"},{v:"electrical_design",l:"Electrical Design"},
    {v:"procurement_stage",l:"Procurement Stage"},{v:"waiting_for_materials",l:"Waiting for Materials"},
    {v:"mechanical_assembly",l:"Mechanical Assembly"},{v:"electrical_assembly",l:"Electrical Assembly"},
    {v:"installation_pending",l:"Installation Pending"},{v:"installation_in_progress",l:"Installation in Progress"},
    {v:"plc_power_up",l:"PLC Power Up"},{v:"io_check",l:"IO Check"},{v:"trials_stage",l:"Trials Stage"},
    {v:"fat",l:"F.A.T"},{v:"sat",l:"S.A.T"},
  ]},
  { group:"Outcome", items:[
    {v:"not_started",l:"Not Started"},{v:"in_progress",l:"In Progress"},
    {v:"on_hold",l:"On Hold"},{v:"blocked",l:"Blocked"},
    {v:"completed",l:"Completed ✓"},{v:"dispatch_stage",l:"Dispatch Stage"},
  ]},
];

const COMMENT_TYPES = [
  {v:"note",    l:"Note",    icon:"📝", bg:"bg-blue-500/10",  text:"text-blue-600 dark:text-blue-400"  },
  {v:"update",  l:"Update",  icon:"✅", bg:"bg-green-500/10", text:"text-green-600 dark:text-green-400"},
  {v:"blocker", l:"Blocker", icon:"🚧", bg:"bg-red-500/10",   text:"text-red-600 dark:text-red-400"   },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split("T")[0];
function todayD() { const d=new Date();d.setHours(0,0,0,0);return d; }
function weekBounds() {
  const d=todayD(),day=d.getDay();
  const mon=new Date(d);mon.setDate(d.getDate()-(day===0?6:day-1));
  const sun=new Date(mon);sun.setDate(mon.getDate()+6);
  return {mon,sun};
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
function taskStatus(s:string) {
  return TASK_STATUSES.find(t=>t.v===s)??TASK_STATUSES[0];
}
function phaseLabel(v:string){
  for(const g of PHASE_GROUPS) {
    const f=g.items.find(i=>i.v===v);
    if(f)return f.l;
  }
  return v;
}

// ── Week filter helpers ────────────────────────────────────────────────────────
function currentWeekStart(): string {
  const d=new Date(); d.setHours(0,0,0,0);
  const day=d.getDay();
  d.setDate(d.getDate()-(day===0?6:day-1));
  return d.toISOString().split("T")[0];
}
function getWeekOptions() {
  const opts: {value:string;label:string}[]=[];
  const now=new Date(); now.setHours(0,0,0,0);
  const day=now.getDay();
  const base=new Date(now); base.setDate(now.getDate()-(day===0?6:day-1));
  for(let i=0;i<8;i++){
    const ws=new Date(base); ws.setDate(base.getDate()-(i*7));
    const we=new Date(ws);   we.setDate(ws.getDate()+6);
    const val=ws.toISOString().split("T")[0];
    const lbl=i===0?"This week":i===1?"Last week":
      ws.toLocaleDateString("en-IN",{day:"numeric",month:"short"})+" – "+
      we.toLocaleDateString("en-IN",{day:"numeric",month:"short"});
    opts.push({value:val,label:lbl});
  }
  return opts;
}
const WEEK_OPTIONS=getWeekOptions();

// ── Task status mini picker ────────────────────────────────────────────────────
function TaskStatusPicker({current,onSelect,onClose}:{current:string;onSelect:(v:string)=>void;onClose:()=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))onClose();};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);
  return (
    <div ref={ref} className="absolute right-0 bottom-full mb-1 z-50 bg-background border rounded-xl shadow-2xl p-1.5 w-36">
      {TASK_STATUSES.map(s=>(
        <button key={s.v} onClick={()=>{onSelect(s.v);onClose();}}
          className={`w-full flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg transition-colors
            ${s.v===current?`${s.bg} ${s.text} font-semibold`:"hover:bg-muted text-foreground"}`}>
          {s.icon}{s.l}
        </button>
      ))}
    </div>
  );
}

// ── Individual task card ──────────────────────────────────────────────────────
function TaskItem({task, projectName, assignmentId, onUpdate, isUpdating}:{
  task:Task; projectName:string; assignmentId:string;
  onUpdate:(assignmentId:string,taskId:string,status:string)=>void;
  isUpdating:boolean;
}) {
  const [pickerOpen,setPickerOpen]=useState(false);
  const st=taskStatus(task.status);
  const isOverdue=task.assignedDate && task.assignedDate < todayStr() && task.status!=="completed";
  const od=isOverdue?overdueDays(task.assignedDate):0;

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all
      ${task.status==="completed"?"border-green-500/20 bg-green-500/5 opacity-70":"border-border bg-card hover:bg-muted/30"}
      ${isOverdue?"border-red-500/30 bg-red-500/5":""}`}>

      {/* Status icon */}
      <button onClick={()=>!isUpdating&&setPickerOpen(o=>!o)}
        className={`mt-0.5 flex-shrink-0 ${isUpdating?"opacity-50":"cursor-pointer hover:opacity-80"}`}
        title="Click to update status">
        <span className={`flex items-center justify-center w-5 h-5 rounded-full border-2 transition-all
          ${task.status==="completed"?"border-green-500 text-green-500":""}
          ${task.status==="in_progress"?"border-blue-500 text-blue-500":""}
          ${task.status==="not_started"?"border-muted-foreground/30 text-muted-foreground/30":""}`}>
          {task.status==="completed"
            ? <CheckCircle2 className="h-4 w-4 text-green-500 fill-green-500/20"/>
            : task.status==="in_progress"
              ? <Clock className="h-3 w-3 text-blue-500"/>
              : <Circle className="h-3 w-3"/>}
        </span>
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${task.status==="completed"?"line-through text-muted-foreground":"text-foreground"}`}>
          {task.taskName}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground font-medium">{projectName}</span>
          {task.assignedDate && task.type==="daily" && (
            <span className="text-[10px] text-muted-foreground">{fmtDate(task.assignedDate)}</span>
          )}
          {isOverdue && (
            <span className="text-[10px] font-bold text-red-500">⚠ {od}d overdue</span>
          )}
          {task.completionDate && (
            <span className="text-[10px] text-green-600 dark:text-green-400">Done {fmtDate(task.completionDate)}</span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      {task.status!=="completed" && (
        <div className="flex items-center gap-1 flex-shrink-0 relative" style={{overflow:"visible"}}>
          <button onClick={()=>!isUpdating&&onUpdate(assignmentId,task.id,"completed")}
            disabled={isUpdating}
            title="Click to mark this task as completed"
            className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg
              bg-muted text-muted-foreground border border-input
              hover:bg-green-100 hover:text-green-700 hover:border-green-300
              dark:hover:bg-green-950 dark:hover:text-green-300 dark:hover:border-green-800
              transition-colors disabled:opacity-40">
            {isUpdating?<Loader2 className="h-3 w-3 animate-spin"/>:<CheckCircle2 className="h-3 w-3"/>}
            Mark Done
          </button>
          <button onClick={()=>setPickerOpen(o=>!o)}
            className="p-1.5 rounded-lg border border-input hover:bg-muted transition-colors text-muted-foreground">
            <Edit2 className="h-3 w-3"/>
          </button>
          {pickerOpen && (
            <TaskStatusPicker
              current={task.status}
              onSelect={v=>{ onUpdate(assignmentId,task.id,v); setPickerOpen(false); }}
              onClose={()=>setPickerOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHead({icon,label,count,variant}:{icon:React.ReactNode;label:string;count:number;variant:"red"|"blue"|"gray"|"green"}) {
  const COLORS={
    red:  "text-red-600 dark:text-red-400 border-red-500/20 bg-red-500/5",
    blue: "text-blue-600 dark:text-blue-400 border-blue-500/20 bg-blue-500/5",
    gray: "text-muted-foreground border-border bg-muted/30",
    green:"text-green-600 dark:text-green-400 border-green-500/20 bg-green-500/5",
  };
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${COLORS[variant]}`}>
      <span className="flex items-center gap-2 text-xs font-bold">{icon}{label}</span>
      <span className="text-xs font-bold opacity-70">{count}</span>
    </div>
  );
}

// ── Quick Assign + Task Modal ──────────────────────────────────────────────────
function QuickAssignModal({onClose, onSaved}:{onClose:()=>void;onSaved:()=>void}) {
  const {toast}=useToast();
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({
    engineerName:"", projectName:"", currentStatus:"not_started",
    resourceLockedFrom:"", resourceLockedTill:"",
    internalTarget:"", customerTarget:"", constraint:"",
  });
  const [tasks,setTasks]=useState<{id:string;taskName:string;type:"weekly"|"daily";assignedDate:string;status:string}[]>([]);
  const [newTask,setNewTask]=useState({taskName:"",type:"weekly" as "weekly"|"daily",assignedDate:todayStr()});

  const {data:masterEngineers=[]}=useQuery<{id:string;name:string;initials:string}[]>({
    queryKey:["/api/engineers-master-list"],
    queryFn:async()=>{const r=await fetch("/api/engineers-master-list");return r.ok?r.json():[];},
  });
  const {data:projectNames=[]}=useQuery<string[]>({
    queryKey:["/api/project-names"],
    queryFn:async()=>{const r=await fetch("/api/project-names");return r.ok?r.json():[];},
  });

  const addTask=()=>{
    if(!newTask.taskName.trim())return;
    setTasks(p=>[...p,{
      id:`t-${Date.now()}`,taskName:newTask.taskName.trim(),
      type:newTask.type,assignedDate:newTask.assignedDate,status:"not_started",
    }]);
    setNewTask(p=>({...p,taskName:""}));
  };

  const removeTask=(id:string)=>setTasks(p=>p.filter(t=>t.id!==id));

  const save=async()=>{
    if(!form.engineerName||!form.projectName){
      toast({title:"Engineer and Project are required",variant:"destructive"});return;
    }
    setSaving(true);
    try {
      const weekStart=new Date();
      weekStart.setDate(weekStart.getDate()-(weekStart.getDay()===0?6:weekStart.getDay()-1));
      await apiRequest("POST","/api/weekly-assignments",{
        ...form,weekStart:weekStart.toISOString().split("T")[0],
        tasks:tasks.map(t=>({...t,targetDate:t.assignedDate,completionDate:undefined})),
      },true);
      toast({title:"Assignment added with "+tasks.length+" task"+( tasks.length!==1?"s":"")});
      onSaved(); onClose();
    } catch(e:any){toast({title:e?.message||"Failed",variant:"destructive"});}
    finally{setSaving(false);}
  };

  const f="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary"/>Assign Weekly Tasks
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add tasks for an engineer under a project
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4"/>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Engineer + Project */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Engineer *</label>
              <select value={form.engineerName} onChange={e=>setForm(f=>({...f,engineerName:e.target.value}))} className={f}>
                <option value="">Select engineer…</option>
                {masterEngineers.map(e=><option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Project *</label>
              <input list="qs-projects" value={form.projectName}
                onChange={e=>setForm(f=>({...f,projectName:e.target.value}))}
                placeholder="Type or select…" className={f}/>
              <datalist id="qs-projects">{projectNames.map(n=><option key={n} value={n}/>)}</datalist>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Project Phase / Status</label>
            <select value={form.currentStatus} onChange={e=>setForm(f=>({...f,currentStatus:e.target.value}))} className={f}>
              {PHASE_GROUPS.map(g=>(
                <optgroup key={g.group} label={g.group}>
                  {g.items.map(s=><option key={s.v} value={s.v}>{s.l}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Dates (optional) */}
          <details>
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground py-1 select-none">
              ▶ Resource dates (optional)
            </summary>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {[
                {k:"resourceLockedFrom",l:"Locked From"},
                {k:"resourceLockedTill",l:"Locked Till"},
                {k:"internalTarget",l:"Internal Target"},
                {k:"customerTarget",l:"Customer Target"},
              ].map(({k,l})=>(
                <div key={k} className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{l}</label>
                  <input type="date" value={(form as any)[k]}
                    onChange={e=>setForm(prev=>({...prev,[k]:e.target.value}))} className={f}/>
                </div>
              ))}
            </div>
          </details>

          {/* Task list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Tasks <span className="text-muted-foreground/50">({tasks.length} added)</span>
              </label>
            </div>

            {/* Existing tasks */}
            {tasks.length>0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {tasks.map(t=>(
                  <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
                      ${t.type==="daily"?"bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300":"bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"}`}>
                      {t.type==="daily"?`Daily · ${fmtDate(t.assignedDate)}`:"Weekly"}
                    </span>
                    <span className="flex-1 text-xs text-foreground truncate">{t.taskName}</span>
                    <button onClick={()=>removeTask(t.id)}
                      className="text-muted-foreground/50 hover:text-red-500 transition-colors flex-shrink-0">
                      <X className="h-3.5 w-3.5"/>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new task */}
            <div className="border rounded-xl p-3 space-y-2.5 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground">Add task</p>
              <input value={newTask.taskName} onChange={e=>setNewTask(p=>({...p,taskName:e.target.value}))}
                onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addTask();}}}
                placeholder="e.g. Complete IO check on panel A…"
                className={f+" text-xs py-2"}/>
              <div className="flex gap-2 items-center">
                <select value={newTask.type} onChange={e=>setNewTask(p=>({...p,type:e.target.value as any}))}
                  className={f+" flex-1 text-xs py-2"}>
                  <option value="weekly">Weekly task</option>
                  <option value="daily">Daily task</option>
                </select>
                {newTask.type==="daily" && (
                  <input type="date" value={newTask.assignedDate}
                    onChange={e=>setNewTask(p=>({...p,assignedDate:e.target.value}))}
                    className={f+" flex-1 text-xs py-2"}/>
                )}
                <Button size="sm" onClick={addTask} disabled={!newTask.taskName.trim()} className="flex-shrink-0 gap-1">
                  <Plus className="h-3.5 w-3.5"/>Add
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Press Enter or click Add after typing each task</p>
            </div>
          </div>

          {/* Constraint */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Constraints / Notes</label>
            <textarea value={form.constraint} rows={2}
              onChange={e=>setForm(f=>({...f,constraint:e.target.value}))}
              placeholder="Any blockers or dependencies…"
              className={f+" resize-none"}/>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t bg-muted/20 flex-shrink-0">
          <Button onClick={save} disabled={saving} className="flex-1 gap-2">
            {saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}
            {saving?"Saving…":`Assign${tasks.length>0?` with ${tasks.length} task${tasks.length>1?"s":""}`:" (no tasks)"}`}
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main EngineerWorkspace ─────────────────────────────────────────────────────
export function EngineerWorkspace() {
  const {user,isAdmin}=useAuth();
  const {toast}=useToast();
  const engineerName=user?.name??user?.username??"";

  const [commentText, setCommentText]  = useState("");
  const [commentType, setCommentType]  = useState<"note"|"update"|"blocker">("note");
  const [submitting,  setSubmitting]   = useState(false);
  const [comments,    setComments]     = useState<NBComment[]>([]);
  const [dismissed,   setDismissed]    = useState<string[]>([]);
  const [nbLoaded,    setNbLoaded]     = useState(false);
  const [showAssign,        setShowAssign]        = useState(false);
  const [viewMode,          setViewMode]          = useState<"mine"|"all">("mine");
  const [adminWeekFilter,   setAdminWeekFilter]   = useState(currentWeekStart());
  const [adminStatusFilter, setAdminStatusFilter] = useState("all");
  const [showDone,    setShowDone]     = useState(false);
  const [updatingTask,setUpdatingTask] = useState<string|null>(null);

  const {data:allAssignments=[],isLoading}=useQuery<WeeklyAssignment[]>({
    queryKey:["/api/weekly-assignments"],staleTime:60000,
  });

  const mine=useMemo(()=>
    allAssignments.filter(a=>a.engineerName?.trim().toLowerCase()===engineerName.trim().toLowerCase()),
    [allAssignments,engineerName]
  );

  // Admin: filter + group assignments by engineer
  const filteredAdminAssignments=useMemo(()=>{
    if(!isAdmin) return [];
    return allAssignments.filter(a=>{
      // Week filter: match weekStart OR task assignedDate falls in selected week
      const weekMatch = a.weekStart===adminWeekFilter ||
        (a.tasks??[]).some(t=>t.assignedDate?.startsWith(adminWeekFilter.slice(0,7)) &&
          t.assignedDate>=adminWeekFilter &&
          t.assignedDate<=adminWeekFilter.slice(0,8)+"6");
      if(!weekMatch) return false;
      // Status filter
      if(adminStatusFilter==="all") return true;
      return (a.tasks??[]).some(t=>t.status===adminStatusFilter) ||
             a.currentStatus===adminStatusFilter;
    });
  },[allAssignments,isAdmin,adminWeekFilter,adminStatusFilter]);

  const byEngineer=useMemo(()=>{
    if(!isAdmin) return {};
    const map: Record<string,typeof allAssignments>={};
    filteredAdminAssignments.forEach(a=>{
      const k=a.engineerName?.trim()||"Unassigned";
      if(!map[k]) map[k]=[];
      map[k].push(a);
    });
    return map;
  },[filteredAdminAssignments,isAdmin]);

  // Flatten all tasks from my assignments
  const allTasks=useMemo(()=>
    mine.flatMap(a=>(a.tasks??[]).map(t=>({...t,projectName:a.projectName,assignmentId:a.id}))),
    [mine]
  );

  const today=todayStr();
  const {mon,sun}=weekBounds();

  const overdueTasks=useMemo(()=>
    allTasks.filter(t=>{
      if(t.status==="completed")return false;
      if(dismissed.includes(t.id))return false;
      const d=t.assignedDate??t.targetDate;
      if(!d)return false;
      return new Date(d)<todayD();
    }),
    [allTasks,dismissed]
  );

  const todayTasks=useMemo(()=>
    allTasks.filter(t=>{
      if(t.status==="completed")return false;
      if(t.type==="daily")return t.assignedDate===today;
      return false; // weekly tasks shown separately
    }),
    [allTasks,today]
  );

  const weeklyTasks=useMemo(()=>
    allTasks.filter(t=>{
      if(t.status==="completed")return false;
      return t.type==="weekly";
    }),
    [allTasks]
  );

  const doneTasks=useMemo(()=>
    allTasks.filter(t=>t.status==="completed"),
    [allTasks]
  );

  // Load notice board
  useEffect(()=>{
    if(!engineerName)return;
    (async()=>{
      try {
        const r=await fetch(`/api/notice-board/${encodeURIComponent(engineerName)}`);
        if(r.ok){const d=await r.json();setComments(d.comments??[]);setDismissed(d.dismissedMissed??[]);}
      }catch{}finally{setNbLoaded(true);}
    })();
  },[engineerName]);

  // Update task status
  const handleTaskUpdate=async(assignmentId:string,taskId:string,status:string)=>{
    setUpdatingTask(taskId);
    try {
      await apiRequest("PATCH",`/api/weekly-assignments/${encodeURIComponent(assignmentId)}/task-status`,
        {taskId,status},true);
      queryClient.invalidateQueries({queryKey:["/api/weekly-assignments"]});
      toast({title:status==="completed"?"✓ Task completed!":"Status updated"});
    }catch{toast({title:"Update failed",variant:"destructive"});}
    finally{setUpdatingTask(null);}
  };

  const addComment=async()=>{
    if(!commentText.trim()||!engineerName)return;
    setSubmitting(true);
    try {
      const r=await fetch(`/api/notice-board/${encodeURIComponent(engineerName)}/comment`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text:commentText.trim(),type:commentType,date:today}),
      });
      if(r.ok){const c=await r.json();setComments(p=>[...p,c]);setCommentText("");}
    }catch{}finally{setSubmitting(false);}
  };

  const deleteComment=async(id:string)=>{
    try {
      await fetch(`/api/notice-board/${encodeURIComponent(engineerName)}/comment/${id}`,{method:"DELETE"});
      setComments(p=>p.filter(c=>c.id!==id));
    }catch{}
  };

  const todayComments=comments.filter(c=>c.date===today);
  const olderComments=comments.filter(c=>c.date!==today).slice(-5).reverse();
  const todayFmt=new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"});

  if(!user) return (
    <div className="border rounded-2xl p-10 text-center bg-card">
      <LayoutDashboard className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3"/>
      <p className="text-sm font-semibold">Log in to see your workspace</p>
    </div>
  );
  if(isLoading) return (
    <div className="border rounded-2xl p-8 flex items-center justify-center gap-3 bg-card">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/>
      <span className="text-sm text-muted-foreground">Loading your workspace…</span>
    </div>
  );

  const totalPending=overdueTasks.length+todayTasks.length+weeklyTasks.length;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary"/>My Workspace
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="font-semibold text-foreground">{user.name??engineerName}</span> · {todayFmt}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle — admin only */}
          {isAdmin && (
            <div className="flex items-center gap-0 border rounded-xl overflow-hidden">
              <button onClick={()=>setViewMode("mine")}
                className={`text-xs font-semibold px-3 py-1.5 transition-colors
                  ${viewMode==="mine"?"bg-primary text-primary-foreground":"hover:bg-muted text-muted-foreground"}`}>
                My Tasks
              </button>
              <button onClick={()=>setViewMode("all")}
                className={`text-xs font-semibold px-3 py-1.5 transition-colors border-l
                  ${viewMode==="all"?"bg-primary text-primary-foreground":"hover:bg-muted text-muted-foreground"}`}>
                All Engineers
              </button>
            </div>
          )}
          {viewMode==="mine" && overdueTasks.length>0 && <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 font-bold">{overdueTasks.length} overdue</span>}
          {viewMode==="mine" && todayTasks.length>0    && <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-500 font-bold">{todayTasks.length} today</span>}
          {viewMode==="mine" && weeklyTasks.length>0   && <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">{weeklyTasks.length} weekly</span>}
          {viewMode==="mine" && doneTasks.length>0     && <span className="text-xs px-2.5 py-1 rounded-full bg-green-500/10 text-green-500 font-medium">{doneTasks.length} done</span>}
          {viewMode==="all"  && <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">{filteredAdminAssignments.length} assignments</span>}
          {isAdmin && (
            <button onClick={()=>setShowAssign(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              <Plus className="h-3.5 w-3.5"/>Assign Tasks
            </button>
          )}
        </div>
      </div>

      {(isAdmin && viewMode==="all") ? (
        <div className="space-y-4">

          {/* ── Admin filters ── */}
          <div className="flex flex-wrap gap-3 items-center p-4 border rounded-2xl bg-card">
            {/* Week selector */}
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0"/>
              <select
                value={adminWeekFilter}
                onChange={e=>setAdminWeekFilter(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary border-input">
                {WEEK_OPTIONS.map(w=>(
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>
            {/* Status filter pills */}
            <div className="flex gap-1.5 flex-wrap">
              {[
                {v:"all",          l:"All Status",   dot:""},
                {v:"not_started",  l:"Not Started",  dot:"bg-muted-foreground/50"},
                {v:"in_progress",  l:"In Progress",  dot:"bg-blue-500"},
                {v:"completed",    l:"Completed",    dot:"bg-green-500"},
              ].map(s=>(
                <button key={s.v} onClick={()=>setAdminStatusFilter(s.v)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all
                    ${adminStatusFilter===s.v
                      ?"bg-primary text-primary-foreground border-primary"
                      :"bg-muted/50 text-muted-foreground border-muted-foreground/20 hover:bg-muted"}`}>
                  {s.dot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`}/>}
                  {s.l}
                </button>
              ))}
            </div>
            {/* Result count */}
            <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
              {filteredAdminAssignments.length} assignment{filteredAdminAssignments.length!==1?"s":""}
              {" · "}{filteredAdminAssignments.reduce((s,a)=>s+(a.tasks??[]).length,0)} tasks
            </span>
          </div>

          {Object.keys(byEngineer).length===0 && (
            <div className="border rounded-2xl p-8 text-center bg-card">
              <p className="text-sm font-semibold text-foreground">No assignments found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {adminStatusFilter!=="all"
                  ? `No "${adminStatusFilter.replace(/_/g," ")}" tasks for the selected week`
                  : "No assignments for the selected week. Try a different week or use \"Assign Tasks\" above."
                }
              </p>
            </div>
          )}
          {Object.entries(byEngineer).sort(([a],[b])=>a.localeCompare(b)).map(([eng,assignments])=>{
            const allTks=assignments.flatMap((a:any)=>(a.tasks??[]).map((t:any)=>({...t,projectName:a.projectName,assignmentId:a.id})));
            const pending=allTks.filter((t:any)=>t.status!=="completed").length;
            const done=allTks.filter((t:any)=>t.status==="completed").length;
            const overdue=allTks.filter((t:any)=>t.status!=="completed"&&t.assignedDate&&t.assignedDate<todayStr()).length;
            return (
              <div key={eng} className="border rounded-2xl overflow-hidden bg-card">
                <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                    {eng.split(" ").map((n:string)=>n[0]).slice(0,2).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{eng}</p>
                    <p className="text-[11px] text-muted-foreground">{assignments.length} project{assignments.length!==1?"s":""} · {allTks.length} task{allTks.length!==1?"s":""}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {overdue>0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">{overdue} overdue</span>}
                    {pending>0 && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">{pending} pending</span>}
                    {done>0    && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">{done} done</span>}
                  </div>
                </div>
                <div className="divide-y">
                  {assignments.map((a:any)=>(
                    <div key={a.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground line-clamp-1 flex-1" title={a.projectName}>
                          📁 {a.projectName}
                        </p>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                          {(a.currentStatus??"").replace(/_/g," ")}
                        </span>
                      </div>
                      {(a.tasks??[]).length===0 && (
                        <p className="text-xs text-muted-foreground italic pl-4">No tasks assigned yet</p>
                      )}
                      {(a.tasks??[])
                        .filter((t:any)=>adminStatusFilter==="all"||t.status===adminStatusFilter)
                        .map((t:any)=>(
                          <TaskItem key={t.id} task={t} projectName="" assignmentId={a.id}
                            onUpdate={handleTaskUpdate} isUpdating={updatingTask===t.id}/>
                        ))}
                      {(a.tasks??[]).length>0 &&
                       adminStatusFilter!=="all" &&
                       (a.tasks??[]).filter((t:any)=>t.status===adminStatusFilter).length===0 && (
                        <p className="text-xs text-muted-foreground italic pl-4">
                          No {adminStatusFilter.replace(/_/g," ")} tasks in this assignment
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

        {/* ── Left: Task lists ── */}
        <div className="space-y-3 min-w-0">

          {totalPending===0 && (
            <div className="border rounded-2xl p-10 text-center bg-card">
              <CheckCircle2 className="h-10 w-10 mx-auto text-green-500/50 mb-3"/>
              <p className="text-sm font-semibold">All caught up!</p>
              <p className="text-xs text-muted-foreground mt-1">
                {isAdmin?"Use "+ '"Assign Tasks"'+" above to add tasks for your engineers."
                        :"No tasks assigned yet. Check with your lead."}
              </p>
            </div>
          )}

          {/* Overdue */}
          {overdueTasks.length>0 && (
            <div className="space-y-2">
              <SectionHead icon={<AlertTriangle className="h-3.5 w-3.5"/>} label="Overdue — take action now" count={overdueTasks.length} variant="red"/>
              {overdueTasks.map(t=>(
                <TaskItem key={t.id} task={t} projectName={t.projectName} assignmentId={t.assignmentId}
                  onUpdate={handleTaskUpdate} isUpdating={updatingTask===t.id}/>
              ))}
            </div>
          )}

          {/* Today's daily tasks */}
          {todayTasks.length>0 && (
            <div className="space-y-2">
              <SectionHead icon={<Zap className="h-3.5 w-3.5"/>} label="Daily Tasks — Today" count={todayTasks.length} variant="blue"/>
              {todayTasks.map(t=>(
                <TaskItem key={t.id} task={t} projectName={t.projectName} assignmentId={t.assignmentId}
                  onUpdate={handleTaskUpdate} isUpdating={updatingTask===t.id}/>
              ))}
            </div>
          )}

          {/* Weekly tasks */}
          {weeklyTasks.length>0 && (
            <div className="space-y-2">
              <SectionHead icon={<Calendar className="h-3.5 w-3.5"/>} label="Weekly Tasks — This Week" count={weeklyTasks.length} variant="gray"/>
              {weeklyTasks.map(t=>(
                <TaskItem key={t.id} task={t} projectName={t.projectName} assignmentId={t.assignmentId}
                  onUpdate={handleTaskUpdate} isUpdating={updatingTask===t.id}/>
              ))}
            </div>
          )}

          {/* Completed (collapsible) */}
          {doneTasks.length>0 && (
            <div className="space-y-2">
              <button onClick={()=>setShowDone(e=>!e)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-muted/30 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500"/>
                  Completed tasks ({doneTasks.length})
                </span>
                {showDone?<ChevronUp className="h-3.5 w-3.5"/>:<ChevronDown className="h-3.5 w-3.5"/>}
              </button>
              {showDone && doneTasks.map(t=>(
                <TaskItem key={t.id} task={t} projectName={t.projectName} assignmentId={t.assignmentId}
                  onUpdate={handleTaskUpdate} isUpdating={updatingTask===t.id}/>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Daily log + summary ── */}
        <div className="space-y-3">
          <div className="border rounded-2xl overflow-hidden bg-card">
            <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground"/>
              <span className="text-sm font-semibold">Daily Log</span>
              <span className="text-xs text-muted-foreground ml-auto">{new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span>
            </div>
            <div className="px-4 py-3 space-y-2 max-h-52 overflow-y-auto">
              {!nbLoaded && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin"/>Loading…</div>}
              {nbLoaded && todayComments.length===0 && <p className="text-xs text-muted-foreground italic">No entries today.</p>}
              {todayComments.map(c=>{
                const ct=COMMENT_TYPES.find(t=>t.v===c.type)??COMMENT_TYPES[0];
                return (
                  <div key={c.id} className={`flex items-start gap-2 p-2.5 rounded-xl ${ct.bg}`}>
                    <span className="text-sm flex-shrink-0">{ct.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug ${ct.text}`}>{c.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(c.createdAt)}</p>
                    </div>
                    <button onClick={()=>deleteComment(c.id)} className="text-muted-foreground/30 hover:text-red-500 transition-colors flex-shrink-0">
                      <Trash2 className="h-3 w-3"/>
                    </button>
                  </div>
                );
              })}
              {olderComments.length>0 && (
                <details>
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground py-1 select-none">
                    ▶ Previous ({olderComments.length})
                  </summary>
                  <div className="space-y-1.5 mt-1.5">
                    {olderComments.map(c=>{
                      const ct=COMMENT_TYPES.find(t=>t.v===c.type)??COMMENT_TYPES[0];
                      return (
                        <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 opacity-70">
                          <span className="text-xs">{ct.icon}</span>
                          <div><p className="text-xs">{c.text}</p><p className="text-[10px] text-muted-foreground">{c.date} · {timeAgo(c.createdAt)}</p></div>
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
                      ${commentType===t.v?`${t.bg} ${t.text} border-current/20`:"bg-muted text-muted-foreground border-transparent"}`}>
                    {t.icon}{t.l}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={commentText} onChange={e=>setCommentText(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addComment();}}}
                  placeholder="Log your progress…"
                  className="flex-1 border rounded-lg px-3 py-2 text-xs bg-background outline-none focus:ring-2 focus:ring-primary border-input"/>
                <Button size="sm" onClick={addComment} disabled={submitting||!commentText.trim()} className="flex-shrink-0">
                  {submitting?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Send className="h-3.5 w-3.5"/>}
                </Button>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="border rounded-2xl p-4 bg-card space-y-2">
            <p className="text-xs font-semibold flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-muted-foreground"/>Week at a glance
            </p>
            {[
              {l:"Total tasks",    v:allTasks.length,       c:"text-foreground"                                    },
              {l:"Overdue",        v:overdueTasks.length,   c:overdueTasks.length>0?"text-red-500":"text-foreground"},
              {l:"Today (daily)",  v:todayTasks.length,     c:todayTasks.length>0?"text-blue-500":"text-foreground" },
              {l:"Weekly",         v:weeklyTasks.length,    c:"text-muted-foreground"                              },
              {l:"Completed",      v:doneTasks.length,      c:doneTasks.length>0?"text-green-500":"text-foreground" },
              {l:"Log entries",    v:todayComments.length,  c:"text-muted-foreground"                              },
            ].map(r=>(
              <div key={r.l} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{r.l}</span>
                <span className={`font-bold ${r.c}`}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {showAssign && isAdmin && (
        <QuickAssignModal
          onClose={()=>setShowAssign(false)}
          onSaved={()=>queryClient.invalidateQueries({queryKey:["/api/weekly-assignments"]})}
        />
      )}
    </div>
  );
}
