import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ChevronLeft, Plus, Trash2, AlertTriangle, Package, Link2,
  Clock, CheckCircle2, FileText, Truck, Bell, Upload, Loader2, Wrench, CalendarClock,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo, useEffect, useRef } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────────────────────
interface MaterialRow {
  id: string;
  name: string;
  qty: string;
  unit: string;
  bomDate?: string;
  prCreated?: string;
  prApproved?: string;
  poCreated?: string;
  poApproved?: string;
  targetReceipt?: string;       // Target date for receiving hardware (project timeline)
  scmCommittedDate?: string;    // Committed date for material receipt by SCM team
  currentStatus?: string;       // Current procurement status
  actualReceipt?: string;
  hwIntegrationTarget?: string; // AUTO: actualReceipt + 4 days (Electrical Assembly + HW testing + logic configuration)
  hwIntegrationDone?: string;   // Actual completion date of hardware integration
  notes?: string;
}
interface ProjectMaterialData {
  projectName: string;
  bomPath: string;
  materials: MaterialRow[];
}
interface OverdueProjectGroup {
  projectName: string;
  materials: MaterialRow[];
}

const STATUS_OPTIONS = [
  "Not Started",
  "PR Raised",
  "PO Placed",
  "Under Manufacturing",
  "In Transit",
  "Customs / Clearance",
  "Delayed",
  "Received",
] as const;

// Minimum days required after material receipt for Electrical Assembly,
// hardware testing and configuration in the logic.
const HW_INTEGRATION_DAYS = 4;

// ── Date helpers ───────────────────────────────────────────────────────────────
function daysBetween(from?: string, to?: string): number | null {
  if (!from || !to) return null;
  const a = new Date(from); a.setHours(0,0,0,0);
  const b = new Date(to); b.setHours(0,0,0,0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function daysFromToday(d?: string): number | null {
  if (!d) return null;
  const t = new Date(d); t.setHours(0,0,0,0);
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((t.getTime() - now.getTime()) / 86400000);
}
function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
}
function todayStr() { return new Date().toISOString().split("T")[0]; }
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ── Excel import helpers ───────────────────────────────────────────────────────
function excelCellToDateStr(val: any): string {
  if (val === null || val === undefined || val === "") return "";
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return val.toISOString().split("T")[0];
  }
  if (typeof val === "number") {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (!parsed) return "";
    const mm = String(parsed.m).padStart(2, "0");
    const dd = String(parsed.d).padStart(2, "0");
    return `${parsed.y}-${mm}-${dd}`;
  }
  const s = String(val).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  const parsedDate = new Date(s);
  if (!isNaN(parsedDate.getTime())) return parsedDate.toISOString().split("T")[0];
  return "";
}

// Maps a header string from the uploaded timeline sheet to our internal field.
// Order matters: more specific checks first.
function matchHeader(header: string): keyof MaterialRow | "skip" {
  const h = header.toLowerCase().trim();
  if (h.includes("material") && h.includes("name")) return "name";
  if (h === "qty" || h.includes("quantity")) return "qty";
  if (h === "unit") return "unit";
  if (h.includes("bom")) return "bomDate";
  if (h.includes("pr") && h.includes("created")) return "prCreated";
  if (h.includes("pr") && h.includes("approved")) return "prApproved";
  if (h.includes("po") && h.includes("created")) return "poCreated";
  if (h.includes("po") && h.includes("approved")) return "poApproved";
  if (h.includes("commit")) return "scmCommittedDate";                 // "SCM Committed Date"
  if (h.includes("integration")) return "hwIntegrationTarget";         // "HW Integration Target"
  if (h.includes("status")) return "currentStatus";                    // "Current Status"
  if (h.includes("target")) return "targetReceipt";                    // "Target Receipt / Target Date"
  if (h.includes("actual")) return "actualReceipt";
  if (h.includes("note") || h.includes("vendor") || h.includes("remark")) return "notes";
  return "skip";
}

const TEXT_FIELDS: (keyof MaterialRow)[] = ["name", "qty", "unit", "notes", "currentStatus"];

