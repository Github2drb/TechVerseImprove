// server/routes.ts  — DRB TechVerse — COMPLETE REWRITE
// Every route returns safe arrays. No handler can crash from undefined.map().
// Weekly assignments auto-sync to daily-activities on save/update.

import { Router, Request, Response } from "express";
import type { Server } from "http";
import {
  getProjectData, saveProjectAssignment, updateProjectAssignment, deleteProjectAssignment,
  getProjectActivities, upsertProjectActivity, getAnalyticsSummary,
  getEngineersMasterList, getProjectMasterList, addProjectToMasterList,
  validateEngineerName, validateProjectNumber, extractProjectNumber,
  readJsonFile, writeJsonFile,
} from "./github";

// ─── Shared types ─────────────────────────────────────────────────────────────

interface EngineerCredential {
  id: string; username: string; name: string; password: string;
  role: "admin" | "engineer"; company?: string;
  isActive: boolean; createdAt: string; lastLogin?: string;
}
interface CredFile { engineers: EngineerCredential[]; lastUpdated: string; }

interface WATask {
  id: string; taskName: string; targetDate?: string;
  completionDate?: string; status: "not_started"|"in_progress"|"completed"|"blocked";
}
interface WeeklyAssignment {
  id: string; engineerName: string; weekStart: string; projectName: string;
  projectTargetDate?: string; resourceLockedFrom?: string; resourceLockedTill?: string;
  internalTarget?: string; customerTarget?: string; tasks: WATask[];
  currentStatus: "not_started"|"in_progress"|"completed"|"on_hold"|"blocked";
  notes?: string; constraint?: string;
}
interface WAFile { assignments: WeeklyAssignment[]; lastUpdated: string; }

interface DailyTask   { id: string; text: string; }
interface DailyEntry  { engineerName: string; date: string; targetTasks: DailyTask[]; completedActivities: DailyTask[]; }
interface DailyFile   { engineerDailyData: DailyEntry[]; }

interface EngConfig   { id: string; name: string; initials: string; }
interface EngConfigFile { engineers: EngConfig[]; lastUpdated: string; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function norm(s: string) { return s.trim().replace(/\s*\([^)]*\)\s*/g,"").trim().toLowerCase(); }

function matchEngineer(field: string, loginName: string): boolean {
  const needle = norm(loginName).replace(/\./g, " ");
  return field
    .split(",")
    .map(n => norm(n))
    .some(n => n === needle || n.includes(needle) || needle.includes(n));
}
}

function isAdmin(req: Request): boolean {
  try {
    const h = req.headers["x-admin-auth"];
    if (!h) return false;
    const d = JSON.parse(Buffer.from(h as string, "base64").toString("utf-8"));
    return d?.role === "admin" || d?.username?.toLowerCase() === "admin";
  } catch { return false; }
}

function projKey(name: string): string {
  const m = name.trim().match(/^([A-Z0-9]{1,4}-[A-Z0-9]{1,5}-\d{4,6})/i);
  return m ? m[1].toUpperCase() : name.trim().toUpperCase();
}
function assignmentKey(a: { id?: number; projectName?: string; engineerName?: string; startDate?: string; weekStart?: string }): string {
  if (typeof a.id === "number" && Number.isFinite(a.id)) return `id:${a.id}`;
  return [
    (a.projectName || "").trim().toLowerCase(),
    (a.engineerName || "").trim().toLowerCase(),
    a.startDate || a.weekStart || "",
  ].join("|");
}
const STATUS: Record<string,string> = {
  not_started:"Not Started", in_progress:"In Progress",
  completed:"Completed", on_hold:"On Hold", blocked:"Blocked",
};

function weekDates(weekStart: string): string[] {
  const out: string[] = [];
  const d = new Date(weekStart + "T00:00:00");
  for (let i = 0; i < 6; i++) {
    const x = new Date(d); x.setDate(d.getDate() + i);
    out.push(x.toISOString().split("T")[0]);
  }
  return out;
}

