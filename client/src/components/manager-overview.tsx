import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, 
  Briefcase, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  Calendar,
  Target,
  Activity
} from "lucide-react";

interface EngineerSkill {
  id: string;
  name: string;
  initials: string;
}

interface EngineerTask {
  engineerName: string;
  planned: number;
  completed: number;
  inProgress: number;
  targetTasks?: Array<{ id: string; text: string }>;
  customActivities?: Array<{ id: string; text: string }>;
}

interface WeeklyAssignment {
  id: string;
  engineerName: string;
  projectName: string;
  currentStatus: string;
  resourceLockedTill?: string;
}

export function ManagerOverview() {
  const { data: engineerConfig = [], isLoading: configLoading } = useQuery<EngineerSkill[]>({
    queryKey: ["/api/engineer-daily-tasks-config"],
  });

  const { data: engineerTasks = [], isLoading: tasksLoading } = useQuery<EngineerTask[]>({
    queryKey: ["/api/engineer-daily-tasks"],
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<WeeklyAssignment[]>({
    queryKey: ["/api/weekly-assignments"],
  });

  const isLoading = configLoading || tasksLoading || assignmentsLoading;

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const totalEngineers = engineerConfig.length;
  
  const engineersWithTasks = engineerTasks.filter(t => 
    (t.targetTasks?.length || 0) > 0 || (t.customActivities?.length || 0) > 0
  ).length;

  const totalTodayTasks = engineerTasks.reduce((sum, t) => sum + (t.targetTasks?.length || 0), 0);
  const completedTodayTasks = engineerTasks.reduce((sum, t) => sum + (t.completed || 0), 0);
  const totalActivities = engineerTasks.reduce((sum, t) => sum + (t.customActivities?.length || 0), 0);

  const activeProjects = new Set(assignments.map(a => a.projectName.toLowerCase())).size;
  const completedProjects = assignments.filter(a => a.currentStatus === 'completed').length;
  const inProgressProjects = assignments.filter(a => a.currentStatus === 'in_progress').length;
  const blockedProjects = assignments.filter(a => a.currentStatus === 'blocked').length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueAssignments = assignments.filter(a => {
    if (!a.resourceLockedTill || a.currentStatus === 'completed') return false;
    const tillDate = new Date(a.resourceLockedTill);
    tillDate.setHours(0, 0, 0, 0);
    return tillDate < today;
  });

  const utilizationRate = totalEngineers > 0 
    ? Math.round((engineersWithTasks / totalEngineers) * 100) 
    : 0;

  const taskCompletionRate = totalTodayTasks > 0 
    ? Math.round((completedTodayTasks / totalTodayTasks) * 100) 
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Manager Quick View
        </h2>
        <Badge variant="outline" className="text-xs">
          <Calendar className="h-3 w-3 mr-1" />
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-team-status">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className="w-1 rounded-full bg-blue-500 shrink-0" />
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Team Status</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold" data-testid="value-active-engineers">{engineersWithTasks}</span>
                      <span className="text-sm text-muted-foreground">/ {totalEngineers}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Engineers active today</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <Progress value={utilizationRate} className="mt-3 h-1.5" />
                <p className="text-xs text-muted-foreground mt-1" data-testid="value-utilization">{utilizationRate}% utilization</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-today-progress">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className="w-1 rounded-full bg-emerald-500 shrink-0" />
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Today's Progress</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="value-activities">{totalActivities}</span>
                      <span className="text-sm text-muted-foreground">activities</span>
                    </div>
                    <p className="text-xs text-muted-foreground" data-testid="value-tasks-assigned">{totalTodayTasks} tasks assigned</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
                <Progress value={taskCompletionRate} className="mt-3 h-1.5" />
                <p className="text-xs text-muted-foreground mt-1" data-testid="value-completion">{taskCompletionRate}% completion</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-projects-status">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className="w-1 rounded-full bg-violet-500 shrink-0" />
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Projects Status</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold" data-testid="value-active-projects">{activeProjects}</span>
                      <span className="text-sm text-muted-foreground">active</span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400" data-testid="value-completed-projects">{completedProjects} done</span>
                      <span className="text-blue-600 dark:text-blue-400" data-testid="value-running-projects">{inProgressProjects} running</span>
                    </div>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                    <Briefcase className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-alerts">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className={`w-1 rounded-full shrink-0 ${overdueAssignments.length > 0 || blockedProjects > 0 ? 'bg-red-500' : 'bg-emerald-500'}`} />
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Alerts</p>
                    {overdueAssignments.length > 0 || blockedProjects > 0 ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="value-issues-count">
                            {overdueAssignments.length + blockedProjects}
                          </span>
                          <span className="text-sm text-muted-foreground">issues</span>
                        </div>
                        <div className="flex gap-2 text-xs">
                          {overdueAssignments.length > 0 && (
                            <span className="text-red-600 dark:text-red-400" data-testid="value-overdue">{overdueAssignments.length} overdue</span>
                          )}
                          {blockedProjects > 0 && (
                            <span className="text-amber-600 dark:text-amber-400" data-testid="value-blocked">{blockedProjects} blocked</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400" data-testid="value-all-good">All Good</span>
                        </div>
                        <p className="text-xs text-muted-foreground">No issues to address</p>
                      </>
                    )}
                  </div>
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${overdueAssignments.length > 0 || blockedProjects > 0 ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
                    {overdueAssignments.length > 0 || blockedProjects > 0 ? (
                      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    ) : (
                      <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {(overdueAssignments.length > 0) && (
        <Card data-testid="card-overdue-list">
          <CardHeader className="pb-2">
            <div className="flex gap-3">
              <div className="w-1 rounded-full bg-red-500 shrink-0" />
              <CardTitle className="text-sm flex items-center gap-2 text-red-700 dark:text-red-400">
                <Clock className="h-4 w-4" />
                Overdue Assignments - Needs Attention
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {overdueAssignments.slice(0, 5).map((a) => (
                <Badge 
                  key={a.id} 
                  variant="outline" 
                  className="bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
                  data-testid={`badge-overdue-${a.id}`}
                >
                  {a.engineerName} - {a.projectName}
                </Badge>
              ))}
              {overdueAssignments.length > 5 && (
                <Badge variant="outline">+{overdueAssignments.length - 5} more</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
