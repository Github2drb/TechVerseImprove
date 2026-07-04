import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { StarPerformerBanner } from "@/components/StarPerformerBanner";
import {
  ArrowLeft, Award, Star, TrendingUp, Users,
  CheckCircle2, Clock, AlertTriangle, Target,
  ChevronDown, ChevronUp, Copy, Check, FolderOpen, ClipboardList, Activity,
} from "lucide-react";

interface EngineerSkill { id: string; name: string; initials: string; }
interface EngineerTask {
  engineerName: string; planned: number; completed: number; inProgress: number;
  targetTasks?: Array<{ id: string; text: string; status?: string }>;
  customActivities?: Array<{ id: string; text: string }>;
}
interface WeeklyAssignment {
  id: string; engineerName: string; projectName: string; currentStatus: string;
  resourceLockedFrom?: string; resourceLockedTill?: string;
}

// ─── Name matching (handles "Santosh N, Harsha" combined records and "(Company)" suffixes) ───
function norm(s: string): string {
  return s.trim().replace(/\s*\([^)]*\)\s*/g, "").trim().toLowerCase();
}
function namesMatch(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (nb.startsWith(na) || na.startsWith(nb)) return true;
  return na.split(/\s+/)[0] === nb.split(/\s+/)[0];
}
function assignmentIncludesEngineer(assignmentEngineerField: string, engineerName: string): boolean {
  return assignmentEngineerField
    .split(",")
    .map(n => n.trim())
    .filter(Boolean)
    .some(n => namesMatch(n, engineerName));
}

