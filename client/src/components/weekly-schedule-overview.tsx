import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { 
  Calendar, 
  Clock, 
  User,
  AlertTriangle,
  CheckCircle2,
  Pause
} from "lucide-react";
import { format, startOfWeek, addDays, isWithinInterval, parseISO } from "date-fns";

interface EngineerSkill {
  id: string;
  name: string;
  initials: string;
}

interface WeeklyAssignment {
  id: string;
  engineerName: string;
  projectName: string;
  currentStatus: string;
  resourceLockedFrom?: string;
  resourceLockedTill?: string;
}

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  completed: { 
    color: "bg-emerald-500/80 dark:bg-emerald-600/80", 
    icon: CheckCircle2, 
    label: "Completed" 
  },
  in_progress: { 
    color: "bg-blue-500/80 dark:bg-blue-600/80", 
    icon: Clock, 
    label: "In Progress" 
  },
  on_hold: { 
    color: "bg-amber-500/80 dark:bg-amber-600/80", 
    icon: Pause, 
    label: "On Hold" 
  },
  blocked: { 
    color: "bg-red-500/80 dark:bg-red-600/80", 
    icon: AlertTriangle, 
    label: "Blocked" 
  },
  not_started: { 
    color: "bg-gray-400/80 dark:bg-gray-500/80", 
    icon: Clock, 
    label: "Not Started" 
  },
};

export function WeeklyScheduleOverview() {
  const { data: engineerConfig = [], isLoading: configLoading } = useQuery<EngineerSkill[]>({
    queryKey: ["/api/engineer-daily-tasks-config"],
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<WeeklyAssignment[]>({
    queryKey: ["/api/weekly-assignments"],
  });

  const isLoading = configLoading || assignmentsLoading;

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const parseFlexibleDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    try {
      const parsed = parseISO(dateStr);
      if (!isNaN(parsed.getTime())) return parsed;
    } catch {}
    try {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) return parsed;
    } catch {}
    return null;
  };

  const getEngineerAssignmentsForDay = (engineerName: string, day: Date) => {
    return assignments.filter(a => {
      if (a.engineerName.toLowerCase() !== engineerName.toLowerCase()) return false;
      if (!a.resourceLockedFrom || !a.resourceLockedTill) return false;
      
      const from = parseFlexibleDate(a.resourceLockedFrom);
      const till = parseFlexibleDate(a.resourceLockedTill);
      
      if (!from || !till) return false;
      
      try {
        return isWithinInterval(day, { start: from, end: till });
      } catch {
        return false;
      }
    });
  };

  const getStatusForDay = (engineerName: string, day: Date) => {
    const dayAssignments = getEngineerAssignmentsForDay(engineerName, day);
    if (dayAssignments.length === 0) return null;
    
    if (dayAssignments.some(a => a.currentStatus === 'blocked')) return 'blocked';
    if (dayAssignments.some(a => a.currentStatus === 'in_progress')) return 'in_progress';
    if (dayAssignments.some(a => a.currentStatus === 'on_hold')) return 'on_hold';
    if (dayAssignments.every(a => a.currentStatus === 'completed')) return 'completed';
    return 'not_started';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-weekly-schedule">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          This Week's Schedule
        </CardTitle>
        <CardDescription>
          Visual overview of engineer assignments for the current week. Click on any cell to manage assignments.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 mb-4" data-testid="schedule-legend">
            <div className="text-sm text-muted-foreground">Status Legend:</div>
            {Object.entries(statusConfig).map(([key, config]) => (
              <div key={key} className="flex items-center gap-1.5" data-testid={`legend-${key}`}>
                <div className={`w-3 h-3 rounded ${config.color}`} />
                <span className="text-xs">{config.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5" data-testid="legend-available">
              <div className="w-3 h-3 rounded bg-muted border" />
              <span className="text-xs">Available</span>
            </div>
          </div>

          <ScrollArea className="w-full">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-8 gap-1 mb-2">
                <div className="p-2 text-sm font-medium text-muted-foreground">Engineer</div>
                {weekDays.map((day) => {
                  const isToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                  return (
                    <div 
                      key={day.toISOString()} 
                      className={`p-2 text-center text-sm font-medium ${isToday ? 'bg-primary/10 rounded' : ''}`}
                    >
                      <div className={isToday ? 'text-primary font-bold' : 'text-muted-foreground'}>
                        {format(day, 'EEE')}
                      </div>
                      <div className={`text-xs ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                        {format(day, 'MMM d')}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1">
                {engineerConfig.map((engineer) => {
                  const engineerAssignments = assignments.filter(
                    a => a.engineerName.toLowerCase() === engineer.name.toLowerCase()
                  );
                  const hasAssignments = engineerAssignments.length > 0;

                  return (
                    <div 
                      key={engineer.id} 
                      className="grid grid-cols-8 gap-1 items-center"
                      data-testid={`schedule-row-${engineer.id}`}
                    >
                      <div className="p-2 flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                          {engineer.initials}
                        </div>
                        <span className="text-sm font-medium truncate">{engineer.name}</span>
                      </div>
                      
                      {weekDays.map((day) => {
                        const dayAssignments = getEngineerAssignmentsForDay(engineer.name, day);
                        const status = getStatusForDay(engineer.name, day);
                        const isToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                        
                        if (dayAssignments.length === 0) {
                          return (
                            <div 
                              key={day.toISOString()} 
                              className={`h-10 rounded border border-dashed ${isToday ? 'border-primary/50 bg-primary/5' : 'border-muted'} flex items-center justify-center hover:bg-accent/50 cursor-pointer transition-colors`}
                              onClick={() => {
                                // For engineers, only allow adding assignments for themselves
                                // For admins, allow adding for anyone
                                window.location.href = "/team-project-tracker";
                              }}
                              data-testid={`schedule-cell-${engineer.id}-${format(day, 'yyyy-MM-dd')}`}
                            >
                              <span className="text-xs text-muted-foreground">-</span>
                            </div>
                          );
                        }

                        const config = statusConfig[status || 'not_started'];
                        const StatusIcon = config.icon;

                        return (
                          <div 
                            key={day.toISOString()}
                            className={`h-10 rounded ${config.color} flex items-center justify-center gap-1 text-white cursor-pointer hover:opacity-90 transition-opacity`}
                            title={dayAssignments.map(a => a.projectName).join(', ')}
                            onClick={() => {
                              window.location.href = "/team-project-tracker";
                            }}
                            data-testid={`schedule-cell-${engineer.id}-${format(day, 'yyyy-MM-dd')}`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            <span className="text-xs font-medium">{dayAssignments.length}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <User className="h-4 w-4" />
              Quick Summary
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-blue-500/10 dark:bg-blue-500/20" data-testid="summary-active-projects">
                <p className="text-xs text-muted-foreground">Active Projects</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400" data-testid="value-active-projects">
                  {new Set(assignments.filter(a => a.currentStatus === 'in_progress').map(a => a.projectName)).size}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20" data-testid="summary-completed">
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="value-completed-count">
                  {assignments.filter(a => a.currentStatus === 'completed').length}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 dark:bg-amber-500/20" data-testid="summary-on-hold">
                <p className="text-xs text-muted-foreground">On Hold</p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400" data-testid="value-on-hold-count">
                  {assignments.filter(a => a.currentStatus === 'on_hold').length}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 dark:bg-red-500/20" data-testid="summary-blocked">
                <p className="text-xs text-muted-foreground">Blocked</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400" data-testid="value-blocked-count">
                  {assignments.filter(a => a.currentStatus === 'blocked').length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
