import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Briefcase, Users, ChevronLeft, Search, Filter, Edit2, Plus, AlertTriangle, Trash2, ChevronDown, X } from "lucide-react";
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

interface WeeklyAssignment {
  id: string;
  engineerName: string;
  projectName: string;
  weekStart: string;
  projectTargetDate?: string;
  resourceLockedFrom?: string;
  resourceLockedTill?: string;
  internalTarget?: string;
  customerTarget?: string;
  currentStatus: string;
  notes?: string;
  constraint?: string;
  tasks: Array<{
    id: string;
    taskName: string;
    targetDate?: string;
    completionDate?: string;
    status: string;
  }>;
}

interface EngineerRowData {
  assignmentId: string;
  name: string;
  resourceLockedFrom?: string;
  resourceLockedTill?: string;
  resourceLockDays: number;
  daysExceeded: number;
  internalTarget?: string;
  customerTarget?: string;
  currentStatus: string;
  constraint?: string;
}

interface ProjectRow {
  projectName: string;
  engineers: EngineerRowData[];
}

// ── Status config — extended with project phase statuses ─────────────────────
const statusColors: Record<string, string> = {
  // Original statuses
  not_started:            "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  in_progress:            "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed:              "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  on_hold:                "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  blocked:                "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  // Phase-based statuses
  design_stage:           "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  electrical_design:      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  procurement_stage:      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  waiting_for_materials:  "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  mechanical_assembly:    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  electrical_assembly:    "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  installation_pending:   "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  installation_in_progress:"bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  plc_power_up:           "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  io_check:               "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",
  trials_stage:           "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  fat:                    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200",
  sat:                    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  dispatch_stage:         "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const statusLabels: Record<string, string> = {
  // Original
  not_started:            "Not Started",
  in_progress:            "In Progress",
  completed:              "Completed",
  on_hold:                "On Hold",
  blocked:                "Blocked",
  // Phase-based
  design_stage:           "Design Stage",
  electrical_design:      "Electrical Design",
  procurement_stage:      "Procurement Stage",
  waiting_for_materials:  "Waiting for Materials",
  mechanical_assembly:    "Mechanical Assembly",
  electrical_assembly:    "Electrical Assembly",
  installation_pending:   "Installation Pending",
  installation_in_progress:"Installation in Progress",
  plc_power_up:           "PLC Power Up",
  io_check:               "IO Check",
  trials_stage:           "Trials Stage",
  fat:                    "F.A.T",
  sat:                    "S.A.T",
  dispatch_stage:         "Dispatch Stage",
};

// Status groups for organised dropdown
const STATUS_GROUPS = [
  {
    label: "General",
    items: [
      { value:"not_started",  label:"Not Started"  },
      { value:"on_hold",      label:"On Hold"       },
      { value:"blocked",      label:"Blocked"       },
      { value:"completed",    label:"Completed"     },
    ],
  },
  {
    label: "Design & Procurement",
    items: [
      { value:"design_stage",          label:"Design Stage"          },
      { value:"electrical_design",     label:"Electrical Design"     },
      { value:"procurement_stage",     label:"Procurement Stage"     },
      { value:"waiting_for_materials", label:"Waiting for Materials" },
    ],
  },
  {
    label: "Assembly & Installation",
    items: [
      { value:"mechanical_assembly",        label:"Mechanical Assembly"        },
      { value:"electrical_assembly",        label:"Electrical Assembly"        },
      { value:"installation_pending",       label:"Installation Pending"       },
      { value:"installation_in_progress",   label:"Installation in Progress"   },
    ],
  },
  {
    label: "Testing & Commissioning",
    items: [
      { value:"plc_power_up",   label:"PLC Power Up"   },
      { value:"io_check",       label:"IO Check"        },
      { value:"trials_stage",   label:"Trials Stage"    },
      { value:"fat",            label:"F.A.T"           },
      { value:"sat",            label:"S.A.T"           },
    ],
  },
  {
    label: "Completion",
    items: [
      { value:"in_progress",    label:"In Progress"   },
      { value:"dispatch_stage", label:"Dispatch Stage" },
    ],
  },
];

