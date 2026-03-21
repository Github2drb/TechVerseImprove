import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, BarChart3 } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/20 py-12 md:py-16">
      <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
      
      <div className="relative mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium text-primary" data-testid="text-greeting">
              Welcome back
            </p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl" data-testid="text-hero-title">
              Controls Team Dashboard
            </h1>
            <p className="max-w-md text-muted-foreground" data-testid="text-hero-description">
              our central hub for project tracking, team collaboration, and resource management.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <Button data-testid="button-new-project">
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
            <Link href="/analytics">
              <Button variant="outline" data-testid="button-view-reports">
                <BarChart3 className="mr-2 h-4 w-4" />
                View Reports
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
