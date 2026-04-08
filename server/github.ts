// server/github.ts
// Full GitHub integration — reads/writes all JSON files in Controls_Team_Tracker repo.
// Added: project_master_list.json read/write + deduplication helpers.

import { Octokit } from "@octokit/rest";

const OWNER = "Github2drb";
const REPO = "Controls_Team_Tracker";
const BRANCH = "main";

function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN environment variable not set");
  return new Octokit({ auth: token });
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

async function getFileSha(octokit: Octokit, path: string): Promise<string | undefined> {
  try {
    const res = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path, ref: BRANCH });
    const data = res.data as { sha: string };
    return data.sha;
  } catch {
    return undefined;
  }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const octokit = getOctokit();
    const res = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path, ref: BRANCH });
    const data = res.data as { content: string };
    const decoded = Buffer.from(data.content, "base64").toString("utf-8");
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(path: string, content: unknown, message: string): Promise<void> {
  const octokit = getOctokit();
  const sha = await getFileSha(octokit, path);
  const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString("base64");
  await octokit.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path,
    message,
    content: encoded,
    sha,
    branch: BRANCH,
  });
}

// ─── Engineers Master List ────────────────────────────────────────────────────

export interface Engineer {
  id: string;
  name: string;
  initials: string;
}

interface EngineersMasterList {
  engineers: Engineer[];
  lastUpdated: string;
}

export async function getEngineersMasterList(): Promise<Engineer[]> {
  const data = await readJsonFile<EngineersMasterList>("engineers_master_list.json");
  return data?.engineers ?? [];
}

/** Validate that an engineer name exists in the master list (case-insensitive trim). */
export function validateEngineerName(name: string, masterList: Engineer[]): boolean {
  const normalized = name.trim().toLowerCase();
  return masterList.some((e) => e.name.trim().toLowerCase() === normalized);
}

// ─── Project Master List ──────────────────────────────────────────────────────

export interface ProjectMasterEntry {
  projectNumber: string;      // e.g. "3A-DK1-25077"
  projectName: string;        // full project name stored at creation time
  createdAt: string;          // ISO timestamp
}

interface ProjectMasterList {
  projects: ProjectMasterEntry[];
  lastUpdated: string;
}

export async function getProjectMasterList(): Promise<ProjectMasterEntry[]> {
  const data = await readJsonFile<ProjectMasterList>("project_master_list.json");
  return data?.projects ?? [];
}

/** Add a project to project_master_list.json if it doesn't already exist. Returns false if duplicate. */
export async function addProjectToMasterList(
  projectNumber: string,
  projectName: string
): Promise<{ success: boolean; message: string }> {
  const data = (await readJsonFile<ProjectMasterList>("project_master_list.json")) ?? {
    projects: [],
    lastUpdated: "",
  };

  const exists = data.projects.some(
    (p) => p.projectNumber.trim().toLowerCase() === projectNumber.trim().toLowerCase()
  );
  if (exists) {
    return { success: false, message: `Project number "${projectNumber}" already exists in master list.` };
  }

  data.projects.push({
    projectNumber: projectNumber.trim(),
    projectName: projectName.trim(),
    createdAt: new Date().toISOString(),
  });
  data.lastUpdated = new Date().toISOString();

  await writeJsonFile("project_master_list.json", data, `Add project ${projectNumber} to master list`);
  return { success: true, message: "Project added to master list." };
}

/** Validate that a project number exists in the master list. */
export function validateProjectNumber(projectNumber: string, masterList: ProjectMasterEntry[]): boolean {
  return masterList.some(
    (p) => p.projectNumber.trim().toLowerCase() === projectNumber.trim().toLowerCase()
  );
}

// ─── data.json ────────────────────────────────────────────────────────────────

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

interface DataJson {
  data: ProjectAssignment[];
}

export async function getProjectData(): Promise<ProjectAssignment[]> {
  const data = await readJsonFile<DataJson>("data.json");
  return data?.data ?? [];
}

