import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import TeamProjectTracker from "@/pages/team-project-tracker";
import ProjectStatus from "@/pages/project-status";
import SkillMatrix from "@/pages/skill-matrix";
import Analytics from "@/pages/analytics";
import EngineerReports from "@/pages/engineer-reports";
import EngineerManagement from "@/pages/engineer-management";
import ProjectDetail from "@/pages/project-detail";
import TeamSheet from "@/pages/team-sheet";
import NotFound from "@/pages/not-found";
import { ErrorBoundary } from "@/components/error-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import DailyReport from "@/pages/daily-report";
import ISA101Page from "@/pages/ISA101Page";

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!isAuthenticated) return <Login />;
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/project-tracker" component={TeamProjectTracker} />
      <Route path="/project-status" component={ProjectStatus} />
      <Route path="/skill-matrix" component={SkillMatrix} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/engineer-reports" component={EngineerReports} />
      <Route path="/engineer-management" component={EngineerManagement} />
      <Route path="/project/:id" component={ProjectDetail} />
      <Route path="/teamsheet" component={TeamSheet} />
      <Route path="/teamsheet" component={TeamSheet} />
      <Route path="/daily-report" component={DailyReport} />  {/* ← ADD */}
      <Route path="/knowledge/isa-101-hmi-standards" component={ISA101Page} />
      <Route component={NotFound} />
    </Switch>
  );
}
<ThemeProvider>
  <ErrorBoundary>        {/* ← ADD THIS */}
    <AuthProvider>
      <AppRoutes />
      <Toaster />
    </AuthProvider>
  </ErrorBoundary>
</ThemeProvider>

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>          {/* ← ADD */}
          <ErrorBoundary>
            <AuthProvider>
              <AppRoutes />
              <Toaster />
            </AuthProvider>
          </ErrorBoundary>
        </TooltipProvider>         {/* ← ADD */}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
