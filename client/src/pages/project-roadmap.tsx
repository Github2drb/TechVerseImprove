// client/src/pages/project-roadmap.tsx
// Add route in App.tsx:
//   import ProjectRoadmap from "@/pages/project-roadmap";
//   <Route path="/project-roadmap" component={ProjectRoadmap} />
// Add link from project-status.tsx header or dashboard nav

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft, RefreshCw, Search, CheckCircle2,
  Circle, Clock4, ChevronRight, Map,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";

// ── Full phase order — single source of truth ─────────────────────────────────
// Testing ends at F.A.T. Installation is its own group (S.A.T happens on site
// AFTER installation, so it belongs to Installation, not Testing).
// Done group = Dispatch → Documentation → Handover → Completed.
// Final phase = Completed → project is considered fully completed.
const PHASES = [
  { key:"Design Stage",              label:"Design",           short:"DES",  group:"Design",       color:"#7c3aed" },
  { key:"Electrical Design",         label:"Elec. Design",     short:"ELD",  group:"Design",       color:"#6366f1" },
  { key:"Procurement Stage",         label:"Procurement",      short:"PRO",  group:"Procurement",  color:"#f59e0b" },
  { key:"Waiting for Materials",     label:"Waiting Mats.",    short:"WFM",  group:"Procurement",  color:"#f97316" },
  { key:"Mechanical Assembly Stage", label:"Mech. Assembly",   short:"MAS",  group:"Assembly",     color:"#3b82f6" },
  { key:"Electrical Assembly Stage", label:"Elec. Assembly",   short:"EAS",  group:"Assembly",     color:"#06b6d4" },
  { key:"PLC Power Up Stage",        label:"PLC Power Up",     short:"PLU",  group:"Testing",      color:"#eab308" },
  { key:"IO Check Stage",            label:"IO Check",         short:"IOC",  group:"Testing",      color:"#84cc16" },
  { key:"Trials Stage",              label:"Trials",           short:"TRL",  group:"Testing",      color:"#14b8a6" },
  { key:"F.A.T",                     label:"F.A.T",            short:"FAT",  group:"Testing",      color:"#d946ef" },
  { key:"Installation Pending",      label:"Install Pending",  short:"INP",  group:"Installation", color:"#f43f5e" },
  { key:"Installation in Progress",  label:"Installing",       short:"INS",  group:"Installation", color:"#ec4899" },
  { key:"Installation Completed",    label:"Install Complete", short:"ICP",  group:"Installation", color:"#059669" },
  { key:"S.A.T",                     label:"S.A.T",            short:"SAT",  group:"Installation", color:"#8b5cf6" },
  { key:"Dispatch Stage",            label:"Dispatch",         short:"DSP",  group:"Done",         color:"#10b981" },
  { key:"Documentation",             label:"Documentation",    short:"DOC",  group:"Done",         color:"#0284c7" },
  { key:"Equipment Handover",        label:"Handover",         short:"EHO",  group:"Done",         color:"#16a34a" },
  { key:"Completed",                 label:"Completed",        short:"CMP",  group:"Done",         color:"#22c55e" },
];

// Final phase — selecting this marks the project as completed
const FINAL_PHASE = "Completed";

const PHASE_GROUPS = ["Design","Procurement","Assembly","Testing","Installation","Done"];

const GROUP_COLORS: Record<string,string> = {
  Design:       "#7c3aed",
  Procurement:  "#f59e0b",
  Assembly:     "#3b82f6",
  Testing:      "#14b8a6",
  Installation: "#ec4899",
  Done:         "#22c55e",
};

// ── Offline software track — runs PARALLEL to the main hardware roadmap ───────
// Real workflow: PLC programming and HMI screen design happen SIMULTANEOUSLY
// (not one after another) — both usually start once Electrical Design is
// complete. Offline Testing can only begin once both PLC and HMI are done.
// The offline track then merges back into the main roadmap at the
// "PLC Power Up Stage" (Equipment Power-Up) step.
interface OfflineState {
  plc: boolean;
  hmi: boolean;
  testing: "not_started" | "in_progress" | "done";
}
const DEFAULT_OFFLINE_STATE: OfflineState = { plc: false, hmi: false, testing: "not_started" };

