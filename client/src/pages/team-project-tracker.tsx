import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Briefcase, Users, ChevronLeft, Search, Filter, Edit2, Plus, AlertTriangle, User, Trash2, ChevronDown, X } from "lucide-react";
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

const statusColors: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  on_hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  blocked: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const statusLabels: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
  blocked: "Blocked",
};

function calculateLockDays(from?: string, till?: string): number {
  if (!from || !till) return 0;
  const fromDate = new Date(from);
  const tillDate = new Date(till);
  const diffTime = tillDate.getTime() - fromDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

function calculateDaysExceeded(till?: string): number {
  if (!till) return 0;
  const tillDate = new Date(till);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  tillDate.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - tillDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

function groupByProject(assignments: WeeklyAssignment[]): ProjectRow[] {
  const projectMap: Record<string, ProjectRow> = {};

  assignments.forEach((assignment) => {
    const key = assignment.projectName.toLowerCase().trim();

    if (!projectMap[key]) {
      projectMap[key] = {
        projectName: assignment.projectName,
        engineers: [],
      };
    }

    const existingEngineer = projectMap[key].engineers.find(
      e => e.name === assignment.engineerName && e.assignmentId === assignment.id
    );

    if (!existingEngineer) {
      projectMap[key].engineers.push({
        assignmentId: assignment.id,
        name: assignment.engineerName,
        resourceLockedFrom: assignment.resourceLockedFrom,
        resourceLockedTill: assignment.resourceLockedTill,
        resourceLockDays: calculateLockDays(assignment.resourceLockedFrom, assignment.resourceLockedTill),
        daysExceeded: calculateDaysExceeded(assignment.resourceLockedTill),
        internalTarget: assignment.internalTarget,
        customerTarget: assignment.customerTarget,
        currentStatus: assignment.currentStatus,
        constraint: assignment.constraint,
      });
    }
  });

  return Object.values(projectMap).sort((a, b) => a.projectName.localeCompare(b.projectName));
}

export default function TeamProjectTracker() {
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<WeeklyAssignment | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<{ id: string; projectName: string; engineerName: string } | null>(null);

  const [formData, setFormData] = useState({
    engineerName: "",
    projectName: "",
    resourceLockedFrom: "",
    resourceLockedTill: "",
    internalTarget: "",
    customerTarget: "",
    currentStatus: "not_started",
    constraint: "",
  });

  const { data: weeklyAssignmentsRaw = [], isLoading } = useQuery<WeeklyAssignment[]>({
    queryKey: ["/api/weekly-assignments"],
    queryFn: async () => {
      const response = await fetch("/api/weekly-assignments");
      if (!response.ok) throw new Error("Failed to fetch assignments");
      return response.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  // Also fetch from data.json (legacy source) for non-admin engineers
  const { data: dataJsonProjects = [] } = useQuery<Array<{ engineerName: string; projectName: string; status: string; notes?: string }>>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const response = await fetch("/api/projects");
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  // Convert data.json entries to WeeklyAssignment shape and merge with weekly assignments
  const assignments = useMemo((): WeeklyAssignment[] => {
    // Map data.json entries to WeeklyAssignment shape
    const dataJsonMapped: WeeklyAssignment[] = dataJsonProjects
      .filter(p => p.status?.toLowerCase() !== "completed")
      .map((p, idx) => ({
        id: `datajson-${idx}-${p.projectName}`,
        engineerName: p.engineerName || "",
        weekStart: new Date().toISOString().split("T")[0],
        projectName: p.projectName,
        currentStatus: (p.status?.toLowerCase() === "in progress" ? "in_progress" : "not_started") as any,
        notes: p.notes || "",
        tasks: [],
      }));

    // Merge: use weekly-assignments as primary; add data.json entries that aren't already covered
    const weeklyProjectKeys = new Set(
      weeklyAssignmentsRaw.map(a => a.projectName.trim().toLowerCase())
    );
    const additionalFromDataJson = dataJsonMapped.filter(
      p => !weeklyProjectKeys.has(p.projectName.trim().toLowerCase())
    );

    return [...weeklyAssignmentsRaw, ...additionalFromDataJson];
  }, [weeklyAssignmentsRaw, dataJsonProjects]);

  const { data: projectNames = [] } = useQuery<string[]>({
    queryKey: ["/api/project-names"],
    queryFn: async () => {
      const response = await fetch("/api/project-names");
      if (!response.ok) throw new Error("Failed to fetch project names");
      return response.json();
    },
  });

  const { data: teamMembers = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/team-members"],
  });

  const { data: masterEngineers = [] } = useQuery<Array<{ id: string; name: string; initials: string }>>({
    queryKey: ["/api/engineers-master-list"],
    queryFn: async () => {
      const response = await fetch("/api/engineers-master-list");
      if (!response.ok) throw new Error("Failed to fetch engineers");
      return response.json();
    },
  });

  const [engineerPickerOpen, setEngineerPickerOpen] = useState(false);
  const [engineerSearch, setEngineerSearch] = useState("");
  const engineerPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (engineerPickerRef.current && !engineerPickerRef.current.contains(e.target as Node)) {
        setEngineerPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedEngineers = useMemo(() => {
    if (!formData.engineerName.trim()) return [];
    return formData.engineerName.split(",").map(n => n.trim()).filter(Boolean);
  }, [formData.engineerName]);

  const toggleEngineer = (name: string) => {
    const current = selectedEngineers;
    const exists = current.includes(name);
    const updated = exists ? current.filter(n => n !== name) : [...current, name];
    setFormData(prev => ({ ...prev, engineerName: updated.join(", ") }));
  };

  const filteredMasterEngineers = useMemo(() => {
    if (!engineerSearch.trim()) return masterEngineers;
    return masterEngineers.filter(e =>
      e.name.toLowerCase().includes(engineerSearch.toLowerCase())
    );
  }, [masterEngineers, engineerSearch]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<WeeklyAssignment> & { id: string }) => {
      return apiRequest("PATCH", `/api/weekly-assignments/${id}`, data, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments"] });
      toast({ title: "Assignment updated successfully" });
      setEditDialogOpen(false);
      setEditingAssignment(null);
    },
    onError: () => {
      toast({ title: "Failed to update assignment", variant: "destructive" });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: Partial<WeeklyAssignment>) => {
      return apiRequest("POST", "/api/weekly-assignments", data, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments"] });
      toast({ title: "Assignment added successfully" });
      setAddDialogOpen(false);
      resetFormData();
    },
    onError: () => {
      toast({ title: "Failed to add assignment", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/weekly-assignments/${id}`, undefined, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments"] });
      toast({ title: "Assignment deleted successfully" });
      setDeleteDialogOpen(false);
      setDeletingAssignment(null);
    },
    onError: () => {
      toast({ title: "Failed to delete assignment", variant: "destructive" });
    },
  });

  const resetFormData = () => {
    setFormData({
      engineerName: "",
      projectName: "",
      resourceLockedFrom: "",
      resourceLockedTill: "",
      internalTarget: "",
      customerTarget: "",
      currentStatus: "not_started",
      constraint: "",
    });
    setEngineerPickerOpen(false);
    setEngineerSearch("");
  };

  const handleEdit = (assignmentId: string) => {
    const assignment = assignments.find(a => a.id === assignmentId);
    if (assignment) {
      setEditingAssignment(assignment);
      setFormData({
        engineerName: assignment.engineerName || "",
        projectName: assignment.projectName || "",
        resourceLockedFrom: assignment.resourceLockedFrom || "",
        resourceLockedTill: assignment.resourceLockedTill || "",
        internalTarget: assignment.internalTarget || "",
        customerTarget: assignment.customerTarget || "",
        currentStatus: assignment.currentStatus || "not_started",
        constraint: assignment.constraint || "",
      });
      setEditDialogOpen(true);
    }
  };

  const handleSaveEdit = () => {
    if (!editingAssignment) return;
    updateMutation.mutate({
      id: editingAssignment.id,
      weekStart: editingAssignment.weekStart,
      projectName: formData.projectName,
      projectTargetDate: editingAssignment.projectTargetDate,
      tasks: editingAssignment.tasks,
      notes: editingAssignment.notes,
      engineerName: formData.engineerName,
      resourceLockedFrom: formData.resourceLockedFrom || undefined,
      resourceLockedTill: formData.resourceLockedTill || undefined,
      internalTarget: formData.internalTarget || undefined,
      customerTarget: formData.customerTarget || undefined,
      currentStatus: formData.currentStatus as any,
      constraint: formData.constraint || undefined,
    });
  };

  const handleAdd = () => {
    if (!formData.projectName || !formData.engineerName) {
      toast({ title: "Project and Engineer are required", variant: "destructive" });
      return;
    }
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
    addMutation.mutate({
      engineerName: formData.engineerName,
      projectName: formData.projectName,
      weekStart,
      resourceLockedFrom: formData.resourceLockedFrom || undefined,
      resourceLockedTill: formData.resourceLockedTill || undefined,
      internalTarget: formData.internalTarget || undefined,
      customerTarget: formData.customerTarget || undefined,
      currentStatus: formData.currentStatus as any,
      constraint: formData.constraint || undefined,
      tasks: [],
    });
  };

  // Filter assignments based on logged-in engineer (non-admins only see their projects)
  // Supports comma-separated engineer names (e.g., "Veeresh,Ramkumar,Deekshitha")
  const userFilteredAssignments = useMemo(() => {
    // Always exclude completed assignments from tracker view
    const activeAssignments = assignments.filter(a => a.currentStatus !== "completed");
    if (isAdmin) return activeAssignments;
    if (!user?.name) return [];
    
    // Match engineer name (case-insensitive, ignoring company suffix in parentheses)
    const userName = user.name.replace(/\s*\([^)]*\)\s*/g, '').trim().toLowerCase();
// Also try first name only for partial matching
const userFirstName = userName.split(' ')[0];

return activeAssignments.filter(a => {
  const engineerNames = a.engineerName.split(',').map(name =>
    name.replace(/\s*\([^)]*\)\s*/g, '').trim().toLowerCase()
  );
  return engineerNames.some(engName =>
    engName === userName ||
    engName.includes(userName) ||
    userName.includes(engName) ||
    engName.startsWith(userFirstName) ||
    userFirstName.length > 3 && engName.includes(userFirstName)
  );
});
      
      // Check if any of the comma-separated names matches the logged-in user
      return engineerNames.some(engName => 
        engName === userName || 
        engName.includes(userName) || 
        userName.includes(engName)
      );
    });
  }, [assignments, user?.name, isAdmin]);

  const projectRows = useMemo(() => groupByProject(userFilteredAssignments), [userFilteredAssignments]);

  const filteredProjects = useMemo(() => {
    return projectRows.filter((project) => {
      // Hide projects where ALL engineers have completed status
      const allCompleted = project.engineers.every(e => e.currentStatus === "completed");
      if (allCompleted) return false;

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

  const activeProjects = useMemo(() => {
    return projectRows.filter(p => 
      p.engineers.some(e => e.currentStatus === "in_progress")
    ).length;
  }, [projectRows]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto px-4 py-6 w-full max-w-[95vw]">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              {isAdmin ? "All Engineers - Week-wise Project Overview" : `My Projects - ${user?.name || 'Engineer'}`}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isAdmin 
                ? "View all projects with resource allocation details" 
                : "View projects assigned to you with resource allocation details"}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => { resetFormData(); setAddDialogOpen(true); }} data-testid="button-add-assignment">
              <Plus className="h-4 w-4 mr-2" />
              Add Assignment
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card data-testid="stat-total-projects">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                  <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Projects</p>
                  <p className="text-2xl font-bold">{projectRows.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="stat-total-engineers">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                  <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Engineers Assigned</p>
                  <p className="text-2xl font-bold">{uniqueEngineers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="stat-active-projects">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900">
                  <Briefcase className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Projects</p>
                  <p className="text-2xl font-bold">{activeProjects}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Projects Overview
              </CardTitle>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search projects or engineers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-full sm:w-64"
                    data-testid="input-search"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Loading projects...
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                No projects found
              </div>
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
                      <TableHead className="min-w-[100px]">Current Status</TableHead>
                      <TableHead className="min-w-[150px]">Constraints</TableHead>
                      <TableHead className="w-[60px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProjects.map((project) => (
                      project.engineers.map((engineer, idx) => (
                        <TableRow 
                          key={`${project.projectName}-${engineer.assignmentId}`} 
                          data-testid={`row-project-${project.projectName}-${idx}`}
                        >
                          <TableCell className="font-medium">
                            {idx === 0 ? project.projectName : ""}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {engineer.name}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(engineer.resourceLockedFrom)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(engineer.resourceLockedTill)}
                          </TableCell>
                          <TableCell className="text-center">
                            {engineer.resourceLockDays > 0 ? (
                              <div className="flex flex-col items-center gap-1">
                                <Badge 
                                  variant="outline" 
                                  className={engineer.daysExceeded > 0 ? "border-red-500 text-red-600 dark:text-red-400" : ""}
                                >
                                  {engineer.resourceLockDays} days
                                </Badge>
                                {engineer.daysExceeded > 0 && (
                                  <Badge className="bg-red-500 text-white text-xs flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    +{engineer.daysExceeded} overdue
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(engineer.internalTarget)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(engineer.customerTarget)}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[engineer.currentStatus]}>
                              {statusLabels[engineer.currentStatus]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {engineer.constraint || "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(engineer.assignmentId)}
                                  data-testid={`button-edit-${engineer.assignmentId}`}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              )}
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                  onClick={() => {
                                    setDeletingAssignment({
                                      id: engineer.assignmentId,
                                      projectName: project.projectName,
                                      engineerName: engineer.name,
                                    });
                                    setDeleteDialogOpen(true);
                                  }}
                                  data-testid={`button-delete-${engineer.assignmentId}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Assignment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="projectNameEdit">Project Name</Label>
              <Input
                id="projectNameEdit"
                list="project-names-list"
                value={formData.projectName}
                onChange={(e) => setFormData(prev => ({ ...prev, projectName: e.target.value }))}
                placeholder="Type or select project name"
                data-testid="input-project-name-edit"
              />
              <datalist id="project-names-list">
                {projectNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-2">
              <Label>Engineer(s)</Label>
              <div className="relative" ref={engineerPickerRef}>
                <button
                  type="button"
                  className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted transition-colors"
                  onClick={() => { setEngineerPickerOpen(o => !o); setEngineerSearch(""); }}
                  data-testid="input-engineer-edit"
                >
                  <span className="truncate text-left">
                    {selectedEngineers.length === 0
                      ? "Select engineers..."
                      : selectedEngineers.join(", ")}
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
                      <Input
                        placeholder="Search engineers..."
                        value={engineerSearch}
                        onChange={e => setEngineerSearch(e.target.value)}
                        className="h-7 text-xs"
                        autoFocus
                      />
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {filteredMasterEngineers.map(eng => {
                        const checked = selectedEngineers.includes(eng.name);
                        return (
                          <div
                            key={eng.id}
                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted text-sm ${checked ? "bg-primary/5" : ""}`}
                            onClick={() => toggleEngineer(eng.name)}
                          >
                            <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary" : "border-input"}`}>
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="lockedFrom">Resource Locked From</Label>
                <Input
                  id="lockedFrom"
                  type="date"
                  value={formData.resourceLockedFrom}
                  onChange={(e) => setFormData(prev => ({ ...prev, resourceLockedFrom: e.target.value }))}
                  data-testid="input-locked-from"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lockedTill">Resource Locked Till</Label>
                <Input
                  id="lockedTill"
                  type="date"
                  value={formData.resourceLockedTill}
                  onChange={(e) => setFormData(prev => ({ ...prev, resourceLockedTill: e.target.value }))}
                  data-testid="input-locked-till"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="internalTarget">Internal Target</Label>
                <Input
                  id="internalTarget"
                  type="date"
                  value={formData.internalTarget}
                  onChange={(e) => setFormData(prev => ({ ...prev, internalTarget: e.target.value }))}
                  data-testid="input-internal-target"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customerTarget">Customer Target</Label>
                <Input
                  id="customerTarget"
                  type="date"
                  value={formData.customerTarget}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerTarget: e.target.value }))}
                  data-testid="input-customer-target"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Current Status</Label>
              <Select value={formData.currentStatus} onValueChange={(v) => setFormData(prev => ({ ...prev, currentStatus: v }))}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="constraint">Constraints</Label>
              <Textarea
                id="constraint"
                value={formData.constraint}
                onChange={(e) => setFormData(prev => ({ ...prev, constraint: e.target.value }))}
                placeholder="Enter any constraints..."
                data-testid="input-constraint"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending} data-testid="button-save-edit">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Assignment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="projectNameAdd">Project Name</Label>
              <Input
                id="projectNameAdd"
                list="project-names-list-add"
                value={formData.projectName}
                onChange={(e) => setFormData(prev => ({ ...prev, projectName: e.target.value }))}
                placeholder="Type or select project name"
                data-testid="input-project-name-add"
              />
              <datalist id="project-names-list-add">
                {projectNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-2">
              <Label>Engineer(s)</Label>
              <div className="relative" ref={engineerPickerRef}>
                <button
                  type="button"
                  className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-background hover:bg-muted transition-colors"
                  onClick={() => { setEngineerPickerOpen(o => !o); setEngineerSearch(""); }}
                  data-testid="input-engineer-add"
                >
                  <span className="truncate text-left">
                    {selectedEngineers.length === 0
                      ? "Select engineers..."
                      : selectedEngineers.join(", ")}
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
                      <Input
                        placeholder="Search engineers..."
                        value={engineerSearch}
                        onChange={e => setEngineerSearch(e.target.value)}
                        className="h-7 text-xs"
                        autoFocus
                      />
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {filteredMasterEngineers.map(eng => {
                        const checked = selectedEngineers.includes(eng.name);
                        return (
                          <div
                            key={eng.id}
                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted text-sm ${checked ? "bg-primary/5" : ""}`}
                            onClick={() => toggleEngineer(eng.name)}
                          >
                            <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary" : "border-input"}`}>
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="lockedFrom">Resource Locked From</Label>
                <Input
                  id="lockedFrom"
                  type="date"
                  value={formData.resourceLockedFrom}
                  onChange={(e) => setFormData(prev => ({ ...prev, resourceLockedFrom: e.target.value }))}
                  data-testid="input-locked-from-add"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lockedTill">Resource Locked Till</Label>
                <Input
                  id="lockedTill"
                  type="date"
                  value={formData.resourceLockedTill}
                  onChange={(e) => setFormData(prev => ({ ...prev, resourceLockedTill: e.target.value }))}
                  data-testid="input-locked-till-add"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="internalTarget">Internal Target</Label>
                <Input
                  id="internalTarget"
                  type="date"
                  value={formData.internalTarget}
                  onChange={(e) => setFormData(prev => ({ ...prev, internalTarget: e.target.value }))}
                  data-testid="input-internal-target-add"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customerTarget">Customer Target</Label>
                <Input
                  id="customerTarget"
                  type="date"
                  value={formData.customerTarget}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerTarget: e.target.value }))}
                  data-testid="input-customer-target-add"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Current Status</Label>
              <Select value={formData.currentStatus} onValueChange={(v) => setFormData(prev => ({ ...prev, currentStatus: v }))}>
                <SelectTrigger data-testid="select-status-add">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="constraint">Constraints</Label>
              <Textarea
                id="constraint"
                value={formData.constraint}
                onChange={(e) => setFormData(prev => ({ ...prev, constraint: e.target.value }))}
                placeholder="Enter any constraints..."
                data-testid="input-constraint-add"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add">
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending} data-testid="button-save-add">
              {addMutation.isPending ? "Adding..." : "Add Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setDeletingAssignment(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Assignment
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this assignment? This action cannot be undone.
            </p>
            {deletingAssignment && (
              <div className="mt-3 p-3 rounded-md bg-muted text-sm space-y-1">
                <p><span className="font-medium">Project:</span> {deletingAssignment.projectName}</p>
                <p><span className="font-medium">Engineer:</span> {deletingAssignment.engineerName}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDeleteDialogOpen(false); setDeletingAssignment(null); }}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingAssignment && deleteMutation.mutate(deletingAssignment.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
