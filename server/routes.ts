// server/routes.ts — Complete route definitions for DRB TechVerse
// FIXED: 1) Engineer-specific project filtering (non-admin users)
//        2) Data not shown issue root cause documented + safe reads
//        3) Weekly assignments now auto-sync to daily-activities on save/update

import { Router } from "express";
import type { Server } from "http";
import {
  getProjectData,
  saveProjectAssignment,
  updateProjectAssignment,
  deleteProjectAssignment,
  getProjectActivities,
  upsertProjectActivity,
  getAnalyticsSummary,
  getEngineersMasterList,
  getProjectMasterList,
  addProjectToMasterList,
  validateEngineerName,
  validateProjectNumber,
  extractProjectNumber,
  readJsonFile,
  writeJsonFile,
} from "./github";
import { syncAssignmentToDailyActivities } from "./syncDailyTasks";

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface EngineerCredential {
  id: string; username: string; name: string; password: string;
  role: "admin" | "engineer"; company?: string;
  isActive: boolean; createdAt: string; lastLogin?: string;
}
interface EngineerCredentialsFile { engineers: EngineerCredential[]; lastUpdated: string; }

interface WeeklyAssignmentTask {
  id: string; taskName: string; targetDate?: string;
  completionDate?: string; status: "not_started"|"in_progress"|"completed"|"blocked";
}
interface WeeklyAssignment {
  id: string; engineerName: string; weekStart: string; projectName: string;
  projectTargetDate?: string; resourceLockedFrom?: string; resourceLockedTill?: string;
  internalTarget?: string; customerTarget?: string; tasks: WeeklyAssignmentTask[];
  currentStatus: "not_started"|"in_progress"|"completed"|"on_hold"|"blocked";
  notes?: string; constraint?: string;
}
interface WeeklyAssignmentsFile { assignments: WeeklyAssignment[]; lastUpdated: string; }

interface DailyEntry {
  engineerName: string; date: string;
  targetTasks: Array<{ id: string; text: string }>;
  completedActivities: Array<{ id: string; text: string }>;
}
interface DailyActivitiesFile { engineerDailyData: DailyEntry[]; }

interface EngineerTaskConfig { id: string; name: string; initials: string; }
interface EngineerTasksConfigFile { engineers: EngineerTaskConfig[]; lastUpdated: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAdmin(req: any): boolean {
  try {
    const h = req.headers["x-admin-auth"];
    if (!h) return false;
    const d = JSON.parse(Buffer.from(h as string, "base64").toString("utf-8"));
    return d?.role === "admin" || d?.username?.toLowerCase() === "admin";
  } catch { return false; }
}

function extractProjectKey(name: string): string {
  const m = name.trim().match(/^([A-Z0-9]{1,4}-[A-Z0-9]{1,5}-\d{4,6})/i);
  return m ? m[1].toUpperCase() : name.trim().toUpperCase();
}

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started", in_progress: "In Progress",
  completed: "Completed", on_hold: "On Hold", blocked: "Blocked",
};

/**
 * FIX #1 — Engineer name normalization.
 * Strips company suffix like "(DRB)" and normalises whitespace + casing
 * so that stored names ("John Doe (DRB)") match login names ("John Doe").
 */
function normaliseEngineerName(raw: string): string {
  return raw.trim().replace(/\s*\([^)]*\)\s*/g, "").trim().toLowerCase();
}

/**
 * Returns true if the stored engineerName field (which may be comma-separated
 * and contain company suffixes) contains the given login name.
 */