/**
 * Save a new project assignment to data.json.
 * Also registers the project in project_master_list.json.
 * Validates engineer against engineers_master_list.json.
 * Prevents duplicate project+engineer combos in data.json.
 */
export async function saveProjectAssignment(
  assignment: Omit<ProjectAssignment, "id">
): Promise<{ success: boolean; message: string; id?: number }> {

  // 1. Validate engineer name
  const engineers = await getEngineersMasterList();
  if (!validateEngineerName(assignment.engineerName, engineers)) {
    return {
      success: false,
      message: `Engineer "${assignment.engineerName}" is not in the engineers master list.`,
    };
  }

  // 2. Load current data.json
  const current = (await readJsonFile<DataJson>("data.json")) ?? { data: [] };

  // 3. Prevent duplicate project+engineer combo
  const duplicate = current.data.some(
    (d) =>
      d.projectName.trim().toLowerCase() === assignment.projectName.trim().toLowerCase() &&
      d.engineerName.trim().toLowerCase() === assignment.engineerName.trim().toLowerCase()
  );
  if (duplicate) {
    return {
      success: false,
      message: `Engineer "${assignment.engineerName}" is already assigned to project "${assignment.projectName}".`,
    };
  }

  // 4. Create new record
  const id = Date.now();
  const newEntry: ProjectAssignment = { id, ...assignment };
  current.data.push(newEntry);

  await writeJsonFile("data.json", current, `Add assignment: ${assignment.projectName} → ${assignment.engineerName}`);

  // 5. Register project number in master list (extract project number from name e.g. "3A-DK1-25077")
  const projectNumber = extractProjectNumber(assignment.projectName);
  if (projectNumber) {
    await addProjectToMasterList(projectNumber, assignment.projectName);
  }

  return { success: true, message: "Assignment saved.", id };
}

/** Update an existing assignment in data.json. */
export async function updateProjectAssignment(
  id: number,
  updates: Partial<ProjectAssignment>
): Promise<{ success: boolean; message: string }> {
  const current = await readJsonFile<DataJson>("data.json");
  if (!current) return { success: false, message: "data.json not found." };

  const idx = current.data.findIndex((d) => d.id === id);
  if (idx === -1) return { success: false, message: `Assignment id ${id} not found.` };

  // If engineer is being changed, validate new name
  if (updates.engineerName && updates.engineerName !== current.data[idx].engineerName) {
    const engineers = await getEngineersMasterList();
    if (!validateEngineerName(updates.engineerName, engineers)) {
      return {
        success: false,
        message: `Engineer "${updates.engineerName}" is not in the engineers master list.`,
      };
    }
  }

  current.data[idx] = { ...current.data[idx], ...updates };
  await writeJsonFile("data.json", current, `Update assignment id ${id}`);
  return { success: true, message: "Assignment updated." };
}

/** Delete an assignment from data.json by id. */
export async function deleteProjectAssignment(
  id: number
): Promise<{ success: boolean; message: string }> {
  const current = await readJsonFile<DataJson>("data.json");
  if (!current) return { success: false, message: "data.json not found." };

  const filtered = current.data.filter((d) => d.id !== id);
  if (filtered.length === current.data.length) {
    return { success: false, message: `Assignment id ${id} not found.` };
  }

  current.data = filtered;
  await writeJsonFile("data.json", current, `Delete assignment id ${id}`);
  return { success: true, message: "Assignment deleted." };
}

// ─── project-activities.json ──────────────────────────────────────────────────

export interface ProjectActivity {
  projectName: string;
  currentStatus: string;
  activities: Record<string, string>;
}

interface ProjectActivitiesJson {
  projectActivities: ProjectActivity[];
  lastUpdated: string;
}

export async function getProjectActivities(): Promise<ProjectActivity[]> {
  const data = await readJsonFile<ProjectActivitiesJson>("project-activities.json");
  return data?.projectActivities ?? [];
}

/**
 * Add or update a project's activity log entry.
 * Validates that the project number is in project_master_list.json before writing.
 */
