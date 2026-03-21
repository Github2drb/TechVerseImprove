import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Plus, Trash2, Target, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import type { TeamMember } from "@shared/schema";

interface EngineerTaskConfig {
  id: string;
  name: string;
  initials: string;
}

interface EngineerTask {
  engineerName: string;
  planned: number;
  completed: number;
  inProgress: number;
  tasks: Array<{
    projectId: string;
    projectName: string;
    completed: boolean;
  }>;
  customActivities: Array<{ id: string; text: string; date: string }>;
  targetTasks: Array<{ id: string; text: string; date: string }>;
}

interface PendingTask {
  id: string;
  text: string;
  date: string;
}

interface EngineerDailyTasksProps {
  teamMembers: TeamMember[];
  isLoading: boolean;
}

export function EngineerDailyTasks({ teamMembers, isLoading }: EngineerDailyTasksProps) {
  const [selectedEngineer, setSelectedEngineer] = useState<string | null>(null);
  const [newActivity, setNewActivity] = useState("");
  const [newTargetTask, setNewTargetTask] = useState("");
  const [taskStatus, setTaskStatus] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: engineerConfig = [], isLoading: configLoading } = useQuery<EngineerTaskConfig[]>({
    queryKey: ["/api/engineer-daily-tasks-config"],
  });

  const { data: engineerTasks = [] } = useQuery<EngineerTask[]>({
    queryKey: ["/api/engineer-daily-tasks"],
    enabled: !isLoading,
  });

  const { data: pendingTasks = [] } = useQuery<PendingTask[]>({
    queryKey: ["/api/pending-tasks", selectedEngineer],
    enabled: !!selectedEngineer,
  });

  const initializeConfigMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/engineer-daily-tasks-config/initialize");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engineer-daily-tasks-config"] });
      toast({ title: "Engineer config initialized successfully" });
    },
    onError: () => {
      toast({ title: "Failed to initialize config", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!configLoading && engineerConfig.length === 0) {
      initializeConfigMutation.mutate();
    }
  }, [configLoading, engineerConfig.length]);

  const getEngineerData = (name: string) => {
    const taskData = engineerTasks.find(
      t => t.engineerName.toLowerCase() === name.toLowerCase()
    );
    return {
      taskCount: taskData?.planned || 0,
      completed: taskData?.completed || 0,
    };
  };

  const addActivityMutation = useMutation({
    mutationFn: async ({ engineerName, activity }: { engineerName: string; activity: string }) => {
      const date = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/engineer-daily-activities/${engineerName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity, date }),
      });
      if (!response.ok) throw new Error("Failed to add activity");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engineer-daily-tasks"] });
      setNewActivity("");
      toast({ title: "Activity added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add activity", variant: "destructive" });
    },
  });

  const deleteActivityMutation = useMutation({
    mutationFn: async ({ engineerName, activityId }: { engineerName: string; activityId: string }) => {
      const date = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/engineer-daily-activities/${engineerName}/${activityId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!response.ok) throw new Error("Failed to delete activity");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engineer-daily-tasks"] });
      toast({ title: "Activity deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete activity", variant: "destructive" });
    },
  });

  const addTargetTaskMutation = useMutation({
    mutationFn: async ({ engineerName, task }: { engineerName: string; task: string }) => {
      const date = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/engineer-target-tasks/${engineerName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, date }),
      });
      if (!response.ok) throw new Error("Failed to add target task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engineer-daily-tasks"] });
      setNewTargetTask("");
      toast({ title: "Target task added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add target task", variant: "destructive" });
    },
  });

  const deleteTargetTaskMutation = useMutation({
    mutationFn: async ({ engineerName, taskId }: { engineerName: string; taskId: string }) => {
      const date = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/engineer-target-tasks/${engineerName}/${taskId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!response.ok) throw new Error("Failed to delete target task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engineer-daily-tasks"] });
      toast({ title: "Target task deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete target task", variant: "destructive" });
    },
  });

  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Engineer Daily Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-10 bg-muted rounded-md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Collect all target tasks from all engineers for today
  const allTodayTargetTasks = engineerTasks.flatMap(engineer => 
    (engineer.targetTasks || []).map(task => ({
      ...task,
      engineerName: engineer.engineerName,
      projects: engineer.tasks || []
    }))
  );

  return (
    <Card className="border-l-4 border-l-primary" data-testid="card-engineer-daily-tasks">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Engineer Daily Tasks - {dateString}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* All Engineers Summary Grid - Only from Master List */}
          <div>
            <p className="text-sm font-medium mb-2">All Engineers</p>
            {configLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                {engineerConfig.map((engineer) => {
                  const data = getEngineerData(engineer.name);
                  const isActive = selectedEngineer === engineer.name;

                  return (
                    <Card
                      key={engineer.id}
                      className={`hover-elevate cursor-pointer transition-all ${isActive ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setSelectedEngineer(isActive ? null : engineer.name)}
                      data-testid={`card-engineer-${engineer.id}`}
                    >
                      <CardContent className="flex flex-col items-center justify-center p-2 gap-1">
                        <Avatar className="h-8 w-8 bg-muted">
                          <AvatarFallback className="text-xs font-medium">
                            {engineer.initials}
                          </AvatarFallback>
                        </Avatar>
                        <p className="font-medium text-xs truncate max-w-[70px] text-center" data-testid={`text-engineer-name-${engineer.id}`}>
                          {engineer.name}
                        </p>
                        <Badge variant="secondary" className="text-[10px] px-1 py-0" data-testid={`badge-tasks-${engineer.id}`}>
                          {data.completed}/{data.taskCount}
                        </Badge>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Admin: Add Activity Form */}
          {selectedEngineer && (
            <div className="bg-muted/50 p-3 rounded-md space-y-2">
              <label className="text-sm font-medium">Add Completed Activity for {selectedEngineer}</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter completed activity..."
                  value={newActivity}
                  onChange={(e) => setNewActivity(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && newActivity.trim()) {
                      addActivityMutation.mutate({
                        engineerName: selectedEngineer,
                        activity: newActivity,
                      });
                    }
                  }}
                  data-testid="input-new-activity"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (newActivity.trim()) {
                      addActivityMutation.mutate({
                        engineerName: selectedEngineer,
                        activity: newActivity,
                      });
                    }
                  }}
                  disabled={!newActivity.trim() || addActivityMutation.isPending}
                  data-testid="button-add-activity"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          )}

          {/* Admin: Set Target Tasks Form - Shows when engineer is selected */}
          {isAdmin && selectedEngineer && (
            <div className="bg-blue-500/10 dark:bg-blue-500/20 p-3 rounded-md space-y-2 border border-blue-500/20">
              <label className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Set Target Tasks for {selectedEngineer} (Admin Only)
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter target task..."
                  value={newTargetTask}
                  onChange={(e) => setNewTargetTask(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && newTargetTask.trim() && selectedEngineer) {
                      addTargetTaskMutation.mutate({
                        engineerName: selectedEngineer,
                        task: newTargetTask,
                      });
                    }
                  }}
                  data-testid="input-target-task"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (newTargetTask.trim() && selectedEngineer) {
                      addTargetTaskMutation.mutate({
                        engineerName: selectedEngineer,
                        task: newTargetTask,
                      });
                    }
                  }}
                  disabled={!newTargetTask.trim() || addTargetTaskMutation.isPending}
                  data-testid="button-add-target-task"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
              
              {/* Display Selected Engineer's Target Tasks */}
              {selectedEngineer && (
                <div className="pt-3 border-t border-blue-500/20 space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">{selectedEngineer}'s Target Tasks for Today</h4>
                  {engineerTasks.find(t => t.engineerName === selectedEngineer)?.targetTasks?.length ? (
                    <div className="space-y-2">
                      {engineerTasks.find(t => t.engineerName === selectedEngineer)?.targetTasks?.map((task: any) => {
                        const projects = engineerTasks.find(t => t.engineerName === selectedEngineer)?.tasks || [];
                        const projectNames = projects.map(p => p.projectName).join(", ") || "-";
                        const status = taskStatus[task.id] || "Not Yet Started";
                        
                        return (
                          <div key={task.id} className="grid grid-cols-4 gap-2 p-2 bg-blue-500/10 dark:bg-blue-500/20 rounded items-center" data-testid={`target-task-${task.id}`}>
                            <div className="text-xs text-muted-foreground truncate">{projectNames}</div>
                            <div className="text-xs text-blue-700 dark:text-blue-300 truncate">{task.text}</div>
                            <Select value={status} onValueChange={(value) => setTaskStatus({ ...taskStatus, [task.id]: value })}>
                              <SelectTrigger className="h-8 text-xs" data-testid={`select-status-${task.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Not Yet Started">Not Yet Started</SelectItem>
                                <SelectItem value="In progress">In progress</SelectItem>
                                <SelectItem value="Completed">Completed</SelectItem>
                                <SelectItem value="Aborted">Aborted</SelectItem>
                                <SelectItem value="Diverted to Another">Diverted to Another</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => deleteTargetTaskMutation.mutate({ engineerName: selectedEngineer, taskId: task.id })}
                              data-testid={`button-delete-target-${task.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No target tasks set for {selectedEngineer} yet</p>
                  )}
                </div>
              )}
            </div>
          )}


          {/* Selected Engineer's Pending Tasks from Previous Days */}
          {selectedEngineer && pendingTasks.length > 0 && (
            <div className="border-t pt-3 space-y-2 bg-orange-500/10 dark:bg-orange-500/20 p-3 rounded">
              <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                <span className="text-lg">⚠️</span> Pending Tasks from Previous Days
              </h4>
              <div className="space-y-2">
                {pendingTasks.map((task) => (
                  <div key={task.id} className="p-2 bg-orange-500/20 dark:bg-orange-500/30 rounded text-xs" data-testid={`pending-task-${task.id}`}>
                    <div className="text-orange-800 dark:text-orange-300 break-words">
                      <span className="font-semibold">{task.date}:</span> {task.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected Engineer's Target Tasks */}
          {selectedEngineer && (
            <div className="border-t pt-3 space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">{selectedEngineer}'s Target Tasks for Today</h4>
              {engineerTasks.find(t => t.engineerName === selectedEngineer)?.targetTasks?.length ? (
                <div className="space-y-3">
                  {engineerTasks.find(t => t.engineerName === selectedEngineer)?.targetTasks?.map((task: any) => {
                    const projects = engineerTasks.find(t => t.engineerName === selectedEngineer)?.tasks || [];
                    const projectNames = projects.map(p => p.projectName).join(", ") || "-";
                    const status = taskStatus[task.id] || "Not Yet Started";
                    
                    return (
                      <div key={task.id} className="p-3 bg-blue-500/10 dark:bg-blue-500/20 rounded space-y-2" data-testid={`target-task-${task.id}`}>
                        <div className="text-xs font-medium text-muted-foreground text-left">
                          <span className="font-semibold">Project:</span> {projectNames}
                        </div>
                        <div className="text-xs text-blue-700 dark:text-blue-300 text-left whitespace-normal break-words">
                          <span className="font-semibold">Task:</span> {task.text}
                        </div>
                        <div className="flex gap-2 items-center">
                          <Select value={status} onValueChange={(value) => setTaskStatus({ ...taskStatus, [task.id]: value })}>
                            <SelectTrigger className="h-8 text-xs flex-1" data-testid={`select-status-${task.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Not Yet Started">Not Yet Started</SelectItem>
                              <SelectItem value="In progress">In progress</SelectItem>
                              <SelectItem value="Completed">Completed</SelectItem>
                              <SelectItem value="Aborted">Aborted</SelectItem>
                              <SelectItem value="Diverted to Another">Diverted to Another</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => deleteTargetTaskMutation.mutate({ engineerName: selectedEngineer, taskId: task.id })}
                            data-testid={`button-delete-target-${task.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No target tasks set for {selectedEngineer} yet</p>
              )}
            </div>
          )}

          {/* Selected Engineer's Custom Activities */}
          {selectedEngineer && engineerTasks.find(t => t.engineerName === selectedEngineer)?.customActivities?.length ? (
            <div className="border-t pt-3 space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">{selectedEngineer}'s Custom Activities</h4>
              <div className="space-y-2" data-testid="custom-activities-list">
                {engineerTasks.find(t => t.engineerName === selectedEngineer)?.customActivities?.map((activity: any) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/10 dark:bg-emerald-500/20 group"
                    data-testid={`custom-activity-${activity.id}`}
                  >
                    <span className="text-sm flex-1 text-emerald-700 dark:text-emerald-300">{activity.text}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                      onClick={() => deleteActivityMutation.mutate({ engineerName: selectedEngineer, activityId: activity.id })}
                      data-testid={`button-delete-activity-${activity.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
