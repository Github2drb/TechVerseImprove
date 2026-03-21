import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import Dashboard from "@/pages/dashboard";
import Analytics from "@/pages/analytics";
import EngineerReports from "@/pages/engineer-reports";
import TeamSheet from "@/pages/team-sheet";
import ProjectDetail from "@/pages/project-detail";
import ProjectStatus from "@/pages/project-status";
import TeamProjectTracker from "@/pages/team-project-tracker";
import SkillMatrix from "@/pages/skill-matrix";
import EngineerManagement from "@/pages/engineer-management";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/engineer-reports" component={EngineerReports} />
      <Route path="/teamsheet" component={TeamSheet} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/project-status" component={ProjectStatus} />
      <Route path="/project-tracker" component={TeamProjectTracker} />
      <Route path="/skill-matrix" component={SkillMatrix} />
      <Route path="/engineer-management" component={EngineerManagement} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Login />;
  }
  
  return <Router />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <AuthenticatedApp />
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
