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
  assignmentId: string; rowKey: string; name: string;
  resourceLockedFrom?: string; resourceLockedTill?: string;
  resourceLockDays: number; daysExceeded: number;
  internalTarget?: string; customerTarget?: string;
  currentStatus: string; constraint?: string;
}
interface ProjectRow { projectName: string; engineers: EngineerRowData[]; }

// ── Per-engineer status/timeline overlay ────────────────────────────────────
// Independent of the shared project-level currentStatus above — lets one
// engineer's own phase be marked (e.g. "completed") without touching what
// the rest of the team sees for the project. Fetched from
// /api/project-engineer-status, written via /api/project-engineer-status/:project/:engineer.
interface EngineerStatusEntry {
  displayName: string; currentStatus: string;
  resourceLockedFrom?: string; resourceLockedTill?: string;
  internalTarget?: string; customerTarget?: string; constraint?: string;
  updatedAt?: string; updatedBy?: string;
}
interface EngineerStatusProject { projectName: string; engineers: Record<string, EngineerStatusEntry>; }
type EngineerStatusMap = Record<string, EngineerStatusProject>; // key = projectName.trim().toLowerCase()

// ── Status config ─────────────────────────────────────────────────────────────
// Testing ends at F.A.T. Installation is its own group — S.A.T happens on site
// AFTER installation, so it belongs to Installation, not Testing.
// "ready_to_dispatch" is the first Installation step — equipment staged and
// ready to leave the shop for site, before Installation Pending begins.
// Done group = MT Completed (Machine Trial Completed — key kept as
// "dispatch_stage" so existing saved assignment statuses keep working, only
// the display label changed) → Documentation → Handover → Completed.
// completed = final status → assignment is considered finished.
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
  ready_to_dispatch:"bg-rose-300 text-rose-950 dark:bg-rose-800 dark:text-rose-100",
  equipment_dispatched:"bg-rose-600/20 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
  installation_pending:"bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  installation_in_progress:"bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  installation_completed:"bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  documentation:"bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  equipment_handover:"bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
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
  electrical_assembly:"Electrical Assembly", ready_to_dispatch:"Ready to Dispatch",
  equipment_dispatched:"Equipment Dispatched",
  installation_pending:"Installation Pending",
  installation_in_progress:"Installation in Progress", installation_completed:"Installation Completed",
  documentation:"Documentation", equipment_handover:"Equipment Handover",
  plc_power_up:"PLC Power Up",
  io_check:"IO Check", trials_stage:"Trials Stage", fat:"F.A.T", sat:"S.A.T",
  dispatch_stage:"MT Completed",
};
const STATUS_GROUPS = [
  { label:"General", items:[{value:"not_started",label:"Not Started"},{value:"in_progress",label:"In Progress"},{value:"on_hold",label:"On Hold"},{value:"blocked",label:"Blocked"}]},
  { label:"Design & Procurement", items:[{value:"design_stage",label:"Design Stage"},{value:"electrical_design",label:"Electrical Design"},{value:"procurement_stage",label:"Procurement Stage"},{value:"waiting_for_materials",label:"Waiting for Materials"}]},
  { label:"Assembly", items:[{value:"mechanical_assembly",label:"Mechanical Assembly"},{value:"electrical_assembly",label:"Electrical Assembly"}]},
  { label:"Testing & Commissioning", items:[{value:"plc_power_up",label:"PLC Power Up"},{value:"io_check",label:"IO Check"},{value:"trials_stage",label:"Trials Stage"},{value:"fat",label:"F.A.T"}]},
  { label:"Installation", items:[{value:"ready_to_dispatch",label:"Ready to Dispatch"},{value:"equipment_dispatched",label:"Equipment Dispatched"},{value:"installation_pending",label:"Installation Pending"},{value:"installation_in_progress",label:"Installation in Progress"},{value:"installation_completed",label:"Installation Completed"},{value:"sat",label:"S.A.T"}]},
  { label:"Done", items:[{value:"dispatch_stage",label:"MT Completed"},{value:"documentation",label:"Documentation"},{value:"equipment_handover",label:"Equipment Handover"},{value:"completed",label:"Completed"}]},
];

