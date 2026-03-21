import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface EngineerTask {
  engineerName: string;
  planned: number;
  completed: number;
  inProgress: number;
  customActivities: Array<{ id: string; text: string }>;
  targetTasks: Array<{ id: string; text: string }>;
}

interface TodayActivityProps {
  engineerTasks: EngineerTask[];
  isLoading: boolean;
}

export function TodayActivity({ engineerTasks = [], isLoading }: TodayActivityProps) {
  // Calculate totals from all engineers' today's tasks
  const tasks = engineerTasks || [];
  const totalTargetTasks = tasks.reduce((sum, task) => sum + task.targetTasks.length, 0);
  const totalCompletedActivities = tasks.reduce((sum, task) => sum + task.customActivities.length, 0);
  
  // In Progress = incomplete target tasks (total target tasks - completed activities)
  const totalInProgressTasks = Math.max(0, totalTargetTasks - totalCompletedActivities);

  const planned = totalTargetTasks;
  const completed = totalCompletedActivities;
  const inProgress = totalInProgressTasks;
  const pending = 0;

  // Get all incomplete target tasks by engineer for tooltips
  const inProgressActivitiesByEngineer = tasks
    .map(task => ({
      engineer: task.engineerName,
      count: Math.max(0, task.targetTasks.length - task.customActivities.length),
    }))
    .filter(activity => activity.count > 0);

  const completedActivitiesByEngineer = tasks
    .map(task => ({
      engineer: task.engineerName,
      count: task.customActivities.length,
    }))
    .filter(activity => activity.count > 0);

  const completionRate = planned > 0 ? Math.round((completed / planned) * 100) : 0;

  const getCompletionColor = (rate: number) => {
    if (rate === 100) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    if (rate >= 75) return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    if (rate >= 50) return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Today's Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-10 bg-muted rounded-md" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-12 bg-muted rounded-md" />
              <div className="h-12 bg-muted rounded-md" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-primary" data-testid="card-today-activity">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-primary" />
            Today's Activity
          </CardTitle>
          <Badge variant="secondary" data-testid="badge-planned-count">
            {planned} Planned
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {planned > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="text-completed-count">
                      {completed}
                    </p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 cursor-help hover:bg-blue-500/20 dark:hover:bg-blue-500/30 transition-colors" data-testid="in-progress-hover">
                      <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-in-progress-count">
                          {inProgress}
                        </p>
                        <p className="text-xs text-muted-foreground">In Progress</p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  {inProgress > 0 && (
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-1">
                        <p className="font-semibold text-sm mb-2">In Progress by Engineer:</p>
                        {inProgressActivitiesByEngineer.map((activity) => (
                          <p key={activity.engineer} className="text-xs" data-testid={`tooltip-engineer-${activity.engineer}`}>
                            • {activity.engineer}: {activity.count} task(s)
                          </p>
                        ))}
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>

                <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20">
                  <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-pending-count">
                      {pending}
                    </p>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Completion Rate</span>
                  <Badge className={getCompletionColor(completionRate)} data-testid="badge-completion-rate">
                    {completionRate}%
                  </Badge>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-300"
                    style={{ width: `${completionRate}%` }}
                    data-testid="progress-completion"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <Calendar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No activities planned for today</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
