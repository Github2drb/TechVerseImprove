import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import { CheckCircle2, BarChart3, Target, ArrowLeft } from "lucide-react";
import type { TeamMember } from "@shared/schema";

interface EngineerTask {
  engineerName: string;
  planned: number;
  completed: number;
  inProgress: number;
  customActivities: Array<{ id: string; text: string }>;
  targetTasks: Array<{ id: string; text: string }>;
}

export default function EngineerReports() {
  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const { data: engineerTasks = [] } = useQuery<EngineerTask[]>({
    queryKey: ["/api/engineer-daily-tasks"],
  });

  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <Header searchQuery="" onSearchChange={() => {}} />
      
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6 md:py-12">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Engineer Daily Reports</h1>
            <p className="text-muted-foreground">{dateString}</p>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-2" data-testid="button-back-to-dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>

        <div className="grid gap-4">
          {teamMembers.map((member) => {
            const tasks = engineerTasks.find(t => t.engineerName === member.name);
            const activitiesCount = tasks?.customActivities?.length || 0;

            return (
              <Card key={member.id} className="border-l-4 border-l-primary" data-testid={`report-card-${member.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{member.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{member.role} • {member.department}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="secondary" data-testid={`activities-count-${member.id}`}>
                        {activitiesCount} Activities
                      </Badge>
                      <Badge className={activitiesCount > 0 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30"}>
                        {activitiesCount > 0 ? "Active" : "No Activities"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {tasks?.targetTasks && tasks.targetTasks.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        Target Tasks
                      </h4>
                      <div className="space-y-1">
                        {tasks.targetTasks.map((task: any) => (
                          <div
                            key={task.id}
                            className="flex items-start gap-2 p-1.5 rounded-md bg-blue-500/10 dark:bg-blue-500/20"
                            data-testid={`target-${task.id}`}
                          >
                            <Target className="h-3 w-3 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-blue-700 dark:text-blue-300">{task.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {tasks?.customActivities && tasks.customActivities.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        Completed Activities
                      </h4>
                      <div className="space-y-1">
                        {tasks.customActivities.map((activity: any) => (
                          <div
                            key={activity.id}
                            className="flex items-start gap-3 p-1.5 rounded-md bg-emerald-500/10 dark:bg-emerald-500/20"
                            data-testid={`activity-${activity.id}`}
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                            <p className="text-sm text-emerald-700 dark:text-emerald-300">{activity.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : tasks?.targetTasks && tasks.targetTasks.length > 0 ? null : (
                    <div className="text-center py-6">
                      <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                      <p className="text-sm text-muted-foreground">No target tasks or activities logged yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </>
  );
}
