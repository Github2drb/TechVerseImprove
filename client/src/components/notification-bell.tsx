import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, Check, Clock, AlertTriangle, MessageSquare, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";

const notificationIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  deadline: Clock,
  update: FolderKanban,
  mention: MessageSquare,
  alert: AlertTriangle,
};

function NotificationItem({ notification, onMarkRead }: { notification: Notification; onMarkRead: (id: string) => void }) {
  const Icon = notificationIcons[notification.type] || Bell;
  const isRead = notification.read === "true";

  const typeColors: Record<string, string> = {
    deadline: "text-amber-500",
    update: "text-blue-500",
    mention: "text-violet-500",
    alert: "text-rose-500",
  };

  return (
    <div 
      className={`flex gap-3 p-3 hover-elevate rounded-md transition-colors cursor-pointer ${
        !isRead ? "bg-primary/5" : ""
      }`}
      onClick={() => !isRead && onMarkRead(notification.id)}
      data-testid={`notification-${notification.id}`}
    >
      <div className={`mt-0.5 ${typeColors[notification.type] || "text-muted-foreground"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 space-y-1">
        <p className={`text-sm font-medium leading-tight ${isRead ? "text-muted-foreground" : ""}`}>
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        <p className="text-xs text-muted-foreground">
          {notification.createdAt}
        </p>
      </div>
      {!isRead && (
        <div className="w-2 h-2 rounded-full bg-primary mt-2" />
      )}
    </div>
  );
}

function NotificationSkeleton() {
  return (
    <div className="flex gap-3 p-3">
      <Skeleton className="h-5 w-5 rounded" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const unreadCount = notifications.filter(n => n.read === "false").length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
              variant="destructive"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between gap-4 border-b p-3">
          <h4 className="font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-auto py-1 px-2 text-xs"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {isLoading ? (
            <div className="space-y-1 p-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <NotificationSkeleton key={i} />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="space-y-1 p-1">
              {notifications.map((notification) => (
                <NotificationItem 
                  key={notification.id} 
                  notification={notification}
                  onMarkRead={(id) => markReadMutation.mutate(id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
