import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import { Mail, MessageSquare, ChevronRight, Pencil } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import type { TeamMember } from "@shared/schema";

interface TeamMemberCardProps {
  member: TeamMember;
}

function TeamMemberCard({ member }: TeamMemberCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(member.name);
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const initials = member.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const statusColors: Record<string, string> = {
    active: "bg-emerald-500",
    away: "bg-amber-500",
    busy: "bg-rose-500",
    offline: "bg-gray-400",
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/team-members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      if (!response.ok) throw new Error("Failed to update");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Member updated", description: "Team member name changed successfully." });
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update team member.", variant: "destructive" });
    },
  });

  return (
    <>
      <Card className="hover-elevate transition-all duration-200" data-testid={`card-team-member-${member.id}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-12 w-12 border-2 border-primary/10">
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 font-semibold text-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span 
                className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card ${statusColors[member.status] || statusColors.offline}`}
                aria-label={`Status: ${member.status}`}
              />
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate" data-testid={`text-member-name-${member.id}`}>
                {member.name}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {member.role}
              </p>
              <Badge variant="secondary" className="mt-1 text-xs">
                {member.department}
              </Badge>
            </div>

            <div className="flex gap-1">
              {isAdmin && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setEditOpen(true)}
                  data-testid={`button-edit-${member.id}`}
                  aria-label={`Edit ${member.name}`}
                  title="Admin only"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                data-testid={`button-email-${member.id}`}
                aria-label={`Email ${member.name}`}
              >
                <Mail className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                data-testid={`button-message-${member.id}`}
                aria-label={`Message ${member.name}`}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
            <DialogDescription>
              Update the team member's name below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="member-name">Name</Label>
              <Input
                id="member-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter member name"
                data-testid={`input-edit-name-${member.id}`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditOpen(false)}
              data-testid={`button-cancel-edit-${member.id}`}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => updateMutation.mutate()}
              disabled={!editName.trim() || updateMutation.isPending}
              data-testid={`button-save-edit-${member.id}`}
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TeamMemberSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface TeamSectionProps {
  members: TeamMember[];
  isLoading: boolean;
}

export function TeamSection({ members, isLoading }: TeamSectionProps) {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold" data-testid="text-team-members">Team Members</h2>
        <Button variant="ghost" size="sm" className="gap-1" data-testid="button-view-all-members">
          View All
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <TeamMemberSkeleton key={i} />)
          : members.map((member) => <TeamMemberCard key={member.id} member={member} />)
        }
      </div>
    </section>
  );
}