function assignmentBelongsToEngineer(
  storedEngineerField: string,
  loginName: string
): boolean {
  const needle = normaliseEngineerName(loginName);
  return storedEngineerField
    .split(",")
    .map(n => normaliseEngineerName(n))
    .some(n => n === needle);
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerRoutes(
  httpServer: Server,
  app: ReturnType<typeof import("express")["default"]>
) {
  const router = Router();

  // No-cache all API responses
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  // ── AUTH ──────────────────────────────────────────────────────────────────

  router.post("/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password)
        return res.status(400).json({ message: "Username and password required" });

      const file = await readJsonFile<EngineerCredentialsFile>("engineers_auth.json");
      const list: EngineerCredential[] = file?.engineers ?? [];

      if (!list.find(e => e.username === "admin"))
        list.push({
          id: "admin-1", username: "admin", name: "Admin", password: "admin@drb",
          role: "admin", isActive: true, createdAt: new Date().toISOString()
        });

      const found = list.find(e =>
        e.username.toLowerCase() === username.toLowerCase() &&
        e.password === password && e.isActive !== false);

      if (!found) return res.status(401).json({ message: "Invalid credentials" });

      const role = found.username.toLowerCase() === "admin" ? "admin" : found.role;
      found.lastLogin = new Date().toISOString();

      if (file) {
        file.lastUpdated = new Date().toISOString();
        try { await writeJsonFile("engineers_auth.json", file, "Update last login"); } catch {}
      }

      return res.json({
        id: found.id, username: found.username, name: found.name,
        role, company: found.company, email: `${found.username}@drbtechverse.com`, status: "active"
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  router.post("/auth/logout", (_req, res) => res.json({ success: true }));
  router.get("/auth/me", (_req, res) => res.status(401).json({ message: "Not authenticated" }));

  // ── ENGINEER CREDENTIALS ─────────────────────────────────────────────────

  router.get("/engineer-credentials", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
      const f = await readJsonFile<EngineerCredentialsFile>("engineers_auth.json");
      const safe = (f?.engineers ?? []).map(({ password: _p, ...r }) => r);
      res.json({ engineers: safe, lastUpdated: f?.lastUpdated });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/engineer-credentials", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
      const f = (await readJsonFile<EngineerCredentialsFile>("engineers_auth.json"))
        ?? { engineers: [], lastUpdated: new Date().toISOString() };
      const eng: EngineerCredential = {
        id: req.body.id || `eng-${Date.now()}`, username: req.body.username,
        name: req.body.name, password: req.body.password || "drb@123",
        role: req.body.role || "engineer", company: req.body.company,
        isActive: req.body.isActive !== false, createdAt: new Date().toISOString()
      };
      f.engineers.push(eng);
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("engineers_auth.json", f, `Add engineer: ${eng.username}`);
      const { password: _p, ...safe } = eng;
      res.json({ success: true, engineer: safe });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.put("/engineer-credentials/:id", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
      const f = await readJsonFile<EngineerCredentialsFile>("engineers_auth.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const i = f.engineers.findIndex(e => e.id === req.params.id);
      if (i === -1) return res.status(404).json({ message: "Engineer not found" });
      f.engineers[i] = { ...f.engineers[i], ...req.body, id: req.params.id };
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("engineers_auth.json", f, `Update engineer ${req.params.id}`);
      const { password: _p, ...safe } = f.engineers[i];
      res.json({ success: true, engineer: safe });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete("/engineer-credentials/:id", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
      const f = await readJsonFile<EngineerCredentialsFile>("engineers_auth.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const before = f.engineers.length;
      f.engineers = f.engineers.filter(e => e.id !== req.params.id);
      if (f.engineers.length === before) return res.status(404).json({ message: "Engineer not found" });
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("engineers_auth.json", f, `Delete engineer ${req.params.id}`);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/engineer-credentials/initialize", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
      const [ml, ex] = await Promise.all([
        readJsonFile<EngineerTasksConfigFile>("engineers_master_list.json"),
        readJsonFile<EngineerCredentialsFile>("engineers_auth.json")
      ]);
      const file = ex ?? { engineers: [], lastUpdated: new Date().toISOString() };
      const usernames = new Set(file.engineers.map(e => e.username.toLowerCase()));
      let created = 0;
      for (const eng of (ml?.engineers ?? [])) {
        const u = eng.name.replace(/\s*\([^)]*\)\s*/g, "").trim().toLowerCase().replace(/\s+/g, ".");
        if (!usernames.has(u)) {
          file.engineers.push({
            id: eng.id, name: eng.name, username: u, password: "drb@123",
            role: "engineer", company: eng.name.match(/\(([^)]+)\)/)?.[1],
            isActive: true, createdAt: new Date().toISOString()
          });
          created++;
        }
      }
      if (!usernames.has("admin")) {
        file.engineers.push({
          id: "admin-1", name: "Admin", username: "admin", password: "admin@drb",
          role: "admin", isActive: true, createdAt: new Date().toISOString()
        });
        created++;
      }
      file.lastUpdated = new Date().toISOString();
      await writeJsonFile("engineers_auth.json", file, "Initialize credentials");
      res.json({ success: true, created });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/engineer-credentials/reset-password", async (req, res) => {
    try {
      const { username, newPassword } = req.body;
      if (!username || !newPassword)
        return res.status(400).json({ message: "username and newPassword required" });
      const f = await readJsonFile<EngineerCredentialsFile>("engineers_auth.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const eng = f.engineers.find(e => e.username.toLowerCase() === username.toLowerCase());
      if (!eng) return res.status(404).json({ message: "Engineer not found" });
      eng.password = newPassword;
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("engineers_auth.json", f, `Reset password: ${username}`);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── TEAM MEMBERS ──────────────────────────────────────────────────────────

  router.get("/team-members", async (_req, res) => {
    try {
      const f = await readJsonFile<EngineerCredentialsFile>("engineers_auth.json");
      res.json((f?.engineers ?? [])
        .filter(e => e.isActive && !e.company && e.role !== "admin")
        .map(e => ({
          id: e.id, name: e.name, role: "Engineer",
          email: `${e.username}@drbtechverse.in`, department: "Engineering", status: "active", avatar: null
        })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ENGINEERS MASTER LIST ─────────────────────────────────────────────────

  router.get("/engineers-master", async (_req, res) => {
    try {
      const list = await getEngineersMasterList();
      const seen = new Set<string>();
      res.json(list.filter(e => {
        const k = e.name.trim().toLowerCase();
        return seen.has(k) ? false : (seen.add(k), true);
      }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/engineers-master-list", async (_req, res) => {
    try {
      const f = await readJsonFile<EngineerTasksConfigFile>("engineers_master_list.json");
      res.json(f?.engineers ?? []);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.put("/engineers-master-list", async (req, res) => {
    try {
      const { engineers } = req.body;
      if (!Array.isArray(engineers))
        return res.status(400).json({ message: "Engineers must be an array" });
      const data = { engineers, lastUpdated: new Date().toISOString() };
      await writeJsonFile("engineers_master_list.json", data, "Update engineers master list");
      res.json({ success: true, engineers });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/engineers-master-list/initialize", async (_req, res) => {
    try {
      const f = await readJsonFile<EngineerTasksConfigFile>("engineers_master_list.json");
      res.json({ success: true, count: f?.engineers?.length ?? 0 });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ENGINEER DAILY TASKS CONFIG ───────────────────────────────────────────

  router.get("/engineer-daily-tasks-config", async (_req, res) => {
    try {
      const f = await readJsonFile<EngineerTasksConfigFile>("engineers_master_list.json");
      res.json(f?.engineers ?? []);
    } catch (e: any) { res.status(503).json({ error: e.message }); }
  });

  router.post("/engineer-daily-tasks-config/initialize", async (_req, res) => {
    try {
      const f = await readJsonFile<EngineerTasksConfigFile>("engineers_master_list.json");
      res.json({ success: true, created: 0, engineers: f?.engineers ?? [] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ENGINEER DAILY TASKS (dashboard view) ─────────────────────────────────

  router.get("/engineer-daily-tasks", async (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const [daily, master] = await Promise.all([
        readJsonFile<DailyActivitiesFile>("daily-activities.json"),
        readJsonFile<EngineerTasksConfigFile>("engineers_master_list.json"),
      ]);
      const entries = (daily?.engineerDailyData ?? []).filter(e => e.date === date);
      const engineers = (master?.engineers ?? []).filter(e => !e.name.match(/\([^)]+\)/));
      res.json(engineers.map(eng => {
        const e = entries.find(x => normaliseEngineerName(x.engineerName) === normaliseEngineerName(eng.name));
        return {
          engineerName: eng.name,
          planned: e?.targetTasks?.length ?? 0,
          completed: e?.completedActivities?.length ?? 0,
          inProgress: Math.max(0, (e?.targetTasks?.length ?? 0) - (e?.completedActivities?.length ?? 0)),
          tasks: [], customActivities: e?.completedActivities ?? [], targetTasks: e?.targetTasks ?? [],
        };
      }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── DAILY ACTIVITIES ──────────────────────────────────────────────────────

  router.get("/daily-activities", async (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const f = await readJsonFile<DailyActivitiesFile>("daily-activities.json");
      const map = new Map<string, DailyEntry>();
      (f?.engineerDailyData ?? []).filter(e => e.date === date).forEach(entry => {
        const k = normaliseEngineerName(entry.engineerName);
        if (!map.has(k)) {
          map.set(k, { ...entry, targetTasks: [...(entry.targetTasks ?? [])], completedActivities: [...(entry.completedActivities ?? [])] });
        } else {
          const ex = map.get(k)!;
          const ti = new Set(ex.targetTasks.map(t => t.id));
          const ai = new Set(ex.completedActivities.map(a => a.id));
          (entry.targetTasks ?? []).forEach(t => { if (!ti.has(t.id)) ex.targetTasks.push(t); });
          (entry.completedActivities ?? []).forEach(a => { if (!ai.has(a.id)) ex.completedActivities.push(a); });
        }
      });
      res.json(Array.from(map.values()));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ENGINEER TARGET TASKS ─────────────────────────────────────────────────

  router.post("/engineer-target-tasks/:engineer", async (req, res) => {
    try {
      const { engineer } = req.params;
      const { task, date } = req.body;
      const f = (await readJsonFile<DailyActivitiesFile>("daily-activities.json")) ?? { engineerDailyData: [] };
      const id = Math.random().toString(36).substr(2, 9);
      const i = f.engineerDailyData.findIndex(e => e.engineerName === engineer && e.date === date);
      if (i > -1) { f.engineerDailyData[i].targetTasks.push({ id, text: task }); }
      else { f.engineerDailyData.push({ engineerName: engineer, date, targetTasks: [{ id, text: task }], completedActivities: [] }); }
      await writeJsonFile("daily-activities.json", f, `Target task for ${engineer}`);
      res.json({ id, success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete("/engineer-target-tasks/:engineer/:taskId", async (req, res) => {
    try {
      const { engineer, taskId } = req.params;
      const { date } = req.body;
      const f = await readJsonFile<DailyActivitiesFile>("daily-activities.json");
      if (f) {
        const i = f.engineerDailyData.findIndex(e => e.engineerName === engineer && e.date === date);
        if (i > -1) {
          f.engineerDailyData[i].targetTasks = f.engineerDailyData[i].targetTasks.filter(t => t.id !== taskId);
          await writeJsonFile("daily-activities.json", f, `Delete target task ${taskId}`);
        }
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ENGINEER DAILY ACTIVITIES ─────────────────────────────────────────────

  router.post("/engineer-daily-activities/:engineer", async (req, res) => {
    try {
      const { engineer } = req.params;
      const { activity, date } = req.body;
      const f = (await readJsonFile<DailyActivitiesFile>("daily-activities.json")) ?? { engineerDailyData: [] };
      const id = Math.random().toString(36).substr(2, 9);
      const i = f.engineerDailyData.findIndex(e => e.engineerName === engineer && e.date === date);
      if (i > -1) { f.engineerDailyData[i].completedActivities.push({ id, text: activity }); }
      else { f.engineerDailyData.push({ engineerName: engineer, date, targetTasks: [], completedActivities: [{ id, text: activity }] }); }
      await writeJsonFile("daily-activities.json", f, `Activity for ${engineer}`);
      res.json({ id, success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete("/engineer-daily-activities/:engineer/:activityId", async (req, res) => {
    try {
      const { engineer, activityId } = req.params;
      const { date } = req.body;
      const f = await readJsonFile<DailyActivitiesFile>("daily-activities.json");
      if (f) {
        const i = f.engineerDailyData.findIndex(e => e.engineerName === engineer && e.date === date);
        if (i > -1) {
          f.engineerDailyData[i].completedActivities = f.engineerDailyData[i].completedActivities.filter(a => a.id !== activityId);
          await writeJsonFile("daily-activities.json", f, `Delete activity ${activityId}`);
        }
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PENDING TASKS ─────────────────────────────────────────────────────────

  router.get("/pending-tasks/:engineer", async (req, res) => {
    try {
      const { engineer } = req.params;
      const today = new Date().toISOString().split("T")[0];
      const f = await readJsonFile<DailyActivitiesFile>("daily-activities.json");
      res.json((f?.engineerDailyData ?? [])
        .filter(e => normaliseEngineerName(e.engineerName) === normaliseEngineerName(engineer) && e.date < today)
        .flatMap(e => e.targetTasks.map(t => ({ ...t, date: e.date }))));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── WEEKLY ASSIGNMENTS ────────────────────────────────────────────────────

  router.get("/weekly-assignments", async (req, res) => {
    try {
      const f = await readJsonFile<WeeklyAssignmentsFile>("weekly-assignments.json");
      const all = f?.assignments ?? [];
      const ws = req.query.weekStart as string | undefined;
      res.json(ws ? all.filter(a => a.weekStart === ws) : all);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  /**
   * FIX #2 — New endpoint: get weekly assignments for a specific engineer.
   * Uses normalised name matching so company suffixes and casing don't break the filter.
   * Non-admin frontend should call GET /api/weekly-assignments/engineer/:name
   * instead of filtering the full list client-side.
   */
  router.get("/weekly-assignments/engineer/:name", async (req, res) => {
    try {
      const f = await readJsonFile<WeeklyAssignmentsFile>("weekly-assignments.json");
      const all = f?.assignments ?? [];
      const ws = req.query.weekStart as string | undefined;
      const filtered = all.filter(a =>
        assignmentBelongsToEngineer(a.engineerName, req.params.name) &&
        (ws ? a.weekStart === ws : true)
      );
      res.json(filtered);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/weekly-assignments", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
      const { engineerName, weekStart, projectName } = req.body;
      if (!engineerName || !weekStart || !projectName)
        return res.status(400).json({ message: "Missing required fields" });
      const f = (await readJsonFile<WeeklyAssignmentsFile>("weekly-assignments.json"))
        ?? { assignments: [], lastUpdated: new Date().toISOString() };
      const a: WeeklyAssignment = {
        id: req.body.id || `${engineerName}-${weekStart}-${Date.now()}`,
        engineerName, weekStart, projectName,
        projectTargetDate: req.body.projectTargetDate,
        resourceLockedFrom: req.body.resourceLockedFrom,
        resourceLockedTill: req.body.resourceLockedTill,
        internalTarget: req.body.internalTarget,
        customerTarget: req.body.customerTarget,
        tasks: req.body.tasks || [],
        currentStatus: req.body.currentStatus || "not_started",
        notes: req.body.notes, constraint: req.body.constraint
      };
      f.assignments.push(a);
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, "Add assignment");
      // ✅ Auto-sync: push project as targetTask into daily-activities for every day this week
      syncAssignmentToDailyActivities(a).catch(err => console.error("Daily sync error:", err));
      res.json(a);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.patch("/weekly-assignments/:id", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
      const f = await readJsonFile<WeeklyAssignmentsFile>("weekly-assignments.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const i = f.assignments.findIndex(a => a.id === req.params.id);
      if (i === -1) return res.status(404).json({ message: "Assignment not found" });
      f.assignments[i] = { ...f.assignments[i], ...req.body, id: req.params.id };
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, `Update ${req.params.id}`);
      // ✅ Auto-sync: re-sync updated assignment to daily-activities
      syncAssignmentToDailyActivities(f.assignments[i]).catch(err => console.error("Daily sync error:", err));
      res.json(f.assignments[i]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete("/weekly-assignments/:id", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
      const f = await readJsonFile<WeeklyAssignmentsFile>("weekly-assignments.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const before = f.assignments.length;
      f.assignments = f.assignments.filter(a => a.id !== req.params.id);
      if (f.assignments.length === before) return res.status(404).json({ message: "Not found" });
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, `Delete ${req.params.id}`);
      res.json({ message: "Assignment deleted" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/weekly-assignments/save-all", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
      const { weekStart } = req.body;
      const f = await readJsonFile<WeeklyAssignmentsFile>("weekly-assignments.json");
      const assignments = weekStart
        ? (f?.assignments ?? []).filter(a => a.weekStart === weekStart)
        : (f?.assignments ?? []);
      res.json({ success: true, count: assignments.length, assignments });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/weekly-assignments/:id/tasks", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
      const { taskName, targetDate, completionDate, status } = req.body;
      if (!taskName) return res.status(400).json({ message: "Task name required" });
      const f = await readJsonFile<WeeklyAssignmentsFile>("weekly-assignments.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const a = f.assignments.find(x => x.id === req.params.id);
      if (!a) return res.status(404).json({ message: "Assignment not found" });
      const task: WeeklyAssignmentTask = {
        id: `task-${Date.now()}`, taskName, targetDate, completionDate, status: status || "not_started"
      };
      a.tasks.push(task);
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, `Add task to ${req.params.id}`);
      res.json(task);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.patch("/weekly-assignments/:id/tasks/:taskId", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
      const f = await readJsonFile<WeeklyAssignmentsFile>("weekly-assignments.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const a = f.assignments.find(x => x.id === req.params.id);
      if (!a) return res.status(404).json({ message: "Assignment not found" });
      const ti = a.tasks.findIndex(t => t.id === req.params.taskId);
      if (ti === -1) return res.status(404).json({ message: "Task not found" });
      a.tasks[ti] = { ...a.tasks[ti], ...req.body, id: req.params.taskId };
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, `Update task ${req.params.taskId}`);
      res.json(a.tasks[ti]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete("/weekly-assignments/:id/tasks/:taskId", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
      const f = await readJsonFile<WeeklyAssignmentsFile>("weekly-assignments.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const a = f.assignments.find(x => x.id === req.params.id);
      if (!a) return res.status(404).json({ message: "Assignment not found" });
      a.tasks = a.tasks.filter(t => t.id !== req.params.taskId);
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, `Delete task ${req.params.taskId}`);
      res.json({ message: "Task deleted" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PROJECT NAMES ─────────────────────────────────────────────────────────

  router.get("/project-names", async (_req, res) => {
    try {
      const [wf, pd] = await Promise.all([
        readJsonFile<WeeklyAssignmentsFile>("weekly-assignments.json"),
        getProjectData(),
      ]);
      const seen = new Map<string, string>();
      const add = (name: string) => {
        if (!name.trim()) return;
        const k = extractProjectKey(name);
        if (!seen.has(k) || name.trim().length > seen.get(k)!.trim().length)
          seen.set(k, name.trim());
      };
      (wf?.assignments ?? []).forEach(a => add(a.projectName));
      pd.forEach(a => add(a.projectName));
      res.json(Array.from(seen.values()).sort());
    } catch (e: any) { res.status(503).json({ error: e.message }); }
  });

  // ── STATS ─────────────────────────────────────────────────────────────────

  router.get("/stats", async (_req, res) => {
    try {
      const [pd, cf] = await Promise.all([getProjectData(), readJsonFile<EngineerCredentialsFile>("engineers_auth.json")]);
      const total = pd.length;
      const completed = pd.filter(p => p.status?.toLowerCase() === "completed").length;
      res.json({
        totalProjects: total,
        activeMembers: (cf?.engineers ?? []).filter(e => e.isActive && e.role !== "admin").length,
        completionRate: total > 0 ? Math.round(completed / total * 100) : 0,
        recentActivities: 0
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── NOTIFICATIONS (in-memory) ─────────────────────────────────────────────

  const notifs: any[] = [];
  router.get("/notifications", (_req, res) => res.json(notifs));
  router.post("/notifications", (req, res) => {
    const n = { id: `n-${Date.now()}`, ...req.body };
    notifs.push(n);
    res.status(201).json(n);
  });
  router.patch("/notifications/:id/read", (req, res) => {
    const n = notifs.find(x => x.id === req.params.id);
    if (n) n.read = "true";
    res.json({ success: true });
  });
  router.patch("/notifications/read-all", (_req, res) => {
    notifs.forEach(n => n.read = "true");
    res.json({ success: true });
  });

  // ── PROJECTS (data.json) ──────────────────────────────────────────────────

  router.get("/projects", async (_req, res) => {
    try {
      const data = await getProjectData();
      const seen = new Set<number>();
      res.json(data.filter(d => seen.has(d.id) ? false : (seen.add(d.id), true)));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  /**
   * FIX #2b — New endpoint: get projects assigned to a specific engineer.
   * Uses normalised name matching so login name vs stored name differences don't break the view.
   */
  router.get("/projects/engineer/:name", async (req, res) => {
    try {
      const data = await getProjectData();
      const needle = normaliseEngineerName(req.params.name);
      const seen = new Set<number>();
      const filtered = data.filter(d => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return normaliseEngineerName(d.engineerName ?? "") === needle ||
               (d.engineerName ?? "").split(",").map((n: string) => normaliseEngineerName(n)).includes(needle);
      });
      res.json(filtered);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/projects", async (req, res) => {
    try {
      const r = await saveProjectAssignment(req.body);
      if (!r.success) return res.status(409).json({ error: r.message });
      res.status(201).json({ message: r.message, id: r.id });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.patch("/projects/:id", async (req, res) => {
    try {
      const r = await updateProjectAssignment(parseInt(req.params.id, 10), req.body);
      if (!r.success) return res.status(404).json({ error: r.message });
      res.json({ message: r.message });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete("/projects/:id", async (req, res) => {
    try {
      const r = await deleteProjectAssignment(parseInt(req.params.id, 10));
      if (!r.success) return res.status(404).json({ error: r.message });
      res.json({ message: r.message });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PROJECT ACTIVITIES ────────────────────────────────────────────────────

  router.get("/project-activities", async (_req, res) => {
    try {
      const [activities, assignments] = await Promise.all([getProjectActivities(), getProjectData()]);
      const map = new Map<string, { projectName: string; currentStatus: string; activities: Record<string, string> }>();
      for (const e of activities) {
        const k = e.projectName.trim().toLowerCase();
        if (map.has(k)) { map.get(k)!.activities = { ...map.get(k)!.activities, ...e.activities }; }
        else { map.set(k, { ...e, activities: { ...e.activities } }); }
      }
      const pKeys = new Set([...map.keys()].map(extractProjectKey));
      for (const a of assignments) {
        if (a.status?.toLowerCase() === "completed") continue;
        const k = a.projectName.trim().toLowerCase();
        const pk = extractProjectKey(a.projectName);
        if (!map.has(k) && !pKeys.has(pk)) {
          map.set(k, { projectName: a.projectName.trim(), currentStatus: a.status || "In Progress", activities: {} });
          pKeys.add(pk);
        }
      }
      res.json(Array.from(map.values()));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/project-activities", async (req, res) => {
    try {
      const { projectName, date, activity, status } = req.body;
      if (!projectName || !date || !activity)
        return res.status(400).json({ error: "projectName, date and activity required" });
      const r = await upsertProjectActivity(projectName, date, activity, status);
      if (!r.success) return res.status(400).json({ error: r.message });
      res.json({ message: r.message });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/project-activities/status", async (req, res) => {
    try {
      const { projectName, status } = req.body;
      if (!projectName || !status)
        return res.status(400).json({ error: "projectName and status required" });
      const r = await upsertProjectActivity(projectName, "", "", status);
      res.json({ success: r.success });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ANALYTICS ────────────────────────────────────────────────────────────

  router.get("/analytics", async (_req, res) => {
    try { res.json(await getAnalyticsSummary()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/analytics/engineer-workload", async (_req, res) => {
    try {
      const [wf, mf] = await Promise.all([
        readJsonFile<WeeklyAssignmentsFile>("weekly-assignments.json"),
        readJsonFile<EngineerTasksConfigFile>("engineers_master_list.json"),
      ]);
      const master = mf?.engineers ?? [];
      const resolve = (raw: string) => {
        const c = raw.trim();
        const ex = master.find(e => e.name.trim() === c);
        if (ex) return ex.name;
        const cl = normaliseEngineerName(c);
        return master.find(e => normaliseEngineerName(e.name) === cl)?.name ?? c;
      };
      const em = new Map<string, Map<string, { projectName: string; status: string; scopeOfWork: string; coEngineers: string[] }>>();
      for (const a of (wf?.assignments ?? [])) {
        if (a.currentStatus === "completed") continue;
        const engs = a.engineerName.split(",").map(n => resolve(n.trim())).filter(Boolean);
        const pk = extractProjectKey(a.projectName);
        for (const eng of engs) {
          if (!em.has(eng)) em.set(eng, new Map());
          const pm = em.get(eng)!;
          if (!pm.has(pk) || a.projectName.trim().length > pm.get(pk)!.projectName.trim().length)
            pm.set(pk, {
              projectName: a.projectName.trim(),
              status: STATUS_LABEL[a.currentStatus] || a.currentStatus,
              scopeOfWork: a.notes || a.constraint || "Not specified",
              coEngineers: engs.filter(e => e !== eng)
            });
        }
      }
      const now = new Date();
      const engineers = Array.from(em.entries())
        .map(([name, pm]) => ({ name, projects: Array.from(pm.values()), projectCount: pm.size }))
        .sort((a, b) => b.projectCount - a.projectCount);
      res.json({
        currentMonth: now.toLocaleString("default", { month: "long", year: "numeric" }),
        nextMonth: new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleString("default", { month: "long", year: "numeric" }),
        engineers, totalEngineers: engineers.length,
        totalAssignments: engineers.reduce((s, e) => s + e.projectCount, 0),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PROJECTS MASTER LIST ──────────────────────────────────────────────────

  router.get("/projects-master", async (_req, res) => {
    try {
      const list = await getProjectMasterList();
      const seen = new Set<string>();
      res.json(list.filter(p => {
        const k = p.projectNumber.trim().toLowerCase();
        return seen.has(k) ? false : (seen.add(k), true);
      }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/projects-master", async (req, res) => {
    try {
      const { projectNumber, projectName } = req.body;
      if (!projectNumber || !projectName)
        return res.status(400).json({ error: "projectNumber and projectName required" });
      const r = await addProjectToMasterList(projectNumber, projectName);
      if (!r.success) return res.status(409).json({ error: r.message });
      res.json({ message: r.message });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── VALIDATE ──────────────────────────────────────────────────────────────

  router.post("/validate", async (req, res) => {
    try {
      const { engineerName, projectName } = req.body;
      const [engs, ml] = await Promise.all([getEngineersMasterList(), getProjectMasterList()]);
      const errors: string[] = [];
      if (engineerName && !validateEngineerName(engineerName, engs))
        errors.push(`Engineer "${engineerName}" not in master list.`);
      if (projectName) {
        const pn = extractProjectNumber(projectName);
        if (pn && ml.length > 0 && !validateProjectNumber(pn, ml))
          errors.push(`Project "${pn}" will be auto-registered.`);
      }
      res.json({ valid: errors.length === 0, errors });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PROJECTS OVERVIEW ─────────────────────────────────────────────────────

  router.get("/projects-overview", async (_req, res) => {
    try {
      const [data, ml, engs] = await Promise.all([getProjectData(), getProjectMasterList(), getEngineersMasterList()]);
      const masterNames = new Set(engs.map(e => normaliseEngineerName(e.name)));
      const pm = new Map<string, { projectName: string; projectNumber: string | null; engineers: string[]; status: string; latestEnd: string }>();
      for (const a of data) {
        const k = a.projectName.trim().toLowerCase();
        const pn = extractProjectNumber(a.projectName);
        if (!pm.has(k)) pm.set(k, { projectName: a.projectName.trim(), projectNumber: pn, engineers: [], status: a.status, latestEnd: a.endDate });
        const e = pm.get(k)!;
        const eng = a.engineerName.trim();
        if (masterNames.has(normaliseEngineerName(eng)) && !e.engineers.some(x => normaliseEngineerName(x) === normaliseEngineerName(eng)))
          e.engineers.push(eng);
        if (a.endDate > e.latestEnd) e.latestEnd = a.endDate;
        if (a.status === "In Progress") e.status = "In Progress";
      }
      res.json(Array.from(pm.values()).map(p => ({
        ...p,
        registeredInMaster: p.projectNumber ? validateProjectNumber(p.projectNumber, ml) : false
      })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── DEBUG ────────────────────────────────────────────────────────────────

  router.get("/debug-users", async (_req, res) => {
    try {
      const f = await readJsonFile<EngineerCredentialsFile>("engineers_auth.json");
      res.json({ count: f?.engineers?.length ?? 0, usernames: (f?.engineers ?? []).map(e => e.username) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── MOUNT ─────────────────────────────────────────────────────────────────

  app.use("/api", router);
  return httpServer;
}
