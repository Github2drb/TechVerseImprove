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
  Clock, CheckCircle2, FileText, Truck, Bell, Edit2, X,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo, useEffect } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";

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
  targetReceipt?: string;
  actualReceipt?: string;
  notes?: string;
}
interface ProjectMaterialData {
  projectName: string;
  bomPath: string;
  materials: MaterialRow[];
}

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

// ── Per-material status calculation ────────────────────────────────────────────
interface MaterialStatus {
  prLate: boolean;      // PR not created within 3 days of BOM
  poLate: boolean;      // PO not created within 3 days of PR approval
  receiptOverdue: boolean; // target receipt passed, not yet received
  receiptDueSoon: boolean; // within 3 days of target, not yet received
  received: boolean;
  overallAlert: boolean;
}
function getMaterialStatus(m: MaterialRow): MaterialStatus {
  const prLate = !!m.bomDate && !m.prCreated && (daysBetween(m.bomDate, todayStr()) ?? 0) > 3;
  const poLate = !!m.prApproved && !m.poCreated && (daysBetween(m.prApproved, todayStr()) ?? 0) > 3;
  const received = !!m.actualReceipt;
  const dleft = daysFromToday(m.targetReceipt);
  const receiptOverdue = !received && dleft !== null && dleft < 0;
  const receiptDueSoon = !received && dleft !== null && dleft >= 0 && dleft <= 3;
  return {
    prLate, poLate, receiptOverdue, receiptDueSoon, received,
    overallAlert: prLate || poLate || receiptOverdue,
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
  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
      status.receiptOverdue ? "border-red-500/40 bg-red-500/5" :
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
              className="h-8 text-sm font-medium border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:bg-muted/50 focus-visible:px-2 -ml-0"
              style={{ minWidth: "180px", maxWidth: "320px" }}
            />
            {status.received && <Badge className="bg-green-500 text-white text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1"/>Received</Badge>}
            {!status.received && status.receiptOverdue && <Badge className="bg-red-500 text-white text-[10px]"><Bell className="h-3 w-3 mr-1"/>Receipt overdue</Badge>}
            {!status.received && !status.receiptOverdue && status.receiptDueSoon && <Badge className="bg-amber-500 text-white text-[10px]"><Clock className="h-3 w-3 mr-1"/>Due soon</Badge>}
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
          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 flex-shrink-0"
            onClick={() => onDelete(material.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Timeline grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">BOM Created</Label>
          <StageCell value={material.bomDate} onChange={v=>onUpdate(material.id,"bomDate",v)} disabled={disabled}/>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">PR Created</Label>
          <StageCell value={material.prCreated} onChange={v=>onUpdate(material.id,"prCreated",v)} isLate={status.prLate} disabled={disabled}/>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">PR Approved</Label>
          <StageCell value={material.prApproved} onChange={v=>onUpdate(material.id,"prApproved",v)} disabled={disabled}/>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">PO Created</Label>
          <StageCell value={material.poCreated} onChange={v=>onUpdate(material.id,"poCreated",v)} isLate={status.poLate} disabled={disabled}/>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">PO Approved</Label>
          <StageCell value={material.poApproved} onChange={v=>onUpdate(material.id,"poApproved",v)} disabled={disabled}/>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Target Receipt</Label>
          <StageCell value={material.targetReceipt} onChange={v=>onUpdate(material.id,"targetReceipt",v)} isLate={status.receiptOverdue} disabled={disabled}/>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Actual Receipt Date</Label>
          <Input type="date" value={material.actualReceipt || ""} onChange={e=>onUpdate(material.id,"actualReceipt",e.target.value)} disabled={disabled} className="h-8 text-xs"/>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Notes</Label>
          <Input value={material.notes || ""} onChange={e=>onUpdate(material.id,"notes",e.target.value)} disabled={disabled} placeholder="Vendor, remarks..." className="h-8 text-xs"/>
        </div>
      </div>
    </div>
  );
}

export default function MaterialProcurementTracker() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const [selectedProject, setSelectedProject] = useState<string>("");
  const [bomPath, setBomPath] = useState("");
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [filterMode, setFilterMode] = useState<"all"|"alerts"|"pending">("all");

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
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
    setHasChanges(true);
  };
  const deleteMaterial = (id: string) => {
    setMaterials(prev => prev.filter(m => m.id !== id));
    setHasChanges(true);
  };

  const handleAddProject = () => {
    if (!newProjectName.trim()) return;
    setSelectedProject(newProjectName.trim());
    setNewProjectName("");
    setAddProjectOpen(false);
  };

  // Alert summary across the loaded project
  const alertSummary = useMemo(() => {
    let prLate = 0, poLate = 0, receiptOverdue = 0, dueSoon = 0, received = 0;
    materials.forEach(m => {
      const s = getMaterialStatus(m);
      if (s.prLate) prLate++;
      if (s.poLate) poLate++;
      if (s.receiptOverdue) receiptOverdue++;
      if (s.receiptDueSoon) dueSoon++;
      if (s.received) received++;
    });
    return { prLate, poLate, receiptOverdue, dueSoon, received, total: materials.length };
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
            <p className="text-sm text-muted-foreground">Track BOM → PR → PO → Receipt timeline for every material</p>
          </div>
          {hasChanges && isAdmin && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          )}
        </div>

        {/* Project selector */}
        <Card className="mb-6">
          <CardContent className="pt-5 pb-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Project</Label>
                <div className="flex gap-2">
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
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
              <Card className={alertSummary.dueSoon > 0 ? "border-amber-500/40" : ""}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5"/>Due Soon</p>
                  <p className={`text-xl font-bold ${alertSummary.dueSoon>0?"text-amber-500":""}`}>{alertSummary.dueSoon}</p>
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
                <Button size="sm" onClick={addMaterial}><Plus className="h-4 w-4 mr-1"/>Add Material</Button>
              )}
            </div>

            {/* Material list */}
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading…</div>
            ) : filteredMaterials.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border rounded-xl">
                {materials.length === 0 ? "No materials added yet — click \"Add Material\" to start." : "No materials match this filter."}
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
              <p className="font-medium text-foreground mb-1">Tracking rules applied automatically:</p>
              <p>• PR Created turns <span className="text-red-500 font-medium">red</span> if not filled within 3 days of BOM Created date</p>
              <p>• PO Created turns <span className="text-red-500 font-medium">red</span> if not filled within 3 days of PR Approved date</p>
              <p>• Target Receipt turns <span className="text-red-500 font-medium">red</span> and shows a "Receipt overdue" badge once the target date passes without an Actual Receipt date</p>
              <p>• A material shows "Due soon" within 3 days of the target receipt date</p>
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
    </div>
  );
}