// Statuses that mean "this assignment is finished" — hidden from the tracker.
// equipment_handover is now a mid-sequence Done phase (before Completed),
// so it stays visible until the project is marked Completed.
const TERMINAL_STATUSES = ["completed"];

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
function normName(s:string):string{
  return s.trim().replace(/\s*\([^)]*\)\s*/g,"").trim().toLowerCase();
}
// Normalized key for detecting duplicate/near-duplicate project names — case,
// surrounding whitespace, trailing punctuation, and internal double-spaces
// must never be enough to create a second "different" project.
function normProjectKey(s:string):string{
  return s.trim().toLowerCase().replace(/[.\s]+$/,"").replace(/\s+/g," ");
}
function groupByProject(assignments:WeeklyAssignment[]):ProjectRow[] {
  const map:Record<string,ProjectRow>={};
  const seenNames:Record<string,Set<string>>={}; // projectKey -> set of normalized individual engineer names already shown

  assignments.forEach(a=>{
    // A record with no engineer name at all carries no useful data (no name,
    // no dates) — it's data corruption, never a valid allocation. Never show it.
    if(!a.engineerName||!a.engineerName.trim()) return;

    const k=normProjectKey(a.projectName);
    if(!map[k]){map[k]={projectName:a.projectName,engineers:[]};seenNames[k]=new Set();}

    // A single assignment record's engineerName can list several
    // comma-separated people (they share dates/base status because they
    // were assigned together) — but each person is their OWN row here, with
    // their own tab and their own independently-settable status override.
    // Skip anyone already represented for this project (handles both exact
    // record duplicates and the cross-record duplicate pattern from BUG-09).
    const rawNames=a.engineerName.split(",").map(n=>n.trim()).filter(Boolean);
    rawNames.forEach(rawName=>{
      const nk=normName(rawName);
      if(!nk||seenNames[k].has(nk)) return;
      seenNames[k].add(nk);
      map[k].engineers.push({
        assignmentId:a.id, rowKey:`${a.id}::${nk}`, name:rawName,
        resourceLockedFrom:a.resourceLockedFrom, resourceLockedTill:a.resourceLockedTill,
        resourceLockDays:calcLockDays(a.resourceLockedFrom,a.resourceLockedTill),
        daysExceeded:calcDaysExceeded(a.resourceLockedTill),
        internalTarget:a.internalTarget, customerTarget:a.customerTarget,
        currentStatus:a.currentStatus, constraint:a.constraint,
      });
    });
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
// Look up an engineer's individual override for a given project, if one exists.
function getEngineerOverride(map:EngineerStatusMap, projectName:string, engineerName:string):EngineerStatusEntry|undefined{
  const proj=map[projectName.trim().toLowerCase()];
  if(!proj)return undefined;
  return proj.engineers[normName(engineerName)];
}
// Status actually shown for an engineer row — override wins, falls back to
// the shared project-level status so nothing changes for engineers who have
// never had an individual status set. EXCEPTION: once the shared/project-level
// status is "completed", that always wins — an individual can never show a
// different status than "Completed" once the whole project is marked done.
function effectiveStatusFor(eng:EngineerRowData, projectName:string, map:EngineerStatusMap):string{
  if(eng.currentStatus==="completed") return "completed";
  return getEngineerOverride(map,projectName,eng.name)?.currentStatus || eng.currentStatus;
}
// Full merged view of an engineer's data — their individual override (if any)
// wins field-by-field over the shared/base assignment values. Used so that
// selecting one engineer's tab shows and edits THEIR OWN dates/constraints,
// not just the shared record everyone on the assignment starts from.
interface EffectiveEngineerData {
  currentStatus:string; resourceLockedFrom?:string; resourceLockedTill?:string;
  internalTarget?:string; customerTarget?:string; constraint?:string; hasOverride:boolean;
}
function getEffectiveEngineerData(eng:EngineerRowData, projectName:string, map:EngineerStatusMap):EffectiveEngineerData{
  const override=getEngineerOverride(map,projectName,eng.name);
  return {
    currentStatus: effectiveStatusFor(eng,projectName,map),
    resourceLockedFrom: override?.resourceLockedFrom || eng.resourceLockedFrom,
    resourceLockedTill: override?.resourceLockedTill || eng.resourceLockedTill,
    internalTarget: override?.internalTarget || eng.internalTarget,
    customerTarget: override?.customerTarget || eng.customerTarget,
    constraint: override?.constraint || eng.constraint,
    hasOverride: !!override,
  };
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

// ── Status select items — TOP LEVEL component ─────────────────────────────────
// IMPORTANT: this must live outside the main component. If defined inside,
// React sees a brand-new function reference on every keystroke/re-render,
// treats it as a different component type, and remounts the whole subtree —
// which is what causes inputs to lose focus after a single character.
function StatusSelectItems(){
  return(
    <>{STATUS_GROUPS.map(g=>(
      <div key={g.label}>
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">{g.label}</div>
        {g.items.map(i=><SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
      </div>
    ))}</>
  );
}

// ── Engineer individual status panel — TOP LEVEL component (same reason as above) ──
// Shows the effective status for the currently selected engineer tab and,
// for admins, lets them set/clear an override that is independent of the
// shared project-level "Current Status" field.
interface EngineerStatusPanelProps {
  isAdmin: boolean;
  engineer: EngineerRowData;
  override?: EngineerStatusEntry;
  onSave: (data:{currentStatus:string;resourceLockedFrom?:string;resourceLockedTill?:string;internalTarget?:string;customerTarget?:string;constraint?:string})=>void;
  onClear: ()=>void;
  saving: boolean;
  autoEdit?: boolean;
  onAutoEditConsumed?: ()=>void;
}
function EngineerStatusPanel({isAdmin, engineer, override, onSave, onClear, saving, autoEdit, onAutoEditConsumed}: EngineerStatusPanelProps){
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    currentStatus: override?.currentStatus || engineer.currentStatus,
    resourceLockedFrom: override?.resourceLockedFrom || "",
    resourceLockedTill: override?.resourceLockedTill || "",
    internalTarget: override?.internalTarget || "",
    customerTarget: override?.customerTarget || "",
    constraint: override?.constraint || "",
  });

  // Re-sync the draft whenever the selected engineer or their saved override changes
  useEffect(()=>{
    setDraft({
      currentStatus: override?.currentStatus || engineer.currentStatus,
      resourceLockedFrom: override?.resourceLockedFrom || "",
      resourceLockedTill: override?.resourceLockedTill || "",
      internalTarget: override?.internalTarget || "",
      customerTarget: override?.customerTarget || "",
      constraint: override?.constraint || "",
    });
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[engineer.assignmentId, engineer.name, override?.updatedAt]);

  // Once the shared/project-level status is "Completed", the individual
  // status can never diverge from it — always reads Completed, not editable.
  const isLockedCompleted = engineer.currentStatus==="completed";
  const effectiveStatus = isLockedCompleted ? "completed" : (override?.currentStatus || engineer.currentStatus);
  // An engineer can't hold any status other than "Not Started" without dates
  // allocated — a status with no timeline behind it is meaningless.
  const missingDates = draft.currentStatus!=="not_started" && (!draft.resourceLockedFrom||!draft.resourceLockedTill);

  // The "edit" pencil in the All Engineers list opens THIS engineer's own
  // editor directly, instead of the shared multi-engineer Edit Assignment dialog.
  useEffect(()=>{
    if(autoEdit&&!isLockedCompleted){
      setEditing(true);
      onAutoEditConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[autoEdit]);

  return(
    <div className="pt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {engineer.name.split(" ")[0]}&apos;s Individual Status
        </p>
        {isAdmin&&!editing&&!isLockedCompleted&&(
          <button type="button" onClick={()=>setEditing(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Edit2 className="h-3 w-3"/>{override?"Edit":"Set individually"}
          </button>
        )}
      </div>

      {!editing?(
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`${statusColors[effectiveStatus]??statusColors.not_started} text-xs`}>
            {statusLabels[effectiveStatus]??effectiveStatus}
          </Badge>
          {isLockedCompleted?(
            <span className="text-[11px] text-muted-foreground">project marked Completed — status locked</span>
          ):override?(
            <span className="text-[11px] text-muted-foreground">
              individually updated{override.updatedAt?` · ${fmtDate(override.updatedAt)}`:""}
            </span>
          ):(
            <span className="text-[11px] text-muted-foreground">following project status</span>
          )}
        </div>
      ):(
        <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
          <div className="grid gap-1.5">
            <Label className="text-xs">Status for {engineer.name}</Label>
            <Select value={draft.currentStatus} onValueChange={v=>setDraft(p=>({...p,currentStatus:v}))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto"><StatusSelectItems/></SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1"><Label className="text-xs">Locked From</Label>
              <Input type="date" className="h-8 text-xs" value={draft.resourceLockedFrom} onChange={e=>setDraft(p=>({...p,resourceLockedFrom:e.target.value}))}/></div>
            <div className="grid gap-1"><Label className="text-xs">Locked Till</Label>
              <Input type="date" className="h-8 text-xs" value={draft.resourceLockedTill} onChange={e=>setDraft(p=>({...p,resourceLockedTill:e.target.value}))}/></div>
            <div className="grid gap-1"><Label className="text-xs">Internal Target</Label>
              <Input type="date" className="h-8 text-xs" value={draft.internalTarget} onChange={e=>setDraft(p=>({...p,internalTarget:e.target.value}))}/></div>
            <div className="grid gap-1"><Label className="text-xs">Customer Target</Label>
              <Input type="date" className="h-8 text-xs" value={draft.customerTarget} onChange={e=>setDraft(p=>({...p,customerTarget:e.target.value}))}/></div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Constraints / Notes for {engineer.name}</Label>
            <Textarea className="text-xs min-h-16" value={draft.constraint} onChange={e=>setDraft(p=>({...p,constraint:e.target.value}))} placeholder="Any constraints specific to this engineer..."/>
          </div>
          {missingDates&&(
            <p className="text-[11px] text-red-500">Set Locked From and Locked Till dates before saving a status other than "Not Started".</p>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            {override?(
              <button type="button" onClick={()=>{onClear();setEditing(false);}} className="text-xs text-red-500 hover:underline">
                Clear override
              </button>
            ):<span/>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={()=>setEditing(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" disabled={saving||missingDates} onClick={()=>{onSave(draft);setEditing(false);}}>
                {saving?"Saving…":"Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Engineer picker — TOP LEVEL component (same reason as above) ──────────────
interface EngineerPickerProps {
  pickerOpen: boolean;
  setPickerOpen: (v: boolean | ((o:boolean)=>boolean)) => void;
  engSearch: string;
  setEngSearch: (v: string) => void;
  pickerRef: React.RefObject<HTMLDivElement>;
  selectedEngNames: string[];
  toggleEng: (name: string) => void;
  filteredEngineers: Array<{id:string;name:string;initials:string}>;
}
function EngineerPicker({
  pickerOpen, setPickerOpen, engSearch, setEngSearch,
  pickerRef, selectedEngNames, toggleEng, filteredEngineers,
}: EngineerPickerProps){
  return(
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
}

// ── Form fields — TOP LEVEL component (same reason as above) ──────────────────
interface FormFieldsProps {
  formData: {
    engineerName:string; projectName:string;
    resourceLockedFrom:string; resourceLockedTill:string;
    internalTarget:string; customerTarget:string;
    currentStatus:string; constraint:string;
  };
  setFormData: React.Dispatch<React.SetStateAction<FormFieldsProps["formData"]>>;
  projectNames: string[];
  engineerPickerProps: EngineerPickerProps;
}
function FormFields({ formData, setFormData, projectNames, engineerPickerProps }: FormFieldsProps){
  const typedKey=normProjectKey(formData.projectName);
  const nearMatch=formData.projectName.trim()
    ? projectNames.find(n=>normProjectKey(n)===typedKey&&n!==formData.projectName.trim())
    : undefined;
  return(
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label>Project Name</Label>
        <Input list="proj-list" value={formData.projectName} onChange={e=>setFormData(p=>({...p,projectName:e.target.value}))} placeholder="Type or select project"/>
        <datalist id="proj-list">{projectNames.map(n=><option key={n} value={n}/>)}</datalist>
        {nearMatch&&(
          <p className="text-xs text-amber-600">Matches existing project "{nearMatch}" — will be saved under that exact name to avoid a duplicate.</p>
        )}
      </div>
      <div className="grid gap-2"><Label>Engineer(s)</Label><EngineerPicker {...engineerPickerProps}/></div>
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
        {formData.currentStatus!=="not_started"&&(!formData.resourceLockedFrom||!formData.resourceLockedTill)&&(
          <p className="text-xs text-red-500">Set Resource Locked From and Till dates before saving a status other than "Not Started".</p>
        )}
      </div>
      <div className="grid gap-2"><Label>Constraints</Label>
        <Textarea value={formData.constraint} onChange={e=>setFormData(p=>({...p,constraint:e.target.value}))} placeholder="Any constraints or notes..."/></div>
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
  const [deletingA,      setDeletingA]      = useState<{id:string;projectName:string;engineerName:string;coAssigned:string[]}|null>(null);
  const [selectedEng,    setSelectedEng]    = useState<EngineerRowData|null>(null); // which engineer row in detail
  const [pendingEditKey, setPendingEditKey] = useState<string|null>(null); // rowKey to auto-open in the individual editor

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
  // Independent per-engineer status/timeline overrides (see interfaces above)
  const {data:engineerStatusMap={}}=useQuery<EngineerStatusMap>({
    queryKey:["/api/project-engineer-status"],
    queryFn:async()=>{const r=await fetch("/api/project-engineer-status");if(!r.ok)throw new Error("failed");return r.json();},
    staleTime:0, refetchOnMount:true,
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

  // Data — build rows from ALL assignments so a "Completed" filter can still find them.
  // We only hide fully-finished projects by default (statusFilter === "all"); an explicit
  // status filter (e.g. "Completed") must be able to surface them.
  const projectRows=useMemo(()=>groupByProject(assignments),[assignments]);
  const filtered=useMemo(()=>projectRows.filter(p=>{
    // "Completed" is an OVERALL project state, not a per-engineer one — a
    // project only counts as Completed when EVERY engineer on it is
    // Completed. A single completed record among others doesn't qualify.
    const allCompleted=p.engineers.length>0&&p.engineers.every(e=>TERMINAL_STATUSES.includes(e.currentStatus));
    if(statusFilter==="all"&&allCompleted)return false; // declutter default view only
    const mQ=p.projectName.toLowerCase().includes(search.toLowerCase())||
      p.engineers.some(e=>e.name.toLowerCase().includes(search.toLowerCase()));
    const mS=statusFilter==="all"
      ?true
      :statusFilter==="completed"
        ?allCompleted
        :p.engineers.some(e=>e.currentStatus===statusFilter);
    return mQ&&mS;
  }),[projectRows,search,statusFilter]);

  const selectedProject = useMemo(()=>filtered.find(p=>normProjectKey(p.projectName)===selectedKey)||filtered[0]||null,[filtered,selectedKey]);
  useEffect(()=>{
    if(selectedProject){
      setSelectedKey(normProjectKey(selectedProject.projectName));
      if(!selectedEng||!selectedProject.engineers.find(e=>e.rowKey===selectedEng.rowKey))
        setSelectedEng(selectedProject.engineers[0]||null);
    }
  },[selectedProject]);

  const uniqueEngineers=useMemo(()=>{
    const s=new Set<string>();
    assignments.forEach(a=>a.engineerName.split(",").map(n=>n.trim()).filter(Boolean).forEach(n=>s.add(normName(n))));
    return Array.from(s);
  },[assignments]);
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
  // Save/clear an individual engineer's status+timeline override for the selected project
  const engineerStatusMutation=useMutation({
    mutationFn:async({projectName,engineerName,data}:{projectName:string;engineerName:string;data:{currentStatus:string;resourceLockedFrom?:string;resourceLockedTill?:string;internalTarget?:string;customerTarget?:string;constraint?:string}})=>
      apiRequest("POST",`/api/project-engineer-status/${encodeURIComponent(projectName)}/${encodeURIComponent(engineerName)}`,data,true),
    onSuccess:()=>{queryClient.invalidateQueries({queryKey:["/api/project-engineer-status"]});toast({title:"Individual status updated"});},
    onError:(e:any)=>toast({title:e?.message||"Update failed",variant:"destructive"}),
  });
  const clearEngineerStatusMutation=useMutation({
    mutationFn:async({projectName,engineerName}:{projectName:string;engineerName:string})=>
      apiRequest("DELETE",`/api/project-engineer-status/${encodeURIComponent(projectName)}/${encodeURIComponent(engineerName)}`,undefined,true),
    onSuccess:()=>{queryClient.invalidateQueries({queryKey:["/api/project-engineer-status"]});toast({title:"Cleared — following project status"});},
    onError:(e:any)=>toast({title:e?.message||"Clear failed",variant:"destructive"}),
  });

  const handleEdit=(assignmentId:string)=>{
    const a=assignments.find(x=>x.id===assignmentId);
    if(a){
      setEditingA(a);
      setFormData({engineerName:a.engineerName||"",projectName:a.projectName||"",resourceLockedFrom:a.resourceLockedFrom||"",resourceLockedTill:a.resourceLockedTill||"",internalTarget:a.internalTarget||"",customerTarget:a.customerTarget||"",currentStatus:a.currentStatus||"not_started",constraint:a.constraint||""});
      setEditOpen(true);
    }
  };
  // An engineer can't be given any status other than "Not Started" without
  // a Resource Locked From/Till timeline behind it — no empty/date-less
  // status changes allowed.
  const statusNeedsDates=()=>{
    if(formData.currentStatus!=="not_started"&&(!formData.resourceLockedFrom||!formData.resourceLockedTill)){
      toast({title:"Set Resource Locked From/Till dates before saving a status other than \"Not Started\"",variant:"destructive"});
      return true;
    }
    return false;
  };
  // Never let a typo or stray punctuation create a second "different" project.
  // If what was typed normalizes to match an existing project name, silently
  // resolve to that exact existing name instead of creating a near-duplicate.
  const resolveProjectName=(typed:string):string=>{
    const trimmed=typed.trim();
    const key=normProjectKey(trimmed);
    const existing=projectNames.find(n=>normProjectKey(n)===key);
    if(existing&&existing!==trimmed){
      toast({title:`Matched existing project "${existing}" — using it to avoid a duplicate`});
      return existing;
    }
    return trimmed;
  };
  const handleSaveEdit=()=>{
    if(!editingA)return;
    if(!formData.projectName||!formData.engineerName){toast({title:"Project and Engineer required",variant:"destructive"});return;}
    if(statusNeedsDates())return;
    const projectName=resolveProjectName(formData.projectName);
    updateMutation.mutate({id:editingA.id,weekStart:editingA.weekStart,projectName,projectTargetDate:editingA.projectTargetDate,tasks:editingA.tasks,notes:editingA.notes,engineerName:formData.engineerName,resourceLockedFrom:formData.resourceLockedFrom||undefined,resourceLockedTill:formData.resourceLockedTill||undefined,internalTarget:formData.internalTarget||undefined,customerTarget:formData.customerTarget||undefined,currentStatus:formData.currentStatus as any,constraint:formData.constraint||undefined});
  };
  const handleAdd=()=>{
    if(!formData.projectName||!formData.engineerName){toast({title:"Project and Engineer required",variant:"destructive"});return;}
    if(statusNeedsDates())return;
    const projectName=resolveProjectName(formData.projectName);
    addMutation.mutate({engineerName:formData.engineerName,projectName,weekStart:format(startOfWeek(new Date(),{weekStartsOn:1}),"yyyy-MM-dd"),resourceLockedFrom:formData.resourceLockedFrom||undefined,resourceLockedTill:formData.resourceLockedTill||undefined,internalTarget:formData.internalTarget||undefined,customerTarget:formData.customerTarget||undefined,currentStatus:formData.currentStatus as any,constraint:formData.constraint||undefined,tasks:[]});
  };


  const engineerPickerProps: EngineerPickerProps = {
    pickerOpen, setPickerOpen, engSearch, setEngSearch,
    pickerRef, selectedEngNames, toggleEng, filteredEngineers,
  };

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
                  const key=normProjectKey(project.projectName);
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
                          <span key={e.rowKey} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold" title={e.name}>
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
                          onClick={()=>{
                            if(selectedEng){
                              const coAssigned=selectedProject.engineers
                                .filter(e=>e.assignmentId===selectedEng.assignmentId&&e.rowKey!==selectedEng.rowKey)
                                .map(e=>e.name);
                              setDeletingA({id:selectedEng.assignmentId,projectName:selectedProject.projectName,engineerName:selectedEng.name,coAssigned});
                              setDeleteOpen(true);
                            }
                          }}>
                          <Trash2 className="h-3.5 w-3.5"/>Delete
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Engineer tabs (if multiple engineers) */}
                  {selectedProject.engineers.length>1&&(
                    <div className="flex gap-1 px-6 pt-3 pb-0 flex-wrap flex-shrink-0 border-b">
                      {selectedProject.engineers.map(eng=>(
                        <button key={eng.rowKey}
                          onClick={()=>setSelectedEng(eng)}
                          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-t-lg border border-b-0 transition-colors
                            ${selectedEng?.rowKey===eng.rowKey
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
                    {selectedEng&&(()=>{
                      const eff=getEffectiveEngineerData(selectedEng, selectedProject.projectName, engineerStatusMap);
                      const effLockDays=calcLockDays(eff.resourceLockedFrom, eff.resourceLockedTill);
                      const effDaysExceeded=calcDaysExceeded(eff.resourceLockedTill);
                      return(
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x">

                        {/* Left column */}
                        <div className="px-6 py-4 space-y-0">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resource & Timeline</p>
                            {eff.hasOverride&&<span className="text-[10px] text-primary">individually updated</span>}
                          </div>
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
                            value={fmtDate(eff.resourceLockedFrom)}
                          />
                          <InfoRow
                            icon={<Calendar className="h-4 w-4"/>}
                            label="Resource Locked Till"
                            value={fmtDate(eff.resourceLockedTill)}
                          />
                          <InfoRow
                            icon={<Clock className="h-4 w-4"/>}
                            label="Lock Period"
                            value={effLockDays>0?(
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>{effLockDays} days</span>
                                {effDaysExceeded>0&&(
                                  <Badge className="bg-red-500 text-white text-xs">
                                    <AlertTriangle className="h-3 w-3 mr-1"/>
                                    +{effDaysExceeded}d overdue
                                  </Badge>
                                )}
                              </div>
                            ):"—"}
                          />
                          <InfoRow
                            icon={<Target className="h-4 w-4"/>}
                            label="Internal Target"
                            value={fmtDate(eff.internalTarget)}
                          />
                          <InfoRow
                            icon={<Target className="h-4 w-4"/>}
                            label="Customer Target"
                            value={fmtDate(eff.customerTarget)}
                            accent={eff.customerTarget?daysFromToday(eff.customerTarget)<0:false}
                          />
                        </div>

                        {/* Right column */}
                        <div className="px-6 py-4 space-y-0">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Status & Notes</p>
                          <InfoRow
                            icon={<Briefcase className="h-4 w-4"/>}
                            label="Current Status"
                            value={
                              <Badge className={`${statusColors[eff.currentStatus]??statusColors.not_started} text-xs mt-0.5`}>
                                {statusLabels[eff.currentStatus]??eff.currentStatus}
                              </Badge>
                            }
                          />
                          <InfoRow
                            icon={<FileText className="h-4 w-4"/>}
                            label="Constraints / Notes"
                            value={eff.constraint
                              ? <span className="leading-relaxed">{eff.constraint}</span>
                              : <span className="text-muted-foreground text-xs italic">No constraints noted</span>}
                          />

                          {/* Independent per-engineer status — does not change the shared
                              project-level "Current Status" above */}
                          <EngineerStatusPanel
                            isAdmin={isAdmin}
                            engineer={selectedEng}
                            override={getEngineerOverride(engineerStatusMap, selectedProject.projectName, selectedEng.name)}
                            saving={engineerStatusMutation.isPending}
                            onSave={(data)=>engineerStatusMutation.mutate({projectName:selectedProject.projectName, engineerName:selectedEng.name, data})}
                            onClear={()=>clearEngineerStatusMutation.mutate({projectName:selectedProject.projectName, engineerName:selectedEng.name})}
                            autoEdit={pendingEditKey===selectedEng.rowKey}
                            onAutoEditConsumed={()=>setPendingEditKey(null)}
                          />

                          {/* All engineers on this project */}
                          {selectedProject.engineers.length>1&&(
                            <div className="pt-4">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Engineers on Project</p>
                              <div className="space-y-2">
                                {selectedProject.engineers.map(eng=>{
                                  const engOverride=getEngineerOverride(engineerStatusMap, selectedProject.projectName, eng.name);
                                  const engEff=getEffectiveEngineerData(eng, selectedProject.projectName, engineerStatusMap);
                                  return(
                                  <div key={eng.rowKey}
                                    onClick={()=>setSelectedEng(eng)}
                                    className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors hover:bg-muted/50
                                      ${selectedEng?.rowKey===eng.rowKey?"bg-primary/5 border-primary/30":""}`}>
                                    <div className="flex items-center gap-2.5">
                                      <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                                        {getInitials(eng.name)}
                                      </span>
                                      <div>
                                        <p className="text-sm font-medium">{eng.name}</p>
                                        <p className="text-[11px] text-muted-foreground">{fmtDate(engEff.resourceLockedFrom)} → {fmtDate(engEff.resourceLockedTill)}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <Badge className={`${statusColors[engEff.currentStatus]??statusColors.not_started} text-[10px]`}>
                                        {statusLabels[engEff.currentStatus]??engEff.currentStatus}
                                      </Badge>
                                      {engOverride&&(
                                        <span className="text-primary text-[10px]" title="Individually updated">●</span>
                                      )}
                                      {isAdmin&&(
                                        <button
                                          title={`Edit ${eng.name}'s own dates, status and constraints`}
                                          onClick={e=>{e.stopPropagation();setSelectedEng(eng);setPendingEditKey(eng.rowKey);}}
                                          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                                          <Edit2 className="h-3.5 w-3.5"/>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })()}
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
          <FormFields formData={formData} setFormData={setFormData} projectNames={projectNames} engineerPickerProps={engineerPickerProps}/>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>{updateMutation.isPending?"Saving…":"Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Add New Assignment</DialogTitle></DialogHeader>
          <FormFields formData={formData} setFormData={setFormData} projectNames={projectNames} engineerPickerProps={engineerPickerProps}/>
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
            {deletingA&&deletingA.coAssigned.length>0&&(
              <div className="mt-3 p-3 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 text-xs text-red-700 dark:text-red-300">
                <p className="font-medium mb-1">⚠ This is a shared assignment record.</p>
                <p>Deleting it will also remove: {deletingA.coAssigned.join(", ")} — they were assigned together on the same record. To remove only {deletingA.engineerName}, use Edit instead and take their name out of the Engineer(s) field.</p>
              </div>
            )}
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