function parseOfflineState(raw?: string): OfflineState {
  if (!raw) return DEFAULT_OFFLINE_STATE;
  try {
    const o = JSON.parse(raw);
    return {
      plc: !!o.plc,
      hmi: !!o.hmi,
      testing: o.testing === "in_progress" || o.testing === "done" ? o.testing : "not_started",
    };
  } catch { return DEFAULT_OFFLINE_STATE; }
}
function serializeOfflineState(s: OfflineState): string { return JSON.stringify(s); }

const ELECTRICAL_DESIGN_IDX = PHASES.findIndex(p => p.key === "Electrical Design");
const PLC_POWER_UP_IDX = PHASES.findIndex(p => p.key === "PLC Power Up Stage");

function getPhaseIndex(status: string): number {
  const idx = PHASES.findIndex(p => p.key === status);
  return idx === -1 ? 0 : idx;
}

function getProgress(status: string): number {
  const idx = getPhaseIndex(status);
  return Math.round(((idx + 1) / PHASES.length) * 100);
}

interface ProjectActivity {
  projectName: string;
  currentStatus: string;
  activities: Record<string, string>;
  engineerName?: string;
}

// ── Simple page header (top-level — never define inside another component) ────
function SimpleHeader() {
  return (
    <header className="sticky top-0 z-50 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">C</div>
            <span className="hidden font-semibold text-lg sm:inline-block">Controls Team</span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell/><ThemeToggle/><UserMenu/>
        </div>
      </div>
    </header>
  );
}

// ── Phase node component ──────────────────────────────────────────────────────
function PhaseNode({
  phase, state, isLast,
}: {
  phase: typeof PHASES[0];
  state: "done" | "current" | "pending";
  isLast: boolean;
}) {
  const isDone    = state === "done";
  const isCurrent = state === "current";

  return (
    <div className="flex items-center">
      <div className="flex flex-col items-center relative group">
        {/* Circle node */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center
            text-[10px] font-bold border-2 transition-all duration-300 relative
            ${isDone    ? "text-white border-transparent shadow-sm" : ""}
            ${isCurrent ? "text-white border-transparent shadow-lg ring-4 ring-offset-1 scale-110" : ""}
            ${state === "pending" ? "bg-muted border-muted-foreground/20 text-muted-foreground/40" : ""}`}
          style={{
            backgroundColor: isDone || isCurrent ? phase.color : undefined,
            boxShadow:        isCurrent ? `0 0 12px ${phase.color}80` : undefined,
            ringColor:        isCurrent ? `${phase.color}40` : undefined,
          }}
          title={phase.key}
        >
          {isDone
            ? <CheckCircle2 className="h-4 w-4"/>
            : isCurrent
              ? <Clock4 className="h-3.5 w-3.5 animate-pulse"/>
              : <span className="text-[9px]">{phase.short}</span>
          }
        </div>

        {/* Label below node */}
        <span
          className={`mt-1.5 text-[9px] font-medium text-center leading-tight max-w-[56px] whitespace-nowrap
            ${isDone    ? "text-foreground"              : ""}
            ${isCurrent ? "font-bold"                    : ""}
            ${state === "pending" ? "text-muted-foreground/40" : ""}`}
          style={{ color: isCurrent ? phase.color : undefined }}
        >
          {phase.label}
        </span>

        {/* Pulse ring for current */}
        {isCurrent && (
          <span className="absolute top-0 left-0 w-8 h-8 rounded-full animate-ping opacity-30"
            style={{ backgroundColor: phase.color }}/>
        )}
      </div>

      {/* Connector line */}
      {!isLast && (
        <div className={`h-0.5 w-6 mx-0.5 flex-shrink-0 rounded-full transition-colors
          ${isDone ? "bg-green-400" : "bg-muted-foreground/15"}`}/>
      )}
    </div>
  );
}

// ── Offline track toggle circle ────────────────────────────────────────────────
function OfflineToggleCircle({
  label, color, state, disabled, onClick,
}: {
  label: string;
  color: string;
  state: "done" | "current" | "pending";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const isDone    = state === "done";
  const isCurrent = state === "current";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1.5 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all flex-shrink-0
          ${isDone    ? "text-white border-transparent" : ""}
          ${isCurrent ? "text-white border-transparent" : ""}
          ${state === "pending" ? "bg-muted border-muted-foreground/20" : ""}`}
        style={{ backgroundColor: isDone || isCurrent ? color : undefined }}
      >
        {isDone && <CheckCircle2 className="h-3.5 w-3.5"/>}
        {isCurrent && <Clock4 className="h-3 w-3 animate-pulse"/>}
      </span>
      <span className={`text-[10px] font-medium ${state==="pending"?"text-muted-foreground/50":""}`}
        style={{ color: isDone || isCurrent ? color : undefined }}>
        {label}
      </span>
    </button>
  );
}

