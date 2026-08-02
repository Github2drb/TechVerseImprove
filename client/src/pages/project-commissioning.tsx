// client/src/pages/project-commissioning.tsx
// Project Commissioning Tracker — replaces the old Daily Report page.
// Station-wise electrical/mechanical constraints, trial readiness, 3-phase
// commissioning checklists, plus a LIVE schedule forecast and engineer rating
// that recalculates on every edit against the Internal / Customer target dates
// entered in the Project Tracker "Edit Assignment" dialog.

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Header } from "@/components/header";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ClipboardCheck, Plus, Trash2, Save, Zap, Wrench, Clock,
  PlugZap, ListChecks, Hand, CheckCircle2, Cable, X,
  CalendarClock, Users, TrendingUp, AlertTriangle, Award, Star, Info,
} from "lucide-react";
import {
  computeForecast, computeRating, formatDate, splitEngineers, namesMatch,
  type CalcRow, type CalcPhase,
} from "@/lib/commissioning-calc";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type StationStatus =
  | "not_started"
  | "electrical_pending"
  | "mechanical_pending"
  | "ready_for_trials"
  | "trials_in_progress"
  | "completed";

interface StationRow {
  id: string;
  label: string;
  description: string;
  electricalConstraint: string;
  mechanicalConstraint: string;
  trialTime: string;
  status: StationStatus;
  notes: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  doneBy?: string;
  doneAt?: string;
}

interface Phase {
  id: string;
  title: string;
  subtitle: string;
  items: ChecklistItem[];
}

interface CommissioningProject {
  projectName: string;
  stations: StationRow[];
  commInterface: StationRow[];
  phases: Phase[];
  lastUpdated?: string;
  updatedBy?: string;
}

