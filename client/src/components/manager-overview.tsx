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

// ── Per-engineer status/timeline overlay ────────────────────────────────────
// Mirrors the same override map used on the Team Project Tracker page. A
// shared weekly-assignment record can list several comma-separated
// engineers, but each one can independently mark THEIR OWN status (e.g.
// "Completed") without changing what the rest of the team sees. Once an
// individual's effective status is "completed", they must never show up in
// the Overdue / Wrapping Up lists again, even if the shared record other
// engineers are on is still open. Fetched read-only here (no writes).
interface EngineerStatusEntry {
  displayName: string; currentStatus: string;
  resourceLockedFrom?: string; resourceLockedTill?: string;
  internalTarget?: string; customerTarget?: string; constraint?: string;
  updatedAt?: string; updatedBy?: string;
}
interface EngineerStatusProject { projectName: string; engineers: Record<string, EngineerStatusEntry>; }
type EngineerStatusMap = Record<string, EngineerStatusProject>; // key = projectName.trim().toLowerCase()

function normName(s: string): string {
  return s.trim().replace(/\s*\([^)]*\)\s*/g, "").trim().toLowerCase();
}
function normProjectKey(s: string): string {
  return s.trim().toLowerCase().replace(/[.\s]+$/, "").replace(/\s+/g, " ");
}
// Look up an engineer's individual override for a given project, if one exists.
function getEngineerOverride(map: EngineerStatusMap, projectName: string, engineerName: string): EngineerStatusEntry | undefined {
  const proj = map[projectName.trim().toLowerCase()];
  if (!proj) return undefined;
  return proj.engineers[normName(engineerName)];
}

// A single engineer's row within an overdue/winding-down list — one per
// (assignment, engineer) pair rather than one per shared assignment record,
// so an individual "Completed" status can silence just that person.
interface EngineerAlertEntry { id: string; engineerName: string; projectName: string; }

// ─── Wind-down phases ───────────────────────────────────────────────────────
// Mirrors the same set used on the Skill Matrix page. A project sitting in
// S.A.T, Dispatch, Documentation or Equipment Handover past its old lock
// date is technically "overdue," but the bulk of the engineering work is
// already done — flagging it identically to a project still stuck in
// Procurement or Assembly past deadline creates false urgency. These are
// shown separately, in a muted "wrapping up" section, instead of being
// counted in the red Alerts number.
const WIND_DOWN_STATUSES = new Set(["sat", "dispatch_stage", "documentation", "equipment_handover"]);

