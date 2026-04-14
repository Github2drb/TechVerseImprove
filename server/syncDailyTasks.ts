// server/syncDailyTasks.ts
// Utility: when a weekly assignment is saved/updated, push the project
// as a targetTask into daily-activities.json for every day of that week.
// This runs server-side so the sync happens even from API calls.

import { readJsonFile, writeJsonFile } from "./github";

interface DailyEntry {
  engineerName: string;
  date: string;
  targetTasks: Array<{ id: string; text: string }>;
  completedActivities: Array<{ id: string; text: string }>;
}
interface DailyActivitiesFile { engineerDailyData: DailyEntry[]; }

function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const start = new Date(weekStart + "T00:00:00");
  for (let i = 0; i < 6; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

export async function syncAssignmentToDailyActivities(assignment: {
  engineerName: string;
  projectName: string;
  weekStart: string;
  notes?: string;
  constraint?: string;
}): Promise<void> {
  if (!assignment.engineerName || !assignment.projectName || !assignment.weekStart) return;

  try {
    const f = (await readJsonFile<DailyActivitiesFile>("daily-activities.json")) ?? { engineerDailyData: [] };
    const weekDates = getWeekDates(assignment.weekStart);

    // Handle comma-separated engineer names
    const engineers = assignment.engineerName.split(",").map(n => n.trim()).filter(Boolean);
    const taskText = `[${assignment.projectName}] ${assignment.notes || assignment.constraint || "Weekly project task"}`;

    let changed = false;

    for (const engineer of engineers) {
      for (const date of weekDates) {
        const idx = f.engineerDailyData.findIndex(
          e => e.engineerName.trim().toLowerCase() === engineer.toLowerCase() && e.date === date
        );

        if (idx > -1) {
          // Check if this project task already exists
          const alreadyExists = f.engineerDailyData[idx].targetTasks.some(
            t => t.text.includes(assignment.projectName)
          );
          if (!alreadyExists) {
            f.engineerDailyData[idx].targetTasks.push({
              id: `weekly-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              text: taskText,
            });
            changed = true;
          }
        } else {
          // Create new entry for this engineer+date
          f.engineerDailyData.push({
            engineerName: engineer,
            date,
            targetTasks: [{
              id: `weekly-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              text: taskText,
            }],
            completedActivities: [],
          });
          changed = true;
        }
      }
    }

    if (changed) {
      await writeJsonFile("daily-activities.json", f, `Sync weekly tasks for: ${assignment.engineerName} – ${assignment.projectName}`);
    }
  } catch (e: any) {
    // Non-fatal — log but don't block the assignment save
    console.error("[syncAssignmentToDailyActivities]", e.message);
  }
}
