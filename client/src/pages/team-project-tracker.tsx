import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Briefcase, Users, ChevronLeft, Search, Filter,
  Edit2, Plus, AlertTriangle, Trash2, ChevronDown,
  X, Calendar, Clock, Target, FileText, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { useState, useMemo, useRef, useEffect } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import { format, startOfWeek } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WeeklyAssignment {
  id: string; engineerName: string; projectName: string; weekStart: string;
  projectTargetDate?: string; resourceLockedFrom?: string; resourceLockedTill?: string;
  internalTarget?: string; customerTarget?: string; currentStatus: string;
  notes?: string; constraint?: string;
  tasks: Array<{ id:string; taskName:string; targetDate?:string; completionDate?:string; status:string }>;
}
interface EngineerRowData {
  assignmentId: string; name: string;
  resourceLockedFrom?: string; resourceLockedTill?: string;
  resourceLockDays: number; daysExceeded: number;
  internalTarget?: string; customerTarget?: string;
  currentStatus: string; constraint?: string;
}
interface ProjectRow { projectName: string; engineers: EngineerRowData[]; }

// ── Status config ─────────────────────────────────────────────────────────────
const statusColors: Record<string,string> = {
  not_started:"bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  in_progress:"bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed:"bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  on_hold:"bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  blocked:"bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  design_stage:"bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  electrical_design:"bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  procurement_stage:"bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  waiting_for_materials:"bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  mechanical_assembly:"bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  electrical_assembly:"bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  installation_pending:"bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  installation_in_progress:"bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  plc_power_up:"bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  io_check:"bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",
  trials_stage:"bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  fat:"bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200",
  sat:"bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  dispatch_stage:"bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};
const statusLabels: Record<string,string> = {
  not_started:"Not Started", in_progress:"In Progress", completed:"Completed",
  on_hold:"On Hold", blocked:"Blocked", design_stage:"Design Stage",
  electrical_design:"Electrical Design", procurement_stage:"Procurement Stage",
  waiting_for_materials:"Waiting for Materials", mechanical_assembly:"Mechanical Assembly",
  electrical_assembly:"Electrical Assembly", installation_pending:"Installation Pending",
  installation_in_progress:"Installation in Progress", plc_power_up:"PLC Power Up",
  io_check:"IO Check", trials_stage:"Trials Stage", fat:"F.A.T", sat:"S.A.T",
  dispatch_stage:"Dispatch Stage",
};
const STATUS_GROUPS = [
  { label:"General", items:[{value:"not_started",label:"Not Started"},{value:"on_hold",label:"On Hold"},{value:"blocked",label:"Blocked"},{value:"completed",label:"Completed"}]},
  { label:"Design & Procurement", items:[{value:"design_stage",label:"Design Stage"},{value:"electrical_design",label:"Electrical Design"},{value:"procurement_stage",label:"Procurement Stage"},{value:"waiting_for_materials",label:"Waiting for Materials"}]},
  { label:"Assembly & Installation", items:[{value:"mechanical_assembly",label:"Mechanical Assembly"},{value:"electrical_assembly",label:"Electrical Assembly"},{value:"installation_pending",label:"Installation Pending"},{value:"installation_in_progress",label:"Installation in Progress"}]},
  { label:"Testing & Commissioning", items:[{value:"plc_power_up",label:"PLC Power Up"},{value:"io_check",label:"IO Check"},{value:"trials_stage",label:"Trials Stage"},{value:"fat",label:"F.A.T"},{value:"sat",label:"S.A.T"}]},
  { label:"Completion", items:[{value:"in_progress",label:"In Progress"},{value:"dispatch_stage",label:"Dispatch Stage"}]},
];

