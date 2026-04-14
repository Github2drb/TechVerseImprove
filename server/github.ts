// server/github.ts
// All data I/O goes through this file.
// Reads AND writes JSON files from the Controls_Team_Tracker GitHub repository.
// This is the ONLY storage that persists across Render restarts.



const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_OWNER = "Github2drb";
const DATA_REPO    = "Controls_Team_Tracker";
const BRANCH       = "main";

if (!GITHUB_TOKEN) {
  console.error("[github.ts] WARNING: GITHUB_TOKEN not set. All data calls will return empty.");
}

function ghHeaders(): Record<string, string> {
  return {
    Authorization: `token ${GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "DRBTechVerse/1.0",
  };
}

function fileUrl(filename: string): string {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${DATA_REPO}/contents/${filename}`;
}

// 30-second read cache so we don't hammer the GitHub API
const _cache = new Map<string, { data: any; ts: number; sha: string }>();
const TTL_MS = 30_000;

// ─── readJsonFile ─────────────────────────────────────────────────────────────
export async function readJsonFile<T>(filename: string): Promise<T | null> {
  const hit = _cache.get(filename);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.data as T;

  try {
    const res = await fetch(fileUrl(filename), { headers: ghHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`[readJsonFile] ${filename} HTTP ${res.status}`);
      return null;
    }
    const meta: any = await res.json();
    const text = Buffer.from(meta.content, "base64").toString("utf-8");
    const data = JSON.parse(text) as T;
    _cache.set(filename, { data, ts: Date.now(), sha: meta.sha });
    return data;
  } catch (err: any) {
    console.error(`[readJsonFile] ${filename}:`, err.message);
    return null;
  }
}

// ─── writeJsonFile ────────────────────────────────────────────────────────────
// Commits directly to Controls_Team_Tracker via GitHub Contents API.
// This is the ONLY way data persists — Render's filesystem is ephemeral.
export async function writeJsonFile(filename: string, data: any, message: string): Promise<void> {
  // Get current SHA (needed to update existing file)
  let sha: string | undefined = _cache.get(filename)?.sha;
  if (!sha) {
    try {
      const r = await fetch(fileUrl(filename), { headers: ghHeaders() });
      if (r.ok) { const m: any = await r.json(); sha = m.sha; }
    } catch {}
  }

  const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
  const body: any = { message, content, branch: BRANCH };
  if (sha) body.sha = sha;

  const res = await fetch(fileUrl(filename), {
    method: "PUT",
    headers: ghHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error(`[writeJsonFile] ${filename} HTTP ${res.status}:`, txt);
    throw new Error(`GitHub write failed: ${res.status}`);
  }

  const resp: any = await res.json();
  // Invalidate + refresh cache with new sha
  _cache.set(filename, { data, ts: Date.now(), sha: resp.content?.sha ?? sha ?? "" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Project assignments (data.json) ─────────────────────────────────────────

export async function getProjectData(): Promise<ProjectAssignment[]> {
  const f = await readJsonFile<{ assignments: ProjectAssignment[] }>("data.json");
  return f?.assignments ?? [];
}

export async function saveProjectAssignment(
  body: Omit<ProjectAssignment, "id">
): Promise<{ success: boolean; message: string; id?: number }> {
  const f = (await readJsonFile<{ assignments: ProjectAssignment[] }>("data.json")) ?? { assignments: [] };
  const id = Date.now();
  f.assignments.push({ ...body, id });
  await writeJsonFile("data.json", f, `Add project: ${body.projectName}`);
  return { success: true, message: "Saved", id };
}

export async function updateProjectAssignment(
  id: number, updates: Partial<ProjectAssignment>
): Promise<{ success: boolean; message: string }> {
  const f = await readJsonFile<{ assignments: ProjectAssignment[] }>("data.json");
  if (!f) return { success: false, message: "File not found" };
  const i = f.assignments.findIndex(a => a.id === id);
  if (i === -1) return { success: false, message: "Assignment not found" };
  f.assignments[i] = { ...f.assignments[i], ...updates, id };
  await writeJsonFile("data.json", f, `Update project ${id}`);
  return { success: true, message: "Updated" };
}

export async function deleteProjectAssignment(
  id: number
): Promise<{ success: boolean; message: string }> {
  const f = await readJsonFile<{ assignments: ProjectAssignment[] }>("data.json");
  if (!f) return { success: false, message: "File not found" };
  const prev = f.assignments.length;
  f.assignments = f.assignments.filter(a => a.id !== id);
  if (f.assignments.length === prev) return { success: false, message: "Not found" };
  await writeJsonFile("data.json", f, `Delete project ${id}`);
  return { success: true, message: "Deleted" };
}

// ─── Project activities (project-activities.json) ────────────────────────────

export async function getProjectActivities(): Promise<ProjectActivity[]> {
  const f = await readJsonFile<{ projectActivities: ProjectActivity[] }>("project-activities.json");
  return f?.projectActivities ?? [];
}

export async function upsertProjectActivity(
  projectName: string, date: string, activity: string, status?: string
): Promise<{ success: boolean; message: string }> {
  const f = (await readJsonFile<{ projectActivities: ProjectActivity[] }>("project-activities.json"))
    ?? { projectActivities: [] };
  const key = projectName.trim().toLowerCase();
  let entry = f.projectActivities.find(p => p.projectName.trim().toLowerCase() === key);
  if (!entry) {
    entry = { projectName: projectName.trim(), currentStatus: status ?? "In Progress", activities: {} };
    f.projectActivities.push(entry);
  }
  if (status) entry.currentStatus = status;
  if (date && activity) entry.activities[date] = activity;
  await writeJsonFile("project-activities.json", f, `Activity: ${projectName}`);
  return { success: true, message: "Saved" };
}

// ─── Analytics summary ────────────────────────────────────────────────────────

export async function getAnalyticsSummary() {
  const [assignments, activities] = await Promise.all([getProjectData(), getProjectActivities()]);

  const total     = assignments.length;
  const completed = assignments.filter(a => a.status?.toLowerCase() === "completed").length;
  const active    = assignments.filter(a => a.status?.toLowerCase() === "in progress").length;
  const onHold    = assignments.filter(a => a.status?.toLowerCase() === "on hold").length;

  const engMap = new Map<string, { total: number; done: number }>();
  for (const a of assignments) {
    for (const name of (a.engineerName || "").split(",").map(n => n.trim()).filter(Boolean)) {
      if (!engMap.has(name)) engMap.set(name, { total: 0, done: 0 });
      const e = engMap.get(name)!;
      e.total++;
      if (a.status?.toLowerCase() === "completed") e.done++;
    }
  }

  const engineerStats = Array.from(engMap.entries())
    .map(([name, s]) => ({
      name,
      totalProjects: s.total,
      completedProjects: s.done,
      activeProjects: s.total - s.done,
      completionRate: s.total > 0 ? Math.round(s.done / s.total * 100) : 0,
    }))
    .sort((a, b) => b.totalProjects - a.totalProjects);

  const statusDistribution = [
    { status: "Completed",   count: completed },
    { status: "In Progress", count: active },
    { status: "On Hold",     count: onHold },
    { status: "Other",       count: Math.max(0, total - completed - active - onHold) },
  ].filter(s => s.count > 0);

  const recentActivities: any[] = [];
  for (const pa of activities) {
    for (const [date, act] of Object.entries(pa.activities ?? {})) {
      recentActivities.push({ projectName: pa.projectName, date, activity: act, status: pa.currentStatus });
    }
  }
  recentActivities.sort((a, b) => b.date.localeCompare(a.date));

  return {
    summary: {
      totalProjects: total,
      completedProjects: completed,
      inProgressProjects: active,
      onHoldProjects: onHold,
      completionRate: total > 0 ? Math.round(completed / total * 100) : 0,
    },
    engineerStats,       // always []
    statusDistribution,  // always []
    recentActivities: recentActivities.slice(0, 20),
    projectActivities: activities,
  };
}

// ─── Engineers master list (engineers_master_list.json) ───────────────────────

export async function getEngineersMasterList(): Promise<EngineerMaster[]> {
  const f = await readJsonFile<{ engineers: EngineerMaster[] }>("engineers_master_list.json");
  return f?.engineers ?? [];
}

// ─── Projects master list (projects_master_list.json) ────────────────────────

export async function getProjectMasterList(): Promise<ProjectMaster[]> {
  const f = await readJsonFile<{ projects: ProjectMaster[] }>("projects_master_list.json");
  return f?.projects ?? [];
}

export async function addProjectToMasterList(
  projectNumber: string, projectName: string
): Promise<{ success: boolean; message: string }> {
  const f = (await readJsonFile<{ projects: ProjectMaster[] }>("projects_master_list.json")) ?? { projects: [] };
  if (f.projects.find(p => p.projectNumber.toLowerCase() === projectNumber.toLowerCase()))
    return { success: false, message: "Already exists" };
  f.projects.push({ projectNumber, projectName });
  await writeJsonFile("projects_master_list.json", f, `Add project: ${projectNumber}`);
  return { success: true, message: "Added" };
}

// ─── Validation helpers ───────────────────────────────────────────────────────

export function extractProjectNumber(name: string): string | null {
  const m = name.trim().match(/^([A-Z0-9]{1,4}-[A-Z0-9]{1,5}-\d{4,6})/i);
  return m ? m[1].toUpperCase() : null;
}

export function validateEngineerName(name: string, list: EngineerMaster[]): boolean {
  const clean = (s: string) => s.trim().replace(/\s*\([^)]*\)\s*/g, "").trim().toLowerCase();
  return list.some(e => clean(e.name) === clean(name));
}

export function validateProjectNumber(pn: string, list: ProjectMaster[]): boolean {
  return list.some(p => p.projectNumber.toLowerCase() === pn.toLowerCase());
}
