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
} from "./github";

// Extend express-session with our custom fields
declare module "express-session" {
  interface SessionData {
    userId: string;
    username: string;
    name: string;
    role: string;
  }
}

export function registerRoutes(
  httpServer: Server,
  app: ReturnType<typeof import("express")["default"]>
) {
  const router = Router();

  // ── Auth ─────────────────────────────────────────────────────────────────

  // POST /api/auth/login
  router.post("/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
      }

      // Try reading from GitHub first
      let engineers: any[] = [];
      try {
        const raw = await (readJsonFile as any)("engineers_auth.json");
        if (raw?.engineers?.length > 0) {
          engineers = raw.engineers;
        }
      } catch (e) {
        console.error("Failed to read engineers from GitHub:", e);
      }

      // Fallback: hardcoded users in case GitHub read fails
      if (engineers.length === 0) {
        engineers = [
          { id: "admin-1", username: "admin", password: "admin@drb", name: "Admin", role: "admin", isActive: true },
          { id: "eng-1775028596527", username: "kavitha", password: "kavitha@123", name: "Kavitha", role: "admin", isActive: true },
          { id: "eng-5", username: "santhosh.n", password: "drb@123", name: "Santhosh N", role: "engineer", isActive: true },
          { id: "eng-6", username: "dyumith.nv", password: "drb@123", name: "Dyumith NV", role: "engineer", isActive: true },
          { id: "eng-7", username: "susanth.k.m", password: "drb@123", name: "Susanth K M", role: "engineer", isActive: true },
          { id: "eng-3", username: "praveen.kumar.c", password: "drb@123", name: "Praveen Kumar C", role: "engineer", isActive: true },
          { id: "eng-10", username: "dhanesh.m", password: "drb@123", name: "Dhanesh M", role: "engineer", isActive: true },
          { id: "eng-11", username: "harsha", password: "drb@123", name: "Harsha", role: "engineer", isActive: true },
          { id: "eng-12", username: "veeresh.m", password: "drb@123", name: "Veeresh M", role: "engineer", isActive: true },
          { id: "eng-13", username: "keerthi.bh", password: "drb@123", name: "Keerthi BH", role: "engineer", isActive: true },
          { id: "eng-14", username: "deekshitha.hc", password: "drb@123", name: "Deekshitha HC", role: "engineer", isActive: true },
          { id: "eng-16", username: "ramkumar.annamalai", password: "drb@123", name: "Ramkumar Annamalai", role: "engineer", isActive: true },
          { id: "eng-17", username: "eswanth.potnuri", password: "drb@123", name: "Eswanth Potnuri", role: "engineer", isActive: true },
          { id: "eng-20", username: "ullaz", password: "drb@123", name: "Ullaz (PAES)", role: "engineer", isActive: true },
          { id: "eng-21", username: "vishnu", password: "drb@123", name: "Vishnu (PAES)", role: "engineer", isActive: true },
          { id: "eng-22", username: "sarath", password: "drb@123", name: "Sarath (PAES)", role: "engineer", isActive: true },
          { id: "eng-23", username: "mallikarjun", password: "drb@123", name: "Mallikarjun (D.I.C.S)", role: "engineer", isActive: true },
          { id: "eng-24", username: "kiran", password: "drb@123", name: "Kiran (D.I.C.S)", role: "engineer", isActive: true },
          { id: "eng-1775028569231", username: "anand", password: "anand@123", name: "Anand", role: "engineer", isActive: true },
        ];
        console.log("Using hardcoded fallback users for login");
      }

      const user = engineers.find(
        (e: any) =>
          e.username?.toLowerCase() === username.toLowerCase() &&
          e.password === password &&
          e.isActive !== false
      );

      if (!user) {
        return res.status(401).json({ message: "Invalid username or password. Please try again." });
      }

      // Store in session
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.name = user.name;
      req.session.role = user.role;

      res.json({
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        email: `${user.username}@drbtechverse.in`,
        status: "active",
        company: user.company ?? "",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/auth/logout
  router.post("/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed." });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully." });
    });
  });

  // GET /api/auth/me
  router.get("/auth/me", (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated." });
    }
    res.json({
      id: req.session.userId,
      username: req.session.username,
      name: req.session.name,
      role: req.session.role,
    });
  });

  // ── Engineers Master List ────────────────────────────────────────────────
  router.get("/engineers-master", async (_req, res) => {
    try {
      const engineers = await getEngineersMasterList();
      const seen = new Set<string>();
      const deduped = engineers.filter((e) => {
        const key = e.name.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      res.json(deduped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Project Master List ─────────────────────────────────────────────────
  router.get("/projects-master", async (_req, res) => {
    try {
      const projects = await getProjectMasterList();
      const seen = new Set<string>();
      const deduped = projects.filter((p) => {
        const key = p.projectNumber.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      res.json(deduped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/projects-master", async (req, res) => {
    try {
      const { projectNumber, projectName } = req.body;
      if (!projectNumber || !projectName) {
        return res.status(400).json({ error: "projectNumber and projectName are required." });
      }
      const result = await addProjectToMasterList(projectNumber, projectName);
      if (!result.success) return res.status(409).json({ error: result.message });
      res.json({ message: result.message });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Validation ──────────────────────────────────────────────────────────
  router.post("/validate", async (req, res) => {
    try {
      const { engineerName, projectName } = req.body;
      const [engineers, masterList] = await Promise.all([
        getEngineersMasterList(),
        getProjectMasterList(),
      ]);
      const errors: string[] = [];

      if (engineerName && !validateEngineerName(engineerName, engineers)) {
        errors.push(`Engineer "${engineerName}" is not in the engineers master list.`);
      }

      if (projectName) {
        const projectNumber = extractProjectNumber(projectName);
        if (
          projectNumber &&
          masterList.length > 0 &&
          !validateProjectNumber(projectNumber, masterList)
        ) {
          errors.push(
            `Project number "${projectNumber}" will be auto-registered in master list.`
          );
        }
      }

      res.json({ valid: errors.length === 0, errors });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Projects (data.json) ────────────────────────────────────────────────
  router.get("/projects", async (_req, res) => {
    try {
      const data = await getProjectData();
      const seenIds = new Set<number>();
      const deduped = data.filter((d) => {
        if (seenIds.has(d.id)) return false;
        seenIds.add(d.id);
        return true;
      });
      res.json(deduped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/projects", async (req, res) => {
    try {
      const assignment = req.body;
      const result = await saveProjectAssignment(assignment);
      if (!result.success) {
        return res.status(409).json({ error: result.message });
      }
      res.status(201).json({ message: result.message, id: result.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch("/projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await updateProjectAssignment(id, req.body);
      if (!result.success) return res.status(404).json({ error: result.message });
      res.json({ message: result.message });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/projects/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await deleteProjectAssignment(id);
      if (!result.success) return res.status(404).json({ error: result.message });
      res.json({ message: result.message });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Project Activities ──────────────────────────────────────────────────
  router.get("/project-activities", async (_req, res) => {
    try {
      const [activities, allAssignments] = await Promise.all([
        getProjectActivities(),
        getProjectData(),
      ]);

      // Build activity log map keyed by normalized project name
      const activityMap = new Map<
        string,
        { projectName: string; currentStatus: string; activities: Record<string, string> }
      >();

      for (const entry of activities) {
        const key = entry.projectName.trim().toLowerCase();
        if (activityMap.has(key)) {
          const existing = activityMap.get(key)!;
          existing.activities = { ...existing.activities, ...entry.activities };
        } else {
          activityMap.set(key, { ...entry, activities: { ...entry.activities } });
        }
      }

      // Build final map starting from ALL active assignments in data.json
      // This ensures every assigned project appears even if it has no logged activities
      const resultMap = new Map<
        string,
        { projectName: string; currentStatus: string; activities: Record<string, string> }
      >();

      for (const assignment of allAssignments) {
        if (assignment.status?.toLowerCase() === "completed") continue;

        const name = assignment.projectName.trim();
        const key = name.toLowerCase();

        if (resultMap.has(key)) {
          // Already added — update status priority (In Progress beats anything)
          if (assignment.status === "In Progress") {
            resultMap.get(key)!.currentStatus = "In Progress";
          }
        } else {
          // Merge in any existing activity log entry for this project
          const logged = activityMap.get(key);
          resultMap.set(key, {
            projectName: logged?.projectName ?? name,
            currentStatus: logged?.currentStatus ?? assignment.status ?? "In Progress",
            activities: logged?.activities ?? {},
          });
        }
      }

      // Also include projects that have activity log entries but are no longer
      // in data.json (e.g. completed projects with logged history)
      for (const [key, entry] of activityMap) {
        if (!resultMap.has(key)) {
          resultMap.set(key, entry);
        }
      }

      res.json(Array.from(resultMap.values()));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/project-activities", async (req, res) => {
    try {
      const { projectName, date, activity, status } = req.body;
      if (!projectName || !date || !activity) {
        return res
          .status(400)
          .json({ error: "projectName, date and activity are required." });
      }
      const result = await upsertProjectActivity(projectName, date, activity, status);
      if (!result.success) return res.status(400).json({ error: result.message });
      res.json({ message: result.message });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Analytics Dashboard ─────────────────────────────────────────────────
  router.get("/analytics", async (_req, res) => {
    try {
      const summary = await getAnalyticsSummary();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Projects Overview ───────────────────────────────────────────────────
  router.get("/projects-overview", async (_req, res) => {
    try {
      const [data, masterList, engineers] = await Promise.all([
        getProjectData(),
        getProjectMasterList(),
        getEngineersMasterList(),
      ]);

      const engineerMasterNames = new Set(
        engineers.map((e) => e.name.trim().toLowerCase())
      );

      const projectMap = new Map<
        string,
        {
          projectName: string;
          projectNumber: string | null;
          engineers: string[];
          status: string;
          latestEnd: string;
        }
      >();

      for (const a of data) {
        const key = a.projectName.trim().toLowerCase();
        const projectNumber = extractProjectNumber(a.projectName);

        if (!projectMap.has(key)) {
          projectMap.set(key, {
            projectName: a.projectName.trim(),
            projectNumber,
            engineers: [],
            status: a.status,
            latestEnd: a.endDate,
          });
        }

        const entry = projectMap.get(key)!;
        const engName = a.engineerName.trim();
        if (
          engineerMasterNames.has(engName.toLowerCase()) &&
          !entry.engineers.some((e) => e.toLowerCase() === engName.toLowerCase())
        ) {
          entry.engineers.push(engName);
        }
        if (a.endDate > entry.latestEnd) entry.latestEnd = a.endDate;
        if (a.status === "In Progress") entry.status = "In Progress";
      }

      const overview = Array.from(projectMap.values()).map((p) => ({
        ...p,
        registeredInMaster: p.projectNumber
          ? validateProjectNumber(p.projectNumber, masterList)
          : false,
      }));

      res.json(overview);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use("/api", router);
}
