// client/src/hooks/useMasterData.ts
// Fetches engineers_master_list and project_master_list from the API.
// Provides deduplication and validation helpers to all components.

import { useQuery } from "@tanstack/react-query";

export interface Engineer {
  id: string;
  name: string;
  initials: string;
}

export interface ProjectMasterEntry {
  projectNumber: string;
  projectName: string;
  createdAt: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useEngineersMaster() {
  return useQuery<Engineer[]>({
    queryKey: ["/api/engineers-master"],
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

export function useProjectsMaster() {
  return useQuery<ProjectMasterEntry[]>({
    queryKey: ["/api/projects-master"],
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Dedup helpers (client-side safety net) ───────────────────────────────────

/** Returns a deduplicated list of engineers by name (case-insensitive). */
export function deduplicateEngineers(engineers: Engineer[]): Engineer[] {
  const seen = new Set<string>();
  return engineers.filter((e) => {
    const key = e.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Returns a deduplicated list of project master entries by projectNumber. */
export function deduplicateProjects(projects: ProjectMasterEntry[]): ProjectMasterEntry[] {
  const seen = new Set<string>();
  return projects.filter((p) => {
    const key = p.projectNumber.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Check if an engineer name is valid against the master list. */
export function isValidEngineer(name: string, engineers: Engineer[]): boolean {
  return engineers.some((e) => e.name.trim().toLowerCase() === name.trim().toLowerCase());
}

/** Check if a project number is already registered. */
export function isRegisteredProject(projectNumber: string, projects: ProjectMasterEntry[]): boolean {
  return projects.some(
    (p) => p.projectNumber.trim().toLowerCase() === projectNumber.trim().toLowerCase()
  );
}
