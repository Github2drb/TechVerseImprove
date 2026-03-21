import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { 
  ArrowLeft, 
  Calendar, 
  Send, 
  AtSign,
  MessageSquare,
  CheckCircle2,
  Clock,
  AlertTriangle
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { Project, Comment, TeamMember } from "@shared/schema";

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
  in_progress: { label: "In Progress", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20", icon: Clock },
  at_risk: { label: "At Risk", color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20", icon: AlertTriangle },
  pending: { label: "Pending", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", icon: Clock },
};

const priorityColors: Record<string, string> = {
  high: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

function CommentCard({ comment }: { comment: Comment }) {
  const initials = comment.authorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const renderContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span key={i} className="text-primary font-medium">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex gap-3" data-testid={`comment-${comment.id}`}>
      <Avatar className="h-8 w-8 mt-0.5">
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{comment.authorName}</span>
          <span className="text-xs text-muted-foreground">{comment.createdAt}</span>
        </div>
        <p className="text-sm text-foreground">{renderContent(comment.content)}</p>
      </div>
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="flex gap-3">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = params.id || "";
  
  const [commentText, setCommentText] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: comments = [], isLoading: commentsLoading } = useQuery<Comment[]>({
    queryKey: ["/api/projects", projectId, "comments"],
    enabled: !!projectId,
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const mentions = content.match(/@(\w+)/g)?.join(",") || "";
      await apiRequest("POST", `/api/projects/${projectId}/comments`, {
        content,
        authorId: "current-user",
        authorName: "You",
        createdAt: "Just now",
        mentions,
      });
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "comments"] });
    },
  });

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const position = e.target.selectionStart || 0;
    setCommentText(value);
    setCursorPosition(position);

    const textBeforeCursor = value.slice(0, position);
    const lastAtSymbol = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtSymbol !== -1 && !textBeforeCursor.slice(lastAtSymbol).includes(" ")) {
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (name: string) => {
    const textBeforeCursor = commentText.slice(0, cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf("@");
    const textAfterCursor = commentText.slice(cursorPosition);
    
    const newText = textBeforeCursor.slice(0, lastAtSymbol) + `@${name.split(" ")[0]} ` + textAfterCursor;
    setCommentText(newText);
    setMentionOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (commentText.trim()) {
      addCommentMutation.mutate(commentText.trim());
    }
  };

  const status = project ? statusConfig[project.status] || statusConfig.pending : statusConfig.pending;
  const StatusIcon = status.icon;

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-full max-w-7xl items-center gap-4 px-4 md:px-6">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-6 w-48" />
          </div>
        </header>
        <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-96 w-full" />
        </main>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Project Not Found</h1>
          <Link href="/">
            <Button>Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="page-project-detail">
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
              <span className="hidden font-semibold text-lg sm:inline-block truncate max-w-[200px]">
                {project.name}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
        <Card data-testid="card-project-info">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <CardTitle className="text-2xl">{project.name}</CardTitle>
                {project.description && (
                  <CardDescription className="text-base">
                    {project.description}
                  </CardDescription>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={status.color}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {status.label}
                </Badge>
                <Badge className={priorityColors[project.priority]}>
                  {project.priority.charAt(0).toUpperCase() + project.priority.slice(1)} Priority
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-mono font-medium">{project.progress}%</span>
              </div>
              <Progress value={project.progress} className="h-3" />
            </div>
            
            {project.dueDate && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Due: {project.dueDate}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-comments">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Discussion
              <Badge variant="secondary" className="ml-2">{comments.length}</Badge>
            </CardTitle>
            <CardDescription>
              Collaborate with your team. Use @mention to notify team members.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <Textarea
                  placeholder="Add a comment... Use @ to mention team members"
                  value={commentText}
                  onChange={handleCommentChange}
                  className="min-h-24 resize-none"
                  data-testid="input-comment"
                />
                <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
                  <PopoverTrigger asChild>
                    <span />
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-0" align="start" side="top">
                    <Command>
                      <CommandInput placeholder="Search team members..." />
                      <CommandList>
                        <CommandEmpty>No members found.</CommandEmpty>
                        <CommandGroup>
                          {teamMembers.map((member) => (
                            <CommandItem
                              key={member.id}
                              onSelect={() => insertMention(member.name)}
                              className="cursor-pointer"
                            >
                              <Avatar className="h-6 w-6 mr-2">
                                <AvatarFallback className="text-xs">
                                  {member.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{member.name}</span>
                                <span className="text-xs text-muted-foreground">{member.role}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center justify-between">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    const newText = commentText + "@";
                    setCommentText(newText);
                    setCursorPosition(newText.length);
                    setMentionOpen(true);
                  }}
                  data-testid="button-mention"
                >
                  <AtSign className="h-4 w-4 mr-1" />
                  Mention
                </Button>
                <Button 
                  type="submit" 
                  disabled={!commentText.trim() || addCommentMutation.isPending}
                  data-testid="button-send-comment"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {addCommentMutation.isPending ? "Sending..." : "Send"}
                </Button>
              </div>
            </form>

            <div className="border-t pt-6 space-y-4">
              {commentsLoading ? (
                Array.from({ length: 3 }).map((_, i) => <CommentSkeleton key={i} />)
              ) : comments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>No comments yet. Be the first to start the discussion!</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <CommentCard key={comment.id} comment={comment} />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