function parseExcelToMaterials(buffer: ArrayBuffer): MaterialRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase() !== "instructions") || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  if (rows.length < 2) return [];

  const headerRow = rows[0].map(h => String(h ?? ""));
  const fieldMap = headerRow.map(h => matchHeader(h));

  const out: MaterialRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const isEmpty = row.every(c => c === "" || c === null || c === undefined);
    if (isEmpty) continue;

    const material: MaterialRow = { id: `mat-${Date.now()}-${i}-${Math.random().toString(36).substr(2,4)}`, name: "", qty: "", unit: "" };
    fieldMap.forEach((field, colIdx) => {
      if (field === "skip") return;
      const raw = row[colIdx];
      if (raw === "" || raw === null || raw === undefined) return;
      if (TEXT_FIELDS.includes(field)) {
        (material as any)[field] = String(raw).trim();
      } else {
        (material as any)[field] = excelCellToDateStr(raw);
      }
    });
    // Auto-derive HW Integration Target from Actual Receipt if present
    if (material.actualReceipt && !material.hwIntegrationTarget) {
      material.hwIntegrationTarget = addDays(material.actualReceipt, HW_INTEGRATION_DAYS);
    }
    if (material.name.trim()) out.push(material);
  }
  return out;
}

// ── Per-material status calculation ────────────────────────────────────────────
interface MaterialStatus {
  prLate: boolean;           // PR not created within 3 days of BOM
  poLate: boolean;           // PO not created within 3 days of PR approval
  receiptOverdue: boolean;   // target receipt passed, not yet received
  receiptDueSoon: boolean;   // within 3 days of target, not yet received
  committedOverdue: boolean; // SCM committed date passed, not yet received
  committedDueSoon: boolean; // within 3 days of SCM committed date, not received
  integrationOverdue: boolean; // received, integration target passed, not completed
  integrationPending: boolean; // received, integration not yet completed
  received: boolean;
  deliveryCrossed: boolean;  // delivery has crossed the scheduled target date
  overallAlert: boolean;
}
function getMaterialStatus(m: MaterialRow): MaterialStatus {
  const prLate = !!m.bomDate && !m.prCreated && (daysBetween(m.bomDate, todayStr()) ?? 0) > 3;
  const poLate = !!m.prApproved && !m.poCreated && (daysBetween(m.prApproved, todayStr()) ?? 0) > 3;
  const received = !!m.actualReceipt;

  const dleft = daysFromToday(m.targetReceipt);
  const receiptOverdue = !received && dleft !== null && dleft < 0;
  const receiptDueSoon = !received && dleft !== null && dleft >= 0 && dleft <= 3;

  const cleft = daysFromToday(m.scmCommittedDate);
  const committedOverdue = !received && cleft !== null && cleft < 0;
  const committedDueSoon = !received && cleft !== null && cleft >= 0 && cleft <= 3;

  const integrationTarget = m.hwIntegrationTarget || (m.actualReceipt ? addDays(m.actualReceipt, HW_INTEGRATION_DAYS) : "");
  const ileft = daysFromToday(integrationTarget || undefined);
  const integrationPending = received && !m.hwIntegrationDone;
  const integrationOverdue = integrationPending && ileft !== null && ileft < 0;

  const deliveryCrossed = receiptOverdue || committedOverdue;

  return {
    prLate, poLate, receiptOverdue, receiptDueSoon,
    committedOverdue, committedDueSoon,
    integrationOverdue, integrationPending,
    received, deliveryCrossed,
    overallAlert: prLate || poLate || receiptOverdue || committedOverdue || integrationOverdue,
  };
}

// ── Stage cell — TOP LEVEL component ───────────────────────────────────────────
interface StageCellProps {
  value?: string;
  onChange: (v: string) => void;
  isLate?: boolean;
  disabled?: boolean;
}
function StageCell({ value, onChange, isLate, disabled }: StageCellProps) {
  return (
    <div className="flex flex-col gap-1">
      <Input
        type="date"
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`h-8 text-xs ${isLate ? "border-red-500 bg-red-500/5 text-red-600 dark:text-red-400" : ""}`}
      />
      {isLate && (
        <span className="text-[10px] text-red-500 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Overdue
        </span>
      )}
    </div>
  );
}

// ── Material row — TOP LEVEL component ─────────────────────────────────────────
interface MaterialRowItemProps {
  material: MaterialRow;
  onUpdate: (id: string, field: keyof MaterialRow, value: string) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}