interface WeeklyAssignment {
  id: string;
  engineerName: string;
  projectName: string;
  currentStatus?: string;
  internalTarget?: string;
  customerTarget?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status metadata
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_META: Record<StationStatus, { label: string; cls: string }> = {
  not_started:        { label: "Not Started",        cls: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" },
  electrical_pending: { label: "Electrical Pending", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  mechanical_pending: { label: "Mechanical Pending", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  ready_for_trials:   { label: "Ready for Trials",   cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  trials_in_progress: { label: "Trials In Progress", cls: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300" },
  completed:          { label: "Completed",          cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
};
const STATUS_ORDER: StationStatus[] = [
  "not_started", "electrical_pending", "mechanical_pending",
  "ready_for_trials", "trials_in_progress", "completed",
];

const LEVEL_CLS: Record<string, string> = {
  Expert:     "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  Proficient: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  Developing: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  Learning:   "bg-gray-500/20 text-gray-700 dark:text-gray-300",
};

// ─────────────────────────────────────────────────────────────────────────────
// Default templates (editable per project after loading)
// ─────────────────────────────────────────────────────────────────────────────
function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function mkRow(label: string, description: string): StationRow {
  return {
    id: uid(), label, description,
    electricalConstraint: "", mechanicalConstraint: "",
    trialTime: "", status: "not_started", notes: "",
  };
}

const DEFAULT_STATION_DEFS: Array<[string, string]> = [
  ["1", "Loading Station"],
  ["2", "Greasing Station"],
  ["3", "Rotor Bearing Pressing Station"],
  ["4", "Rotor Stator Pressing Station"],
  ["5", "Stator Bearing Pressing Station"],
  ["6", "Thrust Checking Station"],
  ["7", "Flipping Station"],
  ["8", "Rubber-A Assembly Station"],
  ["9", "Rubber-B Assembly Station"],
  ["10", "Unloading Station"],
  ["A", "Bowl Feeder Integration"],
  ["B", "Grease Dispenser Unit Integration"],
  ["C", "Bearing Stacker Unit Check on Both Stations"],
];

const DEFAULT_COMM_DEFS: Array<[string, string]> = [
  ["1", "Rexroth Press Display – 3 Press Integration"],
  ["2", "Press Display Thrust Checking Station"],
  ["3", "Safety PLC Integration with Main PLC"],
  ["4", "All E-Stop Integration"],
  ["5", "All Safety Door Integration"],
  ["6", "Servo, Induction Motor Safety Check"],
  ["7", "ID Scanner Check"],
  ["8", "Vision System Check in All Stations"],
  ["9", "Both HMI Manual and Auto Screens Completion as per Standard"],
  ["10", "RFID Tracking"],
  ["11", "Pallet Tracking and Data Saving"],
  ["12", "Cycle Time Optimisation"],
  ["13", "Documentation"],
];

const DEFAULT_PHASE_DEFS: Array<{ title: string; subtitle: string; items: string[] }> = [
  {
    title: "Equipment Powerup",
    subtitle: "Power Up Check List",
    items: [
      "Checklist to be duly filled with standard template",
      "PLC, Remote Module IP Configuration",
      "Servo/VFD Configuration",
      "ID Scanner Configuration",
      "Vision IP Configuration",
    ],
  },
  {
    title: "IO List Testing",
    subtitle: "IO duly tested along with Electrical and Mechanical Integration",
    items: [
      "Field IO",
      "Servo Check",
      "VFD → Motor Rotation Check",
      "Vision Check",
    ],
  },
  {
    title: "Manual Testing",
    subtitle: "Set Feedback Sensors and Actuation",
    items: [
      "XY Gantry Pick and Place Position Check",
      "Pneumatic Actuation and Feedback Check",
    ],
  },
];

function defaultStations(): StationRow[] {
  return DEFAULT_STATION_DEFS.map(([l, d]) => mkRow(l, d));
}
function defaultCommInterface(): StationRow[] {
  return DEFAULT_COMM_DEFS.map(([l, d]) => mkRow(l, d));
}
function defaultPhases(): Phase[] {
  return DEFAULT_PHASE_DEFS.map(p => ({
    id: uid(),
    title: p.title,
    subtitle: p.subtitle,
    items: p.items.map(text => ({ id: uid(), text, done: false })),
  }));
}

const PHASE_ICONS = [
  <PlugZap key="p" className="h-4 w-4" />,
  <ListChecks key="l" className="h-4 w-4" />,
  <Hand key="h" className="h-4 w-4" />,
];

// ─────────────────────────────────────────────────────────────────────────────
// Phase checklist card (top-level component — never define inside another)
// ─────────────────────────────────────────────────────────────────────────────
interface PhaseCardProps {
  phase: Phase;
  index: number;
  onToggleItem: (phaseId: string, itemId: string) => void;
  onItemText: (phaseId: string, itemId: string, text: string) => void;
  onAddItem: (phaseId: string, text: string) => void;
  onDeleteItem: (phaseId: string, itemId: string) => void;
}

function PhaseCard({ phase, index, onToggleItem, onItemText, onAddItem, onDeleteItem }: PhaseCardProps) {
  const [newItem, setNewItem] = useState("");
  const done = phase.items.filter(i => i.done).length;
  const total = phase.items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const add = () => {
    const t = newItem.trim();
    if (!t) return;
    onAddItem(phase.id, t);
    setNewItem("");
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {PHASE_ICONS[index % PHASE_ICONS.length]}
            </span>
            {phase.title}
          </CardTitle>
          <Badge className={pct === 100
            ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"}>
            {done}/{total}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{phase.subtitle}</p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 pt-0">
        {phase.items.map(item => (
          <div key={item.id} className="flex items-start gap-2 rounded-lg border p-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 flex-shrink-0 accent-primary"
              checked={item.done}
              onChange={() => onToggleItem(phase.id, item.id)}
            />
            <div className="min-w-0 flex-1">
              <Input
                value={item.text}
                onChange={e => onItemText(phase.id, item.id, e.target.value)}
                className={`h-8 border-none bg-transparent px-1 text-sm shadow-none focus-visible:ring-1 ${item.done ? "text-muted-foreground line-through" : ""}`}
              />
              {item.done && item.doneBy && (
                <p className="px-1 text-[10px] text-muted-foreground">
                  ✓ {item.doneBy}{item.doneAt ? ` · ${new Date(item.doneAt).toLocaleDateString()}` : ""}
                </p>
              )}
            </div>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onDeleteItem(phase.id, item.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <div className="mt-auto flex gap-2 pt-1">
          <Input
            placeholder="Add checklist item…"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") add(); }}
            className="h-8 text-sm"
          />
          <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" onClick={add}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Station table (top-level component)
// ─────────────────────────────────────────────────────────────────────────────
interface StationTableProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  rows: StationRow[];
  onPatchRow: (rowId: string, patch: Partial<StationRow>) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
}

function StationTable({ title, subtitle, icon, rows, onPatchRow, onAddRow, onDeleteRow }: StationTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
              {title}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onAddRow}>
            <Plus className="mr-1 h-4 w-4" /> Add Row
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <th className="w-14 px-2 py-2">#</th>
                <th className="min-w-[220px] px-2 py-2">Station / Description</th>
                <th className="min-w-[220px] px-2 py-2">
                  <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-amber-500" /> Electrical Constraint</span>
                </th>
                <th className="min-w-[220px] px-2 py-2">
                  <span className="flex items-center gap-1"><Wrench className="h-3.5 w-3.5 text-sky-500" /> Mechanical Constraint</span>
                </th>
                <th className="w-36 px-2 py-2">
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Time to Trials*</span>
                </th>
                <th className="w-44 px-2 py-2">Status</th>
                <th className="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-b align-top last:border-b-0 hover:bg-muted/30">
                  <td className="px-2 py-2">
                    <Input
                      value={row.label}
                      onChange={e => onPatchRow(row.id, { label: e.target.value })}
                      className="h-8 w-12 px-1 text-center text-sm font-semibold"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      value={row.description}
                      onChange={e => onPatchRow(row.id, { description: e.target.value })}
                      placeholder="Station description"
                      className="h-8 text-sm font-medium"
                    />
                    <Textarea
                      value={row.notes}
                      onChange={e => onPatchRow(row.id, { notes: e.target.value })}
                      placeholder="Notes / remarks (optional)"
                      rows={1}
                      className="mt-1 min-h-[30px] resize-y text-xs text-muted-foreground"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Textarea
                      value={row.electricalConstraint}
                      onChange={e => onPatchRow(row.id, { electricalConstraint: e.target.value })}
                      placeholder="Pending electrical works / constraints…"
                      rows={2}
                      className="min-h-[56px] resize-y border-amber-200 text-xs focus-visible:ring-amber-400 dark:border-amber-900/60"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Textarea
                      value={row.mechanicalConstraint}
                      onChange={e => onPatchRow(row.id, { mechanicalConstraint: e.target.value })}
                      placeholder="Pending mechanical works / constraints…"
                      rows={2}
                      className="min-h-[56px] resize-y border-sky-200 text-xs focus-visible:ring-sky-400 dark:border-sky-900/60"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      value={row.trialTime}
                      onChange={e => onPatchRow(row.id, { trialTime: e.target.value })}
                      placeholder="2 days / 1 week / date"
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={row.status}
                      onChange={e => onPatchRow(row.id, { status: e.target.value as StationStatus })}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {STATUS_ORDER.map(s => (
                        <option key={s} value={s}>{STATUS_META[s].label}</option>
                      ))}
                    </select>
                    <Badge className={`${STATUS_META[row.status]?.cls ?? STATUS_META.not_started.cls} mt-1 text-[10px]`}>
                      {STATUS_META[row.status]?.label ?? row.status}
                    </Badge>
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onDeleteRow(row.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No rows yet — click "Add Row" to start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          * Time required to take trials after mechanical and electrical completion.
          Accepts "2", "2 days", "1 week", "1 month", "16 hrs" or an absolute date (2026-09-14 / 14-09-2026).
        </p>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variance pill (top-level component)
// ─────────────────────────────────────────────────────────────────────────────
function VariancePill({ label, target, varianceDays, score }: {
  label: string; target: string | null; varianceDays: number | null; score: number | null;
}) {
  if (!target || varianceDays === null) {
    return (
      <div className="rounded-lg border border-dashed p-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">Not set</p>
        <p className="text-[11px] text-muted-foreground">
          Enter it in Project Tracker → Edit Assignment
        </p>
      </div>
    );
  }
  const late = varianceDays > 0;
  return (
    <div className={`rounded-lg border p-3 ${late
      ? "border-red-300 bg-red-500/5 dark:border-red-900/60"
      : "border-green-300 bg-green-500/5 dark:border-green-900/60"}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{formatDate(target)}</p>
      <p className={`text-xs font-medium ${late ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
        {late
          ? `${varianceDays} working day${varianceDays === 1 ? "" : "s"} LATE`
          : varianceDays === 0 ? "On target" : `${Math.abs(varianceDays)} day${Math.abs(varianceDays) === 1 ? "" : "s"} early`}
      </p>
      <p className="text-[11px] text-muted-foreground">Score {score}/100</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function ProjectCommissioning() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<CommissioningProject | null>(null);
  const [dirty, setDirty] = useState(false);
  const [newProject, setNewProject] = useState("");
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  const userName: string =
    (user as any)?.name ?? (user as any)?.username ?? "Engineer";

  // Tracked projects list
  const { data: tracked = [] } = useQuery<string[]>({
    queryKey: ["/api/commissioning-tracker"],
  });

  // Weekly assignments — source of Internal / Customer target dates + engineers
  const { data: assignments = [] } = useQuery<WeeklyAssignment[]>({
    queryKey: ["/api/weekly-assignments"],
  });

  // All known project names (for "track new project" dropdown)
  const { data: projectNamesRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/project-names"],
  });
  const allProjectNames = useMemo(() => {
    const raw = Array.isArray(projectNamesRaw) ? projectNamesRaw : [];
    const names = raw
      .map((p: any) => (typeof p === "string" ? p : p?.name ?? p?.projectName ?? ""))
      .filter(Boolean);
    const trackedLower = new Set(tracked.map(t => t.trim().toLowerCase()));
    return names.filter(n => !trackedLower.has(n.trim().toLowerCase()));
  }, [projectNamesRaw, tracked]);

  // Selected project data
  const projectUrl = selected ? `/api/commissioning-tracker/${encodeURIComponent(selected)}` : "";
  const { data: projectData, isLoading: projectLoading } = useQuery<CommissioningProject>({
    queryKey: [projectUrl],
    enabled: !!selected,
  });

  // Seed draft when project data loads (empty project → default template)
  useEffect(() => {
    if (!selected) { setDraft(null); return; }
    if (!projectData) return;
    const isNew =
      (projectData.stations?.length ?? 0) === 0 &&
      (projectData.phases?.length ?? 0) === 0;
    setDraft({
      projectName: projectData.projectName || selected,
      stations: isNew ? defaultStations() : projectData.stations ?? [],
      commInterface: (projectData.commInterface?.length ?? 0) === 0 && isNew
        ? defaultCommInterface()
        : projectData.commInterface ?? [],
      phases: isNew ? defaultPhases() : projectData.phases ?? [],
      lastUpdated: projectData.lastUpdated,
      updatedBy: projectData.updatedBy,
    });
    setDirty(isNew); // freshly seeded template needs a first save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectData, selected]);

  const patchDraft = (fn: (d: CommissioningProject) => CommissioningProject) => {
    setDraft(d => (d ? fn(d) : d));
    setDirty(true);
  };

  // ── Station / comm-interface row handlers ──────────────────────────────
  const patchRow = (section: "stations" | "commInterface") =>
    (rowId: string, patch: Partial<StationRow>) =>
      patchDraft(d => ({
        ...d,
        [section]: d[section].map(r => (r.id === rowId ? { ...r, ...patch } : r)),
      }));

  const addRow = (section: "stations" | "commInterface") => () =>
    patchDraft(d => ({
      ...d,
      [section]: [...d[section], mkRow(String(d[section].length + 1), "")],
    }));

  const deleteRow = (section: "stations" | "commInterface") => (rowId: string) =>
    patchDraft(d => ({ ...d, [section]: d[section].filter(r => r.id !== rowId) }));

  // ── Checklist handlers ─────────────────────────────────────────────────
  const toggleItem = (phaseId: string, itemId: string) =>
    patchDraft(d => ({
      ...d,
      phases: d.phases.map(p =>
        p.id !== phaseId ? p : {
          ...p,
          items: p.items.map(i =>
            i.id !== itemId ? i : {
              ...i,
              done: !i.done,
              doneBy: !i.done ? userName : undefined,
              doneAt: !i.done ? new Date().toISOString() : undefined,
            }),
        }),
    }));

  const editItemText = (phaseId: string, itemId: string, text: string) =>
    patchDraft(d => ({
      ...d,
      phases: d.phases.map(p =>
        p.id !== phaseId ? p : { ...p, items: p.items.map(i => (i.id === itemId ? { ...i, text } : i)) }),
    }));

  const addItem = (phaseId: string, text: string) =>
    patchDraft(d => ({
      ...d,
      phases: d.phases.map(p =>
        p.id !== phaseId ? p : { ...p, items: [...p.items, { id: uid(), text, done: false }] }),
    }));

  const deleteItem = (phaseId: string, itemId: string) =>
    patchDraft(d => ({
      ...d,
      phases: d.phases.map(p =>
        p.id !== phaseId ? p : { ...p, items: p.items.filter(i => i.id !== itemId) }),
    }));

  // ── Assignment context for the selected project ────────────────────────
  const projectContext = useMemo(() => {
    if (!selected) return { engineers: [] as string[], internalTarget: null as string | null, customerTarget: null as string | null };
    const key = selected.trim().toLowerCase();
    const mine = assignments.filter(a => {
      const an = (a.projectName ?? "").trim().toLowerCase();
      return an === key || an.includes(key) || key.includes(an);
    });
    const engineers = Array.from(new Set(mine.flatMap(a => splitEngineers(a.engineerName))));
    const internalTarget = mine.map(a => (a.internalTarget ?? "").trim()).filter(Boolean).sort().pop() ?? null;
    const customerTarget = mine.map(a => (a.customerTarget ?? "").trim()).filter(Boolean).sort().pop() ?? null;
    return { engineers, internalTarget, customerTarget };
  }, [assignments, selected]);

  // ── LIVE forecast + rating — recalculates on every keystroke/toggle ─────
  const analysis = useMemo(() => {
    if (!draft) return null;
    const rows: CalcRow[] = [...draft.stations, ...draft.commInterface];
    const phases: CalcPhase[] = draft.phases;
    const forecast = computeForecast(rows, phases, projectContext.engineers.length, new Date());
    const rating = computeRating(forecast, projectContext.internalTarget, projectContext.customerTarget);
    return { forecast, rating };
  }, [draft, projectContext]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft || !selected) throw new Error("Nothing to save");
      return apiRequest("POST", `/api/commissioning-tracker/${encodeURIComponent(selected)}`, {
        ...draft,
        projectName: selected,
        updatedBy: userName,
      });
    },
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/commissioning-tracker"] });
      queryClient.invalidateQueries({ queryKey: [projectUrl] });
      queryClient.invalidateQueries({ queryKey: ["/api/commissioning-performance"] });
      toast({ title: "Saved", description: `Commissioning data for "${selected}" updated. Skill Matrix rating refreshed.` });
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e?.message ?? "Unknown error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () =>
      apiRequest("DELETE", `/api/commissioning-tracker/${encodeURIComponent(selected)}`, undefined, true),
    onSuccess: () => {
      toast({ title: "Removed", description: `"${selected}" removed from commissioning tracking.` });
      setSelected("");
      setDraft(null);
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/commissioning-tracker"] });
      queryClient.invalidateQueries({ queryKey: ["/api/commissioning-performance"] });
    },
    onError: (e: any) =>
      toast({ title: "Delete failed", description: e?.message ?? "Admin only", variant: "destructive" }),
  });

  // ── Project switching ──────────────────────────────────────────────────
  const selectProject = (name: string) => {
    if (!name || name === selected) return;
    if (dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    setDraft(null);
    setDirty(false);
    setSelected(name);
  };

  const startTracking = () => {
    const name = newProject.trim();
    if (!name) {
      toast({ title: "Select or type a project name first", variant: "destructive" });
      return;
    }
    setNewProject("");
    selectProject(name);
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-project-commissioning">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">

        {/* Page title */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <ClipboardCheck className="h-6 w-6 text-primary" />
              Project Commissioning Tracker
            </h1>
            <p className="text-sm text-muted-foreground">
              Station-wise constraints, trial readiness and commissioning checklists per project.
            </p>
          </div>
          {draft?.lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Last updated {new Date(draft.lastUpdated).toLocaleString()}
              {draft.updatedBy ? ` by ${draft.updatedBy}` : ""}
            </p>
          )}
        </div>

        {/* Project picker */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 pt-6">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tracked Projects</label>
              <select
                value={tracked.includes(selected) ? selected : ""}
                onChange={e => selectProject(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— Select a project —</option>
                {tracked.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Track New Project</label>
              <div className="flex gap-2">
                <Input
                  list="commissioning-project-names"
                  placeholder="Select or type project name…"
                  value={newProject}
                  onChange={e => setNewProject(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") startTracking(); }}
                  className="h-9 text-sm"
                />
                <datalist id="commissioning-project-names">
                  {allProjectNames.map(n => <option key={n} value={n} />)}
                </datalist>
                <Button size="sm" className="h-9" onClick={startTracking}>
                  <Plus className="mr-1 h-4 w-4" /> Track
                </Button>
              </div>
            </div>
            {selected && isAdmin && (
              <Button
                variant="outline" size="sm"
                className="h-9 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (window.confirm(`Remove "${selected}" from commissioning tracking? Saved data will be deleted.`)) {
                    deleteMutation.mutate();
                  }
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Remove Project
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Empty / loading states */}
        {!selected && (
          <Card>
            <CardContent className="py-14 text-center text-muted-foreground">
              <ClipboardCheck className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="font-medium">Select a tracked project or start tracking a new one.</p>
              <p className="mt-1 text-sm">
                Each project gets the standard station template, communication-interface list and
                the 3-phase commissioning checklist — all fully editable.
              </p>
            </CardContent>
          </Card>
        )}
        {selected && projectLoading && !draft && (
          <div className="flex justify-center py-14">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        )}

        {selected && draft && analysis && (
          <>
            {/* ── LIVE SCHEDULE FORECAST ─────────────────────────────── */}
            <Card className="border-l-4 border-l-primary">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarClock className="h-5 w-5 text-primary" />
                    Schedule Forecast
                  </CardTitle>
                  <Badge variant="outline" className="text-[11px]">
                    Live · recalculates as you type
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Based on today ({formatDate(new Date())}), pending "Time to Trials" estimates and the
                  engineers assigned to this project. Work week Mon–Sat (Sundays skipped).
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Pending Work</p>
                    <p className="text-2xl font-bold">{analysis.forecast.totalPendingDays}</p>
                    <p className="text-[11px] text-muted-foreground">
                      man-days across {analysis.forecast.pendingRows} open item{analysis.forecast.pendingRows === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" /> Engineers
                    </p>
                    <p className="text-2xl font-bold">{projectContext.engineers.length || 1}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {projectContext.engineers.length === 0 ? "none assigned — assuming 1" : "from Project Tracker"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Days Required</p>
                    <p className="text-2xl font-bold text-primary">{analysis.forecast.effectiveDays}</p>
                    <p className="text-[11px] text-muted-foreground">working days from today</p>
                  </div>
                  <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                    <p className="text-xs text-muted-foreground">Approx. Completion</p>
                    <p className="text-lg font-bold text-primary">{formatDate(analysis.forecast.forecastDate)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {analysis.forecast.completedRows}/{analysis.forecast.totalRows} items done
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <VariancePill
                    label="Internal Target Date"
                    target={analysis.rating.internal.target}
                    varianceDays={analysis.rating.internal.varianceDays}
                    score={analysis.rating.internal.score}
                  />
                  <VariancePill
                    label="Customer Target Date"
                    target={analysis.rating.customer.target}
                    varianceDays={analysis.rating.customer.varianceDays}
                    score={analysis.rating.customer.score}
                  />
                </div>

                {analysis.forecast.missingEstimates > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-500/10 p-3 text-xs dark:border-amber-900/60">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <p>
                      <span className="font-semibold">{analysis.forecast.missingEstimates}</span> pending
                      item{analysis.forecast.missingEstimates === 1 ? " has" : "s have"} no "Time to Trials"
                      estimate — each assumed as 1 day. Fill them in for an accurate forecast.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── ENGINEER RATING ────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Engineer Performance — this project
                  </CardTitle>
                  <Badge className={`${LEVEL_CLS[analysis.rating.level]} text-sm`}>
                    {analysis.rating.level === "Expert" ? <Award className="mr-1 h-3.5 w-3.5" /> : <Star className="mr-1 h-3.5 w-3.5" />}
                    {analysis.rating.overall}% · {analysis.rating.level}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Saved ratings feed the "Commissioning Delivery" section of the Skill Matrix page.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {analysis.rating.components.map(c => (
                    <div key={c.key} className="flex items-center gap-3">
                      <span className="w-36 flex-shrink-0 text-xs text-muted-foreground">
                        {c.label} <span className="opacity-60">({Math.round(c.weight * 100)}%)</span>
                      </span>
                      <Progress value={c.score} className="h-2 flex-1" />
                      <span className="w-12 flex-shrink-0 text-right text-xs font-semibold">{c.score}%</span>
                    </div>
                  ))}
                </div>

                {projectContext.engineers.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      ENGINEERS RATED ON THIS PROJECT ({projectContext.engineers.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {projectContext.engineers.map(n => (
                        <Badge key={n} className={LEVEL_CLS[analysis.rating.level]}>
                          {n} · {analysis.rating.overall}%
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <p>
                      No engineers are assigned to this project in the Project Tracker, so no one can be
                      rated. Assign engineers there and set the Internal / Customer target dates in the
                      Edit Assignment dialog.
                    </p>
                  </div>
                )}

                {analysis.rating.components.length === 2 && (
                  <p className="text-[11px] text-muted-foreground">
                    Internal and Customer target dates are not set for this project, so the rating uses
                    only Station Progress and Checklist, reweighted to 100%.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Summary chips */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Card><CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">{analysis.forecast.totalRows}</p>
                <p className="text-xs text-muted-foreground">Total Line Items</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{analysis.forecast.constrainedRows}</p>
                <p className="text-xs text-muted-foreground">With Constraints</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{analysis.forecast.pendingRows}</p>
                <p className="text-xs text-muted-foreground">Still Pending</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{analysis.forecast.completedRows}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">{analysis.forecast.checklistDone}/{analysis.forecast.checklistTotal}</p>
                <p className="text-xs text-muted-foreground">Checklist Items Done</p>
              </CardContent></Card>
            </div>

            {/* Commissioning phase checklists */}
            <div className="grid gap-4 md:grid-cols-3">
              {draft.phases.map((phase, i) => (
                <PhaseCard
                  key={phase.id}
                  phase={phase}
                  index={i}
                  onToggleItem={toggleItem}
                  onItemText={editItemText}
                  onAddItem={addItem}
                  onDeleteItem={deleteItem}
                />
              ))}
            </div>

            {/* Station table */}
            <StationTable
              title="Stations"
              subtitle="Electrical & mechanical constraints per station — filled by the PLC programmer."
              icon={<CheckCircle2 className="h-4 w-4" />}
              rows={draft.stations}
              onPatchRow={patchRow("stations")}
              onAddRow={addRow("stations")}
              onDeleteRow={deleteRow("stations")}
            />

            {/* Communication interface table */}
            <StationTable
              title="Communication Interface"
              subtitle="Integration, safety and data-interface checks across the line."
              icon={<Cable className="h-4 w-4" />}
              rows={draft.commInterface}
              onPatchRow={patchRow("commInterface")}
              onAddRow={addRow("commInterface")}
              onDeleteRow={deleteRow("commInterface")}
            />

            <div className="h-16" />
          </>
        )}
      </main>

      {/* Sticky save bar */}
      {dirty && draft && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
            <p className="text-sm text-muted-foreground">
              Unsaved changes for “{selected}”
              {analysis && (
                <span className="ml-2 hidden sm:inline">
                  · forecast {formatDate(analysis.forecast.forecastDate)} · rating {analysis.rating.overall}%
                </span>
              )}
            </p>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