function calcLockDays(from?:string, till?:string):number {
  if(!from||!till)return 0;
  return Math.max(0,Math.ceil((new Date(till).getTime()-new Date(from).getTime())/(864e5)));
}
function calcDaysExceeded(till?:string):number {
  if(!till)return 0;
  const today=new Date(); today.setHours(0,0,0,0);
  const t=new Date(till); t.setHours(0,0,0,0);
  return Math.max(0,Math.ceil((today.getTime()-t.getTime())/864e5));
}
function groupByProject(assignments:WeeklyAssignment[]):ProjectRow[] {
  const map:Record<string,ProjectRow>={};
  assignments.forEach(a=>{
    const k=a.projectName.toLowerCase().trim();
    if(!map[k])map[k]={projectName:a.projectName,engineers:[]};
    if(!map[k].engineers.find(e=>e.assignmentId===a.id)){
      map[k].engineers.push({
        assignmentId:a.id, name:a.engineerName,
        resourceLockedFrom:a.resourceLockedFrom, resourceLockedTill:a.resourceLockedTill,
        resourceLockDays:calcLockDays(a.resourceLockedFrom,a.resourceLockedTill),
        daysExceeded:calcDaysExceeded(a.resourceLockedTill),
        internalTarget:a.internalTarget, customerTarget:a.customerTarget,
        currentStatus:a.currentStatus, constraint:a.constraint,
      });
    }
  });
  return Object.values(map).sort((a,b)=>a.projectName.localeCompare(b.projectName));
}
function fmtDate(d?:string){
  if(!d)return"—";
  return new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
}
function getInitials(name:string){return name.split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase();}
function daysFromToday(d?:string):number{
  if(!d)return 0;
  const t=new Date(d); t.setHours(0,0,0,0);
  const now=new Date(); now.setHours(0,0,0,0);
  return Math.ceil((t.getTime()-now.getTime())/864e5);
}

// ── Detail panel info row ─────────────────────────────────────────────────────
function InfoRow({icon,label,value,accent}:{icon:React.ReactNode;label:string;value:React.ReactNode;accent?:boolean}){
  return(
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <div className={`text-sm font-medium ${accent?"text-red-500 dark:text-red-400":""}`}>{value}</div>
      </div>
    </div>
  );
}