function MaterialRowItem({ material, onUpdate, onDelete, disabled }: MaterialRowItemProps) {
  const status = getMaterialStatus(material);
  const crossed = status.deliveryCrossed;
  const labelCls = crossed ? "text-[10px] text-white/80" : "text-[10px] text-muted-foreground";

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
      crossed ? "border-red-700 bg-red-600 text-white" :
      status.integrationOverdue ? "border-red-500/40 bg-red-500/5" :
      status.overallAlert ? "border-amber-500/40 bg-amber-500/5" :
      status.received ? "border-green-500/30 bg-green-500/5" : "border-border"
    }`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={material.name}
              onChange={e => onUpdate(material.id, "name", e.target.value)}
              disabled={disabled}
              placeholder="Material name"
              className={`h-8 text-sm font-medium border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:bg-muted/50 focus-visible:px-2 ${crossed ? "text-white placeholder:text-white/60" : ""}`}
              style={{ minWidth: "180px", maxWidth: "320px" }}
            />
            {status.received && <Badge className="bg-green-500 text-white text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1"/>Received</Badge>}
            {!status.received && status.deliveryCrossed && <Badge className="bg-white text-red-600 text-[10px] font-bold"><Bell className="h-3 w-3 mr-1"/>Delivery crossed target</Badge>}
            {!status.received && !status.deliveryCrossed && (status.receiptDueSoon || status.committedDueSoon) && <Badge className="bg-amber-500 text-white text-[10px]"><Clock className="h-3 w-3 mr-1"/>Due soon</Badge>}
            {status.integrationOverdue && <Badge className="bg-red-500 text-white text-[10px]"><Wrench className="h-3 w-3 mr-1"/>Integration overdue</Badge>}
            {status.integrationPending && !status.integrationOverdue && <Badge className="bg-blue-500 text-white text-[10px]"><Wrench className="h-3 w-3 mr-1"/>Integration in progress</Badge>}
            {material.currentStatus && <Badge variant="outline" className={`text-[10px] ${crossed ? "border-white/60 text-white" : ""}`}>{material.currentStatus}</Badge>}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <Input
              value={material.qty}
              onChange={e => onUpdate(material.id, "qty", e.target.value)}
              disabled={disabled}
              placeholder="Qty"
              className="h-6 w-16 text-xs"
            />
            <Input
              value={material.unit}
              onChange={e => onUpdate(material.id, "unit", e.target.value)}
              disabled={disabled}
              placeholder="Unit"
              className="h-6 w-20 text-xs"
            />
          </div>
        </div>
        {!disabled && (
          <Button variant="ghost" size="icon" className={`h-7 w-7 flex-shrink-0 ${crossed ? "text-white hover:text-white hover:bg-red-700" : "text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"}`}
            onClick={() => onDelete(material.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Procurement timeline grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <div>
          <Label className={labelCls}>BOM Created</Label>
          <StageCell value={material.bomDate} onChange={v=>onUpdate(material.id,"bomDate",v)} disabled={disabled}/>
        </div>
        <div>
          <Label className={labelCls}>PR Created</Label>
          <StageCell value={material.prCreated} onChange={v=>onUpdate(material.id,"prCreated",v)} isLate={status.prLate} disabled={disabled}/>
        </div>
        <div>
          <Label className={labelCls}>PR Approved</Label>
          <StageCell value={material.prApproved} onChange={v=>onUpdate(material.id,"prApproved",v)} disabled={disabled}/>
        </div>
        <div>
          <Label className={labelCls}>PO Created</Label>
          <StageCell value={material.poCreated} onChange={v=>onUpdate(material.id,"poCreated",v)} isLate={status.poLate} disabled={disabled}/>
        </div>
        <div>
          <Label className={labelCls}>PO Approved</Label>
          <StageCell value={material.poApproved} onChange={v=>onUpdate(material.id,"poApproved",v)} disabled={disabled}/>
        </div>
        <div>
          <Label className={labelCls}>Target Receipt (HW)</Label>
          <StageCell value={material.targetReceipt} onChange={v=>onUpdate(material.id,"targetReceipt",v)} isLate={status.receiptOverdue} disabled={disabled}/>
        </div>
      </div>

      {/* Hardware delivery + integration grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <div>
          <Label className={labelCls}>SCM Committed Date</Label>
          <StageCell value={material.scmCommittedDate} onChange={v=>onUpdate(material.id,"scmCommittedDate",v)} isLate={status.committedOverdue} disabled={disabled}/>
        </div>
        <div>
          <Label className={labelCls}>Current Status</Label>
          <Select
            value={material.currentStatus || ""}
            onValueChange={v => onUpdate(material.id, "currentStatus", v)}
            disabled={disabled}
          >
            <SelectTrigger className={`h-8 text-xs ${crossed ? "bg-white/10 border-white/40 text-white" : ""}`}>
              <SelectValue placeholder="Status..."/>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className={labelCls}>Actual Receipt Date</Label>
          <Input type="date" value={material.actualReceipt || ""} onChange={e=>onUpdate(material.id,"actualReceipt",e.target.value)} disabled={disabled} className="h-8 text-xs"/>
        </div>
        <div>
          <Label className={`${labelCls} flex items-center gap-1`}><Wrench className="h-3 w-3"/>HW Integration Target</Label>
          <Input
            type="date"
            value={material.hwIntegrationTarget || ""}
            readOnly
            disabled
            title={`Auto-calculated: Actual Receipt + ${HW_INTEGRATION_DAYS} days (Electrical Assembly + HW testing + logic configuration)`}
            className={`h-8 text-xs ${status.integrationOverdue ? "border-red-500 bg-red-500/5 text-red-600 dark:text-red-400" : "bg-muted/40"}`}
          />
          {status.integrationOverdue && (
            <span className="text-[10px] text-red-500 flex items-center gap-1 mt-1">
              <AlertTriangle className="h-3 w-3" /> Overdue
            </span>
          )}
        </div>
        <div>
          <Label className={labelCls}>HW Integration Done</Label>
          <Input type="date" value={material.hwIntegrationDone || ""} onChange={e=>onUpdate(material.id,"hwIntegrationDone",e.target.value)} disabled={disabled || !material.actualReceipt} className="h-8 text-xs"/>
        </div>
        <div>
          <Label className={labelCls}>Notes</Label>
          <Input value={material.notes || ""} onChange={e=>onUpdate(material.id,"notes",e.target.value)} disabled={disabled} placeholder="Vendor, remarks..." className="h-8 text-xs"/>
        </div>
      </div>
    </div>
  );
}

// ── Project-wise overdue list — TOP LEVEL component ────────────────────────────
// Lists materials (grouped by project) whose delivery has crossed the scheduled
// target date. Rendered with red background and white font as required.
interface OverdueListProps {
  groups: OverdueProjectGroup[];
  isLoading: boolean;
}
function OverdueMaterialsList({ groups, isLoading }: OverdueListProps) {
  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2"/>Checking delivery timelines across all projects…
        </CardContent>
      </Card>
    );
  }
  if (groups.length === 0) return null;

  const total = groups.reduce((n, g) => n + g.materials.length, 0);
  return (
    <Card className="mb-6 border-red-700 overflow-hidden">
      <CardHeader className="bg-red-600 text-white py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bell className="h-4 w-4"/>
          Delivery Crossed Scheduled Target — {total} material{total !== 1 ? "s" : ""} across {groups.length} project{groups.length !== 1 ? "s" : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {groups.map(g => (
          <div key={g.projectName} className="border-t border-red-700/40 first:border-t-0">
            <div className="bg-red-700 text-white px-4 py-2 text-xs font-semibold uppercase tracking-wide">
              {g.projectName}
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-red-500 text-white">
                  <th className="text-left px-4 py-2 font-medium">Material</th>
                  <th className="text-left px-3 py-2 font-medium">Qty</th>
                  <th className="text-left px-3 py-2 font-medium">Target Receipt</th>
                  <th className="text-left px-3 py-2 font-medium">SCM Committed</th>
                  <th className="text-left px-3 py-2 font-medium">Days Overdue</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {g.materials.map(m => {
                  const dTarget = daysFromToday(m.targetReceipt);
                  const dCommit = daysFromToday(m.scmCommittedDate);
                  const worst = Math.min(dTarget ?? 0, dCommit ?? 0);
                  return (
                    <tr key={m.id} className="bg-red-600 text-white border-t border-red-700/40">
                      <td className="px-4 py-2 font-medium">{m.name}</td>
                      <td className="px-3 py-2">{m.qty} {m.unit}</td>
                      <td className="px-3 py-2">{fmtDate(m.targetReceipt)}</td>
                      <td className="px-3 py-2">{fmtDate(m.scmCommittedDate)}</td>
                      <td className="px-3 py-2 font-bold">{worst < 0 ? Math.abs(worst) : "—"}</td>
                      <td className="px-3 py-2">{m.currentStatus || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function MaterialProcurementTracker() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const [selectedProject, setSelectedProject] = useState<string>("");
  const [pendingProject, setPendingProject] = useState<string | null>(null);
  const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false);

  const requestSwitchProject = (next: string) => {
    if (hasChanges && next !== selectedProject) {
      setPendingProject(next);
      setConfirmSwitchOpen(true);
    } else {
      setSelectedProject(next);
    }
  };
  const confirmDiscardAndSwitch = () => {
    if (pendingProject !== null) setSelectedProject(pendingProject);
    setPendingProject(null);
    setConfirmSwitchOpen(false);
  };
  const [bomPath, setBomPath] = useState("");
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [filterMode, setFilterMode] = useState<"all"|"alerts"|"pending">("all");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<MaterialRow[] | null>(null);
  const [importMode, setImportMode] = useState<"replace"|"append">("append");
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const remindedRef = useRef(false);

  const { data: projectNames = [] } = useQuery<string[]>({
    queryKey: ["/api/project-names"],
    queryFn: async () => { const r = await fetch("/api/project-names"); if (!r.ok) throw new Error("failed"); return r.json(); },
  });

  const { data: trackedProjects = [] } = useQuery<string[]>({
    queryKey: ["/api/material-tracker"],
    queryFn: async () => { const r = await fetch("/api/material-tracker"); if (!r.ok) throw new Error("failed"); return r.json(); },
  });

  const allProjectOptions = useMemo(() => {
    const s = new Set<string>([...trackedProjects, ...projectNames]);
    return Array.from(s).sort();
  }, [trackedProjects, projectNames]);

  const { data: projectData, isLoading } = useQuery<ProjectMaterialData | null>({
    queryKey: ["/api/material-tracker", selectedProject],
    queryFn: async () => {
      if (!selectedProject) return null;
      const r = await fetch(`/api/material-tracker/${encodeURIComponent(selectedProject)}`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    enabled: !!selectedProject,
  });

  // ── Automatic monitoring: project-wise overdue deliveries across ALL projects.
  // Re-checked every 5 minutes so reminders stay current while the page is open.
  const { data: overdueGroups = [], isLoading: overdueLoading } = useQuery<OverdueProjectGroup[]>({
    queryKey: ["/api/material-tracker", "overdue-all"],
    queryFn: async () => {
      const r = await fetch("/api/material-tracker");
      if (!r.ok) throw new Error("failed");
      const names: string[] = await r.json();
      const results = await Promise.all(names.map(async (n) => {
        try {
          const res = await fetch(`/api/material-tracker/${encodeURIComponent(n)}`);
          if (!res.ok) return null;
          const d: ProjectMaterialData = await res.json();
          const overdue = (d.materials || []).filter(m => getMaterialStatus(m).deliveryCrossed);
          return overdue.length > 0 ? { projectName: d.projectName || n, materials: overdue } : null;
        } catch {
          return null;
        }
      }));
      return results.filter((g): g is OverdueProjectGroup => g !== null);
    },
    refetchInterval: 5 * 60 * 1000,
  });

  // One-time reminder toast when overdue deliveries are detected
  useEffect(() => {
    if (!remindedRef.current && overdueGroups.length > 0) {
      remindedRef.current = true;
      const total = overdueGroups.reduce((n, g) => n + g.materials.length, 0);
      toast({
        title: `⚠ ${total} material${total !== 1 ? "s" : ""} past delivery target`,
        description: `Across ${overdueGroups.length} project${overdueGroups.length !== 1 ? "s" : ""}. Follow up with SCM team.`,
        variant: "destructive",
      });
    }
  }, [overdueGroups, toast]);

  useEffect(() => {
    if (projectData) {
      setBomPath(projectData.bomPath || "");
      setMaterials(projectData.materials || []);
      setHasChanges(false);
    } else if (selectedProject) {
      setBomPath("");
      setMaterials([]);
      setHasChanges(false);
    }
  }, [projectData, selectedProject]);

  // Warn before closing/refreshing the tab if there are unsaved edits
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  const saveMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/material-tracker/${encodeURIComponent(selectedProject)}`,
      { projectName: selectedProject, bomPath, materials }, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/material-tracker"] });
      toast({ title: "Saved successfully" });
      setHasChanges(false);
    },
    onError: (e: any) => toast({ title: e?.message || "Save failed", variant: "destructive" }),
  });

  const addMaterial = () => {
    setMaterials(prev => [...prev, {
      id: `mat-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
      name: "", qty: "", unit: "",
    }]);
    setHasChanges(true);
  };
  const updateMaterial = (id: string, field: keyof MaterialRow, value: string) => {
    setMaterials(prev => prev.map(m => {
      if (m.id !== id) return m;
      const next: MaterialRow = { ...m, [field]: value };
      // AUTO RULE: once hardware is received, minimum 4 days are required for
      // Electrical Assembly + hardware testing + configuration in the logic.
      // Target date for HW integration = Actual Receipt + 4 days.
      if (field === "actualReceipt") {
        next.hwIntegrationTarget = value ? addDays(value, HW_INTEGRATION_DAYS) : undefined;
        if (value && !next.currentStatus) next.currentStatus = "Received";
        if (!value) next.hwIntegrationDone = undefined;
      }
      return next;
    }));
    setHasChanges(true);
  };
  const deleteMaterial = (id: string) => {
    setMaterials(prev => prev.filter(m => m.id !== id));
    setHasChanges(true);
  };

  // ── Excel timeline import flow ────────────────────────────────────────────────
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseExcelToMaterials(buffer);
      if (parsed.length === 0) {
        toast({ title: "No materials found in this sheet", description: "Check that column headers match the expected names.", variant: "destructive" });
      } else {
        setImportPreview(parsed);
        setImportConfirmOpen(true);
      }
    } catch (err: any) {
      toast({ title: "Could not read this file", description: err?.message || "Make sure it's a valid .xlsx file", variant: "destructive" });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const confirmImport = () => {
    if (!importPreview) return;
    setMaterials(prev => importMode === "replace" ? importPreview : [...prev, ...importPreview]);
    setHasChanges(true);
    setImportConfirmOpen(false);
    setImportPreview(null);
    toast({ title: `Imported ${importPreview.length} material${importPreview.length!==1?"s":""}`, description: "Click Save Changes to persist this." });
  };

  const handleAddProject = () => {
    if (!newProjectName.trim()) return;
    setSelectedProject(newProjectName.trim());
    setNewProjectName("");
    setAddProjectOpen(false);
  };

  // Alert summary across the loaded project
  const alertSummary = useMemo(() => {
    let prLate = 0, poLate = 0, receiptOverdue = 0, committedOverdue = 0, dueSoon = 0, integrationDue = 0, received = 0;
    materials.forEach(m => {
      const s = getMaterialStatus(m);
      if (s.prLate) prLate++;
      if (s.poLate) poLate++;
      if (s.receiptOverdue) receiptOverdue++;
      if (s.committedOverdue) committedOverdue++;
      if (s.receiptDueSoon || s.committedDueSoon) dueSoon++;
      if (s.integrationOverdue) integrationDue++;
      if (s.received) received++;
    });
    return { prLate, poLate, receiptOverdue, committedOverdue, dueSoon, integrationDue, received, total: materials.length };
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    if (filterMode === "all") return materials;
    return materials.filter(m => {
      const s = getMaterialStatus(m);
      if (filterMode === "alerts") return s.overallAlert;
      if (filterMode === "pending") return !s.received;
      return true;
    });
  }, [materials, filterMode]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto px-4 py-6 w-full max-w-[1400px]">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/"><Button variant="ghost" size="icon"><ChevronLeft className="h-5 w-5"/></Button></Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6"/>Material Procurement Tracker</h1>
            <p className="text-sm text-muted-foreground">Track BOM → PR → PO → Receipt → HW Integration timeline for every material</p>
          </div>
          {hasChanges && isAdmin && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          )}
        </div>

        {/* Project-wise overdue deliveries (all projects, red background + white font) */}
        <OverdueMaterialsList groups={overdueGroups} isLoading={overdueLoading} />

        {/* Project selector */}
        <Card className="mb-6">
          <CardContent className="pt-5 pb-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Project</Label>
                <div className="flex gap-2">
                  <Select value={selectedProject} onValueChange={requestSwitchProject}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select a project..."/></SelectTrigger>
                    <SelectContent className="max-h-72 overflow-y-auto">
                      {allProjectOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {isAdmin && (
                    <Button variant="outline" size="icon" onClick={() => setAddProjectOpen(true)} title="Track a new project">
                      <Plus className="h-4 w-4"/>
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="flex items-center gap-1"><Link2 className="h-3.5 w-3.5"/>BOM Location (link or path)</Label>
                <Input
                  value={bomPath}
                  onChange={e => { setBomPath(e.target.value); setHasChanges(true); }}
                  placeholder="https://github.com/.../BOM.xlsx or \\server\path\BOM.xlsx"
                  disabled={!selectedProject || !isAdmin}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {!selectedProject ? (
          <div className="text-center py-20 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto opacity-20 mb-3"/>
            <p>Select or add a project to start tracking materials</p>
          </div>
        ) : (
          <>
            {/* Alert summary bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
              <Card className={alertSummary.prLate > 0 ? "border-red-500/40" : ""}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3.5 w-3.5"/>PR Late</p>
                  <p className={`text-xl font-bold ${alertSummary.prLate>0?"text-red-500":""}`}>{alertSummary.prLate}</p>
                </CardContent>
              </Card>
              <Card className={alertSummary.poLate > 0 ? "border-red-500/40" : ""}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3.5 w-3.5"/>PO Late</p>
                  <p className={`text-xl font-bold ${alertSummary.poLate>0?"text-red-500":""}`}>{alertSummary.poLate}</p>
                </CardContent>
              </Card>
              <Card className={alertSummary.receiptOverdue > 0 ? "border-red-500/40" : ""}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Bell className="h-3.5 w-3.5"/>Receipt Overdue</p>
                  <p className={`text-xl font-bold ${alertSummary.receiptOverdue>0?"text-red-500":""}`}>{alertSummary.receiptOverdue}</p>
                </CardContent>
              </Card>
              <Card className={alertSummary.committedOverdue > 0 ? "border-red-500/40" : ""}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5"/>SCM Commit Missed</p>
                  <p className={`text-xl font-bold ${alertSummary.committedOverdue>0?"text-red-500":""}`}>{alertSummary.committedOverdue}</p>
                </CardContent>
              </Card>
              <Card className={alertSummary.dueSoon > 0 ? "border-amber-500/40" : ""}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5"/>Due Soon</p>
                  <p className={`text-xl font-bold ${alertSummary.dueSoon>0?"text-amber-500":""}`}>{alertSummary.dueSoon}</p>
                </CardContent>
              </Card>
              <Card className={alertSummary.integrationDue > 0 ? "border-red-500/40" : ""}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Wrench className="h-3.5 w-3.5"/>Integration Overdue</p>
                  <p className={`text-xl font-bold ${alertSummary.integrationDue>0?"text-red-500":""}`}>{alertSummary.integrationDue}</p>
                </CardContent>
              </Card>
              <Card className="border-green-500/30">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="h-3.5 w-3.5"/>Received</p>
                  <p className="text-xl font-bold text-green-500">{alertSummary.received} / {alertSummary.total}</p>
                </CardContent>
              </Card>
            </div>

            {/* Filter + Add material */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1">
                {([["all","All"],["alerts","Alerts Only"],["pending","Pending"]] as const).map(([k,label])=>(
                  <button key={k} onClick={()=>setFilterMode(k)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                      filterMode===k ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelected}/>
                  <Button size="sm" variant="outline" disabled={isImporting} onClick={()=>fileInputRef.current?.click()}>
                    {isImporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin"/> : <Upload className="h-4 w-4 mr-1"/>}
                    Upload Project Timeline
                  </Button>
                  <Button size="sm" onClick={addMaterial}><Plus className="h-4 w-4 mr-1"/>Add Material</Button>
                </div>
              )}
            </div>

            {/* Material list */}
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading…</div>
            ) : filteredMaterials.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border rounded-xl">
                {materials.length === 0 ? "No materials added yet — click \"Add Material\" or \"Upload Project Timeline\" to start." : "No materials match this filter."}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMaterials.map(m => (
                  <MaterialRowItem key={m.id} material={m} onUpdate={updateMaterial} onDelete={deleteMaterial} disabled={!isAdmin}/>
                ))}
              </div>
            )}

            {/* Rules reminder */}
            <div className="mt-8 p-4 rounded-xl bg-muted/30 border text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground mb-1">Timeline monitoring rules applied automatically:</p>
              <p>• PR Created turns <span className="text-red-500 font-medium">red</span> if not filled within 3 days of BOM Created date</p>
              <p>• PO Created turns <span className="text-red-500 font-medium">red</span> if not filled within 3 days of PR Approved date</p>
              <p>• Target Receipt / SCM Committed Date turn <span className="text-red-500 font-medium">red</span> once the date passes without an Actual Receipt</p>
              <p>• A material whose delivery has crossed the scheduled target date is highlighted with a <span className="text-red-500 font-medium">red background and white font</span>, and listed project-wise at the top of the page</p>
              <p>• "Due soon" appears within 3 days of the Target Receipt or SCM Committed date</p>
              <p>• On entering the Actual Receipt date, the <strong>HW Integration Target</strong> is set automatically to Actual Receipt + {HW_INTEGRATION_DAYS} days (minimum time for Electrical Assembly, hardware testing and configuration in the logic)</p>
              <p>• HW Integration turns <span className="text-red-500 font-medium">red</span> if not marked done by the integration target date</p>
              <p>• Overdue deliveries are re-checked automatically every 5 minutes while this page is open</p>
            </div>
          </>
        )}
      </div>

      {/* Add project dialog */}
      <Dialog open={addProjectOpen} onOpenChange={setAddProjectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Track a New Project</DialogTitle></DialogHeader>
          <div className="py-4 grid gap-2">
            <Label>Project Name</Label>
            <Input list="all-proj-list" value={newProjectName} onChange={e=>setNewProjectName(e.target.value)} placeholder="Type or select project name"/>
            <datalist id="all-proj-list">{projectNames.map(n=><option key={n} value={n}/>)}</datalist>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setAddProjectOpen(false)}>Cancel</Button>
            <Button onClick={handleAddProject}>Start Tracking</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved changes confirmation */}
      <Dialog open={confirmSwitchOpen} onOpenChange={(open)=>{ setConfirmSwitchOpen(open); if(!open) setPendingProject(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5"/>Unsaved Changes
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              You have unsaved changes for <span className="font-medium text-foreground">{selectedProject}</span>.
              Switching projects now will discard them. Save first, or discard and continue?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>{ setConfirmSwitchOpen(false); setPendingProject(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDiscardAndSwitch}>Discard & Switch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import preview / confirmation */}
      <Dialog open={importConfirmOpen} onOpenChange={(open)=>{ setImportConfirmOpen(open); if(!open) setImportPreview(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5"/>Timeline Import Preview — {importPreview?.length ?? 0} material{(importPreview?.length ?? 0)!==1?"s":""} found
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 max-h-72 overflow-y-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Material</th>
                  <th className="text-left px-3 py-2 font-medium">Qty</th>
                  <th className="text-left px-3 py-2 font-medium">Unit</th>
                  <th className="text-left px-3 py-2 font-medium">BOM</th>
                  <th className="text-left px-3 py-2 font-medium">Target Receipt</th>
                  <th className="text-left px-3 py-2 font-medium">SCM Committed</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {importPreview?.map(m => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-1.5">{m.name}</td>
                    <td className="px-3 py-1.5">{m.qty}</td>
                    <td className="px-3 py-1.5">{m.unit}</td>
                    <td className="px-3 py-1.5">{fmtDate(m.bomDate)}</td>
                    <td className="px-3 py-1.5">{fmtDate(m.targetReceipt)}</td>
                    <td className="px-3 py-1.5">{fmtDate(m.scmCommittedDate)}</td>
                    <td className="px-3 py-1.5">{m.currentStatus || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <Label className="text-sm">If materials already exist for this project:</Label>
            <div className="flex gap-1">
              <button onClick={()=>setImportMode("append")}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${importMode==="append"?"bg-primary text-primary-foreground border-primary":"bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"}`}>
                Add to existing
              </button>
              <button onClick={()=>setImportMode("replace")}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${importMode==="replace"?"bg-red-500 text-white border-red-500":"bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"}`}>
                Replace all
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            This only loads the data into the page — click <strong>Save Changes</strong> afterward to persist it.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={()=>{ setImportConfirmOpen(false); setImportPreview(null); }}>Cancel</Button>
            <Button onClick={confirmImport}>
              {importMode === "replace" ? "Replace All Materials" : "Add These Materials"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
