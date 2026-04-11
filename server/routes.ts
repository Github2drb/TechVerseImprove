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
} from "./github";

export function registerRoutes(
  httpServer: Server,
  app: ReturnType<typeof import("express")["default"]>
) {
  const router = Router();

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

      const map = new Map<
        string,
        { projectName: string; currentStatus: string; activities: Record<string, string> }
      >();

      for (const entry of activities) {
        const key = entry.projectName.trim().toLowerCase();
        if (map.has(key)) {
          const existing = map.get(key)!;
          existing.activities = { ...existing.activities, ...entry.activities };
        } else {
          map.set(key, { ...entry, activities: { ...entry.activities } });
        }
      }

      const extractKey = (name: string): string => {
        const m = name.trim().match(/^([A-Z0-9]{1,4}-[A-Z0-9]{1,5}-\d{4,6})/i);
        return m ? m[1].toUpperCase() : name.trim().toLowerCase();
      };

      const projectKeyMap = new Map<string, string>();
      for (const [key] of map) {
        const entry = map.get(key)!;
        const pKey = extractKey(entry.projectName);
        projectKeyMap.set(pKey, key);
      }

      for (const assignment of allAssignments) {
        const name = assignment.projectName.trim();
        const nameLower = name.toLowerCase();
        const pKey = extractKey(name);

        if (map.has(nameLower) || projectKeyMap.has(pKey)) continue;
        if (assignment.status?.toLowerCase() === "completed") continue;

        map.set(nameLower, {
          projectName: name,
          currentStatus: assignment.status || "In Progress",
          activities: {},
        });
        projectKeyMap.set(pKey, nameLower);
      }

      res.json(Array.from(map.values()));
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