// ── Project roadmap card ──────────────────────────────────────────────────────
function ProjectCard({
  project, isAdmin, onStatusChange, offlineStatus, onOfflineChange,
}: {
  project: ProjectActivity;
  isAdmin: boolean;
  onStatusChange: (name: string, status: string) => void;
  offlineStatus: string;
  onOfflineChange: (name: string, status: string) => void;
}) {
  const currentIdx = getPhaseIndex(project.currentStatus);
  const progress   = getProgress(project.currentStatus);
  const phase      = PHASES[currentIdx];
  // Completed is the completion trigger — project considered fully done
  const isCompleted= project.currentStatus === FINAL_PHASE;

  return (
    <Card className={`overflow-hidden transition-all hover:shadow-md
      ${isCompleted ? "border-green-500/30 bg-green-50/5" : ""}`}>
      <div className="h-1 w-full" style={{ backgroundColor: phase?.color ?? "#6b7280" }}/>
      <CardContent className="p-4 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground leading-snug line-clamp-2" title={project.projectName}>
              {project.projectName}
            </p>
            {project.engineerName && (
              <p className="text-xs text-muted-foreground mt-0.5">👷 {project.engineerName}</p>
            )}
          </div>

          {/* Status badge / select */}
          {isAdmin ? (
            <Select value={project.currentStatus} onValueChange={v => onStatusChange(project.projectName, v)}>
              <SelectTrigger className="h-7 text-xs w-auto min-w-[140px] flex-shrink-0"
                style={{ borderColor: `${phase?.color}60`, color: phase?.color }}>
                <SelectValue/>
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {PHASE_GROUPS.map(group => (
                  <div key={group}>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: GROUP_COLORS[group] }}>
                      {group}
                    </div>
                    {PHASES.filter(p => p.group === group).map(p => (
                      <SelectItem key={p.key} value={p.key}>
                        <span className="text-xs">{p.label}</span>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge className="text-xs h-6 flex-shrink-0 text-white"
              style={{ backgroundColor: phase?.color }}>
              {project.currentStatus}
            </Badge>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Phase {currentIdx + 1} of {PHASES.length}
            </span>
            <span className="font-bold" style={{ color: phase?.color }}>{progress}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width:`${progress}%`, backgroundColor: phase?.color }}/>
          </div>
        </div>

        {/* Offline software track — runs PARALLEL to main roadmap, starts after Electrical Design */}
        {(() => {
          const off = parseOfflineState(offlineStatus);
          const canStart = currentIdx >= ELECTRICAL_DESIGN_IDX && ELECTRICAL_DESIGN_IDX !== -1;
          const bothDone = off.plc && off.hmi;
          const hasMerged = currentIdx >= PLC_POWER_UP_IDX && PLC_POWER_UP_IDX !== -1;

          const togglePlc = () => { if (!canStart) return; onOfflineChange(project.projectName, serializeOfflineState({ ...off, plc: !off.plc })); };
          const toggleHmi = () => { if (!canStart) return; onOfflineChange(project.projectName, serializeOfflineState({ ...off, hmi: !off.hmi })); };
          const cycleTesting = () => {
            if (!canStart || !bothDone) return;
            const next = off.testing === "not_started" ? "in_progress" : off.testing === "in_progress" ? "done" : "not_started";
            onOfflineChange(project.projectName, serializeOfflineState({ ...off, testing: next }));
          };

          return (
            <div className={`rounded-lg border px-2.5 py-2 ${canStart ? "border-orange-500/20 bg-orange-500/5" : "border-muted-foreground/10 bg-muted/20"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-semibold uppercase tracking-widest ${canStart ? "text-orange-500/80" : "text-muted-foreground/50"}`}>
                  Offline Software Track
                </span>
                {hasMerged && (
                  <Badge className="bg-green-500 text-white text-[9px] h-5">✓ Merged at Power-Up</Badge>
                )}
              </div>

              {!canStart ? (
                <p className="text-[10px] text-muted-foreground/70 italic">Starts once Electrical Design is reached</p>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {/* PLC + HMI run simultaneously — grouped together, same level */}
                  <div className="flex flex-col gap-1.5 border-r border-orange-500/20 pr-2.5">
                    <OfflineToggleCircle label="PLC Logic"  color="#f97316" state={off.plc ? "done" : "pending"} disabled={!isAdmin} onClick={togglePlc}/>
                    <OfflineToggleCircle label="HMI Screens" color="#fb923c" state={off.hmi ? "done" : "pending"} disabled={!isAdmin} onClick={toggleHmi}/>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0"/>
                  {/* Testing — only enabled once both PLC and HMI are done */}
                  <OfflineToggleCircle
                    label="Offline Testing"
                    color="#fbbf24"
                    state={off.testing === "done" ? "done" : off.testing === "in_progress" ? "current" : "pending"}
                    disabled={!isAdmin || !bothDone}
                    onClick={cycleTesting}
                  />
                  <span className="text-[9px] text-muted-foreground/60 italic ml-1">→ merges at Equipment Power-Up</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Phase timeline */}
        <div className="overflow-x-auto pb-2">
          <div className="flex items-start pt-1 min-w-max">
            {PHASES.map((p, i) => (
              <PhaseNode
                key={p.key}
                phase={p}
                state={i < currentIdx ? "done" : i === currentIdx ? "current" : "pending"}
                isLast={i === PHASES.length - 1}
              />
            ))}
          </div>
        </div>

        {/* Group progress chips */}
        <div className="flex flex-wrap gap-1.5">
          {PHASE_GROUPS.map(group => {
            const groupPhases = PHASES.filter(p => p.group === group);
            const doneInGroup = groupPhases.filter((_, gi) => {
              const globalIdx = PHASES.findIndex(p => p.key === groupPhases[gi].key);
              return globalIdx < currentIdx;
            }).length;
            const isCurrentGroup = groupPhases.some(p => p.key === project.currentStatus);
            const isFullyDone    = doneInGroup === groupPhases.length;

            return (
              <span key={group}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all
                  ${isFullyDone    ? "text-white border-transparent" : ""}
                  ${isCurrentGroup ? "text-white border-transparent" : ""}
                  ${!isFullyDone && !isCurrentGroup ? "bg-muted text-muted-foreground/50 border-muted-foreground/10" : ""}`}
                style={{
                  backgroundColor: isFullyDone || isCurrentGroup ? GROUP_COLORS[group] : undefined,
                  opacity: !isFullyDone && !isCurrentGroup ? 0.5 : 1,
                }}>
                {isFullyDone ? "✓ " : isCurrentGroup ? "→ " : ""}{group}
              </span>
            );
          })}
        </div>

      </CardContent>
    </Card>
  );
}

// ── Summary stats bar ─────────────────────────────────────────────────────────
function SummaryBar({ projects }: { projects: ProjectActivity[] }) {
  const grouped = PHASE_GROUPS.map(group => ({
    group,
    count: projects.filter(p => PHASES.find(ph => ph.key === p.currentStatus)?.group === group).length,
    color: GROUP_COLORS[group],
  })).filter(g => g.count > 0);

  const avgProgress = projects.length
    ? Math.round(projects.reduce((s, p) => s + getProgress(p.currentStatus), 0) / projects.length)
    : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
      <div className="col-span-2 sm:col-span-1 border rounded-xl p-3 bg-card">
        <p className="text-xs text-muted-foreground">Overall Avg.</p>
        <p className="text-2xl font-bold mt-0.5" style={{ color: "#3b82f6" }}>{avgProgress}%</p>
        <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full" style={{ width:`${avgProgress}%` }}/>
        </div>
      </div>
      {grouped.map(g => (
        <div key={g.group} className="border rounded-xl p-3 bg-card">
          <p className="text-xs text-muted-foreground">{g.group}</p>
          <p className="text-2xl font-bold mt-0.5" style={{ color: g.color }}>{g.count}</p>
          <p className="text-[10px] text-muted-foreground">projects</p>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProjectRoadmap() {
  const { toast }  = useToast();
  const { user }   = useAuth();
  const isAdmin    = user?.role === "admin";
  const [search,   setSearch]   = useState("");
  const [group,    setGroup]    = useState("all");
  const [pending,  setPending]  = useState<Record<string,string>>({});
  const [saving,   setSaving]   = useState(false);
  // Load statuses saved from project-status page (shared via localStorage)
  const [savedStatuses, setSavedStatuses] = useState<Record<string,string>>(() => {
    try { return JSON.parse(localStorage.getItem("drb_project_statuses") ?? "{}"); } catch { return {}; }
  });
  // Offline software track — its own independent status per project
  const [offlineStatuses, setOfflineStatuses] = useState<Record<string,string>>(() => {
    try { return JSON.parse(localStorage.getItem("drb_offline_statuses") ?? "{}"); } catch { return {}; }
  });

  const { data: rawProjects = [], isLoading, refetch } = useQuery<ProjectActivity[]>({
    queryKey: ["/api/project-activities"],
    staleTime: 30000,
  });

  // Also get engineer assignments to enrich project cards
  const { data: assignments = [] } = useQuery<Array<{ engineerName:string; projectName:string }>>({
    queryKey: ["/api/weekly-assignments"],
    staleTime: 30000,
  });

  const { data: offlineStatusData } = useQuery<Record<string,string>>({
    queryKey: ["/api/project-activities/offline-status"],
    staleTime: 30000,
  });
  useEffect(() => {
    if (offlineStatusData) {
      setOfflineStatuses(prev => ({ ...offlineStatusData, ...prev }));
    }
  }, [offlineStatusData]);

  // Merge engineer names + apply savedStatuses overrides
  const projects = useMemo(() => {
    // Hide projects that have reached Completed (project fully done).
    // Handover / Documentation / Dispatch are mid-sequence Done phases —
    // do NOT hide them; they still need to be advanced to Completed.
    const active = rawProjects.filter(p => {
      const s = (savedStatuses[p.projectName] ?? p.currentStatus ?? "").trim().toLowerCase();
      return s !== "completed";
    });
    return active.map(p => {
      const asgn = assignments.find(a =>
        a.projectName?.trim().toLowerCase() === p.projectName?.trim().toLowerCase()
      );
      // savedStatuses takes priority over stale server data
      const currentStatus = savedStatuses[p.projectName] ?? p.currentStatus;
      return { ...p, currentStatus, engineerName: asgn?.engineerName };
    });
  }, [rawProjects, assignments, savedStatuses]);

  const filtered = useMemo(() => {
    let list = projects;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.projectName.toLowerCase().includes(q) ||
        (p.engineerName ?? "").toLowerCase().includes(q)
      );
    }
    if (group !== "all") {
      list = list.filter(p => PHASES.find(ph => ph.key === p.currentStatus)?.group === group);
    }
    return list;
  }, [projects, search, group]);

  const updateStatusMutation = useMutation({
    mutationFn: async (data: { projectName:string; status:string }) =>
      apiRequest("POST", "/api/project-activities/status", data),
  });

  const offlineStatusMutation = useMutation({
    mutationFn: async (data: { projectName:string; offlineStatus:string }) =>
      apiRequest("POST", "/api/project-activities/offline-status", data, true),
  });

  const handleOfflineChange = async (name: string, status: string) => {
    // Optimistic local + localStorage update so it survives refresh even if the save fails
    setOfflineStatuses(prev => {
      const next = { ...prev, [name]: status };
      try { localStorage.setItem("drb_offline_statuses", JSON.stringify(next)); } catch {}
      return next;
    });
    try {
      await offlineStatusMutation.mutateAsync({ projectName: name, offlineStatus: status });
      queryClient.invalidateQueries({ queryKey: ["/api/project-activities/offline-status"] });
    } catch {
      toast({ title: "Saved locally — sync failed, will retry on next save", variant: "destructive" });
    }
  };

  const handleStatusChange = (name: string, status: string) => {
    setPending(prev => ({ ...prev, [name]: status }));
    // Optimistically update React Query cache
    queryClient.setQueryData<ProjectActivity[]>(["/api/project-activities"], old =>
      old ? old.map(p => p.projectName === name ? { ...p, currentStatus: status } : p) : old
    );
  };

  const saveAll = async () => {
    if (!Object.keys(pending).length) return;
    setSaving(true);
    let ok = 0, fail = 0;
    for (const [projectName, status] of Object.entries(pending)) {
      try { await updateStatusMutation.mutateAsync({ projectName, status }); ok++; }
      catch { fail++; }
    }
    setSaving(false);
    if (fail === 0) {
      // Lock in saved statuses — override server data + persist for project-status page
      setSavedStatuses(prev => ({ ...prev, ...pending }));
      try {
        const existing = JSON.parse(localStorage.getItem("drb_project_statuses") ?? "{}");
        localStorage.setItem("drb_project_statuses", JSON.stringify({ ...existing, ...pending }));
      } catch {}
      setPending({});
      toast({ title:`${ok} status${ok>1?"es":""} saved` });
      setTimeout(() => refetch(), 6000);
    } else {
      toast({ title:`${ok} saved, ${fail} failed`, variant:"destructive" });
    }
  };

  if (isLoading) return (
    <div className="min-h-screen bg-background"><SimpleHeader/>
      <div className="container mx-auto p-6 space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3"/>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_,i) => <div key={i} className="h-48 bg-muted rounded-xl"/>)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader/>
      <div className="container mx-auto p-4 space-y-5 max-w-7xl">

        {/* Page header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Link href="/project-status">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2"/>Back</Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Map className="h-6 w-6 text-primary"/>Project Roadmap
              </h1>
              <p className="text-sm text-muted-foreground">
                {filtered.length} of {projects.length} projects · {PHASES.length}-phase lifecycle tracker
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {Object.keys(pending).length > 0 && (
              <Button size="sm" onClick={saveAll} disabled={saving} className="gap-2">
                {saving ? "Saving…" : `Save ${Object.keys(pending).length} change${Object.keys(pending).length>1?"s":""}`}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => {
              try { setSavedStatuses(JSON.parse(localStorage.getItem("drb_project_statuses") ?? "{}")); } catch {}
              refetch();
            }} className="gap-2">
              <RefreshCw className="h-4 w-4"/>Refresh
            </Button>
          </div>
        </div>

        {/* Summary */}
        <SummaryBar projects={projects}/>

        {/* Phase legend */}
        <div className="border rounded-xl p-3 bg-card">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Phase Legend</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {PHASE_GROUPS.map(group => (
              <div key={group} className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: GROUP_COLORS[group] }}>{group}</span>
                <div className="flex items-center gap-1">
                  {PHASES.filter(p => p.group === group).map(p => (
                    <span key={p.key} className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[8px] text-white font-bold"
                      style={{ backgroundColor: p.color }} title={p.key}>
                      {p.short.slice(0,2)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 ml-4 border-l pl-4">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500"/>Done
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock4 className="h-3.5 w-3.5 text-blue-500"/>Current
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Circle className="h-3.5 w-3.5 text-muted-foreground/30"/>Pending
              </span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search projects or engineers…"
              className="pl-9"/>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {["all", ...PHASE_GROUPS].map(g => (
              <button key={g} onClick={() => setGroup(g)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors capitalize
                  ${group===g ? "text-white border-transparent" : "bg-muted/50 text-muted-foreground border-muted-foreground/20 hover:bg-muted"}`}
                style={{ backgroundColor: group===g ? (g==="all" ? "#3b82f6" : GROUP_COLORS[g]) : undefined }}>
                {g === "all" ? `All (${projects.length})` : g}
              </button>
            ))}
          </div>
        </div>

        {/* Project cards grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Map className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4"/>
            <p className="text-muted-foreground">No projects found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((project, i) => (
              <ProjectCard
                key={`${project.projectName}-${i}`}
                project={project}
                isAdmin={isAdmin}
                onStatusChange={handleStatusChange}
                offlineStatus={offlineStatuses[project.projectName] ?? ""}
                onOfflineChange={handleOfflineChange}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center pb-4">
          {filtered.length} project{filtered.length!==1?"s":""} · Status changes save directly to GitHub
        </p>
      </div>
    </div>
  );
}