// ─── Performance level ───
function getPerformanceLevel(efficiency: number): { label: string; color: string; icon: typeof Star } {
  if (efficiency >= 90) return { label: "Expert",      color: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300", icon: Award       };
  if (efficiency >= 75) return { label: "Proficient",  color: "bg-blue-500/20 text-blue-700 dark:text-blue-300",         icon: Star        };
  if (efficiency >= 50) return { label: "Developing",  color: "bg-amber-500/20 text-amber-700 dark:text-amber-300",      icon: TrendingUp  };
  return                       { label: "Learning",    color: "bg-gray-500/20 text-gray-700 dark:text-gray-300",         icon: Clock       };
}

function calculateEfficiency(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

// ─── Stats shape used by diagnosis + justification ───
interface EngineerStats {
  id: string;
  name: string;
  initials: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  targetTasksCount: number;
  activitiesCount: number;
  totalProjects: number;
  completedProjects: number;
  activeProjectNames: string[];
  taskEfficiency: number;
  projectEfficiency: number;
  overallEfficiency: number;
  performance: { label: string; color: string; icon: typeof Star };
}

interface Diagnosis {
  label: string;
  color: string;
  detail: string;
  recommendation: string;
}

// ─── Automatic diagnosis: WHY is this engineer below threshold? ───
function getDiagnosis(e: EngineerStats): Diagnosis {
  const activeProjects = e.activeProjectNames.length;

  // Present and producing activity, but assigned across multiple live projects → capacity problem
  if (activeProjects >= 2 && e.taskEfficiency < 50) {
    return {
      label: "Over-allocated",
      color: "bg-red-500/20 text-red-700 dark:text-red-300",
      detail: `Assigned to ${activeProjects} concurrent active projects. Task completion has collapsed because the assigned load exceeds one engineer's completable capacity — not because of absence or inactivity.`,
      recommendation: "Add capacity: recruit or engage an outsourced engineer to absorb part of the concurrent project scope, or rebalance assignments across the team.",
    };
  }

  // Zero completions AND zero logged activity → cannot verify any output
  if (e.completedTasks === 0 && e.activitiesCount === 0) {
    return {
      label: "No logged output",
      color: "bg-gray-500/20 text-gray-700 dark:text-gray-300",
      detail: "No completed tasks and no activity log entries recorded. Either work is not happening, or it is happening but not being logged — this must be verified before drawing conclusions.",
      recommendation: "Verify daily logging discipline first. If work is genuinely stalled, arrange a skills review or pair with a senior engineer.",
    };
  }

  // Logging activity daily but tasks are not reaching "completed" → blockers
  if (e.activitiesCount > 0 && e.taskEfficiency < 50) {
    return {
      label: "Tasks not closing",
      color: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
      detail: `${e.activitiesCount} activity log entries show daily work is happening, but assigned tasks are not reaching completion — likely blockers (materials, site access, dependencies) or task scope too large.`,
      recommendation: "Review the engineer's notice-board blockers. If the blockage is scope-related, consider short-term outsourced support for the blocked portion.",
    };
  }

  return {
    label: "Below target",
    color: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    detail: "Overall completion rate is below the 50% support threshold without a single dominant cause.",
    recommendation: "Monitor for another week and coach on task completion. Escalate to a capacity request only if the pattern persists.",
  };
}

// ─── HR-ready justification text (copied to clipboard) ───
function buildJustification(e: EngineerStats, diagnosis: Diagnosis): string {
  const projectList = e.activeProjectNames.length > 0
    ? e.activeProjectNames.join("; ")
    : "no active projects";
  const today = new Date().toISOString().split("T")[0];
  return (
    `SUPPORT JUSTIFICATION — ${e.name} (as of ${today})\n` +
    `Overall completion rate: ${e.overallEfficiency}% (below the 50% support threshold).\n` +
    `Daily tasks: ${e.completedTasks} of ${e.totalTasks} completed (${e.taskEfficiency}%), ${e.inProgressTasks} in progress, ${e.targetTasksCount} target tasks set today.\n` +
    `Projects: ${e.completedProjects} of ${e.totalProjects} assignments completed; currently active on ${e.activeProjectNames.length} project(s): ${projectList}.\n` +
    `Activity log entries: ${e.activitiesCount}.\n` +
    `Diagnosis: ${diagnosis.label} — ${diagnosis.detail}\n` +
    `Recommendation: ${diagnosis.recommendation}`
  );
}

export default function SkillMatrix() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const engineerStats: EngineerStats[] = engineerConfig.map(engineer => {
    const tasks = engineerTasks.find(t => namesMatch(t.engineerName, engineer.name));
    // Comma-split + fuzzy match so combined records like "Santosh N, Harsha" count for each engineer
    const engineerAssignments = assignments.filter(a =>
      assignmentIncludesEngineer(a.engineerName, engineer.name)
    );
    const totalTasks       = tasks?.planned || 0;
    const completedTasks   = tasks?.completed || 0;
    const inProgressTasks  = tasks?.inProgress || 0;
    const targetTasksCount = tasks?.targetTasks?.length || 0;
    const activitiesCount  = tasks?.customActivities?.length || 0;
    const completedAssignments = engineerAssignments.filter(a => a.currentStatus === "completed").length;
    const totalAssignments     = engineerAssignments.length;

    // Active (non-completed) project names — deduplicated — the core of the HR capacity argument
    const activeProjectNames = Array.from(new Set(
      engineerAssignments
        .filter(a => a.currentStatus !== "completed")
        .map(a => a.projectName.trim())
        .filter(Boolean)
    ));

    const taskEfficiency    = calculateEfficiency(completedTasks, totalTasks);
    const projectEfficiency = calculateEfficiency(completedAssignments, totalAssignments);
    const overallEfficiency = totalTasks + totalAssignments > 0
      ? Math.round(((completedTasks + completedAssignments) / (totalTasks + totalAssignments)) * 100)
      : 0;

    return {
      id: engineer.id,
      name: engineer.name,
      initials: engineer.initials,
      totalTasks, completedTasks, inProgressTasks, targetTasksCount, activitiesCount,
      totalProjects: totalAssignments, completedProjects: completedAssignments,
      activeProjectNames,
      taskEfficiency, projectEfficiency, overallEfficiency,
      performance: getPerformanceLevel(overallEfficiency),
    };
  });

  const needsAttention = engineerStats.filter(e =>
    e.overallEfficiency < 50 && (e.totalTasks > 0 || e.totalProjects > 0)
  );

  const handleCopyJustification = async (engineer: EngineerStats, diagnosis: Diagnosis) => {
    const text = buildJustification(engineer, diagnosis);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(engineer.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API can fail on http or older mobile browsers — fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(engineer.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-skill-matrix">
      <header className="sticky top-0 z-50 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5"/></Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Award className="h-5 w-5"/>
              </div>
              <span className="hidden font-semibold text-lg sm:inline-block">Skill Matrix & Performance</span>
            </div>
          </div>
          <ThemeToggle/>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Team Skill Matrix</h1>
          <p className="text-muted-foreground">
            Real-time performance based on attendance, task completion and project activity logs.
          </p>
        </div>

        {/* ── STAR PERFORMER BANNER — replaces old 4 summary cards ── */}
        <StarPerformerBanner />

        {/* ── Performance legend ── */}
        {!isLoading && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5"/>Understanding Performance Levels
              </CardTitle>
              <CardDescription>
                Task Rate on this page = (completed tasks + completed projects) ÷ (assigned tasks + projects).
                The weekly weighted score (Attendance 40% + Task Completion 40% + Activity Log 20%) is shown in the Star Performer banner above.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    <Award className="h-3 w-3 mr-1"/>Expert (90%+)
                  </Badge>
                  <span className="text-sm text-muted-foreground">Consistently exceeds expectations</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300">
                    <Star className="h-3 w-3 mr-1"/>Proficient (75-89%)
                  </Badge>
                  <span className="text-sm text-muted-foreground">Reliably meets targets</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    <TrendingUp className="h-3 w-3 mr-1"/>Developing (50-74%)
                  </Badge>
                  <span className="text-sm text-muted-foreground">Growing skills</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-gray-500/20 text-gray-700 dark:text-gray-300">
                    <Clock className="h-3 w-3 mr-1"/>Learning (&lt;50%)
                  </Badge>
                  <span className="text-sm text-muted-foreground">New or needs support</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Engineer task matrix table ── */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-24 w-full"/>)}
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5"/>Engineer Daily Task Matrix
                </CardTitle>
                <CardDescription>
                  Based on daily task tracking — completed tasks vs planned
                </CardDescription>
              </CardHeader>
              <CardContent>
                {engineerStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No engineer task data available. Configure engineers in daily tasks first.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Engineer</TableHead>
                        <TableHead className="text-center">Today's Tasks</TableHead>
                        <TableHead className="text-center">Completed</TableHead>
                        <TableHead className="text-center">Activities</TableHead>
                        <TableHead className="text-center">Projects</TableHead>
                        <TableHead className="text-center">Task Rate</TableHead>
                        <TableHead className="text-center">Level</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {engineerStats.map(engineer => {
                        const Icon = engineer.performance.icon;
                        return (
                          <TableRow key={engineer.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium">
                                  {engineer.initials}
                                </div>
                                <div>
                                  <p className="font-medium">{engineer.name}</p>
                                  <p className="text-xs text-muted-foreground">Controls Engineer</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{engineer.targetTasksCount}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500"/>
                                <span>{engineer.completedTasks}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{engineer.activitiesCount}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-emerald-600 dark:text-emerald-400">{engineer.completedProjects}</span>
                                <span className="text-muted-foreground">/</span>
                                <span>{engineer.totalProjects}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className="font-semibold">{engineer.overallEfficiency}%</span>
                                <Progress value={engineer.overallEfficiency} className="h-1.5 w-16"/>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className={engineer.performance.color}>
                                <Icon className="h-3 w-3 mr-1"/>{engineer.performance.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* ── Needs support section — with expandable justification ── */}
            {needsAttention.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex gap-3">
                    <div className="w-1 rounded-full bg-amber-500 shrink-0"/>
                    <div>
                      <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-5 w-5"/>Engineers Needing Support
                      </CardTitle>
                      <CardDescription>
                        Tap an engineer to see the full justification — diagnosis, workload evidence and recommended action
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {needsAttention.map(engineer => {
                      const diagnosis = getDiagnosis(engineer);
                      const isExpanded = expandedId === engineer.id;
                      const isCopied = copiedId === engineer.id;
                      return (
                        <div key={engineer.id}
                          className="rounded-lg bg-amber-500/10 dark:bg-amber-500/20 overflow-hidden">
                          {/* Header row — click to expand */}
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : engineer.id)}
                            className="w-full flex items-center justify-between p-3 text-left hover:bg-amber-500/10 transition-colors"
                            data-testid={`button-expand-${engineer.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center text-sm font-medium">
                                {engineer.initials}
                              </div>
                              <span className="font-medium">{engineer.name}</span>
                              <Badge className={diagnosis.color}>{diagnosis.label}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                                {engineer.overallEfficiency}% task rate
                              </Badge>
                              {isExpanded
                                ? <ChevronUp className="h-4 w-4 text-muted-foreground"/>
                                : <ChevronDown className="h-4 w-4 text-muted-foreground"/>}
                            </div>
                          </button>

                          {/* Expanded justification panel */}
                          {isExpanded && (
                            <div className="px-4 pb-4 space-y-4 border-t border-amber-500/20 pt-4">
                              {/* Component breakdown */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="rounded-md bg-background/60 p-3">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <ClipboardList className="h-3.5 w-3.5"/>Daily Tasks
                                  </div>
                                  <p className="text-lg font-semibold">
                                    {engineer.completedTasks} / {engineer.totalTasks}
                                    <span className="text-sm font-normal text-muted-foreground ml-1">
                                      ({engineer.taskEfficiency}%)
                                    </span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {engineer.inProgressTasks} in progress · {engineer.targetTasksCount} targets today
                                  </p>
                                </div>
                                <div className="rounded-md bg-background/60 p-3">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <FolderOpen className="h-3.5 w-3.5"/>Project Load
                                  </div>
                                  <p className="text-lg font-semibold">
                                    {engineer.activeProjectNames.length} active
                                    <span className="text-sm font-normal text-muted-foreground ml-1">
                                      ({engineer.completedProjects}/{engineer.totalProjects} done)
                                    </span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Project completion {engineer.projectEfficiency}%
                                  </p>
                                </div>
                                <div className="rounded-md bg-background/60 p-3">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <Activity className="h-3.5 w-3.5"/>Activity Log
                                  </div>
                                  <p className="text-lg font-semibold">{engineer.activitiesCount} entries</p>
                                  <p className="text-xs text-muted-foreground">
                                    {engineer.activitiesCount === 0 ? "Nothing logged — verify" : "Work evidence on record"}
                                  </p>
                                </div>
                              </div>

                              {/* Active project names */}
                              {engineer.activeProjectNames.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                                    ACTIVE PROJECTS ({engineer.activeProjectNames.length})
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {engineer.activeProjectNames.map(name => (
                                      <Badge key={name} variant="outline" className="text-xs font-normal">
                                        {name}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Diagnosis + recommendation */}
                              <div className="rounded-md bg-background/60 p-3 space-y-2">
                                <p className="text-sm">
                                  <span className="font-semibold">Diagnosis: </span>{diagnosis.detail}
                                </p>
                                <p className="text-sm">
                                  <span className="font-semibold">Recommendation: </span>{diagnosis.recommendation}
                                </p>
                              </div>

                              {/* Copy button */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCopyJustification(engineer, diagnosis)}
                                data-testid={`button-copy-justification-${engineer.id}`}
                              >
                                {isCopied
                                  ? <><Check className="h-4 w-4 mr-2 text-emerald-500"/>Copied to clipboard</>
                                  : <><Copy className="h-4 w-4 mr-2"/>Copy Justification for HR</>}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
