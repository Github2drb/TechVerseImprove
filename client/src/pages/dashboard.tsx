import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { HeroSection } from "@/components/hero-section";
import { StatsGrid } from "@/components/stats-widget";
import { EngineerDailyTasks } from "@/components/engineer-daily-tasks";
import { NavigationCards } from "@/components/navigation-cards";
import { TeamSection } from "@/components/team-section";
import { ProjectPreview } from "@/components/project-preview";
import { WidgetSettings, useWidgetConfig } from "@/components/widget-settings";
import { WeeklyAssignmentsTable } from "@/components/weekly-assignments-table";
import { ManagerOverview } from "@/components/manager-overview";
import { WeeklyScheduleOverview } from "@/components/weekly-schedule-overview";
import { useAuth } from "@/components/auth-provider";
import type { DashboardStats, NavigationCard, TeamMember, Project } from "@shared/schema";

const navigationCards: NavigationCard[] = [
  {
    id: "project-assignment",
    title: "Team Project Tracker",
    description: "View all projects with assigned engineers. Track resource allocation and deadlines.",
    icon: "clipboard-list",
    href: "/project-tracker",
    status: "active",
    gradient: "bg-gradient-to-br from-blue-500 to-blue-600",
  },
  {
    id: "skill-matrix",
    title: "Skill Matrix",
    description: "Track engineer performance, efficiency ratings, and identify skill levels.",
    icon: "award",
    href: "/skill-matrix",
    status: "active",
    gradient: "bg-gradient-to-br from-amber-500 to-amber-600",
  },
  {
    id: "project-status",
    title: "Project Activity Log",
    description: "Daily project activity tracking. See what's happening on each project.",
    icon: "clipboard-list",
    href: "/project-status",
    status: "active",
    gradient: "bg-gradient-to-br from-orange-500 to-orange-600",
  },
  {
    id: "analytics",
    title: "Analytics Dashboard",
    description: "Charts and insights for project performance and team productivity.",
    icon: "bar-chart",
    href: "/analytics",
    status: "active",
    gradient: "bg-gradient-to-br from-violet-500 to-violet-600",
  },
  {
    id: "reports",
    title: "Daily Reports",
    description: "View all engineers' completed activities and daily task summaries.",
    icon: "bar-chart",
    href: "/engineer-reports",
    status: "active",
    gradient: "bg-gradient-to-br from-indigo-500 to-indigo-600",
  },
  {
    id: "team-sheet",
    title: "Team Excel Sheet",
    description: "Access and update the shared team spreadsheet with project data.",
    icon: "file-spreadsheet",
    href: "/teamsheet/",
    status: "active",
    gradient: "bg-gradient-to-br from-emerald-500 to-emerald-600",
  },
];

const adminNavigationCard: NavigationCard = {
  id: "engineer-management",
  title: "Engineer Management",
  description: "Add, edit, or remove engineer login credentials. Admin only.",
  icon: "users",
  href: "/engineer-management",
  status: "active",
  gradient: "bg-gradient-to-br from-rose-500 to-rose-600",
};

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const { user, isAdmin } = useAuth();
  const { widgets, toggleWidget, moveWidget, resetWidgets, getVisibleWidgets } = useWidgetConfig();

  // Add admin-only navigation card
  const allNavigationCards = useMemo(() => {
    if (isAdmin) {
      return [...navigationCards, adminNavigationCard];
    }
    return navigationCards;
  }, [isAdmin]);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/stats"],
  });

  const { data: teamMembers = [], isLoading: teamLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  interface EngineerTask {
    engineerName: string;
    planned: number;
    completed: number;
    inProgress: number;
    customActivities: Array<{ id: string; text: string }>;
    targetTasks: Array<{ id: string; text: string }>;
  }

  const { data: engineerDailyTasks = [] } = useQuery<EngineerTask[]>({
    queryKey: ["/api/engineer-daily-tasks"],
  });

  const filteredMembers = teamMembers.filter(
    (member) =>
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const visibleWidgets = getVisibleWidgets();

  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case "stats":
        return <StatsGrid key="stats" stats={stats} isLoading={statsLoading} />;
      case "navigation":
        return <NavigationCards key="navigation" cards={allNavigationCards} />;
      case "projects":
        return (
          <ProjectPreview
            key="projects"
            projects={searchQuery ? filteredProjects : projects}
            isLoading={projectsLoading}
          />
        );
      case "team":
        return (
          <TeamSection
            key="team"
            members={searchQuery ? filteredMembers : teamMembers}
            isLoading={teamLoading}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-dashboard">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      
      <HeroSection />
      
      <main className="mx-auto max-w-7xl space-y-12 px-4 py-8 md:px-6 md:py-12">
        <div className="flex justify-end">
          <WidgetSettings
            widgets={widgets}
            onToggle={toggleWidget}
            onMove={moveWidget}
            onReset={resetWidgets}
          />
        </div>

        <ManagerOverview />
        
        {visibleWidgets.includes("navigation") && renderWidget("navigation")}

        <WeeklyScheduleOverview />
        
        <WeeklyAssignmentsTable teamMembers={teamMembers} />


        <EngineerDailyTasks teamMembers={teamMembers} isLoading={teamLoading} />
        
        {visibleWidgets.filter(w => w !== "navigation").map((widgetId) => renderWidget(widgetId))}
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-muted-foreground" data-testid="text-footer-copyright">
              2024 DRB TechVerse. All rights reserved.
            </p>
            <div className="flex gap-4">
              <a 
                href="#" 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-privacy"
              >
                Privacy
              </a>
              <a 
                href="#" 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-terms"
              >
                Terms
              </a>
              <a 
                href="#" 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-contact"
              >
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
