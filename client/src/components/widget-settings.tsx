import { useState, useEffect } from "react";
import { Settings, GripVertical, Eye, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export interface WidgetConfig {
  id: string;
  name: string;
  visible: boolean;
  order: number;
}

const defaultWidgets: WidgetConfig[] = [
  { id: "stats", name: "Statistics Overview", visible: true, order: 0 },
  { id: "navigation", name: "Quick Access Links", visible: true, order: 1 },
  { id: "projects", name: "Recent Projects", visible: false, order: 2 },
  { id: "team", name: "Team Members", visible: true, order: 3 },
];

const STORAGE_KEY = "dashboard-widgets";

export function useWidgetConfig() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return defaultWidgets;
        }
      }
    }
    return defaultWidgets;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const toggleWidget = (id: string) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
    );
  };

  const moveWidget = (id: string, direction: "up" | "down") => {
    setWidgets((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const index = sorted.findIndex((w) => w.id === id);
      
      if (direction === "up" && index > 0) {
        const temp = sorted[index].order;
        sorted[index].order = sorted[index - 1].order;
        sorted[index - 1].order = temp;
      } else if (direction === "down" && index < sorted.length - 1) {
        const temp = sorted[index].order;
        sorted[index].order = sorted[index + 1].order;
        sorted[index + 1].order = temp;
      }
      
      return sorted;
    });
  };

  const resetWidgets = () => {
    setWidgets(defaultWidgets);
  };

  const getVisibleWidgets = () => {
    return [...widgets]
      .filter((w) => w.visible)
      .sort((a, b) => a.order - b.order)
      .map((w) => w.id);
  };

  return {
    widgets,
    toggleWidget,
    moveWidget,
    resetWidgets,
    getVisibleWidgets,
  };
}

interface WidgetSettingsProps {
  widgets: WidgetConfig[];
  onToggle: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onReset: () => void;
}

export function WidgetSettings({
  widgets,
  onToggle,
  onMove,
  onReset,
}: WidgetSettingsProps) {
  const [open, setOpen] = useState(false);
  const sortedWidgets = [...widgets].sort((a, b) => a.order - b.order);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-customize">
          <Settings className="h-4 w-4 mr-2" />
          Customize
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Customize Dashboard</SheetTitle>
          <SheetDescription>
            Show, hide, or reorder dashboard widgets to personalize your view.
          </SheetDescription>
        </SheetHeader>
        
        <div className="py-6 space-y-4">
          {sortedWidgets.map((widget, index) => (
            <Card 
              key={widget.id} 
              className={`p-4 ${!widget.visible ? "opacity-60" : ""}`}
              data-testid={`widget-config-${widget.id}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onMove(widget.id, "up")}
                    disabled={index === 0}
                    data-testid={`button-move-up-${widget.id}`}
                  >
                    <span className="sr-only">Move up</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m18 15-6-6-6 6" />
                    </svg>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onMove(widget.id, "down")}
                    disabled={index === sortedWidgets.length - 1}
                    data-testid={`button-move-down-${widget.id}`}
                  >
                    <span className="sr-only">Move down</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </Button>
                </div>
                
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                
                <div className="flex-1">
                  <Label htmlFor={`toggle-${widget.id}`} className="font-medium">
                    {widget.name}
                  </Label>
                </div>
                
                <div className="flex items-center gap-2">
                  {widget.visible ? (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Switch
                    id={`toggle-${widget.id}`}
                    checked={widget.visible}
                    onCheckedChange={() => onToggle(widget.id)}
                    data-testid={`switch-${widget.id}`}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Separator />
        
        <SheetFooter className="pt-4">
          <Button 
            variant="outline" 
            onClick={onReset}
            className="w-full"
            data-testid="button-reset-widgets"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
