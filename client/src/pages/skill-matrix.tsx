import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { 
  ArrowLeft, 
  Award, 
  Star, 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Zap,
  Target
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
  targetTasks?: Array<{ id: string; text: string; status?: string }>;
  customActivities?: Array<{ id: string; text: string }>;
}

interface WeeklyAssignment {
  id: string;
  engineerName: string;
  projectName: string;
  currentStatus: string;
  resourceLockedFrom?: string;
  resourceLockedTill?: string;
}

function getPerformanceLevel(efficiency: number): { label: string; color: string; icon: typeof Star } {
  if (efficiency >= 90) return { label: "Expert", color: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300", icon: Award };
  if (efficiency >= 75) return { label: "Proficient", color: "bg-blue-500/20 text-blue-700 dark:text-blue-300", icon: Star };
  if (efficiency >= 50) return { label: "Developing", color: "bg-amber-500/20 text-amber-700 dark:text-amber-300", icon: TrendingUp };
  return { label: "Learning", color: "bg-gray-500/20 text-gray-700 dark:text-gray-300", icon: Clock };
}

function calculateEfficiency(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

export default function SkillMatrix() {
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

  const engineerStats = engineerConfig.map(engineer => {
    const tasks = engineerTasks.find(t => t.engineerName === engineer.name);
    const engineerAssignments = assignments.filter(a => 
      a.engineerName.toLowerCase() === engineer.name.toLowerCase()
    );

    const totalTasks = tasks?.planned || 0;
    const completedTasks = tasks?.completed || 0;
    const inProgressTasks = tasks?.inProgress || 0;
    const targetTasksCount = tasks?.targetTasks?.length || 0;
    const activitiesCount = tasks?.customActivities?.length || 0;
    
    const completedAssignments = engineerAssignments.filter(a => a.currentStatus === 'completed').length;
    const totalAssignments = engineerAssignments.length;

    const taskEfficiency = calculateEfficiency(completedTasks, totalTasks);
    const projectEfficiency = calculateEfficiency(completedAssignments, totalAssignments);
    const overallEfficiency = totalTasks + totalAssignments > 0 
      ? Math.round(((completedTasks + completedAssignments) / (totalTasks + totalAssignments)) * 100)
      : 0;

    const onTimeDelivery = engineerAssignments.filter(a => {
      if (!a.resourceLockedTill || a.currentStatus !== 'completed') return false;
      return true;
    }).length;

    return {
      ...engineer,
      totalTasks,
      completedTasks,
      inProgressTasks,
      targetTasksCount,
      activitiesCount,
      totalProjects: totalAssignments,
      completedProjects: completedAssignments,
      taskEfficiency,
      projectEfficiency,
      overallEfficiency,
      onTimeDelivery,
      performance: getPerformanceLevel(overallEfficiency),
    };
  });

  const teamAverageEfficiency = engineerStats.length > 0
    ? Math.round(engineerStats.reduce((sum, e) => sum + e.overallEfficiency, 0) / engineerStats.length)
    : 0;

  const topPerformers = [...engineerStats].sort((a, b) => b.overallEfficiency - a.overallEfficiency).slice(0, 3);
  const needsAttention = engineerStats.filter(e => e.overallEfficiency < 50 && (e.totalTasks > 0 || e.totalProjects > 0));

  return (
    <div className="min-h-screen bg-background" data-testid="page-skill-matrix">
      <header className="sticky top-0 z-50 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
                <Award className="h-5 w-5" />
              </div>
              <span className="hidden font-semibold text-lg sm:inline-block">
                Skill Matrix & Performance
              </span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-skill-matrix-title">
            Team Skill Matrix
          </h1>
          <p className="text-muted-foreground">
            Track engineer performance, task completion rates, and identify skill levels at a glance.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Summary Cards - Easy to understand metrics */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card data-testid="card-team-size">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Engineers</p>
                      <p className="text-3xl font-bold" data-testid="value-total-engineers">{engineerStats.length}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-team-efficiency">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Team Efficiency</p>
                      <p className="text-3xl font-bold" data-testid="value-team-efficiency">{teamAverageEfficiency}%</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Zap className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>
                  <Progress value={teamAverageEfficiency} className="mt-3 h-2" />
                </CardContent>
              </Card>

              <Card data-testid="card-top-performers">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Top Performers</p>
                      <p className="text-3xl font-bold" data-testid="value-top-performers-count">{topPerformers.filter(e => e.overallEfficiency >= 75).length}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <Star className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-needs-attention">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Needs Support</p>
                      <p className="text-3xl font-bold" data-testid="value-needs-attention-count">{needsAttention.length}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center">
                      <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Performance Legend - For easy understanding */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Understanding Performance Levels
                </CardTitle>
                <CardDescription>
                  Performance is calculated based on completed tasks and on-time project deliveries
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4" data-testid="performance-legend">
                  <div className="flex items-center gap-2" data-testid="legend-expert">
                    <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                      <Award className="h-3 w-3 mr-1" />
                      Expert (90%+)
                    </Badge>
                    <span className="text-sm text-muted-foreground">Consistently exceeds expectations</span>
                  </div>
                  <div className="flex items-center gap-2" data-testid="legend-proficient">
                    <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300">
                      <Star className="h-3 w-3 mr-1" />
                      Proficient (75-89%)
                    </Badge>
                    <span className="text-sm text-muted-foreground">Reliably meets targets</span>
                  </div>
                  <div className="flex items-center gap-2" data-testid="legend-developing">
                    <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Developing (50-74%)
                    </Badge>
                    <span className="text-sm text-muted-foreground">Growing skills</span>
                  </div>
                  <div className="flex items-center gap-2" data-testid="legend-learning">
                    <Badge className="bg-gray-500/20 text-gray-700 dark:text-gray-300">
                      <Clock className="h-3 w-3 mr-1" />
                      Learning (&lt;50%)
                    </Badge>
                    <span className="text-sm text-muted-foreground">New or needs support</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Main Skill Matrix Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Engineer Performance Matrix
                </CardTitle>
                <CardDescription>
                  Complete overview of each engineer's workload, completion rates, and skill level
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Engineer</TableHead>
                      <TableHead className="text-center">Today's Tasks</TableHead>
                      <TableHead className="text-center">Completed</TableHead>
                      <TableHead className="text-center">Activities</TableHead>
                      <TableHead className="text-center">Projects</TableHead>
                      <TableHead className="text-center">Efficiency</TableHead>
                      <TableHead className="text-center">Performance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {engineerStats.map((engineer) => {
                      const PerformanceIcon = engineer.performance.icon;
                      return (
                        <TableRow key={engineer.id} data-testid={`row-engineer-${engineer.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium">
                                {engineer.initials}
                              </div>
                              <div>
                                <p className="font-medium">{engineer.name}</p>
                                <p className="text-xs text-muted-foreground">PLC Engineer</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{engineer.targetTasksCount}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
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
                              <Progress value={engineer.overallEfficiency} className="h-1.5 w-16" />
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={engineer.performance.color}>
                              <PerformanceIcon className="h-3 w-3 mr-1" />
                              {engineer.performance.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Top Performers Highlight */}
            {topPerformers.length > 0 && (
              <Card data-testid="card-top-performers-section">
                <CardHeader>
                  <div className="flex gap-3">
                    <div className="w-1 rounded-full bg-emerald-500 shrink-0" />
                    <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                      <Award className="h-5 w-5" />
                      Top Performers This Period
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {topPerformers.map((engineer, index) => (
                      <div 
                        key={engineer.id} 
                        className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20"
                        data-testid={`top-performer-${index}`}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold">
                          #{index + 1}
                        </div>
                        <div>
                          <p className="font-semibold" data-testid={`text-performer-name-${index}`}>{engineer.name}</p>
                          <p className="text-sm text-muted-foreground" data-testid={`text-performer-efficiency-${index}`}>{engineer.overallEfficiency}% efficiency</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Needs Attention Section */}
            {needsAttention.length > 0 && (
              <Card data-testid="card-needs-attention-section">
                <CardHeader>
                  <div className="flex gap-3">
                    <div className="w-1 rounded-full bg-amber-500 shrink-0" />
                    <div>
                      <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-5 w-5" />
                        Engineers Needing Support
                      </CardTitle>
                      <CardDescription>
                        These team members may need additional resources or training
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {needsAttention.map((engineer) => (
                      <div 
                        key={engineer.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 dark:bg-amber-500/20"
                        data-testid={`needs-attention-${engineer.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center text-sm font-medium">
                            {engineer.initials}
                          </div>
                          <span className="font-medium">{engineer.name}</span>
                        </div>
                        <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                          {engineer.overallEfficiency}% efficiency
                        </Badge>
                      </div>
                    ))}
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