export function ManagerOverview() {
  const { data: engineerConfig = [], isLoading: configLoading } = useQuery<EngineerSkill[]>({
    queryKey: ["/api/engineer-daily-tasks-config"],
  });

  const today = new Date().toISOString().split("T")[0];
  const { data: engineerTasks = [], isLoading: tasksLoading } = useQuery<EngineerTask[]>({
    queryKey: ["/api/daily-activities", today],
    queryFn: async () => {
      const res = await fetch(`/api/daily-activities?date=${today}`);
      if (!res.ok) throw new Error("Failed");
      const entries = await res.json() as Array<{
        engineerName: string;
        targetTasks: Array<{ id: string; text: string }>;
        completedActivities: Array<{ id: string; text: string }>;
      }>;
      // Map to EngineerTask shape
      return entries.map(e => ({
        engineerName: e.engineerName,
        planned: e.targetTasks?.length || 0,
        completed: e.completedActivities?.length || 0,
        inProgress: Math.max(0, (e.targetTasks?.length || 0) - (e.completedActivities?.length || 0)),
        targetTasks: e.targetTasks || [],
        customActivities: e.completedActivities || [],
      }));
    },
    refetchInterval: 60000,
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<WeeklyAssignment[]>({
    queryKey: ["/api/weekly-assignments"],
  });

  // Per-engineer status overrides — same source Team Project Tracker uses to
  // let one engineer's status (e.g. "Completed") differ from the shared
  // assignment record. Needed here so a completed engineer is excluded from
  // the Overdue / Wrapping Up lists below.
  const { data: engineerStatusMap = {}, isLoading: statusLoading } = useQuery<EngineerStatusMap>({
    queryKey: ["/api/project-engineer-status"],
    queryFn: async () => {
      const res = await fetch("/api/project-engineer-status");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const isLoading = configLoading || tasksLoading || assignmentsLoading || statusLoading;

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

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  // Build one entry per (assignment, engineer) pair — a shared assignment
  // record can list several comma-separated engineers, and each one can have
  // their own status override. Resolve EACH person's own effective status
  // before deciding whether they're overdue: once an individual's status is
  // "completed" (their own override, or the whole assignment being marked
  // completed), they are dropped from both lists entirely, even while a
  // shared record other engineers are still on is on an earlier status.
  const overdueAssignments: EngineerAlertEntry[] = [];
  const windingDownAssignments: EngineerAlertEntry[] = [];
  const seenPerProject: Record<string, Set<string>> = {};

  assignments.forEach(a => {
    if (!a.engineerName || !a.engineerName.trim()) return;
    const pk = normProjectKey(a.projectName);
    if (!seenPerProject[pk]) seenPerProject[pk] = new Set();

    const rawNames = a.engineerName.split(",").map(n => n.trim()).filter(Boolean);
    rawNames.forEach(rawName => {
      const nk = normName(rawName);
      if (!nk || seenPerProject[pk].has(nk)) return;
      seenPerProject[pk].add(nk);

      const override = getEngineerOverride(engineerStatusMap, a.projectName, rawName);
      const effectiveStatus = a.currentStatus === "completed" ? "completed" : (override?.currentStatus || a.currentStatus);
      if (effectiveStatus === "completed") return; // this engineer's own status is done — never overdue

      const effectiveTill = override?.resourceLockedTill || a.resourceLockedTill;
      if (!effectiveTill) return;
      const tillDate = new Date(effectiveTill);
      tillDate.setHours(0, 0, 0, 0);
      if (tillDate >= todayDate) return; // not past lock date for this engineer

      const entry: EngineerAlertEntry = { id: `${a.id}::${nk}`, engineerName: rawName, projectName: a.projectName };
      if (WIND_DOWN_STATUSES.has(effectiveStatus)) windingDownAssignments.push(entry);
      else overdueAssignments.push(entry);
    });
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
                        <div className="flex gap-2 text-xs flex-wrap">
                          {overdueAssignments.length > 0 && (
                            <span className="text-red-600 dark:text-red-400" data-testid="value-overdue">{overdueAssignments.length} overdue</span>
                          )}
                          {blockedProjects > 0 && (
                            <span className="text-amber-600 dark:text-amber-400" data-testid="value-blocked">{blockedProjects} blocked</span>
                          )}
                          {windingDownAssignments.length > 0 && (
                            <span className="text-muted-foreground" data-testid="value-winding-down">{windingDownAssignments.length} wrapping up</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400" data-testid="value-all-good">All Good</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {windingDownAssignments.length > 0
                            ? `${windingDownAssignments.length} project(s) wrapping up past lock date`
                            : "No issues to address"}
                        </p>
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

      {(windingDownAssignments.length > 0) && (
        <Card data-testid="card-winding-down-list">
          <CardHeader className="pb-2">
            <div className="flex gap-3">
              <div className="w-1 rounded-full bg-muted-foreground/40 shrink-0" />
              <div>
                <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Wrapping Up — Past Lock Date, S.A.T / Dispatch / Documentation / Handover
                </CardTitle>
                <CardDescription className="text-xs">
                  Past their original lock date, but already in a late-stage phase — informational, not an active risk.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {windingDownAssignments.slice(0, 5).map((a) => (
                <Badge
                  key={a.id}
                  variant="outline"
                  className="text-muted-foreground border-dashed"
                  data-testid={`badge-winding-down-${a.id}`}
                >
                  {a.engineerName} - {a.projectName}
                </Badge>
              ))}
              {windingDownAssignments.length > 5 && (
                <Badge variant="outline">+{windingDownAssignments.length - 5} more</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