export async function upsertProjectActivity(
  projectName: string,
  date: string,
  activityText: string,
  statusOverride?: string
): Promise<{ success: boolean; message: string }> {
  // Validate project number exists in master list
  const masterList = await getProjectMasterList();
  const projectNumber = extractProjectNumber(projectName);
  if (projectNumber && !validateProjectNumber(projectNumber, masterList)) {
    return {
      success: false,
      message: `Project number "${projectNumber}" is not registered. Please create the project first.`,
    };
  }

  const current = (await readJsonFile<ProjectActivitiesJson>("project-activities.json")) ?? {
    projectActivities: [],
    lastUpdated: "",
  };

  let entry = current.projectActivities.find(
    (p) => p.projectName.trim().toLowerCase() === projectName.trim().toLowerCase()
  );

  if (!entry) {
    entry = { projectName, currentStatus: statusOverride ?? "In Progress", activities: {} };
    current.projectActivities.push(entry);
  }

  if (statusOverride) entry.currentStatus = statusOverride;
  entry.activities[date] = activityText;
  current.lastUpdated = new Date().toISOString();

  await writeJsonFile("project-activities.json", current, `Activity log update: ${projectName} on ${date}`);
  return { success: true, message: "Activity logged." };
}

// ─── Analytics helpers ────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  totalProjects: number;
  totalEngineers: number;
  statusBreakdown: Record<string, number>;
  engineerWorkload: Array<{ name: string; projectCount: number; assignedDays: number }>;
  recentActivity: Array<{ projectName: string; date: string; activity: string }>;
  projectList: string[];           // deduplicated project names from data.json
  engineerList: string[];          // deduplicated engineer names from data.json (validated against master)
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const [assignments, activities, engineers] = await Promise.all([
    getProjectData(),
    getProjectActivities(),
    getEngineersMasterList(),
  ]);

  // Deduplicate project names
  const projectSet = new Set<string>();
  assignments.forEach((a) => projectSet.add(a.projectName.trim()));

  // Deduplicated & validated engineer names
  const engineerMasterNames = new Set(engineers.map((e) => e.name.trim().toLowerCase()));
  const engineerSet = new Set<string>();
  assignments.forEach((a) => {
    const normalized = a.engineerName.trim();
    if (engineerMasterNames.has(normalized.toLowerCase())) {
      engineerSet.add(normalized);
    }
  });

  // Status breakdown
  const statusBreakdown: Record<string, number> = {};
  assignments.forEach((a) => {
    statusBreakdown[a.status] = (statusBreakdown[a.status] ?? 0) + 1;
  });

  // Engineer workload (deduped)
  const workloadMap = new Map<string, { projectCount: number; assignedDays: number }>();
  assignments.forEach((a) => {
    const eng = a.engineerName.trim();
    if (!engineerMasterNames.has(eng.toLowerCase())) return;  // skip invalid
    const prev = workloadMap.get(eng) ?? { projectCount: 0, assignedDays: 0 };
    workloadMap.set(eng, {
      projectCount: prev.projectCount + 1,
      assignedDays: prev.assignedDays + (a.assignedDays ?? 0),
    });
  });
  const engineerWorkload = Array.from(workloadMap.entries()).map(([name, stats]) => ({
    name,
    ...stats,
  }));

  // Recent activity (last 20 entries across all projects, sorted by date desc)
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
    engineerWorkload,
    recentActivity: recentActivity.slice(0, 20),
    projectList: Array.from(projectSet),
    engineerList: Array.from(engineerSet),
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Extract a project number prefix like "3A-DK1-25077" from a full project name.
 * Matches patterns such as 3A-XXX-NNNNN, 3W-XXX-NNNNN, DK1-NNNNN, etc.
 */
export function extractProjectNumber(projectName: string): string | null {
  const match = projectName.match(/^[\s]*(\d[A-Z0-9]+-[A-Z0-9]+-\d{5,}|[A-Z0-9]+-\d{5,})/i);
  return match ? match[1].trim() : null;
}

// ─── Re-export other unchanged file accessors ─────────────────────────────────

export { readJsonFile, writeJsonFile };
