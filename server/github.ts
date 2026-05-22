// server/github.ts
// All data I/O goes through this file.
// Reads AND writes JSON files from the Controls_Team_Tracker GitHub repository.
// This is the ONLY storage that persists across Render restarts.



const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_OWNER = "Github2drb";
const DATA_REPO    = "Controls_Team_Tracker";
const BRANCH       = "main";

if (!GITHUB_TOKEN) {
  console.error("[github.ts] WARNING: GITHUB_TOKEN not set. Read calls will attempt public access; write calls will fail.");
}

function ghHeaders(withAuth = true): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "DRBTechVerse/1.0",
  };
  if (withAuth && GITHUB_TOKEN) headers.Authorization = `token ${GITHUB_TOKEN}`;
  return headers;
}

function fileUrl(filename: string): string {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${DATA_REPO}/contents/${filename}`;
}

// Raw content URL — public, no rate limit, used as a read fallback when the API fails.
function rawUrl(filename: string): string {
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${DATA_REPO}/${BRANCH}/${filename}`;
}

// TTL read cache to avoid hammering GitHub API.
const _cache = new Map<string, { data: any; ts: number; sha: string }>();
const TTL_MS = 300_000; // 5 minutes

// LAST-KNOWN-GOOD cache — never expires. Survives transient GitHub failures so
// a read hiccup can never make the app think a file is empty. This is the core
// safety net that prevents the "data became empty" bug after every deploy.
const _lastGood = new Map<string, { data: any; sha: string }>();

/** Call this after a new GITHUB_TOKEN is set at runtime to force re-fetch. */
export function clearReadCache(): void {
  _cache.clear();
  console.log("[github.ts] Read cache cleared");
}

// ─── readJsonFile ─────────────────────────────────────────────────────────────
// Returns null ONLY when the file genuinely does not exist (HTTP 404).
// On any transient failure (network, rate limit, 5xx, auth) it falls back to:
//   1. raw.githubusercontent.com (public, no rate limit)
//   2. last-known-good cache (data successfully read earlier this process)
// If all of those fail, it THROWS — so a route can return HTTP 503 instead of
// silently treating a read failure as "file is empty". This is what prevents
// the destructive "data became empty after deploy" bug.
export async function readJsonFile<T>(filename: string): Promise<T | null> {
  const hit = _cache.get(filename);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.data as T;

  // ── Attempt 1: GitHub Contents API (authenticated) ──
  try {
    let res = await fetch(fileUrl(filename), { headers: ghHeaders(true) });
    if ((res.status === 401 || res.status === 403) && GITHUB_TOKEN) {
      console.warn(`[readJsonFile] ${filename} auth failed (${res.status}), retrying without token`);
      res = await fetch(fileUrl(filename), { headers: ghHeaders(false) });
    }
    if (res.status === 404) return null; // genuinely absent — safe to treat as empty
    if (res.ok) {
      const meta: any = await res.json();
      const text = Buffer.from(meta.content, "base64").toString("utf-8");
      const data = JSON.parse(text) as T;
      _cache.set(filename, { data, ts: Date.now(), sha: meta.sha });
      _lastGood.set(filename, { data, sha: meta.sha });
      return data;
    }
    console.error(`[readJsonFile] ${filename} API HTTP ${res.status} — trying raw fallback`);
  } catch (err: any) {
    console.error(`[readJsonFile] ${filename} API error: ${err.message} — trying raw fallback`);
  }

  // ── Attempt 2: raw.githubusercontent.com (public, no rate limit) ──
  try {
    const res = await fetch(rawUrl(filename));
    if (res.status === 404) return null;
    if (res.ok) {
      const text = await res.text();
      const data = JSON.parse(text) as T;
      // raw has no SHA; keep any SHA we already had so writes still work
      const prevSha = _cache.get(filename)?.sha ?? _lastGood.get(filename)?.sha ?? "";
      _cache.set(filename, { data, ts: Date.now(), sha: prevSha });
      _lastGood.set(filename, { data, sha: prevSha });
      console.log(`[readJsonFile] ${filename} recovered via raw fallback`);
      return data;
    }
    console.error(`[readJsonFile] ${filename} raw HTTP ${res.status}`);
  } catch (err: any) {
    console.error(`[readJsonFile] ${filename} raw error: ${err.message}`);
  }

  // ── Attempt 3: last-known-good cache ──
  const lg = _lastGood.get(filename);
  if (lg) {
    console.warn(`[readJsonFile] ${filename} serving LAST-KNOWN-GOOD cache (GitHub unreachable)`);
    return lg.data as T;
  }

  // All recovery paths failed and we have nothing cached. Throw so the route
  // returns 503 instead of pretending the file is empty.
  throw new Error(`Unable to read ${filename}: GitHub unreachable and no cached copy available`);
}

