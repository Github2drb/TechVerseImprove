import { useState } from "react";
import { LogOut, User, Shield, Settings, Briefcase, CalendarCheck, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "./auth-provider";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const roleColors: Record<string, string> = {
  admin: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  manager: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  member: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  engineer: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  stores: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
};

// ── Profile summary (attendance / projects / completion) ───────────────────
// Backed by GET /api/profile-summary/:name — see server/routes.ts.
interface ProfileProject { projectName: string; status: string; }
interface ProfileSummary {
  name: string;
  trackedAsEngineer: boolean;
  month: string;
  attendancePercent: number;
  daysPresent: number;
  workdaysCounted: number;
  projects: ProfileProject[];
  totalProjects: number;
  completedProjects: number;
  totalTasks: number;
  completedTasks: number;
  taskCompletionPercent: number;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function UserMenu() {
  const { user, login, logout } = useAuth();
  const { toast } = useToast();
  const [loginOpen, setLoginOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Profile dialog
  const [profileOpen, setProfileOpen] = useState(false);

  // Change password dialog
  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileErrored,
  } = useQuery<ProfileSummary>({
    queryKey: ["/api/profile-summary", user?.name],
    queryFn: async () => {
      const res = await fetch(`/api/profile-summary/${encodeURIComponent(user!.name)}`);
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    enabled: profileOpen && !!user,
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      await login(username, password);
      setLoginOpen(false);
      setUsername("");
      setPassword("");
      toast({
        title: "Welcome back!",
        description: "You have successfully logged in.",
      });
    } catch (error) {
      toast({
        title: "Login failed",
        description: "Invalid username or password.",
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast({
      title: "Logged out",
      description: "You have been logged out successfully.",
    });
  };

  const resetPwdForm = () => {
    setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); setPwdError("");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError("");
    if (!user) return;
    if (!currentPwd || !newPwd || !confirmPwd) {
      setPwdError("All fields are required.");
      return;
    }
    if (newPwd.length < 4) {
      setPwdError("New password must be at least 4 characters.");
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError("New password and confirmation do not match.");
      return;
    }
    setPwdSaving(true);
    try {
      // Verify the current password is actually correct before changing it —
      // reuses the existing login endpoint rather than trusting the client.
      await apiRequest("POST", "/api/auth/login", { username: user.username, password: currentPwd });
    } catch {
      setPwdError("Current password is incorrect.");
      setPwdSaving(false);
      return;
    }
    try {
      await apiRequest("POST", "/api/engineer-credentials/reset-password", {
        username: user.username,
        newPassword: newPwd,
      });
      toast({ title: "Password updated", description: "Your password has been changed successfully." });
      setPwdOpen(false);
      resetPwdForm();
    } catch {
      setPwdError("Could not update password. Please try again.");
    } finally {
      setPwdSaving(false);
    }
  };

  if (!user) {
    return (
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" data-testid="button-login">
            <User className="h-4 w-4 mr-2" />
            Sign In
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign In</DialogTitle>
            <DialogDescription>
              Enter your credentials to access your account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                data-testid="input-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                data-testid="input-password"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isLoggingIn} data-testid="button-submit-login">
                {isLoggingIn ? "Signing in..." : "Sign In"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 gap-2 px-2" data-testid="button-user-menu">
            <Avatar className="h-7 w-7 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline-block text-sm font-medium">
              {user.name.split(" ")[0]}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <Badge className={`w-fit mt-1 ${roleColors[user.role] ?? roleColors.member}`}>
                <Shield className="h-3 w-3 mr-1" />
                {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
              </Badge>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="menu-item-profile" onClick={() => setProfileOpen(true)}>
            <User className="h-4 w-4 mr-2" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="menu-item-settings" onClick={() => { resetPwdForm(); setPwdOpen(true); }}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-destructive focus:text-destructive"
            data-testid="menu-item-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Profile dialog ───────────────────────────────────────────────── */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-profile">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-9 w-9 border-2 border-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="leading-tight">{user.name}</p>
                <p className="text-xs font-normal text-muted-foreground leading-tight">
                  {user.username} · {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription>
              {profile ? `Performance summary for ${monthLabel(profile.month)}` : "Performance summary"}
            </DialogDescription>
          </DialogHeader>

          {profileLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
              Loading profile…
            </div>
          ) : profileErrored ? (
            <p className="text-sm text-muted-foreground py-4">Couldn't load profile data. Try again shortly.</p>
          ) : profile && !profile.trackedAsEngineer ? (
            <p className="text-sm text-muted-foreground py-4">
              This account isn't tracked as a field engineer, so attendance and project stats aren't available here.
            </p>
          ) : profile ? (
            <div className="space-y-5 py-1">
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium flex items-center gap-1.5">
                    <CalendarCheck className="h-3.5 w-3.5 text-emerald-500" />
                    Attendance this month
                  </span>
                  <span className="font-semibold">{profile.attendancePercent}%</span>
                </div>
                <Progress value={profile.attendancePercent} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {profile.daysPresent} / {profile.workdaysCounted} working days
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium flex items-center gap-1.5">
                    <ListChecks className="h-3.5 w-3.5 text-blue-500" />
                    Work completed
                  </span>
                  <span className="font-semibold">{profile.taskCompletionPercent}%</span>
                </div>
                <Progress value={profile.taskCompletionPercent} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {profile.completedTasks} / {profile.totalTasks} tasks · {profile.completedProjects} / {profile.totalProjects} projects completed
                </p>
              </div>

              <div>
                <p className="text-sm font-medium flex items-center gap-1.5 mb-2">
                  <Briefcase className="h-3.5 w-3.5 text-violet-500" />
                  Projects assigned ({profile.totalProjects})
                </p>
                {profile.projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No projects assigned right now.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {profile.projects.map((p) => (
                      <Badge
                        key={p.projectName}
                        variant="outline"
                        className={p.status === "completed"
                          ? "text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10 text-xs"
                          : "text-xs"}
                      >
                        {p.projectName}{p.status === "completed" ? " ✓" : ""}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Settings / change password dialog ───────────────────────────── */}
      <Dialog open={pwdOpen} onOpenChange={(open) => { setPwdOpen(open); if (!open) resetPwdForm(); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-change-password">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Update the password for your account ({user.username}).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="Enter current password"
                data-testid="input-current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Enter new password"
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="Re-enter new password"
                data-testid="input-confirm-password"
              />
            </div>
            {pwdError && (
              <p className="text-xs text-destructive" data-testid="text-password-error">{pwdError}</p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={pwdSaving} data-testid="button-submit-password">
                {pwdSaving ? "Updating..." : "Update Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
