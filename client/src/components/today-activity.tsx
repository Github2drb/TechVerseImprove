import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, Calendar, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DailyEntry {
  engineerName: string;
  date: string;
  targetTasks: Array<{ id: string; text: string }>;
  completedActivities: Array<{ id: string; text: string }>;
}

export function TodayActivity() {
  const today = new Date().toISOString().split("T")[0];

  const { data: entries = [], isLoading } = useQuery<DailyEntry[]>({
    queryKey: ["/api/daily-activities", today],
    queryFn: async () => {
      const res = await fetch(`/api/daily-activities?date=${today}`);
      if (!res.ok) throw new Error("Failed to fetch daily activities");
      return res.json();
    },
    refetchInterval: 60000, // refresh every minute
  });

  const totalTarget = entries.reduce((s, e) => s + (e.targetTasks?.length || 0), 0);
  const totalCompleted = entries.reduce((s, e) => s + (e.completedActivities?.length || 0), 0);
  const totalInProgress = Math.max(0, totalTarget - totalCompleted);
  const completionRate = totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 100) : 0;

  const engineersWithActivities = entries.filter(
    e => (e.targetTasks?.length || 0) > 0 || (e.completedActivities?.length || 0) > 0
  );

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
            <div className="grid grid-cols-3 gap-3">
              <div className="h-20 bg-muted rounded-md" />
              <div className="h-20 bg-muted rounded-md" />
              <div className="h-20 bg-muted rounded-md" />
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
            {totalTarget} Planned
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {totalTarget > 0 || totalCompleted > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                {/* Completed */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 cursor-help">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      <div className="text-center">
                        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="text-completed-count">
                          {totalCompleted}
                        </p>
                        <p className="text-xs text-muted-foreground">Completed</p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  {totalCompleted > 0 && (
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-1">
                        <p className="font-semibold text-sm mb-2">Completed by Engineer:</p>
                        {entries.filter(e => e.completedActivities?.length > 0).map(e => (
                          <p key={e.engineerName} className="text-xs">
                            • {e.engineerName}: {e.completedActivities.length} activity
                          </p>
                        ))}
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>

                {/* In Progress */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 cursor-help hover:bg-blue-500/20 transition-colors" data-testid="in-progress-hover">
                      <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-in-progress-count">
                          {totalInProgress}
                        </p>
                        <p className="text-xs text-muted-foreground">In Progress</p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  {totalInProgress > 0 && (
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-1">
                        <p className="font-semibold text-sm mb-2">Pending by Engineer:</p>
                        {entries.filter(e => (e.targetTasks?.length || 0) > (e.completedActivities?.length || 0)).map(e => (
                          <p key={e.engineerName} className="text-xs">
                            • {e.engineerName}: {Math.max(0, (e.targetTasks?.length || 0) - (e.completedActivities?.length || 0))} pending
                          </p>
                        ))}
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>

                {/* Target */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 border border-purple-500/20 cursor-help">
                      <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      <div className="text-center">
                        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {totalTarget}
                        </p>
                        <p className="text-xs text-muted-foreground">Target Tasks</p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  {totalTarget > 0 && (
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-1">
                        <p className="font-semibold text-sm mb-2">Target by Engineer:</p>
                        {entries.filter(e => e.targetTasks?.length > 0).map(e => (
                          <p key={e.engineerName} className="text-xs">
                            • {e.engineerName}: {e.targetTasks.length} task(s)
                          </p>
                        ))}
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>

              {/* Completion Rate Bar */}
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

              {/* Per-engineer breakdown */}
              {engineersWithActivities.length > 0 && (
                <div className="pt-2 border-t space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Today's Breakdown</p>
                  <div className="space-y-1.5">
                    {engineersWithActivities.map(e => {
                      const done = e.completedActivities?.length || 0;
                      const target = e.targetTasks?.length || 0;
                      const pct = target > 0 ? Math.round((done / target) * 100) : 0;
                      return (
                        <div key={e.engineerName} className="flex items-center gap-3">
                          <span className="text-xs font-medium w-28 truncate" title={e.engineerName}>{e.engineerName}</span>
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-14 text-right">{done}/{target} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