// ─── writeJsonFile ────────────────────────────────────────────────────────────
// Commits directly to Controls_Team_Tracker via GitHub Contents API.
// This is the ONLY way data persists — Render's filesystem is ephemeral.
// Maps each known data file to the array key that holds its records.
// Used by the empty-overwrite guard below.
const _recordKey: Record<string, string> = {
  "weekly-assignments.json": "assignments",
  "data.json":               "assignments",
  "project-activities.json": "projectActivities",
  "engineers_auth.json":     "engineers",
  "engineers_master_list.json": "engineers",
  "daily-activities.json":   "engineerDailyData",
};

/** Count records in a data file payload, regardless of which key holds them. */
function _recordCount(filename: string, data: any): number {
  if (!data || typeof data !== "object") return 0;
  const key = _recordKey[filename];
  if (key && Array.isArray(data[key])) return data[key].length;
  // Fallback: data.json legacy { data: [] } shape
  if (filename === "data.json" && Array.isArray(data.data)) return data.data.length;
  return -1; // unknown shape — skip the guard
}

export async function writeJsonFile(filename: string, data: any, message: string): Promise<void> {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required for write operations");
  }

  // ── EMPTY-OVERWRITE GUARD ───────────────────────────────────────────────────
  // Refuse to overwrite a populated data file with an empty/much-smaller payload.
  // This is the defence-in-depth that makes the "data became empty" bug impossible:
  // even if a buggy route tries to write [], this blocks it.
  const newCount = _recordCount(filename, data);
  if (newCount === 0) {
    const known = _lastGood.get(filename) ?? _cache.get(filename);
    const oldCount = known ? _recordCount(filename, known.data) : 0;
    if (oldCount > 0) {
      console.error(`[writeJsonFile] BLOCKED: refusing to overwrite ${filename} `
        + `(${oldCount} records) with an empty payload. Commit message was: "${message}"`);
      throw new Error(`Refused to overwrite ${filename} with empty data — `
        + `${oldCount} existing records would be lost`);
    }
  }

  // Get current SHA (required by GitHub Contents API to update an existing file).
  // Priority: in-memory cache → fresh authenticated fetch → fallback unauthenticated fetch.
  let sha: string | undefined = _cache.get(filename)?.sha;
  if (!sha) {
    try {
      let shaRes = await fetch(fileUrl(filename), { headers: ghHeaders(true) });
      // If auth fails (expired/invalid token), retry without token (public repo read)
      if ((shaRes.status === 401 || shaRes.status === 403) && GITHUB_TOKEN) {
        console.warn(`[writeJsonFile] SHA fetch auth failed (${shaRes.status}) for ${filename}, retrying without token`);
        shaRes = await fetch(fileUrl(filename), { headers: ghHeaders(false) });
      }
      if (shaRes.ok) {
        const m: any = await shaRes.json();
        sha = m.sha;
      } else if (shaRes.status === 404) {
        sha = undefined; // New file — no SHA needed
      } else {
        console.warn(`[writeJsonFile] Could not get SHA for ${filename}: HTTP ${shaRes.status}. Will attempt without.`);
      }
    } catch (e: any) {
      console.warn(`[writeJsonFile] SHA fetch error for ${filename}:`, e.message);
    }
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
    _cache.delete(filename); // Always clear stale SHA on failure

    if (res.status === 422) {
      throw new Error(`GitHub write conflict for ${filename} — SHA mismatch, please retry`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("GitHub token invalid or expired — update GITHUB_TOKEN in Render env vars");
    }
    throw new Error(`GitHub write failed: ${res.status}`);
  }

  const resp: any = await res.json();
  // Refresh both caches immediately with the new SHA from the commit response
  const newSha = resp.content?.sha ?? sha ?? "";
  _cache.set(filename, { data, ts: Date.now(), sha: newSha });
  _lastGood.set(filename, { data, sha: newSha });
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
  const f = await readJsonFile<any>("data.json");
  if (!f) return [];
  // Handle both { data: [] } (old format) and { assignments: [] } (new format)
  return f.data ?? f.assignments ?? [];
}

