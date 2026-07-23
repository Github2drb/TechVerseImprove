import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ArrowLeft, Calendar, RefreshCw, Save, Plus,
  CheckCircle, Clock, AlertTriangle, Map,
  ChevronLeft, ChevronRight, CalendarDays, FileText,
} from "lucide-react";
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

// ── Status options — full project lifecycle (matches Roadmap 18-phase order) ──
// Testing ends at F.A.T. Installation is its own group — S.A.T happens on site
// AFTER installation, so it belongs to Installation, not Testing.
// Done group = Dispatch → Documentation → Handover → Completed.
// Final status = Completed → project is considered fully completed.
const STATUS_OPTIONS = [
  // Design & Procurement
  { value:"Design Stage",             label:"Design Stage",             icon:Clock,        color:"bg-purple-500/20 text-purple-700 dark:text-purple-300"  },
  { value:"Electrical Design",        label:"Electrical Design",        icon:Clock,        color:"bg-indigo-500/20 text-indigo-700 dark:text-indigo-300"  },
  { value:"Procurement Stage",        label:"Procurement Stage",        icon:Clock,        color:"bg-orange-500/20 text-orange-700 dark:text-orange-300"  },
  { value:"Waiting for Materials",    label:"Waiting for Materials",    icon:Clock,        color:"bg-amber-500/20 text-amber-700 dark:text-amber-300"     },
  // Assembly
  { value:"Mechanical Assembly Stage",label:"Mechanical Assembly",      icon:Clock,        color:"bg-blue-500/20 text-blue-700 dark:text-blue-300"        },
  { value:"Electrical Assembly Stage",label:"Electrical Assembly",      icon:Clock,        color:"bg-cyan-500/20 text-cyan-700 dark:text-cyan-300"        },
  // Testing & Commissioning
  { value:"PLC Power Up Stage",       label:"PLC Power Up",             icon:Clock,        color:"bg-yellow-500/20 text-yellow-700 dark:text-yellow-300"  },
  { value:"IO Check Stage",           label:"IO Check",                 icon:Clock,        color:"bg-lime-500/20 text-lime-700 dark:text-lime-300"        },
  { value:"Trials Stage",             label:"Trials Stage",             icon:Clock,        color:"bg-pink-500/20 text-pink-700 dark:text-pink-300"        },
  { value:"F.A.T",                    label:"F.A.T",                    icon:Clock,        color:"bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300"},
  // Installation
  { value:"Installation Pending",     label:"Installation Pending",     icon:Clock,        color:"bg-rose-500/20 text-rose-700 dark:text-rose-300"        },
  { value:"Installation in Progress", label:"Installation in Progress", icon:Clock,        color:"bg-pink-500/20 text-pink-700 dark:text-pink-300"        },
  { value:"Installation Completed",   label:"Installation Completed",   icon:CheckCircle,  color:"bg-teal-500/20 text-teal-700 dark:text-teal-300"        },
  { value:"S.A.T",                    label:"S.A.T",                    icon:Clock,        color:"bg-violet-500/20 text-violet-700 dark:text-violet-300"  },
  // Done
  { value:"Dispatch Stage",           label:"Dispatch Stage",           icon:CheckCircle,  color:"bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"},
  { value:"Documentation",            label:"Documentation",            icon:FileText,     color:"bg-sky-500/20 text-sky-700 dark:text-sky-300"           },
  { value:"Equipment Handover",       label:"Equipment Handover",       icon:CheckCircle,  color:"bg-green-500/20 text-green-700 dark:text-green-300"     },
  { value:"Completed",                label:"Completed",                icon:CheckCircle,  color:"bg-green-500/20 text-green-700 dark:text-green-300"     },
];

// Group labels for visual separation in dropdown
const STATUS_GROUPS = [
  { label:"Design & Procurement",    from:"Design Stage",              to:"Waiting for Materials"      },
  { label:"Assembly",                from:"Mechanical Assembly Stage",  to:"Electrical Assembly Stage"  },
  { label:"Testing & Commissioning", from:"PLC Power Up Stage",         to:"F.A.T"                      },
  { label:"Installation",            from:"Installation Pending",       to:"S.A.T"                      },
  { label:"Done",                    from:"Dispatch Stage",             to:"Completed"                  },
];

function generateDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getStatusColor(status: string): string {
  return STATUS_OPTIONS.find(o => o.value === status)?.color ?? "bg-gray-500/20 text-gray-600 dark:text-gray-400";
}

