import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import { CheckCircle2, BarChart3, Target, ArrowLeft, Users } from "lucide-react";

interface DailyEntry {
  engineerName: string;
  date: string;
  targetTasks: Array<{ id: string; text: string }>;
  completedActivities: Array<{ id: string; text: string }>;
}

// A target task counts as "done" if its text is reflected in the completed
// activities list (fuzzy/contains match on either side, case-insensitive).
// This is the clearest signal we have today since the two lists aren't
// linked by id — it turns "Target Tasks" + "Completed Activities" into a
// single clear pending/done picture for whoever's reading the report.
function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
function isTaskDone(taskText: string, completed: Array<{ text: string }>) {
  const t = norm(taskText);
  if (!t) return false;
  return completed.some(c => {
    const ct = norm(c.text);
    if (!ct) return false;
    return ct.includes(t) || t.includes(ct);
  });
}

export default function EngineerReports() {
  const today = new Date().toISOString().split("T")[0];
  const dateString = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const { data: entries = [], isLoading } = useQuery<DailyEntry[]>({
    queryKey: ["/api/daily-activities", today],
    queryFn: async () => {
      const res = await fetch(`/api/daily-activities?date=${today}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 60000,
  });

  // Show ALL engineers from daily-activities.json that have any data today
  const activeEntries = entries.filter(
    e => (e.targetTasks?.length || 0) > 0 || (e.completedActivities?.length || 0) > 0
  );

  const teamPendingCount = activeEntries.reduce((sum, e) => {
    const completed = e.completedActivities || [];
    const pending = (e.targetTasks || []).filter(t => !isTaskDone(t.text, completed));
    return sum + pending.length;
  }, 0);

  return (
    <>
      <Header searchQuery="" onSearchChange={() => {}} />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6 md:py-12">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Engineer Daily Reports</h1>
            <p className="text-muted-foreground">{dateString}</p>
            {!isLoading && activeEntries.length > 0 && (
              <p className="mt-2 text-sm font-medium">
                {teamPendingCount > 0 ? (
                  <span className="text-red-600 dark:text-red-400">{teamPendingCount} task{teamPendingCount === 1 ? "" : "s"} pending across the team today</span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400">All target tasks done for today 🎉</span>
                )}
              </p>
            )}
          </div>
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-2" data-testid="button-back-to-dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="h-24 bg-muted rounded-lg m-4" />
              </Card>
            ))}
          </div>
        ) : activeEntries.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No activities logged for today yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Data is read from <code className="text-xs bg-muted px-1 py-0.5 rounded">daily-activities.json</code>
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {activeEntries.map((entry) => {
              const completed = entry.completedActivities || [];
              const targets = entry.targetTasks || [];
              const doneTargets = targets.filter(t => isTaskDone(t.text, completed));
              const pendingTargets = targets.filter(t => !isTaskDone(t.text, completed));
              const done = completed.length;
              const target = targets.length;
              const pct = target > 0 ? Math.round((doneTargets.length / target) * 100) : 0;

              return (
                <Card
                  key={entry.engineerName}
                  className="border-l-4 border-l-primary"
                  data-testid={`report-card-${entry.engineerName}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{entry.engineerName}</CardTitle>
                      <div className="flex gap-2 items-center">
                        {target > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {doneTargets.length}/{target} tasks
                          </Badge>
                        )}
                        {pendingTargets.length > 0 && (
                          <Badge className="text-xs bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30">
                            {pendingTargets.length} pending
                          </Badge>
                        )}
                        <Badge
                          className={
                            done > 0
                              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30"
                          }
                        >
                          {done > 0 ? "Active" : "No Activities"}
                        </Badge>
                      </div>
                    </div>
                    {/* Completion progress bar */}
                    {target > 0 && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Completion</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Target Tasks — split into clear Pending vs Done so anyone reading this can tell at a glance what's left */}
                    {pendingTargets.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-red-600 dark:text-red-400">
                          <Target className="h-4 w-4" />
                          Pending — To Be Done
                          <Badge className="text-xs ml-auto bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30">{pendingTargets.length}</Badge>
                        </h4>
                        <div className="space-y-1">
                          {pendingTargets.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-start gap-2 p-1.5 rounded-md bg-red-500/10 dark:bg-red-500/15"
                              data-testid={`target-${task.id}`}
                            >
                              <Target className="h-3 w-3 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                              <p className="text-sm text-red-700 dark:text-red-300">{task.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {doneTargets.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          Target Tasks — Done
                          <Badge variant="secondary" className="text-xs ml-auto">{doneTargets.length}</Badge>
                        </h4>
                        <div className="space-y-1">
                          {doneTargets.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-start gap-2 p-1.5 rounded-md bg-blue-500/10 dark:bg-blue-500/20"
                              data-testid={`target-${task.id}`}
                            >
                              <Target className="h-3 w-3 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                              <p className="text-sm text-blue-700 dark:text-blue-300 line-through opacity-70">{task.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Completed Activities */}
                    {entry.completedActivities?.length > 0 ? (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          Completed Activities
                          <Badge variant="secondary" className="text-xs ml-auto">{entry.completedActivities.length}</Badge>
                        </h4>
                        <div className="space-y-1">
                          {entry.completedActivities.map((activity) => (
                            <div
                              key={activity.id}
                              className="flex items-start gap-3 p-1.5 rounded-md bg-emerald-500/10 dark:bg-emerald-500/20"
                              data-testid={`activity-${activity.id}`}
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <p className="text-sm text-emerald-700 dark:text-emerald-300">{activity.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : entry.targetTasks?.length > 0 ? (
                      <p className="text-xs text-muted-foreground italic">No completed activities yet</p>
                    ) : (
                      <div className="text-center py-4">
                        <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                        <p className="text-sm text-muted-foreground">No tasks or activities logged yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