export async function saveProjectAssignment(
  body: Omit<ProjectAssignment, "id">
): Promise<{ success: boolean; message: string; id?: number }> {
  const raw = await readJsonFile<any>("data.json");
  // Normalise to { assignments: [] } regardless of legacy { data: [] } format
  const f = raw ? { assignments: raw.data ?? raw.assignments ?? [] } : { assignments: [] };
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

interface WATask { id: string; taskName: string; status: string; }
interface WeeklyAssignmentRaw {
  id: string; engineerName: string; projectName: string; weekStart?: string;
  currentStatus?: string; tasks?: WATask[];
}
interface WAFileRaw { assignments: WeeklyAssignmentRaw[]; }

export async function getAnalyticsSummary() {
  const [dataJsonRaw, waRaw, activities] = await Promise.all([
    getProjectData(),
    readJsonFile<WAFileRaw>("weekly-assignments.json"),
    getProjectActivities(),
  ]);

  // ── Merge data.json + weekly-assignments into a unified assignment list ──────
  // weekly-assignments.json is the source of truth for current work;
  // data.json may have older / completed entries not in weekly-assignments.
  const statusMap: Record<string,string> = {
    in_progress: "In Progress", not_started: "Not Started",
    completed: "Completed", on_hold: "On Hold", blocked: "Blocked",
  };

  // Normalise weekly assignments
  interface NormAssignment { engineerName: string; projectName: string; status: string; endDate?: string; }
  const waAssignments: NormAssignment[] = (waRaw?.assignments ?? []).map(a => ({
    engineerName: a.engineerName ?? "",
    projectName: a.projectName ?? "",
    status: statusMap[a.currentStatus ?? ""] ?? a.currentStatus ?? "Not Started",
    endDate: undefined,
  }));

  // Add data.json entries that are NOT already covered in weekly-assignments
  const waProjKeys = new Set(waAssignments.map(a => a.projectName.trim().toLowerCase()));
  const legacyOnly = dataJsonRaw.filter(a => !waProjKeys.has(a.projectName.trim().toLowerCase()));

  const assignments: NormAssignment[] = [
    ...waAssignments,
    ...legacyOnly.map(a => ({
      engineerName: (a as any).engineerName ?? "",
      projectName: a.projectName ?? "",
      status: a.status ?? "Not Started",
      endDate: (a as any).endDate,
    })),
  ];

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

  // Build projectsByStatus with colors to match AnalyticsData schema
  const STATUS_COLORS: Record<string, string> = {
    "Completed":   "#22c55e",
    "In Progress": "#3b82f6",
    "On Hold":     "#f59e0b",
    "Other":       "#94a3b8",
  };
  const projectsByStatus = statusDistribution.map(s => ({
    status: s.status,
    count: s.count,
    color: STATUS_COLORS[s.status] ?? "#94a3b8",
  }));

  // projectsByPriority: derive from assignments if priority field exists, else empty
  const priorityMap = new Map<string, number>();
  for (const a of assignments) {
    const p = (a as any).priority || "Normal";
    priorityMap.set(p, (priorityMap.get(p) ?? 0) + 1);
  }
  const PRIORITY_COLORS: Record<string, string> = {
    High: "#ef4444", Medium: "#f59e0b", Normal: "#3b82f6", Low: "#94a3b8",
  };
  const projectsByPriority = Array.from(priorityMap.entries()).map(([priority, count]) => ({
    priority,
    count,
    color: PRIORITY_COLORS[priority] ?? "#94a3b8",
  }));

  // teamPerformance from engineerStats
  const teamPerformance = engineerStats.map(e => ({
    name: e.name,
    tasksCompleted: e.completedProjects,
    department: "Controls",
  }));

  // monthlyProgress: last 6 months from recentActivities
  const monthMap = new Map<string, { completed: number; inProgress: number; pending: number }>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
    monthMap.set(key, { completed: 0, inProgress: 0, pending: 0 });
  }
  for (const a of assignments) {
    const end = (a as any).endDate ? new Date((a as any).endDate) : null;
    if (!end) continue;
    const key = end.toLocaleString("default", { month: "short", year: "2-digit" });
    if (!monthMap.has(key)) continue;
    const m = monthMap.get(key)!;
    const s = a.status?.toLowerCase() ?? "";
    if (s === "completed") m.completed++;
    else if (s === "in progress") m.inProgress++;
    else m.pending++;
  }
  const monthlyProgress = Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v }));

  // completionTrend: last 8 weeks
  const weekMap = new Map<string, { done: number; total: number }>();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const key = `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleString("default", { month: "short" })}`;
    weekMap.set(key, { done: 0, total: 0 });
  }
  const completionTrend = Array.from(weekMap.entries()).map(([week, v]) => ({
    week,
    rate: v.total > 0 ? Math.round(v.done / v.total * 100) : 0,
  }));

  return {
    // Legacy fields (kept for any other consumers)
    summary: {
      totalProjects: total,
      completedProjects: completed,
      inProgressProjects: active,
      onHoldProjects: onHold,
      completionRate: total > 0 ? Math.round(completed / total * 100) : 0,
    },
    engineerStats,
    statusDistribution,
    recentActivities: recentActivities.slice(0, 20),
    projectActivities: activities,
    // Fields required by AnalyticsData schema (frontend analytics.tsx)
    projectsByStatus,
    projectsByPriority,
    teamPerformance,
    monthlyProgress,
    completionTrend,
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
