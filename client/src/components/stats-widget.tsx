import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FolderKanban, 
  Users, 
  TrendingUp, 
  Activity,
  type LucideIcon 
} from "lucide-react";
import type { DashboardStats } from "@shared/schema";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color: string;
}

function StatCard({ title, value, icon: Icon, trend, trendUp, color }: StatCardProps) {
  return (
    <Card className="hover-elevate transition-all duration-200" data-testid={`card-stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold font-mono tracking-tight">{value}</p>
            {trend && (
              <p className={`text-xs font-medium ${trendUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {trend}
              </p>
            )}
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-12 w-12 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
}

interface StatsGridProps {
  stats: DashboardStats | undefined;
  isLoading: boolean;
}

export function StatsGrid({ stats, isLoading }: StatsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const statItems = [
    {
      title: "Total Projects",
      value: stats?.totalProjects ?? 0,
      icon: FolderKanban,
      trend: "+12% from last month",
      trendUp: true,
      color: "bg-blue-500",
    },
    {
      title: "Active Members",
      value: stats?.activeMembers ?? 0,
      icon: Users,
      trend: "+3 new this week",
      trendUp: true,
      color: "bg-emerald-500",
    },
    {
      title: "Completion Rate",
      value: `${stats?.completionRate ?? 0}%`,
      icon: TrendingUp,
      trend: "+5% improvement",
      trendUp: true,
      color: "bg-violet-500",
    },
    {
      title: "Recent Activities",
      value: stats?.recentActivities ?? 0,
      icon: Activity,
      trend: "Last 24 hours",
      trendUp: true,
      color: "bg-amber-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {statItems.map((stat) => (
        <StatCard key={stat.title} {...stat} />
      ))}
    </div>
  );
}
