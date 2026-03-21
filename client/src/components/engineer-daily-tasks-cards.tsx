import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";

interface EngineerTaskConfig {
  id: string;
  name: string;
  initials: string;
}

interface EngineerDailyTask {
  engineerName: string;
  planned: number;
  completed: number;
  inProgress: number;
  tasks: Array<{
    projectId: string;
    projectName: string;
    completed: boolean;
  }>;
}

export function EngineerDailyTasksCards() {
  const { data: engineerConfig = [], isLoading: configLoading } = useQuery<EngineerTaskConfig[]>({
    queryKey: ["/api/engineer-daily-tasks-config"],
  });

  const { data: engineerTasks = [], isLoading: tasksLoading } = useQuery<EngineerDailyTask[]>({
    queryKey: ["/api/engineer-daily-tasks"],
  });

  const isLoading = configLoading || tasksLoading;

  const getEngineerData = (name: string) => {
    const taskData = engineerTasks.find(
      t => t.engineerName.toLowerCase() === name.toLowerCase()
    );
    return {
      taskCount: taskData?.planned || 0,
      completed: taskData?.completed || 0,
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (engineerConfig.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No engineers configured. Initialize the engineer daily tasks file to get started.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {engineerConfig.map((engineer) => {
        const data = getEngineerData(engineer.name);
        return (
          <Card
            key={engineer.id}
            className="hover-elevate cursor-pointer"
            data-testid={`card-engineer-${engineer.id}`}
          >
            <CardContent className="flex flex-col items-center justify-center p-4 gap-2">
              <Avatar className="h-12 w-12 bg-muted">
                <AvatarFallback className="text-sm font-medium">
                  {engineer.initials}
                </AvatarFallback>
              </Avatar>
              <div className="text-center">
                <p className="font-medium text-sm truncate max-w-[100px]" data-testid={`text-engineer-name-${engineer.id}`}>
                  {engineer.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.taskCount} tasks
                </p>
              </div>
              <Badge variant="secondary" className="text-xs" data-testid={`badge-tasks-${engineer.id}`}>
                {data.completed}/{data.taskCount}
              </Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
