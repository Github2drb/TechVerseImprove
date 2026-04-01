import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar, Plus, Trash2, ChevronDown, ChevronRight, Edit2, Save, TableIcon, AlertTriangle, Users, CalendarClock, Briefcase, UserCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import type { TeamMember } from "@shared/schema";
import { format, startOfWeek, addWeeks, parseISO } from "date-fns";

interface WeeklyAssignmentTask {
  id: string;
  taskName: string;
  targetDate?: string;
  completionDate?: string;
  status: "not_started" | "in_progress" | "completed" | "blocked";
}

interface WeeklyAssignment {
  id: string;
  engineerName: string;
  weekStart: string;
  projectName: string;
  projectTargetDate?: string;
  resourceLockedFrom?: string;
  resourceLockedTill?: string;
  internalTarget?: string;
  customerTarget?: string;
  tasks: WeeklyAssignmentTask[];
  currentStatus: "not_started" | "in_progress" | "completed" | "on_hold" | "blocked";
  notes?: string;
  constraint?: string;
}

interface WeeklyAssignmentsTableProps {
  teamMembers: TeamMember[];
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

function getWeekOptions() {
  const weeks: { value: string; label: string }[] = [];
  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  
  for (let i = -4; i <= 8; i++) {
    const weekDate = addWeeks(currentWeekStart, i);
    weeks.push({
      value: format(weekDate, "yyyy-MM-dd"),
      label: format(weekDate, "MMM dd, yyyy"),
    });
  }
  return weeks;
}

interface ScheduleAnalysis {
  overloadedEngineers: { name: string; projectCount: number; projects: string[] }[];
  dateConflicts: { date: string; engineers: { name: string; projects: string[] }[] }[];
  hasIssues: boolean;
}

interface MergedProject {
  projectName: string;
  engineers: string[];
  targetDate?: string;
  tasks: WeeklyAssignmentTask[];
  constraints: string[];
  assignmentIds: string[];
}

function mergeProjectsByName(assignments: WeeklyAssignment[]): MergedProject[] {
  const projectMap: Record<string, MergedProject> = {};
  
  assignments.forEach((assignment) => {
    const key = assignment.projectName.toLowerCase().trim();
    
    if (!projectMap[key]) {
      projectMap[key] = {
        projectName: assignment.projectName,
        engineers: [],
        targetDate: assignment.projectTargetDate,
        tasks: [],
        constraints: [],
        assignmentIds: [],
      };
    }
    
    if (!projectMap[key].engineers.includes(assignment.engineerName)) {
      projectMap[key].engineers.push(assignment.engineerName);
    }
    
    projectMap[key].tasks.push(...assignment.tasks);
    projectMap[key].assignmentIds.push(assignment.id);
    
    if (assignment.constraint && !projectMap[key].constraints.includes(assignment.constraint)) {
      projectMap[key].constraints.push(assignment.constraint);
    }
    
    if (!projectMap[key].targetDate && assignment.projectTargetDate) {
      projectMap[key].targetDate = assignment.projectTargetDate;
    }
  });
  
  return Object.values(projectMap);
}

function analyzeSchedule(assignments: WeeklyAssignment[]): ScheduleAnalysis {
  const engineerProjects: Record<string, { projects: string[]; dates: Record<string, string[]> }> = {};
  
  assignments.forEach((assignment) => {
    if (!engineerProjects[assignment.engineerName]) {
      engineerProjects[assignment.engineerName] = { projects: [], dates: {} };
    }
    engineerProjects[assignment.engineerName].projects.push(assignment.projectName);
    
    if (assignment.projectTargetDate) {
      if (!engineerProjects[assignment.engineerName].dates[assignment.projectTargetDate]) {
        engineerProjects[assignment.engineerName].dates[assignment.projectTargetDate] = [];
      }
      engineerProjects[assignment.engineerName].dates[assignment.projectTargetDate].push(assignment.projectName);
    }
  });
  
  const overloadedEngineers = Object.entries(engineerProjects)
    .filter(([_, data]) => data.projects.length > 2)
    .map(([name, data]) => ({
      name,
      projectCount: data.projects.length,
      projects: data.projects,
    }));
  
  const dateConflictsMap: Record<string, { name: string; projects: string[] }[]> = {};
  
  Object.entries(engineerProjects).forEach(([name, data]) => {
    Object.entries(data.dates).forEach(([date, projects]) => {
      if (projects.length > 1) {
        if (!dateConflictsMap[date]) {
          dateConflictsMap[date] = [];
        }
        dateConflictsMap[date].push({ name, projects });
      }
    });
  });
  
  const dateConflicts = Object.entries(dateConflictsMap).map(([date, engineers]) => ({
    date,
    engineers,
  }));
  
  return {
    overloadedEngineers,
    dateConflicts,
    hasIssues: overloadedEngineers.length > 0 || dateConflicts.length > 0,
  };
}

export function WeeklyAssignmentsTable({ teamMembers }: WeeklyAssignmentsTableProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const today = new Date();
    return format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<WeeklyAssignment | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [editingConstraint, setEditingConstraint] = useState<{ id: string; value: string } | null>(null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  
  const [newAssignment, setNewAssignment] = useState({
    engineerName: "",
    projectName: "",
    projectTargetDate: "",
    currentStatus: "not_started" as const,
    notes: "",
    constraint: "",
  });
  
  const [newTask, setNewTask] = useState({
    taskName: "",
    targetDate: "",
    completionDate: "",
    status: "not_started" as const,
  });
  
  const weekOptions = getWeekOptions();

  const { data: assignments = [], isLoading } = useQuery<WeeklyAssignment[]>({
    queryKey: ["/api/weekly-assignments", selectedWeek],
    queryFn: async () => {
      const response = await fetch(`/api/weekly-assignments?weekStart=${selectedWeek}`);
      if (!response.ok) throw new Error("Failed to fetch assignments");
      return response.json();
    },
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async (data: Partial<WeeklyAssignment>) => {
      return apiRequest("POST", "/api/weekly-assignments", {
        ...data,
        weekStart: selectedWeek,
        tasks: [],
      }, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments", selectedWeek] });
      setIsAddDialogOpen(false);
      setNewAssignment({ engineerName: "", projectName: "", projectTargetDate: "", currentStatus: "not_started", notes: "", constraint: "" });
      toast({ title: "Assignment created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create assignment", variant: "destructive" });
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<WeeklyAssignment> & { id: string }) => {
      return apiRequest("PATCH", `/api/weekly-assignments/${id}`, data, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments", selectedWeek] });
      setEditingAssignment(null);
      toast({ title: "Assignment updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update assignment", variant: "destructive" });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/weekly-assignments/${id}`, undefined, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments", selectedWeek] });
      toast({ title: "Assignment deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete assignment", variant: "destructive" });
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: async ({ assignmentId, ...taskData }: { assignmentId: string } & Omit<WeeklyAssignmentTask, "id">) => {
      return apiRequest("POST", `/api/weekly-assignments/${assignmentId}/tasks`, taskData, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments", selectedWeek] });
      setIsTaskDialogOpen(false);
      setSelectedAssignmentId(null);
      setNewTask({ taskName: "", targetDate: "", completionDate: "", status: "not_started" });
      toast({ title: "Task added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add task", variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ assignmentId, taskId, ...data }: { assignmentId: string; taskId: string } & Partial<WeeklyAssignmentTask>) => {
      return apiRequest("PATCH", `/api/weekly-assignments/${assignmentId}/tasks/${taskId}`, data, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments", selectedWeek] });
      toast({ title: "Task updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update task", variant: "destructive" });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async ({ assignmentId, taskId }: { assignmentId: string; taskId: string }) => {
      return apiRequest("DELETE", `/api/weekly-assignments/${assignmentId}/tasks/${taskId}`, undefined, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments", selectedWeek] });
      toast({ title: "Task deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete task", variant: "destructive" });
    },
  });

  const saveAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/weekly-assignments/save-all", { weekStart: selectedWeek }, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-assignments", selectedWeek] });
      toast({ title: "All assignments saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save assignments", variant: "destructive" });
    },
  });

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleCreateAssignment = () => {
    if (!newAssignment.engineerName || !newAssignment.projectName) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    createAssignmentMutation.mutate(newAssignment);
  };

  const handleAddTask = () => {
    if (!newTask.taskName || !selectedAssignmentId) {
      toast({ title: "Task name is required", variant: "destructive" });
      return;
    }
    addTaskMutation.mutate({ assignmentId: selectedAssignmentId, ...newTask });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      return format(parseISO(dateStr), "MMM dd");
    } catch {
      return dateStr;
    }
  };


  return (
    <Card data-testid="card-weekly-assignments">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calendar className="h-5 w-5" />
          Weekly Engineer Assignments
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-[180px]" data-testid="select-week">
              <SelectValue placeholder="Select week" />
            </SelectTrigger>
            <SelectContent>
              {weekOptions.map((week) => (
                <SelectItem key={week.value} value={week.value}>
                  Week of {week.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveAllMutation.mutate()}
                disabled={saveAllMutation.isPending || assignments.length === 0}
                data-testid="button-save-all"
              >
                <Save className="h-4 w-4 mr-1" />
                {saveAllMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-assignment">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Weekly Assignment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Engineer</Label>
                    <Select
                      value={newAssignment.engineerName}
                      onValueChange={(v) => setNewAssignment({ ...newAssignment, engineerName: v })}
                    >
                      <SelectTrigger data-testid="select-engineer">
                        <SelectValue placeholder="Select engineer" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.id} value={member.name}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Project Name</Label>
                    <Input
                      value={newAssignment.projectName}
                      onChange={(e) => setNewAssignment({ ...newAssignment, projectName: e.target.value })}
                      placeholder="Enter project name"
                      data-testid="input-project-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Project Target Date</Label>
                    <Input
                      type="date"
                      value={newAssignment.projectTargetDate}
                      onChange={(e) => setNewAssignment({ ...newAssignment, projectTargetDate: e.target.value })}
                      data-testid="input-project-target-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={newAssignment.currentStatus}
                      onValueChange={(v: any) => setNewAssignment({ ...newAssignment, currentStatus: v })}
                    >
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
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Input
                      value={newAssignment.notes}
                      onChange={(e) => setNewAssignment({ ...newAssignment, notes: e.target.value })}
                      placeholder="Optional notes"
                      data-testid="input-notes"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Constraint</Label>
                    <Input
                      value={newAssignment.constraint}
                      onChange={(e) => setNewAssignment({ ...newAssignment, constraint: e.target.value })}
                      placeholder="Any constraints or blockers"
                      data-testid="input-constraint"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateAssignment} disabled={createAssignmentMutation.isPending} data-testid="button-save-assignment">
                    {createAssignmentMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Schedule Analysis Section */}
        {!isLoading && assignments.length > 0 && (() => {
          const analysis = analyzeSchedule(assignments);
          if (!analysis.hasIssues) return null;
          
          return (
            <div className="mb-6 space-y-3" data-testid="schedule-analysis">
              {analysis.overloadedEngineers.length > 0 && (
                <Alert variant="destructive" className="border-orange-500 bg-orange-50 dark:bg-orange-950/30">
                  <Users className="h-4 w-4" />
                  <AlertTitle className="text-orange-700 dark:text-orange-400">Overloaded Engineers</AlertTitle>
                  <AlertDescription className="text-orange-600 dark:text-orange-300">
                    <ul className="mt-2 space-y-1">
                      {analysis.overloadedEngineers.map((eng) => (
                        <li key={eng.name} data-testid={`overloaded-${eng.name}`}>
                          <span className="font-medium">{eng.name}</span> has {eng.projectCount} projects: {eng.projects.join(", ")}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              
              {analysis.dateConflicts.length > 0 && (
                <Alert variant="destructive" className="border-red-500 bg-red-50 dark:bg-red-950/30">
                  <CalendarClock className="h-4 w-4" />
                  <AlertTitle className="text-red-700 dark:text-red-400">Date Conflicts</AlertTitle>
                  <AlertDescription className="text-red-600 dark:text-red-300">
                    <ul className="mt-2 space-y-1">
                      {analysis.dateConflicts.map((conflict) => (
                        <li key={conflict.date} data-testid={`conflict-${conflict.date}`}>
                          <span className="font-medium">{formatDate(conflict.date)}</span>:{" "}
                          {conflict.engineers.map((eng) => (
                            <span key={eng.name}>
                              {eng.name} ({eng.projects.join(" & ")})
                            </span>
                          )).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, ", ", curr], [] as React.ReactNode[])}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          );
        })()}

        {/* Project Coordination Summary */}
        {!isLoading && assignments.length > 0 && (() => {
          const mergedProjects = mergeProjectsByName(assignments);
          const uniqueEngineers = new Set(assignments.map(a => a.engineerName));
          const runningProjects = mergedProjects.filter(p => 
            assignments.some(a => a.projectName.toLowerCase() === p.projectName.toLowerCase() && a.currentStatus !== "completed")
          );
          const understaffedProjects = mergedProjects.filter(p => p.engineers.length < 2);
          const analysis = analyzeSchedule(assignments);
          
          return (
            <div className="mb-6" data-testid="coordination-summary">
              <Collapsible defaultOpen={true}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Project Coordination Summary
                  </h3>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" data-testid="button-toggle-coordination">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3" data-testid="stat-running-projects">
                      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                        <Briefcase className="h-4 w-4" />
                        <span className="text-xs font-medium">Running Projects</span>
                      </div>
                      <p className="text-2xl font-bold text-blue-800 dark:text-blue-300 mt-1">{runningProjects.length}</p>
                    </div>
                    
                    <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3" data-testid="stat-engineers-involved">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                        <UserCheck className="h-4 w-4" />
                        <span className="text-xs font-medium">Engineers Involved</span>
                      </div>
                      <p className="text-2xl font-bold text-green-800 dark:text-green-300 mt-1">{uniqueEngineers.size}</p>
                    </div>
                    
                    <div className={`${understaffedProjects.length > 0 ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'} border rounded-lg p-3`} data-testid="stat-understaffed">
                      <div className={`flex items-center gap-2 ${understaffedProjects.length > 0 ? 'text-yellow-700 dark:text-yellow-400' : 'text-gray-600 dark:text-gray-400'}`}>
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-xs font-medium">Understaffed</span>
                      </div>
                      <p className={`text-2xl font-bold mt-1 ${understaffedProjects.length > 0 ? 'text-yellow-800 dark:text-yellow-300' : 'text-gray-700 dark:text-gray-300'}`}>
                        {understaffedProjects.length}
                      </p>
                    </div>
                    
                    <div className={`${analysis.overloadedEngineers.length > 0 ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'} border rounded-lg p-3`} data-testid="stat-overloaded">
                      <div className={`flex items-center gap-2 ${analysis.overloadedEngineers.length > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'}`}>
                        <Users className="h-4 w-4" />
                        <span className="text-xs font-medium">Overloaded</span>
                      </div>
                      <p className={`text-2xl font-bold mt-1 ${analysis.overloadedEngineers.length > 0 ? 'text-orange-800 dark:text-orange-300' : 'text-gray-700 dark:text-gray-300'}`}>
                        {analysis.overloadedEngineers.length}
                      </p>
                    </div>
                  </div>

                  {/* Project-Engineer Matrix */}
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>Engineers Assigned</TableHead>
                          <TableHead>Target Date</TableHead>
                          <TableHead>Resources</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mergedProjects.map((project) => (
                          <TableRow key={project.projectName} data-testid={`coord-row-${project.projectName}`}>
                            <TableCell className="font-medium">{project.projectName}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {project.engineers.map((eng) => (
                                  <Badge 
                                    key={eng} 
                                    variant="secondary" 
                                    className={analysis.overloadedEngineers.some(o => o.name === eng) ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' : ''}
                                  >
                                    {eng}
                                    {analysis.overloadedEngineers.some(o => o.name === eng) && (
                                      <AlertTriangle className="h-3 w-3 ml-1" />
                                    )}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>{formatDate(project.targetDate)}</TableCell>
                            <TableCell>
                              {project.engineers.length >= 2 ? (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Sufficient
                                </Badge>
                              ) : (
                                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Needs +{2 - project.engineers.length}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          );
        })()}
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading assignments...
          </div>
        ) : assignments.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            No assignments for this week
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Engineer</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Target Date</TableHead>
                  <TableHead>Tasks</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="w-24">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => (
                  <Collapsible key={assignment.id} asChild open={expandedRows.has(assignment.id)}>
                    <>
                      <TableRow data-testid={`row-assignment-${assignment.id}`}>
                        <TableCell>
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleRow(assignment.id)}
                              data-testid={`button-expand-${assignment.id}`}
                            >
                              {expandedRows.has(assignment.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </TableCell>
                        <TableCell className="font-medium">{assignment.engineerName}</TableCell>
                        <TableCell>{assignment.projectName}</TableCell>
                        <TableCell>{formatDate(assignment.projectTargetDate)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{assignment.tasks.length} tasks</Badge>
                        </TableCell>
                        <TableCell>
                          {isAdmin ? (
                            <Select
                              value={assignment.currentStatus}
                              onValueChange={(v: any) =>
                                updateAssignmentMutation.mutate({ id: assignment.id, currentStatus: v })
                              }
                            >
                              <SelectTrigger className="w-[130px]" data-testid={`select-status-${assignment.id}`}>
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
                          ) : (
                            <Badge className={statusColors[assignment.currentStatus]}>
                              {statusLabels[assignment.currentStatus]}
                            </Badge>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingAssignment(assignment)}
                                data-testid={`button-edit-assignment-${assignment.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedAssignmentId(assignment.id);
                                  setIsTaskDialogOpen(true);
                                }}
                                data-testid={`button-add-task-${assignment.id}`}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteAssignmentMutation.mutate(assignment.id)}
                                data-testid={`button-delete-${assignment.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                      <CollapsibleContent asChild>
                        <TableRow className="bg-muted/50">
                          <TableCell colSpan={isAdmin ? 7 : 6} className="p-0">
                            {assignment.tasks.length > 0 ? (
                              <div className="p-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Task</TableHead>
                                      <TableHead>Target Date</TableHead>
                                      <TableHead>Completion Date</TableHead>
                                      <TableHead>Status</TableHead>
                                      {isAdmin && <TableHead className="w-16">Actions</TableHead>}
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {assignment.tasks.map((task) => (
                                      <TableRow key={task.id} data-testid={`row-task-${task.id}`}>
                                        <TableCell>{task.taskName}</TableCell>
                                        <TableCell>{formatDate(task.targetDate)}</TableCell>
                                        <TableCell>
                                          {isAdmin ? (
                                            <Input
                                              type="date"
                                              value={task.completionDate || ""}
                                              onChange={(e) =>
                                                updateTaskMutation.mutate({
                                                  assignmentId: assignment.id,
                                                  taskId: task.id,
                                                  completionDate: e.target.value,
                                                })
                                              }
                                              className="w-[140px]"
                                              data-testid={`input-completion-${task.id}`}
                                            />
                                          ) : (
                                            formatDate(task.completionDate)
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {isAdmin ? (
                                            <Select
                                              value={task.status}
                                              onValueChange={(v: any) =>
                                                updateTaskMutation.mutate({
                                                  assignmentId: assignment.id,
                                                  taskId: task.id,
                                                  status: v,
                                                })
                                              }
                                            >
                                              <SelectTrigger className="w-[120px]" data-testid={`select-task-status-${task.id}`}>
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="not_started">Not Started</SelectItem>
                                                <SelectItem value="in_progress">In Progress</SelectItem>
                                                <SelectItem value="completed">Completed</SelectItem>
                                                <SelectItem value="blocked">Blocked</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          ) : (
                                            <Badge className={statusColors[task.status]}>
                                              {statusLabels[task.status]}
                                            </Badge>
                                          )}
                                        </TableCell>
                                        {isAdmin && (
                                          <TableCell>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() =>
                                                deleteTaskMutation.mutate({
                                                  assignmentId: assignment.id,
                                                  taskId: task.id,
                                                })
                                              }
                                              data-testid={`button-delete-task-${task.id}`}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            ) : (
                              <div className="p-4 text-center text-sm text-muted-foreground">
                                No tasks added yet
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Task Name</Label>
                <Input
                  value={newTask.taskName}
                  onChange={(e) => setNewTask({ ...newTask, taskName: e.target.value })}
                  placeholder="Enter task name"
                  data-testid="input-task-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Target Date</Label>
                <Input
                  type="date"
                  value={newTask.targetDate}
                  onChange={(e) => setNewTask({ ...newTask, targetDate: e.target.value })}
                  data-testid="input-task-target-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={newTask.status}
                  onValueChange={(v: any) => setNewTask({ ...newTask, status: v })}
                >
                  <SelectTrigger data-testid="select-task-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTaskDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddTask} disabled={addTaskMutation.isPending} data-testid="button-save-task">
                {addTaskMutation.isPending ? "Saving..." : "Add Task"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Summary Table View - Grouped by Project (Collapsible) */}
        {assignments.length > 0 && (() => {
          const mergedProjects = mergeProjectsByName(assignments);
          return (
          <div className="mt-6 pt-6 border-t">
            <Button
              variant="ghost"
              className="w-full flex items-center justify-between p-2 hover:bg-muted/50"
              onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
              data-testid="button-toggle-summary"
            >
              <span className="flex items-center gap-2 font-semibold">
                <TableIcon className="h-4 w-4" />
                Summary View
                <Badge variant="outline" className="ml-2">{mergedProjects.length} projects</Badge>
              </span>
              {isSummaryExpanded ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </Button>
            {isSummaryExpanded && (
            <div className="rounded-md border mt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px]">Project / Task</TableHead>
                    <TableHead>Engineers</TableHead>
                    <TableHead>Target Date</TableHead>
                    <TableHead>Constraint</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mergedProjects.map((project) => (
                    <Fragment key={`project-${project.projectName}`}>
                      {/* Project Header Row */}
                      <TableRow className="bg-muted/50" data-testid={`row-project-${project.projectName}`}>
                        <TableCell className="font-semibold">
                          {project.projectName}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {project.engineers.map((eng) => (
                              <Badge key={eng} variant="secondary" className="text-xs">
                                {eng}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(project.targetDate)}</TableCell>
                        <TableCell className="text-sm">
                          {project.constraints.length > 0 
                            ? project.constraints.join("; ") 
                            : <span className="text-muted-foreground italic">No constraint</span>
                          }
                        </TableCell>
                      </TableRow>
                      {/* Task Rows */}
                      {project.tasks.map((task) => (
                        <TableRow key={`task-${task.id}`} data-testid={`row-task-summary-${task.id}`}>
                          <TableCell className="pl-8 text-sm">{task.taskName}</TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-sm">{formatDate(task.targetDate)}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      ))}
                      {project.tasks.length === 0 && (
                        <TableRow>
                          <TableCell className="pl-8 text-sm text-muted-foreground italic" colSpan={4}>
                            No tasks added yet
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}
          </div>
          );
        })()}

        {/* Edit Assignment Dialog */}
        <Dialog open={!!editingAssignment} onOpenChange={(open) => !open && setEditingAssignment(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Engineer</Label>
                <Select
                  value={editingAssignment?.engineerName || ""}
                  onValueChange={(value) => setEditingAssignment(prev => prev ? { ...prev, engineerName: value } : null)}
                >
                  <SelectTrigger data-testid="select-edit-engineer">
                    <SelectValue placeholder="Select engineer" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.name}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input
                  value={editingAssignment?.projectName || ""}
                  onChange={(e) => setEditingAssignment(prev => prev ? { ...prev, projectName: e.target.value } : null)}
                  placeholder="Enter project name"
                  data-testid="input-edit-project-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Target Date</Label>
                <Input
                  type="date"
                  value={editingAssignment?.projectTargetDate || ""}
                  onChange={(e) => setEditingAssignment(prev => prev ? { ...prev, projectTargetDate: e.target.value } : null)}
                  data-testid="input-edit-target-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={editingAssignment?.notes || ""}
                  onChange={(e) => setEditingAssignment(prev => prev ? { ...prev, notes: e.target.value } : null)}
                  placeholder="Optional notes"
                  data-testid="input-edit-notes"
                />
              </div>
              <div className="space-y-2">
                <Label>Constraint</Label>
                <Input
                  value={editingAssignment?.constraint || ""}
                  onChange={(e) => setEditingAssignment(prev => prev ? { ...prev, constraint: e.target.value } : null)}
                  placeholder="Any constraints or blockers"
                  data-testid="input-edit-assignment-constraint"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingAssignment(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (editingAssignment) {
                    updateAssignmentMutation.mutate({
                      id: editingAssignment.id,
                      engineerName: editingAssignment.engineerName,
                      projectName: editingAssignment.projectName,
                      projectTargetDate: editingAssignment.projectTargetDate,
                      notes: editingAssignment.notes,
                      constraint: editingAssignment.constraint,
                    });
                    setEditingAssignment(null);
                  }
                }}
                disabled={updateAssignmentMutation.isPending}
                data-testid="button-save-assignment-edit"
              >
                {updateAssignmentMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Constraint Dialog */}
        <Dialog open={!!editingConstraint} onOpenChange={(open) => !open && setEditingConstraint(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Constraint</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Constraint / Blocker</Label>
                <Input
                  value={editingConstraint?.value || ""}
                  onChange={(e) => setEditingConstraint(prev => prev ? { ...prev, value: e.target.value } : null)}
                  placeholder="Enter any constraints or blockers"
                  data-testid="input-edit-constraint"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingConstraint(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (editingConstraint) {
                    updateAssignmentMutation.mutate({
                      id: editingConstraint.id,
                      constraint: editingConstraint.value,
                    });
                    setEditingConstraint(null);
                  }
                }}
                disabled={updateAssignmentMutation.isPending}
                data-testid="button-save-constraint"
              >
                {updateAssignmentMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
