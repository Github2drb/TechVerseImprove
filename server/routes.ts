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

// Helpers
function norm(s: string): string {
  return s.trim().replace(/\s*\([^)]*\)\s*/g, "").trim().toLowerCase();
}

// Fuzzy match: handles "Susanth" matching "Susanth K M", "Santosh N" matching "Santhosh N", etc.
function fuzzyMatchEngineer(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  // One is a prefix of the other (e.g. "susanth" starts "susanth k m")
  if (nb.startsWith(na + " ") || na.startsWith(nb + " ")) return true;
  if (nb.startsWith(na) || na.startsWith(nb)) return true;
  // Handle single-letter surname omissions: "veeresh" vs "veeresh m"
  const partsA = na.split(/\s+/);
  const partsB = nb.split(/\s+/);
  if (partsA[0] === partsB[0]) return true; // same first name
  return false;
}

function matchEngineer(field: string, loginName: string): boolean {
  const needle = norm(loginName).replace(/\./g, " ");
  const names = field.split(",").map((n: string) => norm(n));
  return names.some((n: string) => n === needle || n.includes(needle) || needle.includes(n) || fuzzyMatchEngineer(n, needle));
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
  app.get("/api/knowledge/isa-101", async (_req, res) => {
  try {
    const metadata = {
      id: "isa-101-hmi-standards",
      title: "ISA-101 HMI Standards",
      category: "Controls Engineering",
      tags: ["ISA-101", "HMI", "SCADA", "Alarm Management", "Process Control"],
      description:
        "Complete guide to ISA-101 HMI standards covering color schemes, screen hierarchies, faceplate behaviors, and alarm lifecycle management.",
      publishedAt: "2025-05-16",
      readTimeMinutes: 15,
      sections: [
        "Screen Hierarchy (L1–L4)",
        "Color Scheme (Gray-background philosophy)",
        "Faceplate Design (§6.4 zone rules)",
        "Alarm Lifecycle (ISA-18.2 integration)",
      ],
    };
    res.json({ success: true, data: metadata });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Track when an engineer reads the article (POST /api/knowledge/isa-101/read)
app.post("/api/knowledge/isa-101/read", async (req, res) => {
  try {
    const { engineerName } = req.body as { engineerName?: string };
    if (!engineerName) {
      return res.status(400).json({ success: false, error: "engineerName required" });
    }

    const FILE = "knowledge-articles.json";
    type KnowledgeFile = Record<string, { readers: Array<{ name: string; readAt: string }> }>;
    let articles: KnowledgeFile = (await readJsonFile<KnowledgeFile>(FILE)) ?? {};

    if (!articles["isa-101-hmi-standards"]) {
      articles["isa-101-hmi-standards"] = { readers: [] };
    }

    const already = articles["isa-101-hmi-standards"].readers.find(
      (r) => r.name === engineerName
    );
    if (!already) {
      articles["isa-101-hmi-standards"].readers.push({
        name: engineerName,
        readAt: new Date().toISOString(),
      });
      await writeJsonFile(FILE, articles, `Knowledge article update`);
    }

    res.json({
      success: true,
      readersCount: articles["isa-101-hmi-standards"].readers.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// GET readers list (admin only)
app.get("/api/knowledge/isa-101/readers", async (_req, res) => {
  try {
    const FILE = "knowledge-articles.json";
    type KnowledgeFile = Record<string, { readers: Array<{ name: string; readAt: string }> }>;
    const articles: KnowledgeFile = (await readJsonFile<KnowledgeFile>(FILE)) ?? {};
    const readers = articles["isa-101-hmi-standards"]?.readers ?? [];
    res.json({ success: true, data: readers });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

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
        // Use fuzzy matching to handle "Susanth" vs "Susanth K M", "Veeresh" vs "Veeresh M", etc.
        const e = entries.find(x => fuzzyMatchEngineer(x.engineerName, eng.name));
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
        .filter(e => fuzzyMatchEngineer(e.engineerName, req.params.engineer) && e.date < today)
        .flatMap(e => (e.targetTasks ?? []).map(t => ({ ...t, date: e.date }))));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── WEEKLY ASSIGNMENTS ──────────────────────────────────────────────────────

  r.get("/weekly-assignments", async (req, res) => {
    try {
      // readJsonFile THROWS on a genuine read failure (caught below -> 503).
      // It returns null only when the file truly does not exist (404).
      // The destructive auto-bootstrap that used to overwrite this file on a
      // transient read failure has been REMOVED — it was the root cause of the
      // "all data became empty after deploy" bug.
      const f = await readJsonFile<WAFile>("weekly-assignments.json");
      const all = f?.assignments ?? [];
      const ws = req.query.weekStart as string | undefined;
      res.json(ws ? all.filter(a => a.weekStart === ws) : all);
    } catch (e: any) {
      // 503 (not 200 with []) so the client shows an error and KEEPS old data,
      // instead of rendering an empty screen.
      console.error("[GET /weekly-assignments]", e.message);
      res.status(503).json({ error: "Data source temporarily unavailable. Please retry." });
    }
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

  r.post("/weekly-assignments/save-all", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const f = await readJsonFile<WAFile>("weekly-assignments.json");
      const { weekStart } = req.body;
      const assignments = weekStart ? (f?.assignments ?? []).filter(a => a.weekStart === weekStart) : (f?.assignments ?? []);
      res.json({ success: true, count: assignments.length, assignments });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });


  r.patch("/weekly-assignments/:id", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });

      // Read current file. readJsonFile returns null ONLY on a true 404.
      // Any transient read failure throws -> caught below -> 503 (data is NOT touched).
      const f = (await readJsonFile<WAFile>("weekly-assignments.json"))
        ?? { assignments: [], lastUpdated: "" };

      const reqId = req.params.id;
      let i = f.assignments.findIndex(a => a.id === reqId);

      // ── UPSERT LOGIC — this is the permanent fix for "Failed to update" ──────
      // The tracker table merges weekly-assignments.json with synthetic rows
      // built from data.json (ids like "datajson-3-<project>"). Editing such a
      // row used to PATCH an id that does not exist in weekly-assignments.json
      // -> 404 -> "Failed to update assignment".
      // Now: if the id is not found, we try to match by projectName, and if
      // still not found we CREATE a real assignment. The edit always succeeds.
      if (i === -1) {
        const incomingProject = (req.body?.projectName || "").trim().toLowerCase();
        if (incomingProject) {
          i = f.assignments.findIndex(
            a => a.projectName.trim().toLowerCase() === incomingProject
          );
        }
      }

      if (i === -1) {
        // No matching record anywhere — create a brand-new real assignment.
        const newId = (reqId && !reqId.startsWith("datajson-") && !reqId.startsWith("bootstrap-"))
          ? reqId
          : `wa-${Date.now()}`;
        const created: WeeklyAssignment = {
          id: newId,
          engineerName: req.body?.engineerName || "",
          weekStart: req.body?.weekStart || new Date().toISOString().split("T")[0],
          projectName: req.body?.projectName || "",
          projectTargetDate: req.body?.projectTargetDate,
          resourceLockedFrom: req.body?.resourceLockedFrom,
          resourceLockedTill: req.body?.resourceLockedTill,
          internalTarget: req.body?.internalTarget,
          customerTarget: req.body?.customerTarget,
          tasks: Array.isArray(req.body?.tasks) ? req.body.tasks : [],
          currentStatus: req.body?.currentStatus || "not_started",
          notes: req.body?.notes || "",
          constraint: req.body?.constraint || "",
        };
        f.assignments.push(created);
        f.lastUpdated = new Date().toISOString();
        await writeJsonFile("weekly-assignments.json", f,
          `Create assignment via edit: ${created.projectName}`);
        syncToDailyActivities(created).catch(err => console.error("syncToDailyActivities:", err));
        return res.json(created);
      }

      // Normal update of an existing real assignment.
      f.assignments[i] = { ...f.assignments[i], ...req.body, id: f.assignments[i].id };
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, `Update assignment ${f.assignments[i].id}`);
      syncToDailyActivities(f.assignments[i]).catch(err => console.error("syncToDailyActivities:", err));
      res.json(f.assignments[i]);
    } catch (e: any) {
      // Read/write against GitHub failed — return 503 so the client shows a
      // retryable error and KEEPS the data on screen (never goes empty).
      console.error("[PATCH /weekly-assignments]", e.message);
      res.status(503).json({ error: e.message || "Update temporarily unavailable — please retry" });
    }
  });

  r.delete("/weekly-assignments/:id", async (req, res) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
      const f = await readJsonFile<WAFile>("weekly-assignments.json");
      if (!f) return res.status(404).json({ message: "Not found" });
      const prev = f.assignments.length;

      // Synthetic rows (datajson-* / bootstrap-*) carry the project name after
      // the prefix. If the literal id is not present, fall back to deleting by
      // project name so a deletion request never silently 404s.
      f.assignments = f.assignments.filter(a => a.id !== req.params.id);
      if (f.assignments.length === prev) {
        const projFromSynthetic = req.params.id
          .replace(/^datajson-\d+-/, "")
          .replace(/^bootstrap-\d+-/, "")
          .trim()
          .toLowerCase();
        if (projFromSynthetic) {
          f.assignments = f.assignments.filter(
            a => a.projectName.trim().toLowerCase() !== projFromSynthetic
          );
        }
      }
      if (f.assignments.length === prev) {
        // Nothing matched — it was a synthetic-only row not present in
        // weekly-assignments.json. Treat as success (idempotent delete).
        return res.json({ message: "Nothing to delete (synthetic row)" });
      }
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("weekly-assignments.json", f, `Delete ${req.params.id}`);
      res.json({ message: "Deleted" });
    } catch (e: any) {
      console.error("[DELETE /weekly-assignments]", e.message);
      res.status(503).json({ error: e.message || "Delete temporarily unavailable — please retry" });
    }
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

  // ── NOTIFICATIONS (in-memory, ephemeral is fine) ────────────────────────────
  
  const notifs: any[] = [];
  // ─────────────────────────────────────────────────────────────────────────────
// ADD THIS BLOCK TO server/routes.ts
// Paste it inside registerRoutes(), just before the health check route.
// Also REPLACE the existing in-memory notifications block (4 lines) with
// the persistent versions below.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────
interface BlogPost {
  id: string; title: string; author: string; date: string;
  category: string; tags: string[]; coverImage: string;
  excerpt: string; content: string;
  isPinned: boolean; isPublished: boolean; createdAt: string;
}
interface BlogFile { posts: BlogPost[]; lastUpdated: string; }

interface Notification {
  id: string; title: string; message: string;
  type: "info"|"success"|"warning"|"alert";
  link?: string; isRead: boolean; author: string; createdAt: string;
}
interface NotifFile { notifications: Notification[]; lastUpdated: string; }

// ── BLOG POSTS ────────────────────────────────────────────────────────────────

r.get("/blog-posts", async (req, res) => {
  try {
    const f = await readJsonFile<BlogFile>("blog-posts.json");
    let posts = (f?.posts ?? []);
    // Non-admins only see published posts
    if (!isAdmin(req)) posts = posts.filter(p => p.isPublished);
    // Sort: pinned first, then newest
    posts.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    res.json(posts);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

r.get("/blog-posts/:id", async (req, res) => {
  try {
    const f = await readJsonFile<BlogFile>("blog-posts.json");
    const post = (f?.posts ?? []).find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (!post.isPublished && !isAdmin(req))
      return res.status(403).json({ message: "Not published" });
    res.json(post);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

r.post("/blog-posts", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    const f = (await readJsonFile<BlogFile>("blog-posts.json"))
      ?? { posts: [], lastUpdated: "" };
    const post: BlogPost = {
      id: `post-${Date.now()}`,
      title:       req.body.title       ?? "Untitled",
      author:      req.body.author      ?? "Admin",
      date:        req.body.date        ?? new Date().toISOString().split("T")[0],
      category:    req.body.category    ?? "General",
      tags:        req.body.tags        ?? [],
      coverImage:  req.body.coverImage  ?? "",
      excerpt:     req.body.excerpt     ?? "",
      content:     req.body.content     ?? "",
      isPinned:    req.body.isPinned    ?? false,
      isPublished: req.body.isPublished ?? false,
      createdAt:   new Date().toISOString(),
    };
    f.posts.push(post);
    f.lastUpdated = new Date().toISOString();
    await writeJsonFile("blog-posts.json", f, `New post: ${post.title}`);
    res.status(201).json(post);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

r.put("/blog-posts/:id", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    const f = await readJsonFile<BlogFile>("blog-posts.json");
    if (!f) return res.status(404).json({ message: "Not found" });
    const i = f.posts.findIndex(p => p.id === req.params.id);
    if (i === -1) return res.status(404).json({ message: "Post not found" });
    f.posts[i] = { ...f.posts[i], ...req.body, id: req.params.id };
    f.lastUpdated = new Date().toISOString();
    await writeJsonFile("blog-posts.json", f, `Update post: ${f.posts[i].title}`);
    res.json(f.posts[i]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

r.delete("/blog-posts/:id", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    const f = await readJsonFile<BlogFile>("blog-posts.json");
    if (!f) return res.status(404).json({ message: "Not found" });
    const prev = f.posts.length;
    f.posts = f.posts.filter(p => p.id !== req.params.id);
    if (f.posts.length === prev) return res.status(404).json({ message: "Post not found" });
    f.lastUpdated = new Date().toISOString();
    await writeJsonFile("blog-posts.json", f, `Delete post ${req.params.id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── NOTIFICATIONS (persistent — replaces the in-memory block) ─────────────────
// DELETE the old 4-line in-memory notifications block and use these instead:

// ─────────────────────────────────────────────────────────────────────────────
// REPLACE all existing notification routes in server/routes.ts with these.
// Find the block starting with:
//   r.get("/notifications", ...
// and ending with:
//   r.patch("/notifications/read-all", ...
// Delete those lines and paste this entire block instead.
// ─────────────────────────────────────────────────────────────────────────────
 
interface NotifV2 {
  id: string; title: string; message: string;
  type: string; link?: string; isTicker?: boolean;
  readBy: string[];   // ← replaces isRead boolean
  author: string; createdAt: string;
}
interface NotifFile2 { notifications: NotifV2[]; lastUpdated: string; }
 
// Helper: migrate old isRead boolean → readBy array
function migrateNotif(n: any): NotifV2 {
  if (!n.readBy) {
    n.readBy = n.isRead ? ["__all__"] : []; // __all__ = was already read by everyone (legacy)
    delete n.isRead;
  }
  return n as NotifV2;
}
 
r.get("/notifications", async (req, res) => {
  try {
    const currentUser = ((req.headers["x-current-user"] as string) || "guest").toLowerCase();
    const f = await readJsonFile<NotifFile2>("notifications.json");
    const notifs = (f?.notifications ?? [])
      .map(migrateNotif)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(n => ({
        ...n,
        isRead: n.readBy.includes(currentUser) || n.readBy.includes("__all__"),
      }));
    res.json(notifs);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
 
r.post("/notifications", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    const f = (await readJsonFile<NotifFile2>("notifications.json"))
      ?? { notifications: [], lastUpdated: "" };
    f.notifications = f.notifications.map(migrateNotif);
    const n: NotifV2 = {
      id:        `notif-${Date.now()}`,
      title:     req.body.title   ?? "Notification",
      message:   req.body.message ?? "",
      type:      req.body.type    ?? "info",
      link:      req.body.link,
      isTicker:  req.body.isTicker ?? false,
      readBy:    [],  // unread for everyone
      author:    req.body.author ?? "Admin",
      createdAt: new Date().toISOString(),
    };
    f.notifications.push(n);
    f.lastUpdated = new Date().toISOString();
    await writeJsonFile("notifications.json", f, `New notification: ${n.title}`);
    res.status(201).json(n);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
 
r.patch("/notifications/:id/read", async (req, res) => {
  try {
    const currentUser = ((req.headers["x-current-user"] as string) || "guest").toLowerCase();
    const f = await readJsonFile<NotifFile2>("notifications.json");
    if (!f) return res.status(404).json({ message: "Not found" });
    f.notifications = f.notifications.map(migrateNotif);
    const n = f.notifications.find(x => x.id === req.params.id);
    if (!n) return res.status(404).json({ message: "Not found" });
    if (!n.readBy.includes(currentUser)) {
      n.readBy.push(currentUser);
      f.lastUpdated = new Date().toISOString();
      await writeJsonFile("notifications.json", f, `Read by ${currentUser}`);
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
 
r.patch("/notifications/read-all", async (req, res) => {
  try {
    const currentUser = ((req.headers["x-current-user"] as string) || "guest").toLowerCase();
    const f = await readJsonFile<NotifFile2>("notifications.json");
    if (!f) return res.json({ success: true });
    f.notifications = f.notifications.map(migrateNotif);
    f.notifications.forEach(n => {
      if (!n.readBy.includes(currentUser)) n.readBy.push(currentUser);
    });
    f.lastUpdated = new Date().toISOString();
    await writeJsonFile("notifications.json", f, `Read all by ${currentUser}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
 
r.patch("/notifications/:id/ticker", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    const f = await readJsonFile<NotifFile2>("notifications.json");
    if (!f) return res.status(404).json({ message: "Not found" });
    f.notifications = f.notifications.map(migrateNotif);
    const n = f.notifications.find((x: any) => x.id === req.params.id);
    if (!n) return res.status(404).json({ message: "Not found" });
    n.isTicker = req.body.isTicker ?? !n.isTicker;
    f.lastUpdated = new Date().toISOString();
    await writeJsonFile("notifications.json", f, `Toggle ticker: ${n.title}`);
    res.json({ success: true, isTicker: n.isTicker });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
 
r.delete("/notifications/:id", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    const f = await readJsonFile<NotifFile2>("notifications.json");
    if (!f) return res.status(404).json({ message: "Not found" });
    f.notifications = f.notifications.filter((n: any) => n.id !== req.params.id);
    f.lastUpdated = new Date().toISOString();
    await writeJsonFile("notifications.json", f, `Delete notification ${req.params.id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

r.delete("/notifications/:id", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    const f = await readJsonFile<NotifFile>("notifications.json");
    if (!f) return res.status(404).json({ message: "Not found" });
    f.notifications = f.notifications.filter(n => n.id !== req.params.id);
    f.lastUpdated = new Date().toISOString();
    await writeJsonFile("notifications.json", f, `Delete notification ${req.params.id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});


  // ── PROJECTS ────────────────────────────────────────────────────────────────

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

  // Engineer-specific projects (for non-admin users)
  r.get("/projects/engineer/:name", async (req, res) => {
    try {
      const data = await getProjectData();
      const needle = norm(req.params.name).replace(/\./g, " ");
      const seen = new Set<string>();
      res.json(data.filter(d => {
       const k = assignmentKey(d);
        if (seen.has(k)) return false;
        seen.add(k);
        const names = (d.engineerName || "").split(",").map(n => norm(n));
        return names.some(n => n === needle || n.includes(needle) || needle.includes(n));
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
    const [activities, waFile] = await Promise.all([
      getProjectActivities(),
      readJsonFile<WAFile>("weekly-assignments.json"),
    ]);
 
    // ── ONLY show projects that exist in weekly-assignments.json ──────────────
    // This removes stale projects from data.json / project-activities.json
    const activeAssignments = waFile?.assignments ?? [];
 
    // Build a set of active project keys from weekly-assignments
    const activeProjKeys = new Set(
      activeAssignments
        .filter(a => a.projectName?.trim())
        .map(a => projKey(a.projectName))
    );
 
    // If weekly-assignments is empty (first load), fall back to showing all
    const filterByActive = activeProjKeys.size > 0;
 
    const map = new Map<string, {
      projectName: string; currentStatus: string; activities: Record<string,string>
    }>();
 
    // 1. Seed from project-activities.json — but only if project is active
    for (const e of activities) {
      const pk = projKey(e.projectName);
      if (filterByActive && !activeProjKeys.has(pk)) continue; // skip inactive
      const k = e.projectName.trim().toLowerCase();
      if (map.has(k)) Object.assign(map.get(k)!.activities, e.activities);
      else map.set(k, { ...e, activities: { ...e.activities } });
    }
 
    // 2. Add active weekly assignments not yet in map
    const STATUS_DISPLAY: Record<string,string> = {
      in_progress: "In Progress", not_started: "Not Started",
      completed: "Completed", on_hold: "On Hold", blocked: "Blocked",
    };
    const pKeys = new Set([...map.keys()].map(projKey));
 
    for (const a of activeAssignments) {
      if (!a.projectName?.trim()) continue;
      const k  = a.projectName.trim().toLowerCase();
      const pk = projKey(a.projectName);
      if (!map.has(k) && !pKeys.has(pk)) {
        const displayStatus = STATUS_DISPLAY[a.currentStatus ?? ""] ?? a.currentStatus ?? "In Progress";
        map.set(k, { projectName: a.projectName.trim(), currentStatus: displayStatus, activities: {} });
        pKeys.add(pk);
      }
    }
 
    res.json(Array.from(map.values()));
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
        if ((a.currentStatus ?? "").toLowerCase() === "completed") continue;
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

  // ── DAILY REPORT ATTENDANCE ──────────────────────────────────────────────────
// Add this block inside registerRoutes(), just before the health check route.
// Saves/loads attendance data to daily-report-data.json in Controls_Team_Tracker.

interface DailyReportFile {
  attendance: Record<string, Record<string, Record<string, string>>>;
  // structure: attendance[year][month][engId][day] = value
  lastUpdated: string;
}

r.get("/daily-report-data", async (req, res) => {
  try {
    const { year, month } = req.query as { year?: string; month?: string };
    const f = await readJsonFile<DailyReportFile>("daily-report-data.json");
    if (!f) return res.json({ attendance: {} });
    if (year && month !== undefined) {
      const monthData = f.attendance?.[year]?.[month] ?? {};
      return res.json({ attendance: monthData });
    }
    res.json(f);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

r.post("/daily-report-data", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    const { year, month, attendance } = req.body as {
      year?: string | number;
      month?: string | number;
      attendance?: Record<string, Record<string, string>>;
    };
    if (!year || month === undefined || !attendance)
      return res.status(400).json({ message: "year, month, attendance required" });

    const f = (await readJsonFile<DailyReportFile>("daily-report-data.json"))
      ?? { attendance: {}, lastUpdated: "" };

    const y = String(year);
    const m = String(month);
    if (!f.attendance[y]) f.attendance[y] = {};
    f.attendance[y][m] = attendance;
    f.lastUpdated = new Date().toISOString();

    await writeJsonFile(
      "daily-report-data.json", f,
      `Daily report save: ${y}-${String(parseInt(m)+1).padStart(2,"0")}`
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADD TO server/routes.ts — paste just before the health check route
// Handles saving/loading project status overrides to project-status-data.json
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectStatusFile {
  overrides: Record<string, string[]>; // projId -> array of status per phase
  phases:    string[];
  projects:  Array<{ id: string; name: string; engineer: string }>;
  lastUpdated: string;
}

r.get("/project-status-data", async (_q, res) => {
  try {
    const f = await readJsonFile<ProjectStatusFile>("project-status-data.json");
    if (!f) return res.json({ exists: false });
    res.json({ exists: true, ...f });
  } catch {
    res.json({ exists: false }); // no saved data yet = use Excel defaults
  }
});

r.post("/project-status-data", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    const f: ProjectStatusFile = {
      overrides:   req.body.overrides   ?? {},
      phases:      req.body.phases      ?? [],
      projects:    req.body.projects    ?? [],
      lastUpdated: new Date().toISOString(),
    };
    await writeJsonFile("project-status-data.json", f, "Update project status overrides");
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADD TO server/routes.ts — paste just before the health check route
// Proxies the Excel file through the backend (uses GITHUB_TOKEN, no CORS issues)
// ─────────────────────────────────────────────────────────────────────────────

r.get("/project-status-excel", async (_q, res) => {
  try {
    const token = process.env.GITHUB_TOKEN || "";
    const headers: Record<string,string> = {
      "Accept":        "application/vnd.github.v3+json",
      "Cache-Control": "no-cache",
      "User-Agent":    "DRBTechVerse/1.0",
    };
    if (token) headers["Authorization"] = `token ${token}`;

    const apiRes = await fetch(
      "https://api.github.com/repos/Github2drb/TechVerseImprove/contents/Project%20Status_May_Sept_2026.xlsx",
      { headers }
    );
    if (!apiRes.ok) {
      const txt = await apiRes.text();
      throw new Error(`GitHub API HTTP ${apiRes.status}: ${txt}`);
    }
    const meta: any = await apiRes.json();
    // Return base64 content — frontend decodes with SheetJS
    res.json({ content: meta.content, sha: meta.sha });
  } catch (e: any) {
    console.error("[project-status-excel]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADD TO server/routes.ts — paste just before the health check route
// Toggles isTicker flag on a notification
// ─────────────────────────────────────────────────────────────────────────────
 
r.patch("/notifications/:id/ticker", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });
    const f = await readJsonFile<{ notifications: any[]; lastUpdated: string }>("notifications.json");
    if (!f) return res.status(404).json({ message: "Not found" });
    const n = f.notifications.find((x: any) => x.id === req.params.id);
    if (!n) return res.status(404).json({ message: "Notification not found" });
    n.isTicker = req.body.isTicker ?? !n.isTicker; // toggle if not passed
    f.lastUpdated = new Date().toISOString();
    await writeJsonFile("notifications.json", f, `Toggle ticker: ${n.title}`);
    res.json({ success: true, isTicker: n.isTicker });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── END DAILY REPORT ATTENDANCE ──────────────────────────────────────────────  
// ─────────────────────────────────────────────────────────────────────────────
// ADD TO server/routes.ts — paste before the health check route
// Handles per-engineer notice board comments and acknowledgements
// ─────────────────────────────────────────────────────────────────────────────

interface NBComment {
  id: string; text: string; date: string; createdAt: string; type: "note"|"update"|"blocker";
}
interface NBEngineer {
  comments: NBComment[];
  dismissedMissed: string[]; // assignment IDs dismissed
}
interface NBFile {
  data: Record<string, NBEngineer>; // key = engineerName.toLowerCase()
  lastUpdated: string;
}

function nbKey(name: string) { return name.trim().toLowerCase(); }

r.get("/notice-board/:engineer", async (req, res) => {
  try {
    const key = nbKey(req.params.engineer);
    const f   = await readJsonFile<NBFile>("notice-board.json");
    const eng = f?.data?.[key] ?? { comments: [], dismissedMissed: [] };
    res.json(eng);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

r.post("/notice-board/:engineer/comment", async (req, res) => {
  try {
    const key = nbKey(req.params.engineer);
    const f   = (await readJsonFile<NBFile>("notice-board.json"))
      ?? { data: {}, lastUpdated: "" };
    if (!f.data[key]) f.data[key] = { comments: [], dismissedMissed: [] };
    const comment: NBComment = {
      id:        `c-${Date.now()}`,
      text:      req.body.text ?? "",
      date:      req.body.date ?? new Date().toISOString().split("T")[0],
      type:      req.body.type ?? "note",
      createdAt: new Date().toISOString(),
    };
    f.data[key].comments.push(comment);
    // Keep only last 50 comments per engineer
    if (f.data[key].comments.length > 50)
      f.data[key].comments = f.data[key].comments.slice(-50);
    f.lastUpdated = new Date().toISOString();
    await writeJsonFile("notice-board.json", f, `NB comment: ${req.params.engineer}`);
    res.status(201).json(comment);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

r.delete("/notice-board/:engineer/comment/:id", async (req, res) => {
  try {
    const key = nbKey(req.params.engineer);
    const f   = await readJsonFile<NBFile>("notice-board.json");
    if (!f?.data?.[key]) return res.status(404).json({ message: "Not found" });
    f.data[key].comments = f.data[key].comments.filter(c => c.id !== req.params.id);
    f.lastUpdated = new Date().toISOString();
    await writeJsonFile("notice-board.json", f, `NB delete comment: ${req.params.engineer}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

r.patch("/notice-board/:engineer/dismiss/:assignmentId", async (req, res) => {
  try {
    const key = nbKey(req.params.engineer);
    const f   = (await readJsonFile<NBFile>("notice-board.json"))
      ?? { data: {}, lastUpdated: "" };
    if (!f.data[key]) f.data[key] = { comments: [], dismissedMissed: [] };
    if (!f.data[key].dismissedMissed.includes(req.params.assignmentId))
      f.data[key].dismissedMissed.push(req.params.assignmentId);
    f.lastUpdated = new Date().toISOString();
    await writeJsonFile("notice-board.json", f, `NB dismiss: ${req.params.engineer}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
// ── Health check ─────────────────────────────────────────────────────────────
  r.get("/health", async (_q, res) => {
    
    const token = !!process.env.GITHUB_TOKEN;
    const data = await readJsonFile("data.json").catch(() => null);
    res.json({ ok: true, githubToken: token, dataReadable: data !== null, ts: new Date().toISOString() });
  });

  // ── DEBUG — quick health check accessible from browser ─────────────────────
  r.get("/debug/status", async (_req, res) => {
    try {
      const [wa, da, creds, master] = await Promise.all([
        readJsonFile<any>("weekly-assignments.json"),
        readJsonFile<any>("daily-activities.json"),
        readJsonFile<any>("engineers_auth.json"),
        readJsonFile<any>("engineers_master_list.json"),
      ]);
      const dataJson = await readJsonFile<any>("data.json");
      res.json({
        ok: true,
        "weekly-assignments": wa ? `${(wa.assignments ?? []).length} records` : "FILE MISSING",
        "daily-activities": da ? `${(da.engineerDailyData ?? []).length} records` : "FILE MISSING",
        "engineers_auth": creds ? `${(creds.engineers ?? []).length} engineers` : "FILE MISSING",
        "engineers_master_list": master ? `${(master.engineers ?? []).length} engineers` : "FILE MISSING",
        "data.json": dataJson
          ? `${(dataJson.data ?? dataJson.assignments ?? []).length} assignments (key: ${dataJson.data ? "data" : "assignments"})`
          : "FILE MISSING",
        GITHUB_TOKEN: process.env.GITHUB_TOKEN ? "SET" : "NOT SET — all reads will fail!",
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.use("/api", r);
  return httpServer;
}
