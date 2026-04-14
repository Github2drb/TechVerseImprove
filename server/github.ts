// server/github.ts — Persistent GitHub-backed storage for DRB TechVerse
// CRITICAL FIX: writeJsonFile NOW commits to GitHub via API (not local disk)
// This is the ONLY persistent storage on Render free tier.

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_OWNER = process.env.GITHUB_OWNER || "Github2drb";
const GITHUB_REPO  = process.env.GITHUB_REPO  || "TechVerseImprove";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const DATA_FOLDER = process.env.GITHUB_DATA_FOLDER || "data"; // folder in repo where JSON files live

const BASE_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FOLDER}`;

function headers() {
  return {
    Authorization: `token ${GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "DRBTechVerse-Server",
  };
}

// ── In-memory cache so we don't hammer GitHub API on every request ──────────
const cache = new Map<string, { data: any; etag?: string; ts: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

// ── readJsonFile ─────────────────────────────────────────────────────────────
export async function readJsonFile<T>(filename: string): Promise<T | null> {
  const now = Date.now();
  const cached = cache.get(filename);
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.data as T;

  try {
    const url = `${BASE_URL}/${filename}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`GitHub read failed: ${res.status} ${await res.text()}`);
    }
    const meta = await res.json();
    const content = Buffer.from(meta.content, "base64").toString("utf-8");
    const data = JSON.parse(content) as T;
    cache.set(filename, { data, etag: res.headers.get("etag") ?? undefined, ts: now });
    return data;
  } catch (e: any) {
    console.error(`[readJsonFile] ${filename}:`, e.message);
    return null;
  }
}

// ── writeJsonFile ────────────────────────────────────────────────────────────
// MUST commit to GitHub — this is the ONLY persistent write on Render.
export async function writeJsonFile(filename: string, data: any, commitMessage: string): Promise<void> {
  try {
    const url = `${BASE_URL}/${filename}`;
    // Get current SHA (required for update)
    const getRes = await fetch(url, { headers: headers() });
    let sha: string | undefined;
    if (getRes.ok) {
      const meta = await getRes.json();
      sha = meta.sha;
    } else if (getRes.status !== 404) {
      throw new Error(`GitHub SHA fetch failed: ${getRes.status}`);
    }

    const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
    const body: any = { message: commitMessage, content, branch: GITHUB_BRANCH };
    if (sha) body.sha = sha;

    const putRes = await fetch(url, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`GitHub write failed: ${putRes.status} ${err}`);
    }

    // Invalidate cache so next read gets fresh data
    cache.delete(filename);
    console.log(`[writeJsonFile] Committed ${filename}: ${commitMessage}`);
  } catch (e: any) {
    console.error(`[writeJsonFile] ${filename}:`, e.message);
    throw e;
  }
}

// ─── Data shape interfaces ───────────────────────────────────────────────────

export interface ProjectAssignment {
  id: number;
  engineerName: string;
  projectName: string;
  startDate: string;
  endDate: string;
  status: string;
  description?: string;
}

export interface ProjectActivity {
  projectName: string;
  currentStatus: string;
  activities: Record<string, string>;
}

export interface EngineerMaster {
  id: string;
  name: string;
  initials: string;
}

export interface ProjectMaster {
  projectNumber: string;
  projectName: string;
}

interface DataFile { assignments: ProjectAssignment[]; }
interface ActivitiesFile { projectActivities: ProjectActivity[]; }
interface EngineerMasterFile { engineers: EngineerMaster[]; }
interface ProjectMasterFile { projects: ProjectMaster[]; }

// ─── getProjectData ──────────────────────────────────────────────────────────
export async function getProjectData(): Promise<ProjectAssignment[]> {
  const f = await readJsonFile<DataFile>("data.json");
  return f?.assignments ?? [];
}

// ─── saveProjectAssignment ───────────────────────────────────────────────────
export async function saveProjectAssignment(
  assignment: Omit<ProjectAssignment, "id">
): Promise<{ success: boolean; message: string; id?: number }> {
  const f = (await readJsonFile<DataFile>("data.json")) ?? { assignments: [] };
  const id = Date.now();
  f.assignments.push({ ...assignment, id });
  await writeJsonFile("data.json", f, `Add assignment: ${assignment.projectName}`);
  return { success: true, message: "Assignment saved", id };
}

// ─── updateProjectAssignment ──────────────────────────────────────────────────
export async function updateProjectAssignment(
  id: number,
  updates: Partial<ProjectAssignment>
): Promise<{ success: boolean; message: string }> {
  const f = await readJsonFile<DataFile>("data.json");
  if (!f) return { success: false, message: "Data file not found" };
  const i = f.assignments.findIndex(a => a.id === id);
  if (i === -1) return { success: false, message: "Assignment not found" };
  f.assignments[i] = { ...f.assignments[i], ...updates, id };
  await writeJsonFile("data.json", f, `Update assignment ${id}`);
  return { success: true, message: "Assignment updated" };
}

// ─── deleteProjectAssignment ──────────────────────────────────────────────────
export async function deleteProjectAssignment(
  id: number
): Promise<{ success: boolean; message: string }> {
  const f = await readJsonFile<DataFile>("data.json");
  if (!f) return { success: false, message: "Data file not found" };
  const before = f.assignments.length;
  f.assignments = f.assignments.filter(a => a.id !== id);
  if (f.assignments.length === before) return { success: false, message: "Assignment not found" };
  await writeJsonFile("data.json", f, `Delete assignment ${id}`);
  return { success: true, message: "Assignment deleted" };
}

// ─── getProjectActivities ─────────────────────────────────────────────────────
export async function getProjectActivities(): Promise<ProjectActivity[]> {
  const f = await readJsonFile<ActivitiesFile>("project-activities.json");
  return f?.projectActivities ?? [];
}

// ─── upsertProjectActivity ────────────────────────────────────────────────────
export async function upsertProjectActivity(
  projectName: string,
  date: string,
  activity: string,
  status?: string
): Promise<{ success: boolean; message: string }> {
  const f = (await readJsonFile<ActivitiesFile>("project-activities.json")) ?? { projectActivities: [] };
  const k = projectName.trim().toLowerCase();
  let entry = f.projectActivities.find(p => p.projectName.trim().toLowerCase() === k);
  if (!entry) {
    entry = { projectName: projectName.trim(), currentStatus: status || "In Progress", activities: {} };
    f.projectActivities.push(entry);
  }
  if (status) entry.currentStatus = status;
  if (date && activity) entry.activities[date] = activity;
  await writeJsonFile("project-activities.json", f, `Activity: ${projectName}`);
  return { success: true, message: "Activity saved" };
}

// ─── getAnalyticsSummary ──────────────────────────────────────────────────────
export async function getAnalyticsSummary() {
  const [assignments, activities] = await Promise.all([
    getProjectData(),
    getProjectActivities(),
  ]);

  const total = assignments.length;
  const completed = assignments.filter(a => a.status?.toLowerCase() === "completed").length;
  const inProgress = assignments.filter(a => a.status?.toLowerCase() === "in progress").length;
  const onHold = assignments.filter(a => a.status?.toLowerCase() === "on hold").length;

  // Engineer workload
  const engineerMap = new Map<string, { total: number; completed: number }>();
  for (const a of assignments) {
    const names = (a.engineerName || "").split(",").map(n => n.trim()).filter(Boolean);
    for (const name of names) {
      if (!engineerMap.has(name)) engineerMap.set(name, { total: 0, completed: 0 });
      const e = engineerMap.get(name)!;
      e.total++;
      if (a.status?.toLowerCase() === "completed") e.completed++;
    }
  }

  const engineerStats = Array.from(engineerMap.entries()).map(([name, s]) => ({
    name,
    totalProjects: s.total,
    completedProjects: s.completed,
    activeProjects: s.total - s.completed,
    completionRate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
  })).sort((a, b) => b.totalProjects - a.totalProjects);

  // Project status distribution
  const statusDistribution = [
    { status: "Completed", count: completed },
    { status: "In Progress", count: inProgress },
    { status: "On Hold", count: onHold },
    { status: "Other", count: total - completed - inProgress - onHold },
  ].filter(s => s.count > 0);

  // Recent activities (last 10)
  const recentActivities: Array<{ projectName: string; date: string; activity: string; status: string }> = [];
  for (const pa of activities) {
    const entries = Object.entries(pa.activities || {})
      .map(([date, activity]) => ({ projectName: pa.projectName, date, activity, status: pa.currentStatus }))
      .sort((a, b) => b.date.localeCompare(a.date));
    recentActivities.push(...entries);
  }
  recentActivities.sort((a, b) => b.date.localeCompare(a.date));

  return {
    summary: {
      totalProjects: total,
      completedProjects: completed,
      inProgressProjects: inProgress,
      onHoldProjects: onHold,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    },
    engineerStats,           // always an array, never undefined
    statusDistribution,      // always an array, never undefined
    recentActivities: recentActivities.slice(0, 10),  // always an array
    projectActivities: activities,  // always an array
  };
}

// ─── getEngineersMasterList ───────────────────────────────────────────────────
export async function getEngineersMasterList(): Promise<EngineerMaster[]> {
  const f = await readJsonFile<EngineerMasterFile>("engineers_master_list.json");
  return f?.engineers ?? [];
}

// ─── getProjectMasterList ─────────────────────────────────────────────────────
export async function getProjectMasterList(): Promise<ProjectMaster[]> {
  const f = await readJsonFile<ProjectMasterFile>("projects_master_list.json");
  return f?.projects ?? [];
}

// ─── addProjectToMasterList ───────────────────────────────────────────────────
export async function addProjectToMasterList(
  projectNumber: string,
  projectName: string
): Promise<{ success: boolean; message: string }> {
  const f = (await readJsonFile<ProjectMasterFile>("projects_master_list.json")) ?? { projects: [] };
  if (f.projects.find(p => p.projectNumber.trim().toLowerCase() === projectNumber.trim().toLowerCase()))
    return { success: false, message: "Project already in master list" };
  f.projects.push({ projectNumber, projectName });
  await writeJsonFile("projects_master_list.json", f, `Add project: ${projectNumber}`);
  return { success: true, message: "Project added to master list" };
}

// ─── validateEngineerName ─────────────────────────────────────────────────────
export function validateEngineerName(name: string, masterList: EngineerMaster[]): boolean {
  const n = name.trim().replace(/\s*\([^)]*\)\s*/g, "").trim().toLowerCase();
  return masterList.some(e => e.name.replace(/\s*\([^)]*\)\s*/g, "").trim().toLowerCase() === n);
}

// ─── validateProjectNumber ────────────────────────────────────────────────────
export function validateProjectNumber(pn: string, masterList: ProjectMaster[]): boolean {
  return masterList.some(p => p.projectNumber.trim().toLowerCase() === pn.trim().toLowerCase());
}

// ─── extractProjectNumber ─────────────────────────────────────────────────────
export function extractProjectNumber(name: string): string | null {
  const m = name.trim().match(/^([A-Z0-9]{1,4}-[A-Z0-9]{1,5}-\d{4,6})/i);
  return m ? m[1].toUpperCase() : null;
}
