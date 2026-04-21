import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Calendar, RefreshCw, Save, Plus, Edit2, CheckCircle, Clock, AlertTriangle, XCircle, Pause, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";

interface ProjectActivity {
  projectName: string;
  currentStatus: string;
  activities: Record<string, string>;
}

const STATUS_OPTIONS = [
  { value: "Design Stage", label: "Design Stage", icon: Clock, color: "bg-purple-500/20 text-purple-700 dark:text-purple-300" },
  { value: "Procurement Stage", label: "Procurement Stage", icon: Clock, color: "bg-orange-500/20 text-orange-700 dark:text-orange-300" },
  { value: "Mechanical Assembly Stage", label: "Mechanical Assembly", icon: Clock, color: "bg-blue-500/20 text-blue-700 dark:text-blue-300" },
  { value: "Electrical Assembly Stage", label: "Electrical Assembly", icon: Clock, color: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300" },
  { value: "PLC Power Up Stage", label: "PLC Power Up", icon: Clock, color: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300" },
  { value: "IO Check Stage", label: "IO Check", icon: Clock, color: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300" },
  { value: "Trials Stage", label: "Trials Stage", icon: Clock, color: "bg-pink-500/20 text-pink-700 dark:text-pink-300" },
  { value: "Completed", label: "Completed", icon: CheckCircle, color: "bg-green-500/20 text-green-700 dark:text-green-300" },
  { value: "Dispatch Stage", label: "Dispatch Stage", icon: CheckCircle, color: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" },
];

function generateDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

function getStatusColor(status: string): string {
  const option = STATUS_OPTIONS.find(o => o.value === status);
  return option?.color || "bg-gray-500/20 text-gray-600 dark:text-gray-400";
}

function getStatusIcon(status: string) {
  const option = STATUS_OPTIONS.find(o => o.value === status);
  return option?.icon || Clock;
}

export default function ProjectStatus() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [pendingActivities, setPendingActivities] = useState<Record<string, Record<string, string>>>({});
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [editingCell, setEditingCell] = useState<{ project: string; date: string } | null>(null);
  const [activityInput, setActivityInput] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  const scrollToToday = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayElement = document.querySelector(`[data-date="${today}"]`);
    if (todayElement) {
      todayElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  const dateRange = useMemo(() => {
    // Start from the 1st of the current month
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    // End on the last day of next month
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    return generateDateRange(start, end);
  }, []);

  const { data: rawProjects = [], isLoading, isError, error, refetch } = useQuery<ProjectActivity[]>({
    queryKey: ["/api/project-activities"],
    retry: 2,
    staleTime: 30000,
  });

  // Get assignments from data.json to determine which projects belong to the logged-in engineer
  const { data: dataJsonAssignments = [] } = useQuery<Array<{ engineerName: string; projectName: string; status: string }>>({
    queryKey: ["/api/projects"],
    enabled: !isAdmin, // Only fetch for non-admins
    staleTime: 0,
    refetchOnMount: true,
  });

  // Also get weekly-assignments for additional coverage
  const { data: weeklyAssignments = [] } = useQuery<Array<{ engineerName: string; projectName: string }>>({
    queryKey: ["/api/weekly-assignments"],
    enabled: !isAdmin,
    staleTime: 0,
  });

  // Merge both sources
  const assignments = [...dataJsonAssignments, ...weeklyAssignments];

  // Get project names assigned to the current user
  // Supports comma-separated engineer names (e.g., "Veeresh,Ramkumar,Deekshitha")
  const userProjectNames = useMemo(() => {
    if (isAdmin) return null; // null means show all
    if (!user?.name) return [];
    
    const userName = user.name.replace(/\s*\([^)]*\)\s*/g, '').trim().toLowerCase();
    const userFirstName = userName.split(' ')[0];

    .filter(a => {
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
    })
      .map(a => a.projectName.toLowerCase());
  }, [assignments, user?.name, isAdmin]);

  // Filter out completed projects and optionally filter by user's projects
  const projects = useMemo(() => {
    return rawProjects.filter(project => {
      const status = project.currentStatus?.toLowerCase() || "";
      const isNotCompleted = !status.includes("complete") && !status.includes("done");
      
      // If admin or userProjectNames is null, show all non-completed projects
      if (userProjectNames === null) return isNotCompleted;
      
      // For engineers, only show their assigned projects
      const projectNameLower = project.projectName.toLowerCase();
      const isUserProject = userProjectNames.some(up => 
        up === projectNameLower || up.includes(projectNameLower) || projectNameLower.includes(up)
      );
      
      return isNotCompleted && isUserProject;
    });
  }, [rawProjects, userProjectNames]);

  const saveMutation = useMutation({
    mutationFn: async (data: { projectName: string; date: string; activity: string }) => {
      return apiRequest("POST", "/api/project-activities", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-activities"] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (data: { projectName: string; status: string }) => {
      return apiRequest("POST", "/api/project-activities/status", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-activities"] });
    },
  });

  const handleActivityChange = (projectName: string, date: string, activity: string) => {
    setPendingActivities(prev => ({
      ...prev,
      [projectName]: {
        ...(prev[projectName] || {}),
        [date]: activity,
      },
    }));
  };

  const handleStatusChange = (projectName: string, status: string) => {
    setPendingStatuses(prev => ({
      ...prev,
      [projectName]: status,
    }));
  };

  const getActivityForDate = (project: ProjectActivity, date: string): string => {
    return pendingActivities[project.projectName]?.[date] ?? project.activities?.[date] ?? "";
  };

  const getCurrentStatus = (project: ProjectActivity): string => {
    return pendingStatuses[project.projectName] ?? project.currentStatus ?? "In Progress";
  };

  const openActivityEditor = (project: string, date: string, currentValue: string) => {
    setEditingCell({ project, date });
    setActivityInput(currentValue);
  };

  const saveActivityEdit = () => {
    if (editingCell) {
      handleActivityChange(editingCell.project, editingCell.date, activityInput);
      setEditingCell(null);
      setActivityInput("");
    }
  };

  const saveAllChanges = async () => {
    if (!user) {
      toast({ title: "Please log in to save changes", variant: "destructive" });
      return;
    }
    
    setIsSaving(true);
    let successCount = 0;
    let failCount = 0;
    
    try {
      // Save all pending activities
      for (const [projectName, dateActivities] of Object.entries(pendingActivities)) {
        for (const [date, activity] of Object.entries(dateActivities)) {
          try {
            await saveMutation.mutateAsync({ projectName, date, activity });
            successCount++;
          } catch {
            failCount++;
          }
        }
      }

      // Save all pending status changes
      for (const [projectName, status] of Object.entries(pendingStatuses)) {
        try {
          await updateStatusMutation.mutateAsync({ projectName, status });
          successCount++;
        } catch {
          failCount++;
        }
      }
      
      if (failCount === 0) {
        setPendingActivities({});
        setPendingStatuses({});
        toast({ title: `All ${successCount} changes saved successfully` });
      } else {
        toast({ 
          title: `Saved ${successCount} changes, ${failCount} failed`,
          variant: "destructive" 
        });
      }
      
      refetch();
    } catch {
      toast({ title: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const hasPendingChanges = Object.keys(pendingActivities).length > 0 || Object.keys(pendingStatuses).length > 0;

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return { day, month };
  };

  const SimpleHeader = () => (
    <header className="sticky top-0 z-50 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
                C
              </div>
              <span className="hidden font-semibold text-lg sm:inline-block">
                Controls Team
              </span>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SimpleHeader />
        <div className="container mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background">
        <SimpleHeader />
        <div className="container mx-auto p-6">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Failed to load project data</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {error instanceof Error ? error.message : "An error occurred while loading project activities."}
              </p>
              <Button onClick={() => refetch()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader />
      <div className="container mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Calendar className="h-6 w-6 text-primary" />
                Project Activity Tracking
              </h1>
              <p className="text-sm text-muted-foreground">
                Track daily activities from December 1, 2025 onwards
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            {hasPendingChanges && (
              <Button
                size="sm"
                onClick={saveAllChanges}
                disabled={isSaving}
                data-testid="button-save-all"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Saving..." : "Save All Changes"}
              </Button>
            )}
          </div>
        </div>

        {!isAdmin && (
          <Card className="bg-blue-500/10 border-blue-500/20">
            <CardContent className="p-4">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                You can edit activities for your assigned projects. Only admins can change project status.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-lg">
                {projects.length} Active Projects
                {rawProjects.length > projects.length && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({rawProjects.length - projects.length} completed hidden)
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={scrollLeft}
                  data-testid="button-scroll-left"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={scrollToToday}
                  data-testid="button-scroll-today"
                >
                  <CalendarDays className="h-4 w-4 mr-1" />
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={scrollRight}
                  data-testid="button-scroll-right"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No active projects found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Projects will appear here once they are loaded from the data source.
                </p>
                <Button onClick={() => refetch()} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Data
                </Button>
              </div>
            ) : (
              <div 
                ref={scrollContainerRef}
                className="w-full overflow-x-auto"
              >
                <div className="min-w-max">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="sticky left-0 z-20 bg-background p-2 text-left font-medium min-w-[300px]">
                          Project Name
                        </th>
                        {dateRange.map((date) => {
                          const { day, month } = formatDateHeader(date);
                          const isWeekend = [0, 6].includes(new Date(date).getDay());
                          const isToday = date === new Date().toISOString().split('T')[0];
                          return (
                            <th
                              key={date}
                              data-date={date}
                              className={`p-1 text-center min-w-[100px] ${isWeekend ? 'bg-muted/50' : ''} ${isToday ? 'bg-primary/20 ring-2 ring-primary' : ''}`}
                              title={date}
                            >
                              <div className="text-xs text-muted-foreground">{month}</div>
                              <div className="font-medium">{day}</div>
                            </th>
                          );
                        })}
                        <th className="sticky right-0 z-20 bg-background p-2 text-center font-medium min-w-[150px] border-l">
                          Current Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((project, index) => {
                        const currentStatus = getCurrentStatus(project);
                        const StatusIcon = getStatusIcon(currentStatus);
                        const hasPendingStatus = !!pendingStatuses[project.projectName];
                        
                        return (
                          <tr
                            key={`${project.projectName}-${index}`}
                            className="border-b hover:bg-muted/30"
                            data-testid={`row-project-${index}`}
                          >
                            <td className="sticky left-0 z-10 bg-background p-2 font-medium">
                              <div className="max-w-[300px]" title={project.projectName}>
                                <span className="line-clamp-2">{project.projectName}</span>
                              </div>
                            </td>
                            {dateRange.map((date) => {
                              const activity = getActivityForDate(project, date);
                              const isWeekend = [0, 6].includes(new Date(date).getDay());
                              const hasPending = pendingActivities[project.projectName]?.[date] !== undefined;
                              
                              return (
                                <td
                                  key={date}
                                  className={`p-1 text-center ${isWeekend ? 'bg-muted/50' : ''} ${hasPending ? 'ring-2 ring-primary/50' : ''}`}
                                >
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`h-8 w-full text-xs px-1 ${activity ? 'bg-primary/10' : 'border-dashed border'}`}
                                        onClick={() => openActivityEditor(project.projectName, date, activity)}
                                        data-testid={`button-activity-${index}-${date}`}
                                      >
                                        {activity ? (
                                          <span className="truncate max-w-[80px]" title={activity}>{activity}</span>
                                        ) : (
                                          <Plus className="h-3 w-3" />
                                        )}
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle>
                                          Activity for {date}
                                        </DialogTitle>
                                      </DialogHeader>
                                      <div className="space-y-4">
                                        <div>
                                          <p className="text-sm text-muted-foreground mb-2">
                                            Project: {project.projectName}
                                          </p>
                                          <Textarea
                                            placeholder="Enter activity description..."
                                            value={activityInput}
                                            onChange={(e) => setActivityInput(e.target.value)}
                                            className="min-h-[100px]"
                                            data-testid="input-activity"
                                          />
                                        </div>
                                        <div className="flex justify-end gap-2">
                                          <Button
                                            onClick={saveActivityEdit}
                                            data-testid="button-save-activity"
                                          >
                                            <Save className="h-4 w-4 mr-2" />
                                            Save
                                          </Button>
                                        </div>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                </td>
                              );
                            })}
                            <td className={`sticky right-0 z-10 bg-background p-2 border-l ${hasPendingStatus ? 'ring-2 ring-primary/50' : ''}`}>
                              {isAdmin ? (
                                <Select
                                  value={currentStatus}
                                  onValueChange={(value) => handleStatusChange(project.projectName, value)}
                                >
                                  <SelectTrigger 
                                    className={`h-9 text-xs ${getStatusColor(currentStatus)}`}
                                    data-testid={`select-status-${index}`}
                                  >
                                    <StatusIcon className="h-3 w-3 mr-1" />
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {STATUS_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        <div className="flex items-center gap-2">
                                          <option.icon className="h-3 w-3" />
                                          {option.label}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge className={getStatusColor(currentStatus)}>
                                  <StatusIcon className="h-3 w-3 mr-1" />
                                  {currentStatus}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
