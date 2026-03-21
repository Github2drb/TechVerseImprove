import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronRight, Calendar, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import type { Project } from "@shared/schema";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ComponentType<{ className?: string }> }> = {
  completed: { label: "Completed", variant: "default", icon: CheckCircle2 },
  in_progress: { label: "In Progress", variant: "secondary", icon: Clock },
  at_risk: { label: "At Risk", variant: "destructive", icon: AlertCircle },
  pending: { label: "Pending", variant: "outline", icon: Clock },
};

const priorityColors: Record<string, string> = {
  high: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

interface ProjectCardProps {
  project: Project;
}

function ProjectCard({ project }: ProjectCardProps) {
  const status = statusConfig[project.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <Link href={`/projects/${project.id}`}>
      <Card 
        className="hover-elevate transition-all duration-200 cursor-pointer" 
        data-testid={`card-project-${project.id}`}
      >
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="font-semibold truncate" data-testid={`text-project-name-${project.id}`}>
                {project.name}
              </p>
              {project.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {project.description}
                </p>
              )}
            </div>
            <Badge className={priorityColors[project.priority]}>
              {project.priority}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-mono font-medium">{project.progress}%</span>
            </div>
            <Progress value={project.progress} className="h-2" />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <StatusIcon className="h-4 w-4" />
              <span>{status.label}</span>
            </div>
            {project.dueDate && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{project.dueDate}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ProjectCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

interface ProjectPreviewProps {
  projects: Project[];
  isLoading: boolean;
}

export function ProjectPreview({ projects, isLoading }: ProjectPreviewProps) {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold" data-testid="text-recent-projects">Recent Projects</h2>
        <Button variant="ghost" size="sm" className="gap-1" data-testid="button-view-all-projects">
          View All
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <ProjectCardSkeleton key={i} />)
          : projects
              .filter((project) => project.status !== "completed")
              .slice(0, 6)
              .map((project) => <ProjectCard key={project.id} project={project} />)
        }
      </div>
    </section>
  );
}