function getStatusIcon(status: string) {
  return STATUS_OPTIONS.find(o => o.value === status)?.icon ?? Clock;
}

// Build grouped select content
function StatusSelectContent() {
  const groups = STATUS_GROUPS.map(g => {
    const startIdx = STATUS_OPTIONS.findIndex(o => o.value === g.from);
    const endIdx   = STATUS_OPTIONS.findIndex(o => o.value === g.to);
    return { label: g.label, items: STATUS_OPTIONS.slice(startIdx, endIdx + 1) };
  });

  return (
    <>
      {groups.map(group => (
        <div key={group.label}>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
            {group.label}
          </div>
          {group.items.map(option => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <option.icon className="h-3 w-3" />
                {option.label}
              </div>
            </SelectItem>
          ))}
        </div>
      ))}
    </>
  );
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

export default function ProjectStatus() {
  const { toast }  = useToast();
  const { user } = useAuth();
  const isAdmin = true; // Project Status is editable by everyone — no admin gate
  const [pendingActivities, setPendingActivities] = useState<Record<string, Record<string, string>>>({});
  const [pendingStatuses,   setPendingStatuses]   = useState<Record<string, string>>({});
  // savedStatuses: persists confirmed saves — overrides server data even after refetch
  // Initialise from localStorage so status survives page refresh
  const [savedStatuses, setSavedStatuses] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("drb_project_statuses") ?? "{}"); } catch { return {}; }
  });
  const [isSaving,          setIsSaving]          = useState(false);
  const [editingCell,       setEditingCell]        = useState<{ project:string; date:string } | null>(null);
  const [activityInput,     setActivityInput]      = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft  = () => scrollContainerRef.current?.scrollBy({ left:-300, behavior:"smooth" });
  const scrollRight = () => scrollContainerRef.current?.scrollBy({ left:300,  behavior:"smooth" });
  const scrollToToday = () => {
    const today = new Date().toISOString().split("T")[0];
    document.querySelector(`[data-date="${today}"]`)?.scrollIntoView({ behavior:"smooth", block:"nearest", inline:"center" });
  };

  const dateRange = useMemo(() => {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    return generateDateRange(start, end);
  }, []);

  // ── Data: only from weekly-assignments via /api/project-activities ────────
  const { data: rawProjects = [], isLoading, isError, error, refetch } = useQuery<ProjectActivity[]>({
    queryKey: ["/api/project-activities"],
    retry: 2,
    staleTime: 30000,
  });

  // Filter: hide only projects that reached Completed (project fully done).
  // "Equipment Handover", "Documentation" and "Installation Completed" are
  // mid-sequence phases — work still happens after them, so keep them visible.
  const projects = useMemo(() =>
    rawProjects.filter(p => {
      const s = (p.currentStatus ?? "").trim().toLowerCase();
      return s !== "completed";
    }),
    [rawProjects]
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  // No onSuccess invalidation here — saveAllChanges controls the refetch timing
  const saveMutation = useMutation({
    mutationFn: async (data: { projectName:string; date:string; activity:string }) =>
      apiRequest("POST", "/api/project-activities", data),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (data: { projectName:string; status:string }) =>
      apiRequest("POST", "/api/project-activities/status", data),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleActivityChange = (projectName:string, date:string, activity:string) => {
    setPendingActivities(prev => ({ ...prev, [projectName]: { ...(prev[projectName]||{}), [date]:activity } }));
  };

  const handleStatusChange = (projectName:string, status:string) => {
    setPendingStatuses(prev => ({ ...prev, [projectName]:status }));
  };

  const getActivityForDate = (project:ProjectActivity, date:string) =>
    pendingActivities[project.projectName]?.[date] ?? project.activities?.[date] ?? "";

  // Priority: pending (unsaved) > savedStatuses (confirmed save) > server data
  const getCurrentStatus = (project:ProjectActivity) =>
    pendingStatuses[project.projectName]
    ?? savedStatuses[project.projectName]
    ?? project.currentStatus
    ?? "Design Stage";

  const openActivityEditor = (project:string, date:string, currentValue:string) => {
    setEditingCell({ project, date }); setActivityInput(currentValue);
  };

  const saveActivityEdit = () => {
    if (editingCell) { handleActivityChange(editingCell.project, editingCell.date, activityInput); setEditingCell(null); setActivityInput(""); }
  };

  const saveAllChanges = async () => {
    if (!user) { toast({ title:"Please log in to save changes", variant:"destructive" }); return; }
    setIsSaving(true);
    let successCount = 0, failCount = 0;

    // Snapshot what we are about to save (before any async operations)
    const statusesToSave    = { ...pendingStatuses };
    const activitiesToSave  = { ...pendingActivities };

    try {
      // Save activity log entries
      for (const [projectName, dateActivities] of Object.entries(activitiesToSave)) {
        for (const [date, activity] of Object.entries(dateActivities)) {
          try { await saveMutation.mutateAsync({ projectName, date, activity }); successCount++; }
          catch { failCount++; }
        }
      }
      // Save status changes
      for (const [projectName, status] of Object.entries(statusesToSave)) {
        try { await updateStatusMutation.mutateAsync({ projectName, status }); successCount++; }
        catch { failCount++; }
      }

      if (failCount === 0) {
        // ── OPTIMISTIC UPDATE ────────────────────────────────────────────────
        // Directly patch the React Query cache with the saved values.
        // This avoids relying on refetch() timing against GitHub's cache TTL.
        queryClient.setQueryData<ProjectActivity[]>(
          ["/api/project-activities"],
          (old) => {
            if (!old) return old;
            return old.map(project => {
              // Apply saved status
              const newStatus = statusesToSave[project.projectName];
              // Apply saved activity entries
              const newActivities = activitiesToSave[project.projectName]
                ? { ...project.activities, ...activitiesToSave[project.projectName] }
                : project.activities;
              return newStatus || activitiesToSave[project.projectName]
                ? { ...project, currentStatus: newStatus ?? project.currentStatus, activities: newActivities }
                : project;
            });
          }
        );

        // Lock in saved statuses — these override server data even after any refetch
        setSavedStatuses(prev => ({ ...prev, ...statusesToSave }));

        // Persist to localStorage so Roadmap page picks up changes too
        try {
          const existing = JSON.parse(localStorage.getItem("drb_project_statuses") ?? "{}");
          localStorage.setItem("drb_project_statuses", JSON.stringify({ ...existing, ...statusesToSave }));
        } catch {}

        // Clear pending state
        setPendingActivities({});
        setPendingStatuses({});
        toast({ title:`All ${successCount} changes saved successfully` });

        // Delayed refetch — GitHub cache (5 min TTL) will have fresh data by then
        setTimeout(() => refetch(), 6000);
      } else {
        toast({ title:`Saved ${successCount}, ${failCount} failed`, variant:"destructive" });
      }
    } catch { toast({ title:"An unexpected error occurred", variant:"destructive" }); }
    finally { setIsSaving(false); }
  };

  const hasPendingChanges = Object.keys(pendingActivities).length > 0 || Object.keys(pendingStatuses).length > 0;

  const formatDateHeader = (dateStr:string) => {
    const d = new Date(dateStr);
    return { day:d.getDate(), month:d.toLocaleDateString("en-US",{month:"short"}) };
  };

  if (isLoading) return (
    <div className="min-h-screen bg-background"><SimpleHeader/>
      <div className="container mx-auto p-6 animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-1/3"/><div className="h-64 bg-muted rounded"/>
      </div>
    </div>
  );

  if (isError) return (
    <div className="min-h-screen bg-background"><SimpleHeader/>
      <div className="container mx-auto p-6">
        <Card className="max-w-md mx-auto"><CardContent className="p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4"/>
          <h3 className="text-lg font-medium mb-2">Failed to load project data</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {error instanceof Error ? error.message : "An error occurred."}
          </p>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2"/>Try Again
          </Button>
        </CardContent></Card>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader/>
      <div className="container mx-auto p-4 space-y-4">

        {/* Page header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link href="/"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2"/>Back</Button></Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Calendar className="h-6 w-6 text-primary"/>Project Activity Tracking
              </h1>
              <p className="text-sm text-muted-foreground">
                {projects.length} active projects · {STATUS_OPTIONS.length} status options available
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/project-roadmap">
              <Button variant="outline" size="sm"><Map className="h-4 w-4 mr-2"/>Roadmap</Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2"/>Refresh
            </Button>
            {hasPendingChanges && (
              <Button size="sm" onClick={saveAllChanges} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2"/>
                {isSaving ? "Saving..." : "Save All Changes"}
              </Button>
            )}
          </div>
        </div>

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
                <Button variant="outline" size="sm" onClick={scrollLeft}><ChevronLeft className="h-4 w-4"/></Button>
                <Button variant="outline" size="sm" onClick={scrollToToday}>
                  <CalendarDays className="h-4 w-4 mr-1"/>Today
                </Button>
                <Button variant="outline" size="sm" onClick={scrollRight}><ChevronRight className="h-4 w-4"/></Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4"/>
                <h3 className="text-lg font-medium mb-2">No active projects found</h3>
                <p className="text-sm text-muted-foreground mb-4">Projects appear here once added to weekly assignments.</p>
                <Button onClick={() => refetch()} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2"/>Refresh Data
                </Button>
              </div>
            ) : (
              <div ref={scrollContainerRef} className="w-full overflow-x-auto">
                <div className="min-w-max">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="sticky left-0 z-20 bg-background p-2 text-left font-medium min-w-[300px]">Project Name</th>
                        {dateRange.map((date) => {
                          const { day, month } = formatDateHeader(date);
                          const isWeekend = [0,6].includes(new Date(date).getDay());
                          const isToday   = date === new Date().toISOString().split("T")[0];
                          return (
                            <th key={date} data-date={date}
                              className={`p-1 text-center min-w-[100px] ${isWeekend?"bg-muted/50":""} ${isToday?"bg-primary/20 ring-2 ring-primary":""}`}
                              title={date}>
                              <div className="text-xs text-muted-foreground">{month}</div>
                              <div className="font-medium">{day}</div>
                            </th>
                          );
                        })}
                        <th className="sticky right-0 z-20 bg-background p-2 text-center font-medium min-w-[190px] border-l">
                          Current Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((project, index) => {
                        const currentStatus   = getCurrentStatus(project);
                        const StatusIcon      = getStatusIcon(currentStatus);
                        const hasPendingStatus= !!pendingStatuses[project.projectName];
                        return (
                          <tr key={`${project.projectName}-${index}`} className="border-b hover:bg-muted/30">
                            <td className="sticky left-0 z-10 bg-background p-2 font-medium">
                              <div className="max-w-[300px]" title={project.projectName}>
                                <span className="line-clamp-2">{project.projectName}</span>
                              </div>
                            </td>
                            {dateRange.map((date) => {
                              const activity  = getActivityForDate(project, date);
                              const isWeekend = [0,6].includes(new Date(date).getDay());
                              const hasPending= pendingActivities[project.projectName]?.[date] !== undefined;
                              return (
                                <td key={date}
                                  className={`p-1 text-center ${isWeekend?"bg-muted/50":""} ${hasPending?"ring-2 ring-primary/50":""}`}>
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button variant="ghost" size="sm"
                                        className={`h-8 w-full text-xs px-1 ${activity?"bg-primary/10":"border-dashed border"}`}
                                        onClick={() => openActivityEditor(project.projectName, date, activity)}>
                                        {activity
                                          ? <span className="truncate max-w-[80px]" title={activity}>{activity}</span>
                                          : <Plus className="h-3 w-3"/>}
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle>Activity for {date}</DialogTitle>
                                      </DialogHeader>
                                      <div className="space-y-4">
                                        <p className="text-sm text-muted-foreground">Project: {project.projectName}</p>
                                        <Textarea placeholder="Enter activity description..."
                                          value={activityInput} onChange={e => setActivityInput(e.target.value)}
                                          className="min-h-[100px]"/>
                                        <div className="flex justify-end gap-2">
                                          <Button onClick={saveActivityEdit}>
                                            <Save className="h-4 w-4 mr-2"/>Save
                                          </Button>
                                        </div>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                </td>
                              );
                            })}
                            <td className={`sticky right-0 z-10 bg-background p-2 border-l ${hasPendingStatus?"ring-2 ring-primary/50":""}`}>
                              {isAdmin ? (
                                <Select value={currentStatus}
                                  onValueChange={value => handleStatusChange(project.projectName, value)}>
                                  <SelectTrigger className={`h-9 text-xs ${getStatusColor(currentStatus)}`}>
                                    <StatusIcon className="h-3 w-3 mr-1"/>
                                    <SelectValue/>
                                  </SelectTrigger>
                                  <SelectContent className="max-h-80 overflow-y-auto">
                                    <StatusSelectContent/>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge className={getStatusColor(currentStatus)}>
                                  <StatusIcon className="h-3 w-3 mr-1"/>
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