function calculateLockDays(from?: string, till?: string): number {
  if (!from || !till) return 0;
  const diffTime = new Date(till).getTime() - new Date(from).getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

function calculateDaysExceeded(till?: string): number {
  if (!till) return 0;
  const today = new Date(); today.setHours(0,0,0,0);
  const tillDate = new Date(till); tillDate.setHours(0,0,0,0);
  const diffDays = Math.ceil((today.getTime() - tillDate.getTime()) / (1000*60*60*24));
  return diffDays > 0 ? diffDays : 0;
}

function groupByProject(assignments: WeeklyAssignment[]): ProjectRow[] {
  const projectMap: Record<string, ProjectRow> = {};
  assignments.forEach((assignment) => {
    const key = assignment.projectName.toLowerCase().trim();
    if (!projectMap[key]) {
      projectMap[key] = { projectName: assignment.projectName, engineers: [] };
    }
    const existingEngineer = projectMap[key].engineers.find(
      e => e.name === assignment.engineerName && e.assignmentId === assignment.id
    );
    if (!existingEngineer) {
      projectMap[key].engineers.push({
        assignmentId:       assignment.id,
        name:               assignment.engineerName,
        resourceLockedFrom: assignment.resourceLockedFrom,
        resourceLockedTill: assignment.resourceLockedTill,
        resourceLockDays:   calculateLockDays(assignment.resourceLockedFrom, assignment.resourceLockedTill),
        daysExceeded:       calculateDaysExceeded(assignment.resourceLockedTill),
        internalTarget:     assignment.internalTarget,
        customerTarget:     assignment.customerTarget,
        currentStatus:      assignment.currentStatus,
        constraint:         assignment.constraint,
      });
    }
  });
  return Object.values(projectMap).sort((a, b) => a.projectName.localeCompare(b.projectName));
}

export default function TeamProjectTracker() {
  const { toast }   = useToast();
  const { isAdmin } = useAuth();
  const [searchQuery,       setSearchQuery]       = useState("");
  const [statusFilter,      setStatusFilter]      = useState<string>("all");
  const [editDialogOpen,    setEditDialogOpen]    = useState(false);
  const [addDialogOpen,     setAddDialogOpen]     = useState(false);
  const [deleteDialogOpen,  setDeleteDialogOpen]  = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<WeeklyAssignment | null>(null);
  const [deletingAssignment,setDeletingAssignment]= useState<{ id:string; projectName:string; engineerName:string }|null>(null);

  const [formData, setFormData] = useState({
    engineerName: "", projectName: "",
    resourceLockedFrom: "", resourceLockedTill: "",
    internalTarget: "", customerTarget: "",
    currentStatus: "not_started", constraint: "",
  });

  // ── FIXED: Only fetch from weekly-assignments — no data.json merge ─────────
  const { data: assignments = [], isLoading } = useQuery<WeeklyAssignment[]>({
    queryKey: ["/api/weekly-assignments"],
    queryFn: async () => {
      const response = await fetch("/api/weekly-assignments");
      if (!response.ok) throw new Error("Failed to fetch assignments");
      return response.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: projectNames = [] } = useQuery<string[]>({
    queryKey: ["/api/project-names"],
    queryFn: async () => {
      const response = await fetch("/api/project-names");
      if (!response.ok) throw new Error("Failed to fetch project names");
      return response.json();
    },
  });

  const { data: masterEngineers = [] } = useQuery<Array<{ id:string; name:string; initials:string }>>({
    queryKey: ["/api/engineers-master-list"],
    queryFn: async () => {
      const response = await fetch("/api/engineers-master-list");
      if (!response.ok) throw new Error("Failed to fetch engineers");
      return response.json();
    },
  });

  const [engineerPickerOpen, setEngineerPickerOpen] = useState(false);
  const [engineerSearch,     setEngineerSearch]     = useState("");
  const engineerPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (engineerPickerRef.current && !engineerPickerRef.current.contains(e.target as Node))
        setEngineerPickerOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedEngineers = useMemo(() => {
    if (!formData.engineerName.trim()) return [];
    return formData.engineerName.split(",").map(n => n.trim()).filter(Boolean);
  }, [formData.engineerName]);

  const toggleEngineer = (name: string) => {
    const exists = selectedEngineers.includes(name);
    const updated = exists ? selectedEngineers.filter(n => n !== name) : [...selectedEngineers, name];
    setFormData(prev => ({ ...prev, engineerName: updated.join(", ") }));
  };

  const filteredMasterEngineers = useMemo(() => {
    if (!engineerSearch.trim()) return masterEngineers;
    return masterEngineers.filter(e => e.name.toLowerCase().includes(engineerSearch.toLowerCase()));
  }, [masterEngineers, engineerSearch]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<WeeklyAssignment> & { id: string }) => {
      return apiRequest("PATCH", `/api/weekly-assignments/${encodeURIComponent(id)}`, data, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments"] });
      toast({ title: "Assignment updated successfully" });
      setEditDialogOpen(false); setEditingAssignment(null);
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Failed to update assignment", variant: "destructive" });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: Partial<WeeklyAssignment>) => {
      return apiRequest("POST", "/api/weekly-assignments", data, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments"] });
      toast({ title: "Assignment added successfully" });
      setAddDialogOpen(false); resetFormData();
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Failed to add assignment", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/weekly-assignments/${encodeURIComponent(id)}`, undefined, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments"] });
      toast({ title: "Assignment deleted successfully" });
      setDeleteDialogOpen(false); setDeletingAssignment(null);
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Failed to delete assignment", variant: "destructive" });
    },
  });

  const resetFormData = () => {
    setFormData({ engineerName:"", projectName:"", resourceLockedFrom:"", resourceLockedTill:"",
      internalTarget:"", customerTarget:"", currentStatus:"not_started", constraint:"" });
    setEngineerPickerOpen(false); setEngineerSearch("");
  };

  const handleEdit = (assignmentId: string) => {
    const assignment = assignments.find(a => a.id === assignmentId);
    if (assignment) {
      setEditingAssignment(assignment);
      setFormData({
        engineerName:       assignment.engineerName || "",
        projectName:        assignment.projectName || "",
        resourceLockedFrom: assignment.resourceLockedFrom || "",
        resourceLockedTill: assignment.resourceLockedTill || "",
        internalTarget:     assignment.internalTarget || "",
        customerTarget:     assignment.customerTarget || "",
        currentStatus:      assignment.currentStatus || "not_started",
        constraint:         assignment.constraint || "",
      });
      setEditDialogOpen(true);
    }
  };

  const handleSaveEdit = () => {
    if (!editingAssignment) return;
    updateMutation.mutate({
      id:                 editingAssignment.id,
      weekStart:          editingAssignment.weekStart,
      projectName:        formData.projectName,
      projectTargetDate:  editingAssignment.projectTargetDate,
      tasks:              editingAssignment.tasks,
      notes:              editingAssignment.notes,
      engineerName:       formData.engineerName,
      resourceLockedFrom: formData.resourceLockedFrom || undefined,
      resourceLockedTill: formData.resourceLockedTill || undefined,
      internalTarget:     formData.internalTarget || undefined,
      customerTarget:     formData.customerTarget || undefined,
      currentStatus:      formData.currentStatus as any,
      constraint:         formData.constraint || undefined,
    });
  };

  const handleAdd = () => {
    if (!formData.projectName || !formData.engineerName) {
      toast({ title: "Project and Engineer are required", variant: "destructive" }); return;
    }
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
    addMutation.mutate({
      engineerName:       formData.engineerName,
      projectName:        formData.projectName,
      weekStart,
      resourceLockedFrom: formData.resourceLockedFrom || undefined,
      resourceLockedTill: formData.resourceLockedTill || undefined,
      internalTarget:     formData.internalTarget || undefined,
      customerTarget:     formData.customerTarget || undefined,
      currentStatus:      formData.currentStatus as any,
      constraint:         formData.constraint || undefined,
      tasks:              [],
    });
  };

  const userFilteredAssignments = useMemo(() =>
    assignments.filter(a => a.currentStatus !== "completed"), [assignments]);

  const projectRows   = useMemo(() => groupByProject(userFilteredAssignments), [userFilteredAssignments]);
  const filteredProjects = useMemo(() => {
    return projectRows.filter((project) => {
      if (project.engineers.every(e => e.currentStatus === "completed")) return false;
      const matchesSearch =
        project.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.engineers.some(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === "all" ||
        project.engineers.some(e => e.currentStatus === statusFilter);
      return matchesSearch && matchesStatus;
    });
  }, [projectRows, searchQuery, statusFilter]);

  const uniqueEngineers = useMemo(() => {
    const engineers = new Set<string>();
    assignments.forEach(a => engineers.add(a.engineerName));
    return Array.from(engineers).sort();
  }, [assignments]);

  const activeProjects = useMemo(() =>
    projectRows.filter(p => p.engineers.some(e => e.currentStatus === "in_progress")).length,
    [projectRows]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
  };

  // Reusable status select content
  const StatusSelectItems = () => (
    <>
      {STATUS_GROUPS.map(group => (
        <div key={group.label}>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">
            {group.label}
          </div>
          {group.items.map(item => (
            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
          ))}
        </div>
      ))}
    </>
  );

  const EngineerPicker = () => (
    <div className="relative" ref={engineerPickerRef}>
      <button type="button"
        className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted transition-colors"
        onClick={() => { setEngineerPickerOpen(o => !o); setEngineerSearch(""); }}>
        <span className="truncate text-left">
          {selectedEngineers.length === 0 ? "Select engineers..." : selectedEngineers.join(", ")}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 ml-2 text-muted-foreground" />
      </button>
      {selectedEngineers.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selectedEngineers.map(name => (
            <span key={name} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
              {name}
              <button type="button" onClick={() => toggleEngineer(name)}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      {engineerPickerOpen && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-56 flex flex-col">
          <div className="p-2 border-b">
            <Input placeholder="Search engineers..." value={engineerSearch}
              onChange={e => setEngineerSearch(e.target.value)} className="h-7 text-xs" autoFocus />
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredMasterEngineers.map(eng => {
              const checked = selectedEngineers.includes(eng.name);
              return (
                <div key={eng.id}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted text-sm ${checked?"bg-primary/5":""}`}
                  onClick={() => toggleEngineer(eng.name)}>
                  <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${checked?"bg-primary border-primary":"border-input"}`}>
                    {checked && <span className="text-primary-foreground text-[10px] font-bold">✓</span>}
                  </div>
                  <span className="flex-1">{eng.name}</span>
                  <span className="text-xs text-muted-foreground">{eng.initials}</span>
                </div>
              );
            })}
            {filteredMasterEngineers.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No engineers found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto px-4 py-6 w-full max-w-[95vw]">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/"><Button variant="ghost" size="icon"><ChevronLeft className="h-5 w-5" /></Button></Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">All Engineers - Week-wise Project Overview</h1>
            <p className="text-muted-foreground text-sm">View all projects with resource allocation details</p>
          </div>
          {isAdmin && (
            <Button onClick={() => { resetFormData(); setAddDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Add Assignment
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[
            { label:"Total Projects",     value:projectRows.length,       color:"blue",   icon:<Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-400"/> },
            { label:"Engineers Assigned", value:uniqueEngineers.length,   color:"green",  icon:<Users className="h-5 w-5 text-green-600 dark:text-green-400"/> },
            { label:"Active Projects",    value:activeProjects,           color:"orange", icon:<Briefcase className="h-5 w-5 text-orange-600 dark:text-orange-400"/> },
          ].map(s => (
            <Card key={s.label}><CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-${s.color}-100 dark:bg-${s.color}-900`}>{s.icon}</div>
                <div><p className="text-sm text-muted-foreground">{s.label}</p><p className="text-2xl font-bold">{s.value}</p></div>
              </div>
            </CardContent></Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5"/>Projects Overview</CardTitle>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search projects or engineers..." value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)} className="pl-9 w-full sm:w-64" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80 overflow-y-auto">
                    <SelectItem value="all">All Status</SelectItem>
                    <StatusSelectItems />
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">Loading projects...</div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">No projects found</div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Project Name</TableHead>
                      <TableHead className="min-w-[120px]">Engineer</TableHead>
                      <TableHead className="min-w-[130px]">Resource Locked From</TableHead>
                      <TableHead className="min-w-[130px]">Resource Locked Till</TableHead>
                      <TableHead className="min-w-[140px] text-center">Resource Lock Days</TableHead>
                      <TableHead className="min-w-[110px]">Internal Target</TableHead>
                      <TableHead className="min-w-[110px]">Customer Target</TableHead>
                      <TableHead className="min-w-[160px]">Current Status</TableHead>
                      <TableHead className="min-w-[150px]">Constraints</TableHead>
                      <TableHead className="w-[60px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProjects.map(project =>
                      project.engineers.map((engineer, idx) => (
                        <TableRow key={`${project.projectName}-${engineer.assignmentId}`}>
                          <TableCell className="font-medium">{idx === 0 ? project.projectName : ""}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">{engineer.name}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(engineer.resourceLockedFrom)}</TableCell>
                          <TableCell className="text-sm">{formatDate(engineer.resourceLockedTill)}</TableCell>
                          <TableCell className="text-center">
                            {engineer.resourceLockDays > 0 ? (
                              <div className="flex flex-col items-center gap-1">
                                <Badge variant="outline" className={engineer.daysExceeded > 0 ? "border-red-500 text-red-600 dark:text-red-400" : ""}>
                                  {engineer.resourceLockDays} days
                                </Badge>
                                {engineer.daysExceeded > 0 && (
                                  <Badge className="bg-red-500 text-white text-xs flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />+{engineer.daysExceeded} overdue
                                  </Badge>
                                )}
                              </div>
                            ) : <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(engineer.internalTarget)}</TableCell>
                          <TableCell className="text-sm">{formatDate(engineer.customerTarget)}</TableCell>
                          <TableCell>
                            <Badge className={`${statusColors[engineer.currentStatus] ?? statusColors.not_started} text-xs`}>
                              {statusLabels[engineer.currentStatus] ?? engineer.currentStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{engineer.constraint || "-"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {isAdmin && (
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(engineer.assignmentId)}>
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              )}
                              {isAdmin && (
                                <Button variant="ghost" size="icon"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                  onClick={() => { setDeletingAssignment({ id:engineer.assignmentId, projectName:project.projectName, engineerName:engineer.name }); setDeleteDialogOpen(true); }}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Assignment</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Project Name</Label>
              <Input list="project-names-list" value={formData.projectName}
                onChange={e => setFormData(p => ({...p, projectName:e.target.value}))}
                placeholder="Type or select project name" />
              <datalist id="project-names-list">{projectNames.map(n => <option key={n} value={n}/>)}</datalist>
            </div>
            <div className="grid gap-2"><Label>Engineer(s)</Label><EngineerPicker/></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Resource Locked From</Label>
                <Input type="date" value={formData.resourceLockedFrom} onChange={e => setFormData(p => ({...p, resourceLockedFrom:e.target.value}))}/></div>
              <div className="grid gap-2"><Label>Resource Locked Till</Label>
                <Input type="date" value={formData.resourceLockedTill} onChange={e => setFormData(p => ({...p, resourceLockedTill:e.target.value}))}/></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Internal Target</Label>
                <Input type="date" value={formData.internalTarget} onChange={e => setFormData(p => ({...p, internalTarget:e.target.value}))}/></div>
              <div className="grid gap-2"><Label>Customer Target</Label>
                <Input type="date" value={formData.customerTarget} onChange={e => setFormData(p => ({...p, customerTarget:e.target.value}))}/></div>
            </div>
            <div className="grid gap-2">
              <Label>Current Status</Label>
              <Select value={formData.currentStatus} onValueChange={v => setFormData(p => ({...p, currentStatus:v}))}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent className="max-h-80 overflow-y-auto"><StatusSelectItems/></SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Constraints</Label>
              <Textarea value={formData.constraint} onChange={e => setFormData(p => ({...p, constraint:e.target.value}))} placeholder="Enter any constraints..."/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add New Assignment</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Project Name</Label>
              <Input list="project-names-list-add" value={formData.projectName}
                onChange={e => setFormData(p => ({...p, projectName:e.target.value}))}
                placeholder="Type or select project name"/>
              <datalist id="project-names-list-add">{projectNames.map(n => <option key={n} value={n}/>)}</datalist>
            </div>
            <div className="grid gap-2"><Label>Engineer(s)</Label><EngineerPicker/></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Resource Locked From</Label>
                <Input type="date" value={formData.resourceLockedFrom} onChange={e => setFormData(p => ({...p, resourceLockedFrom:e.target.value}))}/></div>
              <div className="grid gap-2"><Label>Resource Locked Till</Label>
                <Input type="date" value={formData.resourceLockedTill} onChange={e => setFormData(p => ({...p, resourceLockedTill:e.target.value}))}/></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Internal Target</Label>
                <Input type="date" value={formData.internalTarget} onChange={e => setFormData(p => ({...p, internalTarget:e.target.value}))}/></div>
              <div className="grid gap-2"><Label>Customer Target</Label>
                <Input type="date" value={formData.customerTarget} onChange={e => setFormData(p => ({...p, customerTarget:e.target.value}))}/></div>
            </div>
            <div className="grid gap-2">
              <Label>Current Status</Label>
              <Select value={formData.currentStatus} onValueChange={v => setFormData(p => ({...p, currentStatus:v}))}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent className="max-h-80 overflow-y-auto"><StatusSelectItems/></SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Constraints</Label>
              <Textarea value={formData.constraint} onChange={e => setFormData(p => ({...p, constraint:e.target.value}))} placeholder="Enter any constraints..."/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Adding..." : "Add Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={open => { setDeleteDialogOpen(open); if (!open) setDeletingAssignment(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5"/> Delete Assignment
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">Are you sure you want to delete this assignment? This action cannot be undone.</p>
            {deletingAssignment && (
              <div className="mt-3 p-3 rounded-md bg-muted text-sm space-y-1">
                <p><span className="font-medium">Project:</span> {deletingAssignment.projectName}</p>
                <p><span className="font-medium">Engineer:</span> {deletingAssignment.engineerName}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeletingAssignment(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingAssignment && deleteMutation.mutate(deletingAssignment.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
