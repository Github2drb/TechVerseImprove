import { Search, BookOpen, Bell, ClipboardCheck, Factory, FileSignature } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { Link, useLocation } from "wouter";
import { NotifBell } from "@/components/NotifBell";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function Header({ searchQuery, onSearchChange }: HeaderProps) {
  const [location] = useLocation();

  const navLink = (
    href: string,
    label: string,
    icon: React.ReactNode,
    iconColorClass: string,
  ) => {
    const active = location === href;
    return (
      <Link href={href}
        className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap
          ${active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
        <span className={active ? "" : iconColorClass}>{icon}</span>
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6">

        {/* Logo */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
              D
            </div>
            <span className="hidden font-semibold text-lg sm:inline-block" data-testid="text-logo">
              DRB TechVerse
            </span>
          </Link>
        </div>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {navLink("/customer-pb-indicator-form", "Customer Form", <FileSignature className="h-4 w-4" />, "text-violet-500")}
          {navLink("/project-commissioning", "Commissioning", <ClipboardCheck className="h-4 w-4" />, "text-blue-500")}
          {navLink("/project-deep-dive", "Project Deep Dive", <Factory className="h-4 w-4" />, "text-orange-500")}
          {navLink("/blog",          "Knowledge Base", <BookOpen className="h-4 w-4" />, "text-emerald-500")}
          {navLink("/notifications",  "Notifications",  <Bell className="h-4 w-4" />, "text-rose-500")}
        </nav>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search projects, team members..."
            className="pl-10 w-full"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            data-testid="input-search"
          />
        </div>

        {/* Right side icons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <NotifBell />
          <ThemeToggle />
          <UserMenu />
        </div>

      </div>
    </header>
  );
}
