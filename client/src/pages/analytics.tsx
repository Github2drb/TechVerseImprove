import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowLeft, TrendingUp, Users, FolderKanban, BarChart3, Briefcase, Calendar } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import type { AnalyticsData } from "@shared/schema";

interface EngineerProject {
  projectName: string;
  status: string;
  scopeOfWork: string;
}

interface EngineerWorkload {
  name: string;
  projects: EngineerProject[];
  projectCount: number;
}

interface EngineerWorkloadData {
  currentMonth: string;
  nextMonth: string;
  engineers: EngineerWorkload[];
  totalEngineers: number;
  totalAssignments: number;
}

function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('complete') || statusLower.includes('done') || statusLower.includes('dispatch')) {
    return "bg-green-500/20 text-green-700 dark:text-green-300";
  }
  if (statusLower.includes('design')) {
    return "bg-purple-500/20 text-purple-700 dark:text-purple-300";
  }
  if (statusLower.includes('procurement')) {
    return "bg-orange-500/20 text-orange-700 dark:text-orange-300";
  }
  if (statusLower.includes('mechanical')) {
    return "bg-blue-500/20 text-blue-700 dark:text-blue-300";
  }
  if (statusLower.includes('electrical')) {
    return "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300";
  }
  if (statusLower.includes('plc')) {
    return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300";
  }
  if (statusLower.includes('io')) {
    return "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300";
  }
  if (statusLower.includes('trial')) {
    return "bg-pink-500/20 text-pink-700 dark:text-pink-300";
  }
  return "bg-gray-500/20 text-gray-700 dark:text-gray-300";
}

function ChartSkeleton() {
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

export default function Analytics() {
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics"],
  });

  const { data: workloadData, isLoading: isLoadingWorkload } = useQuery<EngineerWorkloadData>({
    queryKey: ["/api/analytics/engineer-workload"],
  });

  return (
    <div className="min-h-screen bg-background" data-testid="page-analytics">
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
                D
              </div>
              <span className="hidden font-semibold text-lg sm:inline-block">
                Analytics Dashboard
              </span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-analytics-title">
            Analytics & Reports
          </h1>
          <p className="text-muted-foreground">
            Track project performance, team productivity, and completion trends.
          </p>
        </div>

        {/* Engineer Workload Section - At Top */}
        <Card data-testid="chart-engineer-workload">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Engineer Project Assignments
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {workloadData?.currentMonth} - {workloadData?.nextMonth}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingWorkload ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : workloadData?.engineers && workloadData.engineers.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span>{workloadData.totalEngineers} Engineers</span>
                  <span>{workloadData.totalAssignments} Total Assignments</span>
                </div>
                <ScrollArea className="h-[500px]">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {workloadData.engineers.map((engineer) => (
                      <Card key={engineer.name} className="border" data-testid={`card-engineer-${engineer.name}`}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center justify-between gap-2">
                            <span className="truncate" title={engineer.name}>{engineer.name}</span>
                            <Badge variant="secondary" className="shrink-0">
                              {engineer.projectCount} projects
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-3">
                            {engineer.projects.map((project, idx) => (
                              <div key={idx} className="border-l-2 border-primary/30 pl-3 py-1">
                                <div className="flex items-start gap-2">
                                  <Badge 
                                    className={`text-xs shrink-0 ${getStatusColor(project.status)}`}
                                  >
                                    {project.status}
                                  </Badge>
                                </div>
                                <p className="text-sm font-medium mt-1 break-words whitespace-normal">
                                  {project.projectName}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1 break-words whitespace-normal">
                                  <span className="font-medium">Scope:</span> {project.scopeOfWork}
                                </p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No engineer assignments found</p>
              </div>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <ChartSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <Card data-testid="chart-projects-status">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FolderKanban className="h-5 w-5" />
                    Projects by Status
                  </CardTitle>
                  <CardDescription>
                    Distribution of projects across different statuses
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics?.projectsByStatus}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="count"
                          nameKey="status"
                          label={({ status, count }) => `${status}: ${count}`}
                        >
                          {analytics?.projectsByStatus.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-3 mt-4">
                    {analytics?.projectsByStatus.map((item) => (
                      <Badge 
                        key={item.status} 
                        variant="secondary" 
                        className="gap-2"
                        style={{ borderLeftColor: item.color, borderLeftWidth: 3 }}
                      >
                        {item.status}: {item.count}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="chart-projects-priority">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Projects by Priority
                  </CardTitle>
                  <CardDescription>
                    Priority distribution across all projects
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics?.projectsByPriority}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="priority" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {analytics?.projectsByPriority.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card data-testid="chart-monthly-progress">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Monthly Progress Overview
                </CardTitle>
                <CardDescription>
                  Track project completion trends over the past months
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics?.monthlyProgress}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="completed" 
                        stackId="1"
                        stroke="#22c55e" 
                        fill="#22c55e" 
                        fillOpacity={0.6}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="inProgress" 
                        stackId="1"
                        stroke="#3b82f6" 
                        fill="#3b82f6" 
                        fillOpacity={0.6}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="pending" 
                        stackId="1"
                        stroke="#f59e0b" 
                        fill="#f59e0b" 
                        fillOpacity={0.6}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Card data-testid="chart-team-performance">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Team Performance
                  </CardTitle>
                  <CardDescription>
                    Tasks completed by each team member
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics?.teamPerformance} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" className="text-xs" />
                        <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                          formatter={(value, name) => [value, 'Tasks Completed']}
                        />
                        <Bar dataKey="tasksCompleted" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="chart-completion-trend">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Completion Rate Trend
                  </CardTitle>
                  <CardDescription>
                    Weekly completion rate percentage
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analytics?.completionTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="week" className="text-xs" />
                        <YAxis className="text-xs" domain={[0, 100]} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                          formatter={(value) => [`${value}%`, 'Completion Rate']}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="rate" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
