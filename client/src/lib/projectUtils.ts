// client/src/lib/projectUtils.ts
// Shared utilities for deduplication and validation used by
// Projects Overview, Analytics Dashboard, and Project Activity Log pages.

import type { Engineer, ProjectMasterEntry } from "../hooks/useMasterData";

// ─── Types shared across pages ────────────────────────────────────────────────

export interface ProjectAssignment {
  id: number;
  projectName: string;
  engineerName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  assignedDays: number;
  remainingDays: number;
  status: string;
  notes: string;
}

export interface ProjectActivity {
  projectName: string;
  currentStatus: string;
  activities: Record<string, string>;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Remove duplicate engineer names from any list, validated against master list.
 * Returns only names that appear in engineers_master_list.json (case-insensitive).
 */
export function getValidUniqueEngineers(
  names: string[],
  masterList: Engineer[]
): string[] {
  const masterSet = new Set(masterList.map((e) => e.name.trim().toLowerCase()));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (masterSet.has(key) && !seen.has(key)) {
      seen.add(key);
      result.push(name.trim());
    }
  }
  return result;
}

/**
 * Remove duplicate project names, validated against project_master_list.json.
 * If masterList is empty (initial state), all unique project names pass through.
 */
export function getValidUniqueProjects(
  projectNames: string[],
  masterList: ProjectMasterEntry[]
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of projectNames) {
    const key = name.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(name.trim());
    }
  }
  return result;
}

/**
 * Build a deduplicated "Projects Overview" list from raw data.json assignments.
 * Each project appears once; engineers list per project is deduplicated and master-validated.
 */
export function buildProjectsOverview(
  assignments: ProjectAssignment[],
  engineerMaster: Engineer[],
  projectMaster: ProjectMasterEntry[]
): Array<{
  projectName: string;
  projectNumber: string | null;
  engineers: string[];
  status: string;
  latestEnd: string;
  registeredInMaster: boolean;
}> {
  const engineerMasterSet = new Set(engineerMaster.map((e) => e.name.trim().toLowerCase()));

  const projectMap = new Map<string, {
    projectName: string;
    projectNumber: string | null;
    engineers: Set<string>;
    status: string;
    latestEnd: string;
  }>();

  for (const a of assignments) {
    const key = a.projectName.trim().toLowerCase();
    if (!projectMap.has(key)) {
      projectMap.set(key, {
        projectName: a.projectName.trim(),
        projectNumber: extractProjectNumber(a.projectName),
        engineers: new Set(),
        status: a.status,
        latestEnd: a.endDate,
      });
    }
    const entry = projectMap.get(key)!;
    const engKey = a.engineerName.trim().toLowerCase();
    if (engineerMasterSet.has(engKey)) {
      entry.engineers.add(a.engineerName.trim());
    }
    if (a.endDate > entry.latestEnd) entry.latestEnd = a.endDate;
    if (a.status === "In Progress") entry.status = "In Progress";
  }

  return Array.from(projectMap.values()).map((p) => ({
    projectName: p.projectName,
    projectNumber: p.projectNumber,
    engineers: Array.from(p.engineers),
    status: p.status,
    latestEnd: p.latestEnd,
    registeredInMaster: p.projectNumber
      ? projectMaster.some(
          (m) => m.projectNumber.trim().toLowerCase() === p.projectNumber!.trim().toLowerCase()
        )
      : false,
  }));
}

/**
 * Build analytics summary entirely on the client from raw data.
 * Used as a fallback if /api/analytics is not yet deployed.
 */
export function buildAnalyticsSummary(
  assignments: ProjectAssignment[],
  activities: ProjectActivity[],
  engineerMaster: Engineer[]
) {
  const engineerMasterSet = new Set(engineerMaster.map((e) => e.name.trim().toLowerCase()));

  const projectSet = new Set(assignments.map((a) => a.projectName.trim()));
  const engineerSet = new Set(
    assignments
      .map((a) => a.engineerName.trim())
      .filter((n) => engineerMasterSet.has(n.toLowerCase()))
  );

  const statusBreakdown: Record<string, number> = {};
  assignments.forEach((a) => {
    statusBreakdown[a.status] = (statusBreakdown[a.status] ?? 0) + 1;
  });

  const workloadMap = new Map<string, { projectCount: number; assignedDays: number }>();
  assignments.forEach((a) => {
    const eng = a.engineerName.trim();
    if (!engineerMasterSet.has(eng.toLowerCase())) return;
    const prev = workloadMap.get(eng) ?? { projectCount: 0, assignedDays: 0 };
    workloadMap.set(eng, {
      projectCount: prev.projectCount + 1,
      assignedDays: prev.assignedDays + (a.assignedDays ?? 0),
    });
  });

  const recentActivity: Array<{ projectName: string; date: string; activity: string }> = [];
  activities.forEach((proj) => {
    Object.entries(proj.activities).forEach(([date, activity]) => {
      recentActivity.push({ projectName: proj.projectName, date, activity });
    });
  });
  recentActivity.sort((a, b) => b.date.localeCompare(a.date));

  return {
    totalProjects: projectSet.size,
    totalEngineers: engineerSet.size,
    statusBreakdown,
    engineerWorkload: Array.from(workloadMap.entries()).map(([name, s]) => ({ name, ...s })),
    recentActivity: recentActivity.slice(0, 20),
    projectList: Array.from(projectSet),
    engineerList: Array.from(engineerSet),
  };
}

/**
 * Deduplicate project activities — merge duplicate projectName entries.
 */
export function deduplicateActivities(activities: ProjectActivity[]): ProjectActivity[] {
  const map = new Map<string, ProjectActivity>();
  for (const entry of activities) {
    const key = entry.projectName.trim().toLowerCase();
    if (map.has(key)) {
      const existing = map.get(key)!;
      existing.activities = { ...existing.activities, ...entry.activities };
    } else {
      map.set(key, { ...entry, activities: { ...entry.activities } });
    }
  }
  return Array.from(map.values());
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Extract leading project number from a project name string. */
export function extractProjectNumber(projectName: string): string | null {
  const match = projectName.trim().match(/^(\d[A-Z0-9]+-[A-Z0-9]+-\d{5,}|[A-Z0-9]+-\d{5,})/i);
  return match ? match[1].trim() : null;
}