// ─── Auto-sync weekly assignment → daily activities ───────────────────────────
async function syncToDailyActivities(a: WeeklyAssignment): Promise<void> {
  if (!a.engineerName || !a.projectName || !a.weekStart) return;
  try {
    const f = (await readJsonFile<DailyFile>("daily-activities.json")) ?? { engineerDailyData: [] };
    const text = `[${a.projectName}] ${a.notes || a.constraint || "Weekly project task"}`;
    const engineers = a.engineerName.split(",").map(n => n.trim()).filter(Boolean);
    let changed = false;

    for (const eng of engineers) {
      for (const date of weekDates(a.weekStart)) {
        const idx = f.engineerDailyData.findIndex(
          e => norm(e.engineerName) === norm(eng) && e.date === date
        );
        if (idx > -1) {
          if (!f.engineerDailyData[idx].targetTasks.some(t => t.text.includes(a.projectName))) {
            f.engineerDailyData[idx].targetTasks.push({ id: `wa-${Date.now()}-${Math.random().toString(36).substr(2,4)}`, text });
            changed = true;
          }
        } else {
          f.engineerDailyData.push({ engineerName: eng, date,
            targetTasks: [{ id: `wa-${Date.now()}-${Math.random().toString(36).substr(2,4)}`, text }],
            completedActivities: [] });
          changed = true;
        }
      }
    }
    if (changed) await writeJsonFile("daily-activities.json", f, `Sync weekly: ${a.engineerName} – ${a.projectName}`);
  } catch (e: any) { console.error("[syncToDailyActivities]", e.message); }
}

// ─── Register all routes ──────────────────────────────────────────────────────

