import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ClipboardList, FileSpreadsheet, BarChart2, BookOpen } from "lucide-react";
import type { NavigationCard } from "@shared/schema";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "clipboard-list": ClipboardList,
  "file-spreadsheet": FileSpreadsheet,
  "bar-chart": BarChart2,
  "book-open": BookOpen,
};

interface NavCardProps {
  card: NavigationCard;
}

function NavCard({ card }: NavCardProps) {
  const Icon = iconMap[card.icon] || ClipboardList;
  const isDisabled = card.status === "coming_soon";

  const cardContent = (
    <Card 
      className={`group relative overflow-visible transition-all duration-300 ${
        isDisabled 
          ? "opacity-70" 
          : "hover-elevate cursor-pointer"
      }`}
      data-testid={`card-nav-${card.id}`}
      aria-disabled={isDisabled}
    >
      <div className={`absolute inset-0 opacity-0 transition-opacity duration-300 ${!isDisabled && "group-hover:opacity-100"} ${card.gradient} rounded-md`} />
      <CardHeader className="relative flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.gradient}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <Badge 
          variant={card.status === "active" ? "default" : "secondary"}
          className={card.status === "active" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : ""}
        >
          {card.status === "active" ? "Active" : "Coming Soon"}
        </Badge>
      </CardHeader>
      <CardContent className="relative space-y-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          {card.title}
          {!isDisabled && (
            <ArrowUpRight className="h-4 w-4 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          )}
        </CardTitle>
        <CardDescription className="line-clamp-2">
          {card.description}
        </CardDescription>
      </CardContent>
    </Card>
  );

  if (isDisabled) {
    return (
      <div 
        className="pointer-events-none select-none" 
        aria-disabled="true"
        role="article"
        data-testid={`card-nav-disabled-${card.id}`}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <a 
      href={card.href} 
      target={card.href.startsWith("http") ? "_blank" : undefined}
      rel={card.href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
      data-testid={`link-nav-${card.id}`}
    >
      {cardContent}
    </a>
  );
}

interface NavigationCardsProps {
  cards: NavigationCard[];
}

export function NavigationCards({ cards }: NavigationCardsProps) {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold" data-testid="text-quick-access">Quick Access</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <NavCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}