export default function TeamProjectTracker() {
  const {toast}   = useToast();
  const {isAdmin} = useAuth();

  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState("all");
  const [selectedKey,    setSelectedKey]    = useState<string|null>(null);
  const [editOpen,       setEditOpen]       = useState(false);
  const [addOpen,        setAddOpen]        = useState(false);
  const [deleteOpen,     setDeleteOpen]     = useState(false);
  const [editingA,       setEditingA]       = useState<WeeklyAssignment|null>(null);
  const [deletingA,      setDeletingA]      = useState<{id:string;projectName:string;engineerName:string}|null>(null);
  const [selectedEng,    setSelectedEng]    = useState<EngineerRowData|null>(null); // which engineer row in detail

  const [formData, setFormData] = useState({
    engineerName:"", projectName:"",
    resourceLockedFrom:"", resourceLockedTill:"",
    internalTarget:"", customerTarget:"",
    currentStatus:"not_started", constraint:"",
  });

  const {data:assignments=[],isLoading}=useQuery<WeeklyAssignment[]>({
    queryKey:["/api/weekly-assignments"],
    queryFn:async()=>{const r=await fetch("/api/weekly-assignments");if(!r.ok)throw new Error("failed");return r.json();},
    staleTime:0, refetchOnMount:true,
  });
  const {data:projectNames=[]}=useQuery<string[]>({
    queryKey:["/api/project-names"],
    queryFn:async()=>{const r=await fetch("/api/project-names");if(!r.ok)throw new Error("failed");return r.json();},
  });
  const {data:masterEngineers=[]}=useQuery<{id:string;name:string;initials:string}[]>({
    queryKey:["/api/engineers-master-list"],
    queryFn:async()=>{const r=await fetch("/api/engineers-master-list");if(!r.ok)throw new Error("failed");return r.json();},
  });

  // Engineer picker
  const [pickerOpen,  setPickerOpen]  = useState(false);
  const [engSearch,   setEngSearch]   = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(pickerRef.current&&!pickerRef.current.contains(e.target as Node))setPickerOpen(false);};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[]);
  const selectedEngNames = useMemo(()=>formData.engineerName.split(",").map(n=>n.trim()).filter(Boolean),[formData.engineerName]);
  const toggleEng = (name:string)=>{
    const exists=selectedEngNames.includes(name);
    const updated=exists?selectedEngNames.filter(n=>n!==name):[...selectedEngNames,name];
    setFormData(p=>({...p,engineerName:updated.join(", ")}));
  };
  const filteredEngineers=useMemo(()=>!engSearch.trim()?masterEngineers:masterEngineers.filter(e=>e.name.toLowerCase().includes(engSearch.toLowerCase())),[masterEngineers,engSearch]);

  // Data
  const activeAssignments=useMemo(()=>assignments.filter(a=>a.currentStatus!=="completed"),[assignments]);
  const projectRows=useMemo(()=>groupByProject(activeAssignments),[activeAssignments]);
  const filtered=useMemo(()=>projectRows.filter(p=>{
    if(p.engineers.every(e=>e.currentStatus==="completed"))return false;
    const mQ=p.projectName.toLowerCase().includes(search.toLowerCase())||
      p.engineers.some(e=>e.name.toLowerCase().includes(search.toLowerCase()));
    const mS=statusFilter==="all"||p.engineers.some(e=>e.currentStatus===statusFilter);
    return mQ&&mS;
  }),[projectRows,search,statusFilter]);

  const selectedProject = useMemo(()=>filtered.find(p=>p.projectName.toLowerCase().trim()===selectedKey)||filtered[0]||null,[filtered,selectedKey]);
  useEffect(()=>{
    if(selectedProject){
      setSelectedKey(selectedProject.projectName.toLowerCase().trim());
      if(!selectedEng||!selectedProject.engineers.find(e=>e.assignmentId===selectedEng.assignmentId))
        setSelectedEng(selectedProject.engineers[0]||null);
    }
  },[selectedProject]);

  const uniqueEngineers=useMemo(()=>{const s=new Set<string>();assignments.forEach(a=>s.add(a.engineerName));return Array.from(s);},[assignments]);
  const activeProjects=useMemo(()=>projectRows.filter(p=>p.engineers.some(e=>e.currentStatus==="in_progress")).length,[projectRows]);

  // Mutations
  const resetForm=()=>{setFormData({engineerName:"",projectName:"",resourceLockedFrom:"",resourceLockedTill:"",internalTarget:"",customerTarget:"",currentStatus:"not_started",constraint:""});setPickerOpen(false);setEngSearch("");};

  const updateMutation=useMutation({
    mutationFn:async({id,...data}:Partial<WeeklyAssignment>&{id:string})=>apiRequest("PATCH",`/api/weekly-assignments/${encodeURIComponent(id)}`,data,true),
    onSuccess:()=>{queryClient.invalidateQueries({queryKey:["/api/weekly-assignments"]});toast({title:"Updated successfully"});setEditOpen(false);setEditingA(null);},
    onError:(e:any)=>toast({title:e?.message||"Update failed",variant:"destructive"}),
  });
  const addMutation=useMutation({
    mutationFn:async(data:Partial<WeeklyAssignment>)=>apiRequest("POST","/api/weekly-assignments",data,true),
    onSuccess:()=>{queryClient.invalidateQueries({queryKey:["/api/weekly-assignments"]});toast({title:"Assignment added"});setAddOpen(false);resetForm();},
    onError:(e:any)=>toast({title:e?.message||"Add failed",variant:"destructive"}),
  });
  const deleteMutation=useMutation({
    mutationFn:async(id:string)=>apiRequest("DELETE",`/api/weekly-assignments/${encodeURIComponent(id)}`,undefined,true),
    onSuccess:()=>{queryClient.invalidateQueries({queryKey:["/api/weekly-assignments"]});toast({title:"Deleted"});setDeleteOpen(false);setDeletingA(null);setSelectedEng(null);},
    onError:(e:any)=>toast({title:e?.message||"Delete failed",variant:"destructive"}),
  });

  const handleEdit=(assignmentId:string)=>{
    const a=assignments.find(x=>x.id===assignmentId);
    if(a){
      setEditingA(a);
      setFormData({engineerName:a.engineerName||"",projectName:a.projectName||"",resourceLockedFrom:a.resourceLockedFrom||"",resourceLockedTill:a.resourceLockedTill||"",internalTarget:a.internalTarget||"",customerTarget:a.customerTarget||"",currentStatus:a.currentStatus||"not_started",constraint:a.constraint||""});
      setEditOpen(true);
    }
  };
  const handleSaveEdit=()=>{
    if(!editingA)return;
    updateMutation.mutate({id:editingA.id,weekStart:editingA.weekStart,projectName:formData.projectName,projectTargetDate:editingA.projectTargetDate,tasks:editingA.tasks,notes:editingA.notes,engineerName:formData.engineerName,resourceLockedFrom:formData.resourceLockedFrom||undefined,resourceLockedTill:formData.resourceLockedTill||undefined,internalTarget:formData.internalTarget||undefined,customerTarget:formData.customerTarget||undefined,currentStatus:formData.currentStatus as any,constraint:formData.constraint||undefined});
  };
  const handleAdd=()=>{
    if(!formData.projectName||!formData.engineerName){toast({title:"Project and Engineer required",variant:"destructive"});return;}
    addMutation.mutate({engineerName:formData.engineerName,projectName:formData.projectName,weekStart:format(startOfWeek(new Date(),{weekStartsOn:1}),"yyyy-MM-dd"),resourceLockedFrom:formData.resourceLockedFrom||undefined,resourceLockedTill:formData.resourceLockedTill||undefined,internalTarget:formData.internalTarget||undefined,customerTarget:formData.customerTarget||undefined,currentStatus:formData.currentStatus as any,constraint:formData.constraint||undefined,tasks:[]});
  };

  const StatusSelectItems=()=>(
    <>{STATUS_GROUPS.map(g=>(
      <div key={g.label}>
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">{g.label}</div>
        {g.items.map(i=><SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
      </div>
    ))}</>
  );

  const EngineerPicker=()=>(
    <div className="relative" ref={pickerRef}>
      <button type="button" onClick={()=>{setPickerOpen(o=>!o);setEngSearch("");}}
        className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted">
        <span className="truncate text-left">{selectedEngNames.length===0?"Select engineers...":selectedEngNames.join(", ")}</span>
        <ChevronDown className="h-4 w-4 ml-2 text-muted-foreground shrink-0"/>
      </button>
      {selectedEngNames.length>0&&(
        <div className="flex flex-wrap gap-1 mt-1">
          {selectedEngNames.map(n=>(
            <span key={n} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
              {n}<button type="button" onClick={()=>toggleEng(n)}><X className="h-3 w-3"/></button>
            </span>
          ))}
        </div>
      )}
      {pickerOpen&&(
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-56 flex flex-col">
          <div className="p-2 border-b">
            <Input placeholder="Search engineers..." value={engSearch} onChange={e=>setEngSearch(e.target.value)} className="h-7 text-xs" autoFocus/>
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredEngineers.map(e=>{
              const checked=selectedEngNames.includes(e.name);
              return(
                <div key={e.id} onClick={()=>toggleEng(e.name)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted text-sm ${checked?"bg-primary/5":""}`}>
                  <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${checked?"bg-primary border-primary":"border-input"}`}>
                    {checked&&<span className="text-primary-foreground text-[10px] font-bold">✓</span>}
                  </div>
                  <span className="flex-1">{e.name}</span>
                  <span className="text-xs text-muted-foreground">{e.initials}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const FormFields=()=>(
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label>Project Name</Label>
        <Input list="proj-list" value={formData.projectName} onChange={e=>setFormData(p=>({...p,projectName:e.target.value}))} placeholder="Type or select project"/>
        <datalist id="proj-list">{projectNames.map(n=><option key={n} value={n}/>)}</datalist>
      </div>
      <div className="grid gap-2"><Label>Engineer(s)</Label><EngineerPicker/></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2"><Label>Resource Locked From</Label><Input type="date" value={formData.resourceLockedFrom} onChange={e=>setFormData(p=>({...p,resourceLockedFrom:e.target.value}))}/></div>
        <div className="grid gap-2"><Label>Resource Locked Till</Label><Input type="date" value={formData.resourceLockedTill} onChange={e=>setFormData(p=>({...p,resourceLockedTill:e.target.value}))}/></div>
        <div className="grid gap-2"><Label>Internal Target</Label><Input type="date" value={formData.internalTarget} onChange={e=>setFormData(p=>({...p,internalTarget:e.target.value}))}/></div>
        <div className="grid gap-2"><Label>Customer Target</Label><Input type="date" value={formData.customerTarget} onChange={e=>setFormData(p=>({...p,customerTarget:e.target.value}))}/></div>
      </div>
      <div className="grid gap-2">
        <Label>Current Status</Label>
        <Select value={formData.currentStatus} onValueChange={v=>setFormData(p=>({...p,currentStatus:v}))}>
          <SelectTrigger><SelectValue/></SelectTrigger>
          <SelectContent className="max-h-80 overflow-y-auto"><StatusSelectItems/></SelectContent>
        </Select>
      </div>
      <div className="grid gap-2"><Label>Constraints</Label>
        <Textarea value={formData.constraint} onChange={e=>setFormData(p=>({...p,constraint:e.target.value}))} placeholder="Any constraints or notes..."/></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto px-4 py-6 w-full max-w-[98vw]">

        {/* Page header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/"><Button variant="ghost" size="icon"><ChevronLeft className="h-5 w-5"/></Button></Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">All Engineers — Project Overview</h1>
            <p className="text-sm text-muted-foreground">Click any project to see full details · no scrolling needed</p>
          </div>
          {isAdmin&&<Button onClick={()=>{resetForm();setAddOpen(true);}}><Plus className="h-4 w-4 mr-2"/>Add Assignment</Button>}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            {label:"Total Projects",     value:projectRows.length,     icon:<Briefcase className="h-5 w-5 text-blue-500"/>,   bg:"bg-blue-500/10"  },
            {label:"Engineers Assigned", value:uniqueEngineers.length, icon:<Users className="h-5 w-5 text-green-500"/>,      bg:"bg-green-500/10" },
            {label:"Active Projects",    value:activeProjects,         icon:<Briefcase className="h-5 w-5 text-orange-500"/>, bg:"bg-orange-500/10"},
          ].map(s=>(
            <Card key={s.label}><CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.bg}`}>{s.icon}</div>
                <div><p className="text-sm text-muted-foreground">{s.label}</p><p className="text-2xl font-bold">{s.value}</p></div>
              </div>
            </CardContent></Card>
          ))}
        </div>

        {/* ── MASTER-DETAIL SPLIT PANEL ── */}
        <div className="border rounded-2xl overflow-hidden bg-card" style={{height:"calc(100vh - 280px)", minHeight:"500px"}}>
          <div className="flex h-full">

            {/* ══ LEFT: Project List ══ */}
            <div className="flex flex-col border-r" style={{width:"340px",flexShrink:0}}>

              {/* Filters */}
              <div className="p-3 border-b space-y-2 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"/>
                  <Input value={search} onChange={e=>setSearch(e.target.value)}
                    placeholder="Search projects or engineers…"
                    className="pl-8 h-8 text-xs"/>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground"/>
                    <SelectValue placeholder="All Status"/>
                  </SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto">
                    <SelectItem value="all">All Status</SelectItem>
                    <StatusSelectItems/>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground pl-1">{filtered.length} project{filtered.length!==1?"s":""}</p>
              </div>

              {/* Project list */}
              <div className="flex-1 overflow-y-auto">
                {isLoading&&<div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
                {!isLoading&&filtered.length===0&&<div className="p-6 text-center text-sm text-muted-foreground">No projects found</div>}
                {filtered.map(project=>{
                  const key=project.projectName.toLowerCase().trim();
                  const isSelected=key===selectedKey;
                  const statuses=[...new Set(project.engineers.map(e=>e.currentStatus))];
                  const hasOverdue=project.engineers.some(e=>e.daysExceeded>0);
                  const custTarget=project.engineers[0]?.customerTarget;
                  const daysLeft=daysFromToday(custTarget);
                  const isUrgent=custTarget&&daysLeft<=7&&daysLeft>=0;
                  const isOverdue=custTarget&&daysLeft<0;
                  return(
                    <button key={key} onClick={()=>{setSelectedKey(key);setSelectedEng(project.engineers[0]||null);}}
                      className={`w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50
                        ${isSelected?"bg-primary/5 border-l-4 border-l-primary pl-3":"border-l-4 border-l-transparent"}`}>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2 flex-1">{project.projectName}</p>
                        {isOverdue&&<AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5"/>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                        {project.engineers.map(e=>(
                          <span key={e.assignmentId} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold" title={e.name}>
                            {getInitials(e.name)}
                          </span>
                        ))}
                        <span className="text-[10px] text-muted-foreground">
                          {project.engineers.map(e=>e.name.split(" ")[0]).join(", ")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-1 flex-wrap">
                          {statuses.slice(0,2).map(s=>(
                            <span key={s} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColors[s]??statusColors.not_started}`}>
                              {statusLabels[s]??s}
                            </span>
                          ))}
                        </div>
                        {custTarget&&(
                          <span className={`text-[10px] font-medium flex-shrink-0 ${isOverdue?"text-red-500":isUrgent?"text-amber-500":"text-muted-foreground"}`}>
                            {isOverdue?`${Math.abs(daysLeft)}d late`:isUrgent?`${daysLeft}d left`:`${fmtDate(custTarget)}`}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ══ RIGHT: Detail Panel ══ */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {!selectedProject ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Briefcase className="h-12 w-12 mx-auto opacity-20 mb-3"/>
                    <p className="text-sm">Select a project to view details</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Detail header */}
                  <div className="flex items-start justify-between gap-4 px-6 py-4 border-b flex-shrink-0">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold text-foreground leading-snug">{selectedProject.projectName}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selectedProject.engineers.length} engineer{selectedProject.engineers.length!==1?"s":""} assigned
                      </p>
                    </div>
                    {isAdmin&&(
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs"
                          onClick={()=>selectedEng&&handleEdit(selectedEng.assignmentId)}>
                          <Edit2 className="h-3.5 w-3.5"/>Edit
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950 border-red-200"
                          onClick={()=>{if(selectedEng){setDeletingA({id:selectedEng.assignmentId,projectName:selectedProject.projectName,engineerName:selectedEng.name});setDeleteOpen(true);}}}>
                          <Trash2 className="h-3.5 w-3.5"/>Delete
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Engineer tabs (if multiple engineers) */}
                  {selectedProject.engineers.length>1&&(
                    <div className="flex gap-1 px-6 pt-3 pb-0 flex-wrap flex-shrink-0 border-b">
                      {selectedProject.engineers.map(eng=>(
                        <button key={eng.assignmentId}
                          onClick={()=>setSelectedEng(eng)}
                          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-t-lg border border-b-0 transition-colors
                            ${selectedEng?.assignmentId===eng.assignmentId
                              ?"bg-background text-foreground border-border"
                              :"bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"}`}>
                          <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">
                            {getInitials(eng.name)}
                          </span>
                          {eng.name.split(" ")[0]}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Detail content — scrollable */}
                  <div className="flex-1 overflow-y-auto">
                    {selectedEng&&(
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x">

                        {/* Left column */}
                        <div className="px-6 py-4 space-y-0">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Resource & Timeline</p>
                          <InfoRow
                            icon={<Users className="h-4 w-4"/>}
                            label="Engineer"
                            value={<div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">{getInitials(selectedEng.name)}</span>
                              {selectedEng.name}
                            </div>}
                          />
                          <InfoRow
                            icon={<Calendar className="h-4 w-4"/>}
                            label="Resource Locked From"
                            value={fmtDate(selectedEng.resourceLockedFrom)}
                          />
                          <InfoRow
                            icon={<Calendar className="h-4 w-4"/>}
                            label="Resource Locked Till"
                            value={fmtDate(selectedEng.resourceLockedTill)}
                          />
                          <InfoRow
                            icon={<Clock className="h-4 w-4"/>}
                            label="Lock Period"
                            value={selectedEng.resourceLockDays>0?(
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>{selectedEng.resourceLockDays} days</span>
                                {selectedEng.daysExceeded>0&&(
                                  <Badge className="bg-red-500 text-white text-xs">
                                    <AlertTriangle className="h-3 w-3 mr-1"/>
                                    +{selectedEng.daysExceeded}d overdue
                                  </Badge>
                                )}
                              </div>
                            ):"—"}
                          />
                          <InfoRow
                            icon={<Target className="h-4 w-4"/>}
                            label="Internal Target"
                            value={fmtDate(selectedEng.internalTarget)}
                          />
                          <InfoRow
                            icon={<Target className="h-4 w-4"/>}
                            label="Customer Target"
                            value={fmtDate(selectedEng.customerTarget)}
                            accent={selectedEng.customerTarget?daysFromToday(selectedEng.customerTarget)<0:false}
                          />
                        </div>

                        {/* Right column */}
                        <div className="px-6 py-4 space-y-0">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Status & Notes</p>
                          <InfoRow
                            icon={<Briefcase className="h-4 w-4"/>}
                            label="Current Status"
                            value={
                              <Badge className={`${statusColors[selectedEng.currentStatus]??statusColors.not_started} text-xs mt-0.5`}>
                                {statusLabels[selectedEng.currentStatus]??selectedEng.currentStatus}
                              </Badge>
                            }
                          />
                          <InfoRow
                            icon={<FileText className="h-4 w-4"/>}
                            label="Constraints / Notes"
                            value={selectedEng.constraint
                              ? <span className="leading-relaxed">{selectedEng.constraint}</span>
                              : <span className="text-muted-foreground text-xs italic">No constraints noted</span>}
                          />

                          {/* All engineers on this project */}
                          {selectedProject.engineers.length>1&&(
                            <div className="pt-4">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Engineers on Project</p>
                              <div className="space-y-2">
                                {selectedProject.engineers.map(eng=>(
                                  <div key={eng.assignmentId}
                                    onClick={()=>setSelectedEng(eng)}
                                    className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors hover:bg-muted/50
                                      ${selectedEng?.assignmentId===eng.assignmentId?"bg-primary/5 border-primary/30":""}`}>
                                    <div className="flex items-center gap-2.5">
                                      <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                                        {getInitials(eng.name)}
                                      </span>
                                      <div>
                                        <p className="text-sm font-medium">{eng.name}</p>
                                        <p className="text-[11px] text-muted-foreground">{fmtDate(eng.resourceLockedFrom)} → {fmtDate(eng.resourceLockedTill)}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <Badge className={`${statusColors[eng.currentStatus]??statusColors.not_started} text-[10px]`}>
                                        {statusLabels[eng.currentStatus]??eng.currentStatus}
                                      </Badge>
                                      {isAdmin&&(
                                        <button onClick={e=>{e.stopPropagation();handleEdit(eng.assignmentId);}}
                                          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                                          <Edit2 className="h-3.5 w-3.5"/>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Edit Assignment</DialogTitle></DialogHeader>
          <FormFields/>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>{updateMutation.isPending?"Saving…":"Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Add New Assignment</DialogTitle></DialogHeader>
          <FormFields/>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending}>{addMutation.isPending?"Adding…":"Add Assignment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={open=>{setDeleteOpen(open);if(!open)setDeletingA(null);}}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-600"><Trash2 className="h-5 w-5"/>Delete Assignment</DialogTitle></DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            {deletingA&&<div className="mt-3 p-3 rounded-md bg-muted text-sm space-y-1">
              <p><span className="font-medium">Project:</span> {deletingA.projectName}</p>
              <p><span className="font-medium">Engineer:</span> {deletingA.engineerName}</p>
            </div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>{setDeleteOpen(false);setDeletingA(null);}}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending}
              onClick={()=>deletingA&&deleteMutation.mutate(deletingA.id)}>
              {deleteMutation.isPending?"Deleting…":"Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