export function registerRoutes(httpServer: Server, app: ReturnType<typeof import("express")["default"]>) {
  const r = Router();

  r.use((_q, res, next) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  // ── AUTH ────────────────────────────────────────────────────────────────────

  r.post("/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ message: "Username and password required" });

      const f = await readJsonFile<CredFile>("engineers_auth.json");
      const list: EngineerCredential[] = f?.engineers ?? [];

      // Always ensure admin exists in memory even if file is empty
      if (!list.find(e => e.username === "admin")) {
        list.push({ id: "admin-1", username: "admin", name: "Admin", password: "admin@drb",
          role: "admin", isActive: true, createdAt: new Date().toISOString() });
      }

      const found = list.find(e =>
        e.username.toLowerCase() === username.toLowerCase() &&
        e.password === password && e.isActive !== false
      );
      if (!found) return res.status(401).json({ message: "Invalid credentials" });

      found.lastLogin = new Date().toISOString();
      if (f) { f.lastUpdated = new Date().toISOString(); writeJsonFile("engineers_auth.json", f, "Update lastLogin").catch(() => {}); }

      return res.json({
        id: found.id, username: found.username, name: found.name,
        role: found.username.toLowerCase() === "admin" ? "admin" : found.role,
        company: found.company, email: `${found.username}@drbtechverse.com`, status: "active",
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  r.post("/auth/logout", (_q, res) => res.json({ success: true }));
  r.get("/auth/me", (_q, res) => res.status(401).json({ message: "Not authenticated" }));

  // ── ENGINEER CREDENTIALS ────────────────────────────────────────────────────

  r.get("/engineer-credentials", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const f = await readJsonFile<CredFile>("engineers_auth.json");
      const safe = (f?.engineers ?? []).map(({ password: _p, ...rest }) => rest);
      res.json({ engineers: safe, lastUpdated: f?.lastUpdated ?? "" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.post("/engineer-credentials", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const f = (await readJsonFile<CredFile>("engineers_auth.json")) ?? { engineers: [], lastUpdated: "" };
      const eng: EngineerCredential = {
        id: req.body.id || `eng-${Date.now()}`, username: req.body.username,
        name: req.body.name, password: req.body.password || "drb@123",
        role: req.body.role || "engineer", company: req.body.company,
        isActive: req.body.isActive !== false, createdAt: new Date().toISOString(),
      };
      f.engineers.push(eng); f.lastUpdated = new Date().toISOString();
      await writeJsonFile("engineers_auth.json", f, `Add engineer: ${eng.username}`);
      const { password: _p, ...safe } = eng;
      res.json({ success: true, engineer: safe });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.put("/engineer-credentials/:id", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const f = await readJsonFile<CredFile>("engineers_auth.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const i = f.engineers.findIndex(e => e.id === req.params.id);
      if (i === -1) return res.status(404).json({ message: "Not found" });
      f.engineers[i] = { ...f.engineers[i], ...req.body, id: req.params.id };
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("engineers_auth.json", f, `Update engineer ${req.params.id}`);
      const { password: _p, ...safe } = f.engineers[i];
      res.json({ success: true, engineer: safe });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.delete("/engineer-credentials/:id", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const f = await readJsonFile<CredFile>("engineers_auth.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const prev = f.engineers.length;
      f.engineers = f.engineers.filter(e => e.id !== req.params.id);
      if (f.engineers.length === prev) return res.status(404).json({ message: "Not found" });
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("engineers_auth.json", f, `Delete engineer ${req.params.id}`);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.post("/engineer-credentials/initialize", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const [ml, ex] = await Promise.all([
        readJsonFile<EngConfigFile>("engineers_master_list.json"),
        readJsonFile<CredFile>("engineers_auth.json"),
      ]);
      const f = ex ?? { engineers: [], lastUpdated: "" };
      const existing = new Set(f.engineers.map(e => e.username.toLowerCase()));
      let created = 0;
      for (const eng of (ml?.engineers ?? [])) {
        const u = norm(eng.name).replace(/\s+/g, ".");
        if (!existing.has(u)) {
          f.engineers.push({ id: eng.id, name: eng.name, username: u, password: "drb@123",
            role: "engineer", company: eng.name.match(/\(([^)]+)\)/)?.[1],
            isActive: true, createdAt: new Date().toISOString() });
          created++;
        }
      }
      if (!existing.has("admin")) {
        f.engineers.push({ id: "admin-1", name: "Admin", username: "admin", password: "admin@drb",
          role: "admin", isActive: true, createdAt: new Date().toISOString() });
        created++;
      }
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("engineers_auth.json", f, "Initialize credentials");
      res.json({ success: true, created });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.post("/engineer-credentials/reset-password", async (req, res) => {
    try {
      const { username, newPassword } = req.body;
      if (!username || !newPassword) return res.status(400).json({ message: "Missing fields" });
      const f = await readJsonFile<CredFile>("engineers_auth.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const eng = f.engineers.find(e => e.username.toLowerCase() === username.toLowerCase());
      if (!eng) return res.status(404).json({ message: "Engineer not found" });
      eng.password = newPassword; f.lastUpdated = new Date().toISOString();
      await writeJsonFile("engineers_auth.json", f, `Reset password: ${username}`);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── TEAM MEMBERS ────────────────────────────────────────────────────────────

  r.get("/team-members", async (_q, res) => {
    try {
      const f = await readJsonFile<CredFile>("engineers_auth.json");
      res.json((f?.engineers ?? [])
        .filter(e => e.isActive && e.role !== "admin")
        .map(e => ({ id: e.id, name: e.name, role: "Engineer",
          email: `${e.username}@drbtechverse.in`, department: "Engineering", status: "active", avatar: null })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ENGINEERS MASTER LIST ───────────────────────────────────────────────────
  // Returns [{id, name, initials}] — used by dropdown in Weekly Assignments modal

  r.get("/engineers-master", async (_q, res) => {
    try {
      const list = await getEngineersMasterList();
      const seen = new Set<string>();
      res.json(list.filter(e => { const k = norm(e.name); return seen.has(k) ? false : (seen.add(k), true); }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.get("/engineers-master-list", async (_q, res) => {
    try {
      const f = await readJsonFile<EngConfigFile>("engineers_master_list.json");
      res.json(f?.engineers ?? []);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.put("/engineers-master-list", async (req, res) => {
    try {
      const { engineers } = req.body;
      if (!Array.isArray(engineers)) return res.status(400).json({ message: "engineers must be array" });
      await writeJsonFile("engineers_master_list.json", { engineers, lastUpdated: new Date().toISOString() }, "Update engineers master list");
      res.json({ success: true, engineers });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.post("/engineers-master-list/initialize", async (_q, res) => {
    try {
      const f = await readJsonFile<EngConfigFile>("engineers_master_list.json");
      res.json({ success: true, count: f?.engineers?.length ?? 0 });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ENGINEER DAILY TASKS CONFIG ─────────────────────────────────────────────

  r.get("/engineer-daily-tasks-config", async (_q, res) => {
    try {
      const f = await readJsonFile<EngConfigFile>("engineers_master_list.json");
      res.json(f?.engineers ?? []);
    } catch (e: any) { res.status(503).json({ error: e.message }); }
  });

  r.post("/engineer-daily-tasks-config/initialize", async (_q, res) => {
    try {
      const f = await readJsonFile<EngConfigFile>("engineers_master_list.json");
      res.json({ success: true, created: 0, engineers: f?.engineers ?? [] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ENGINEER DAILY TASKS (dashboard summary) ────────────────────────────────

  r.get("/engineer-daily-tasks", async (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const [daily, master] = await Promise.all([
        readJsonFile<DailyFile>("daily-activities.json"),
        readJsonFile<EngConfigFile>("engineers_master_list.json"),
      ]);
      const entries = (daily?.engineerDailyData ?? []).filter(e => e.date === date);
      const engineers = (master?.engineers ?? []).filter(e => !e.name.match(/\([^)]+\)/));
      res.json(engineers.map(eng => {
        const e = entries.find(x => norm(x.engineerName) === norm(eng.name));
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

  // ── DAILY ACTIVITIES ────────────────────────────────────────────────────────

  r.get("/daily-activities", async (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const f = await readJsonFile<DailyFile>("daily-activities.json");
      const map = new Map<string, DailyEntry>();
      for (const entry of (f?.engineerDailyData ?? []).filter(e => e.date === date)) {
        const k = norm(entry.engineerName);
        if (!map.has(k)) {
          map.set(k, { ...entry, targetTasks: [...(entry.targetTasks ?? [])], completedActivities: [...(entry.completedActivities ?? [])] });
        } else {
          const ex = map.get(k)!;
          const tIds = new Set(ex.targetTasks.map(t => t.id));
          const aIds = new Set(ex.completedActivities.map(a => a.id));
          for (const t of (entry.targetTasks ?? [])) if (!tIds.has(t.id)) ex.targetTasks.push(t);
          for (const a of (entry.completedActivities ?? [])) if (!aIds.has(a.id)) ex.completedActivities.push(a);
        }
      }
      res.json(Array.from(map.values()));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── TARGET TASKS ────────────────────────────────────────────────────────────

  r.post("/engineer-target-tasks/:engineer", async (req, res) => {
    try {
      const { engineer } = req.params; const { task, date } = req.body;
      const f = (await readJsonFile<DailyFile>("daily-activities.json")) ?? { engineerDailyData: [] };
      const id = `t-${Date.now()}-${Math.random().toString(36).substr(2,5)}`;
      const i = f.engineerDailyData.findIndex(e => e.engineerName === engineer && e.date === date);
      if (i > -1) f.engineerDailyData[i].targetTasks.push({ id, text: task });
      else f.engineerDailyData.push({ engineerName: engineer, date, targetTasks: [{ id, text: task }], completedActivities: [] });
      await writeJsonFile("daily-activities.json", f, `Target task: ${engineer}`);
      res.json({ id, success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.delete("/engineer-target-tasks/:engineer/:taskId", async (req, res) => {
    try {
      const { engineer, taskId } = req.params; const { date } = req.body;
      const f = await readJsonFile<DailyFile>("daily-activities.json");
      if (f) {
        const i = f.engineerDailyData.findIndex(e => e.engineerName === engineer && e.date === date);
        if (i > -1) { f.engineerDailyData[i].targetTasks = f.engineerDailyData[i].targetTasks.filter(t => t.id !== taskId);
          await writeJsonFile("daily-activities.json", f, `Delete task ${taskId}`); }
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── DAILY COMPLETED ACTIVITIES ──────────────────────────────────────────────

  r.post("/engineer-daily-activities/:engineer", async (req, res) => {
    try {
      const { engineer } = req.params; const { activity, date } = req.body;
      const f = (await readJsonFile<DailyFile>("daily-activities.json")) ?? { engineerDailyData: [] };
      const id = `a-${Date.now()}-${Math.random().toString(36).substr(2,5)}`;
      const i = f.engineerDailyData.findIndex(e => e.engineerName === engineer && e.date === date);
      if (i > -1) f.engineerDailyData[i].completedActivities.push({ id, text: activity });
      else f.engineerDailyData.push({ engineerName: engineer, date, targetTasks: [], completedActivities: [{ id, text: activity }] });
      await writeJsonFile("daily-activities.json", f, `Activity: ${engineer}`);
      res.json({ id, success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.delete("/engineer-daily-activities/:engineer/:activityId", async (req, res) => {
    try {
      const { engineer, activityId } = req.params; const { date } = req.body;
      const f = await readJsonFile<DailyFile>("daily-activities.json");
      if (f) {
        const i = f.engineerDailyData.findIndex(e => e.engineerName === engineer && e.date === date);
        if (i > -1) { f.engineerDailyData[i].completedActivities = f.engineerDailyData[i].completedActivities.filter(a => a.id !== activityId);
          await writeJsonFile("daily-activities.json", f, `Delete activity ${activityId}`); }
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PENDING TASKS ───────────────────────────────────────────────────────────

  r.get("/pending-tasks/:engineer", async (req, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const f = await readJsonFile<DailyFile>("daily-activities.json");
      res.json((f?.engineerDailyData ?? [])
        .filter(e => norm(e.engineerName) === norm(req.params.engineer) && e.date < today)
        .flatMap(e => (e.targetTasks ?? []).map(t => ({ ...t, date: e.date }))));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── WEEKLY ASSIGNMENTS ──────────────────────────────────────────────────────

  r.get("/weekly-assignments", async (req, res) => {
    try {
      const f = await readJsonFile<WAFile>("weekly-assignments.json");
      const all = f?.assignments ?? [];
      const ws = req.query.weekStart as string | undefined;
      res.json(ws ? all.filter(a => a.weekStart === ws) : all);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Engineer-specific weekly assignments (non-admin users)
  r.get("/weekly-assignments/engineer/:name", async (req, res) => {
    try {
      const f = await readJsonFile<WAFile>("weekly-assignments.json");
      const all = f?.assignments ?? [];
      const ws = req.query.weekStart as string | undefined;
      res.json(all.filter(a => matchEngineer(a.engineerName, req.params.name) && (!ws || a.weekStart === ws)));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.post("/weekly-assignments", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const { engineerName, weekStart, projectName } = req.body;
      if (!engineerName || !weekStart || !projectName) return res.status(400).json({ message: "Missing required fields" });
      const f = (await readJsonFile<WAFile>("weekly-assignments.json")) ?? { assignments: [], lastUpdated: "" };
      const a: WeeklyAssignment = {
        id: req.body.id || `wa-${Date.now()}`,
        engineerName, weekStart, projectName,
        projectTargetDate: req.body.projectTargetDate,
        resourceLockedFrom: req.body.resourceLockedFrom,
        resourceLockedTill: req.body.resourceLockedTill,
        internalTarget: req.body.internalTarget,
        customerTarget: req.body.customerTarget,
        tasks: req.body.tasks || [],
        currentStatus: req.body.currentStatus || "not_started",
        notes: req.body.notes, constraint: req.body.constraint,
      };
      f.assignments.push(a); f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, `Add assignment: ${engineerName} – ${projectName}`);
      // Auto-sync to daily activities (non-blocking)
      syncToDailyActivities(a).catch(err => console.error("syncToDailyActivities:", err));
      res.json(a);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.patch("/weekly-assignments/:id", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const f = await readJsonFile<WAFile>("weekly-assignments.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const i = f.assignments.findIndex(a => a.id === req.params.id);
      if (i === -1) return res.status(404).json({ message: "Assignment not found" });
      f.assignments[i] = { ...f.assignments[i], ...req.body, id: req.params.id };
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, `Update assignment ${req.params.id}`);
      // Re-sync updated assignment
      syncToDailyActivities(f.assignments[i]).catch(err => console.error("syncToDailyActivities:", err));
      res.json(f.assignments[i]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.delete("/weekly-assignments/:id", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const f = await readJsonFile<WAFile>("weekly-assignments.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const prev = f.assignments.length;
      f.assignments = f.assignments.filter(a => a.id !== req.params.id);
      if (f.assignments.length === prev) return res.status(404).json({ message: "Not found" });
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, `Delete ${req.params.id}`);
      res.json({ message: "Deleted" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.post("/weekly-assignments/save-all", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const f = await readJsonFile<WAFile>("weekly-assignments.json");
      const { weekStart } = req.body;
      const assignments = weekStart ? (f?.assignments ?? []).filter(a => a.weekStart === weekStart) : (f?.assignments ?? []);
      res.json({ success: true, count: assignments.length, assignments });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.post("/weekly-assignments/:id/tasks", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const { taskName, targetDate, completionDate, status } = req.body;
      if (!taskName) return res.status(400).json({ message: "taskName required" });
      const f = await readJsonFile<WAFile>("weekly-assignments.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const a = f.assignments.find(x => x.id === req.params.id);
      if (!a) return res.status(404).json({ message: "Assignment not found" });
      const task: WATask = { id: `task-${Date.now()}`, taskName, targetDate, completionDate, status: status || "not_started" };
      a.tasks.push(task); f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, `Add task to ${req.params.id}`);
      res.json(task);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.patch("/weekly-assignments/:id/tasks/:taskId", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const f = await readJsonFile<WAFile>("weekly-assignments.json");
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

  r.delete("/weekly-assignments/:id/tasks/:taskId", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const f = await readJsonFile<WAFile>("weekly-assignments.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const a = f.assignments.find(x => x.id === req.params.id);
      if (!a) return res.status(404).json({ message: "Assignment not found" });
      a.tasks = a.tasks.filter(t => t.id !== req.params.taskId);
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, `Delete task ${req.params.taskId}`);
      res.json({ message: "Deleted" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PROJECT NAMES (for autocomplete) ───────────────────────────────────────

  r.get("/project-names", async (_q, res) => {
    try {
      const [wf, pd] = await Promise.all([readJsonFile<WAFile>("weekly-assignments.json"), getProjectData()]);
      const seen = new Map<string, string>();
      const add = (name: string) => {
        if (!name?.trim()) return;
        const k = projKey(name);
        if (!seen.has(k) || name.trim().length > seen.get(k)!.length) seen.set(k, name.trim());
      };
      (wf?.assignments ?? []).forEach(a => add(a.projectName));
      pd.forEach(a => add(a.projectName));
      res.json(Array.from(seen.values()).sort());
    } catch (e: any) { res.status(503).json({ error: e.message }); }
  });

  // ── STATS ───────────────────────────────────────────────────────────────────

   r.get("/projects", async (_q, res) => {
    try {
      const data = await getProjectData();
      const seen = new Set<string>();
      res.json(data.filter(d => {
        const k = assignmentKey(d);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── NOTIFICATIONS (in-memory, ephemeral is fine) ────────────────────────────
  
  const notifs: any[] = [];
  r.get("/notifications", (_q, res) => res.json(notifs));
  r.post("/notifications", (req, res) => { const n = { id: `n-${Date.now()}`, ...req.body }; notifs.push(n); res.status(201).json(n); });
  r.patch("/notifications/:id/read", (req, res) => { const n = notifs.find(x => x.id === req.params.id); if (n) n.read = true; res.json({ success: true }); });
  r.patch("/notifications/read-all", (_q, res) => { notifs.forEach(n => n.read = true); res.json({ success: true }); });

  // ── PROJECTS ────────────────────────────────────────────────────────────────

  r.get("/projects", async (_q, res) => {
    try {
      const data = await getProjectData();
      const seen = new Set<number>();
      res.json(data.filter(d => seen.has(d.id) ? false : (seen.add(d.id), true)));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Engineer-specific projects (for non-admin users)
  r.get("/projects/engineer/:name", async (req, res) => {
    try {
      const data = await getProjectData();
      const needle = norm(req.params.name);
      const seen = new Set<number>();
      res.json(data.filter(d => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return (d.engineerName || "").split(",").map(n => norm(n)).includes(needle);
      }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.post("/projects", async (req, res) => {
    try {
      const result = await saveProjectAssignment(req.body);
      if (!result.success) return res.status(409).json({ error: result.message });
      res.status(201).json({ message: result.message, id: result.id });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.patch("/projects/:id", async (req, res) => {
    try {
      const result = await updateProjectAssignment(parseInt(req.params.id, 10), req.body);
      if (!result.success) return res.status(404).json({ error: result.message });
      res.json({ message: result.message });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.delete("/projects/:id", async (req, res) => {
    try {
      const result = await deleteProjectAssignment(parseInt(req.params.id, 10));
      if (!result.success) return res.status(404).json({ error: result.message });
      res.json({ message: result.message });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PROJECT ACTIVITIES ──────────────────────────────────────────────────────

  r.get("/project-activities", async (_q, res) => {
    try {
      const [activities, assignments] = await Promise.all([getProjectActivities(), getProjectData()]);
      const map = new Map<string, { projectName: string; currentStatus: string; activities: Record<string,string> }>();
      for (const e of activities) {
        const k = e.projectName.trim().toLowerCase();
        if (map.has(k)) Object.assign(map.get(k)!.activities, e.activities);
        else map.set(k, { ...e, activities: { ...e.activities } });
      }
      const pKeys = new Set([...map.keys()].map(projKey));
      for (const a of assignments) {
        if (a.status?.toLowerCase() === "completed") continue;
        const k = a.projectName.trim().toLowerCase();
        const pk = projKey(a.projectName);
        if (!map.has(k) && !pKeys.has(pk)) {
          map.set(k, { projectName: a.projectName.trim(), currentStatus: a.status || "In Progress", activities: {} });
          pKeys.add(pk);
        }
      }
      res.json(Array.from(map.values()));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.post("/project-activities", async (req, res) => {
    try {
      const { projectName, date, activity, status } = req.body;
      if (!projectName || !date || !activity) return res.status(400).json({ error: "projectName, date, activity required" });
      const result = await upsertProjectActivity(projectName, date, activity, status);
      if (!result.success) return res.status(400).json({ error: result.message });
      res.json({ message: result.message });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.post("/project-activities/status", async (req, res) => {
    try {
      const { projectName, status } = req.body;
      if (!projectName || !status) return res.status(400).json({ error: "projectName and status required" });
      const result = await upsertProjectActivity(projectName, "", "", status);
      res.json({ success: result.success });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── ANALYTICS ───────────────────────────────────────────────────────────────

  r.get("/analytics", async (_q, res) => {
    try { res.json(await getAnalyticsSummary()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.get("/analytics/engineer-workload", async (_q, res) => {
    try {
      const [wf, mf] = await Promise.all([
        readJsonFile<WAFile>("weekly-assignments.json"),
        readJsonFile<EngConfigFile>("engineers_master_list.json"),
      ]);
      const master = mf?.engineers ?? [];
      const resolve = (raw: string): string => {
        const clean = (s: string) => s.trim().replace(/\s*\([^)]*\)\s*/g,"").trim().toLowerCase();
        return master.find(e => clean(e.name) === clean(raw))?.name ?? raw.trim();
      };

      const em = new Map<string, Map<string, { projectName:string; status:string; scopeOfWork:string; coEngineers:string[] }>>();
      for (const a of (wf?.assignments ?? [])) {
        if (a.currentStatus === "completed") continue;
        const engs = a.engineerName.split(",").map(n => resolve(n.trim())).filter(Boolean);
        const pk = projKey(a.projectName);
        for (const eng of engs) {
          if (!em.has(eng)) em.set(eng, new Map());
          const pm = em.get(eng)!;
          if (!pm.has(pk) || a.projectName.trim().length > (pm.get(pk)?.projectName.trim().length ?? 0))
            pm.set(pk, { projectName: a.projectName.trim(), status: STATUS[a.currentStatus] || a.currentStatus,
              scopeOfWork: a.notes || a.constraint || "Not specified", coEngineers: engs.filter(e => e !== eng) });
        }
      }

      const now = new Date();
      const engineers = Array.from(em.entries())
        .map(([name, pm]) => ({ name, projects: Array.from(pm.values()), projectCount: pm.size }))
        .sort((a, b) => b.projectCount - a.projectCount);

      res.json({
        currentMonth: now.toLocaleString("default", { month:"long", year:"numeric" }),
        nextMonth: new Date(now.getFullYear(), now.getMonth()+1, 1).toLocaleString("default", { month:"long", year:"numeric" }),
        engineers,
        totalEngineers: engineers.length,
        totalAssignments: engineers.reduce((s, e) => s + e.projectCount, 0),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PROJECTS MASTER LIST ────────────────────────────────────────────────────

  r.get("/projects-master", async (_q, res) => {
    try {
      const list = await getProjectMasterList();
      const seen = new Set<string>();
      res.json(list.filter(p => { const k = p.projectNumber.toLowerCase(); return seen.has(k) ? false : (seen.add(k), true); }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  r.post("/projects-master", async (req, res) => {
    try {
      const { projectNumber, projectName } = req.body;
      if (!projectNumber || !projectName) return res.status(400).json({ error: "projectNumber and projectName required" });
      const result = await addProjectToMasterList(projectNumber, projectName);
      if (!result.success) return res.status(409).json({ error: result.message });
      res.json({ message: result.message });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── PROJECTS OVERVIEW (All Engineers Week-wise) ────────────────────────────

  r.get("/projects-overview", async (_q, res) => {
    try {
      const [data, ml, engs] = await Promise.all([getProjectData(), getProjectMasterList(), getEngineersMasterList()]);
      const masterNames = new Set(engs.map(e => norm(e.name)));
      const pm = new Map<string, { projectName:string; projectNumber:string|null; engineers:string[]; status:string; latestEnd:string }>();
      for (const a of data) {
        const k = a.projectName.trim().toLowerCase();
        const pn = extractProjectNumber(a.projectName);
        if (!pm.has(k)) pm.set(k, { projectName: a.projectName.trim(), projectNumber: pn, engineers: [], status: a.status, latestEnd: a.endDate });
        const e = pm.get(k)!;
        const eng = a.engineerName.trim();
        if (masterNames.has(norm(eng)) && !e.engineers.some(x => norm(x) === norm(eng))) e.engineers.push(eng);
        if (a.endDate > e.latestEnd) e.latestEnd = a.endDate;
        if (a.status === "In Progress") e.status = "In Progress";
      }
      res.json(Array.from(pm.values()).map(p => ({
        ...p,
        registeredInMaster: p.projectNumber ? validateProjectNumber(p.projectNumber, ml) : false,
      })));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── VALIDATE ────────────────────────────────────────────────────────────────

  r.post("/validate", async (req, res) => {
    try {
      const { engineerName, projectName } = req.body;
      const [engs, ml] = await Promise.all([getEngineersMasterList(), getProjectMasterList()]);
      const errors: string[] = [];
      if (engineerName && !validateEngineerName(engineerName, engs)) errors.push(`Engineer "${engineerName}" not in master list`);
      if (projectName) {
        const pn = extractProjectNumber(projectName);
        if (pn && ml.length > 0 && !validateProjectNumber(pn, ml)) errors.push(`Project "${pn}" will be auto-registered`);
      }
      res.json({ valid: errors.length === 0, errors });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── DEBUG ────────────────────────────────────────────────────────────────────

  r.get("/debug-users", async (_q, res) => {
    try {
      const f = await readJsonFile<CredFile>("engineers_auth.json");
      res.json({ count: f?.engineers?.length ?? 0, usernames: (f?.engineers ?? []).map(e => e.username) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Health check ─────────────────────────────────────────────────────────────
  r.get("/health", async (_q, res) => {
    const token = !!process.env.GITHUB_TOKEN;
    const data = await readJsonFile("data.json").catch(() => null);
    res.json({ ok: true, githubToken: token, dataReadable: data !== null, ts: new Date().toISOString() });
  });

  app.use("/api", r);
  return httpServer;
}
