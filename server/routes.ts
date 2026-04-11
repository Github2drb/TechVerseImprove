// server/routes.ts  (additions & modifications — drop these into your existing routes file)
// ─────────────────────────────────────────────────────────────────────────────
// EXISTING routes stay the same. Only the sections marked NEW / MODIFIED change.
// ─────────────────────────────────────────────────────────────────────────────

import { Server } from "http";
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
  // ... all your routes stay the same ...
  app.use("/api", router);
}

  // ── Engineers Master List ────────────────────────────────────────────────
  // GET /api/engineers-master — returns deduplicated engineer list from master JSON
  router.get("/engineers-master", async (_req, res) => {
    try {
      const engineers = await getEngineersMasterList();
      // Deduplicate by name (case-insensitive), keep first occurrence
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
  // GET /api/projects-master — returns all registered project numbers
  router.get("/projects-master", async (_req, res) => {
    try {
      const projects = await getProjectMasterList();
      // Deduplicate by projectNumber
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

  // POST /api/projects-master — manually register a project number
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

  // ── Validation endpoints ────────────────────────────────────────────────

  // POST /api/validate — validate engineer + project before creating assignment
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
        if (projectNumber && masterList.length > 0 && !validateProjectNumber(projectNumber, masterList)) {
          // Not a hard error on creation — the project will be auto-registered
          // Just warn so the UI can show a message
          errors.push(`Project number "${projectNumber}" will be auto-registered in master list.`);
        }
      }

      res.json({ valid: errors.length === 0, errors });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Projects (data.json) ────────────────────────────────────────────────

  // GET /api/projects — return deduplicated project assignments
  router.get("/projects", async (_req, res) => {
    try {
      const data = await getProjectData();
      // Remove exact duplicate IDs (shouldn't happen, but guard)
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

  // POST /api/projects — create new assignment (validates engineer + deduplicates)
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

  // PATCH /api/projects/:id — update assignment
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

  // DELETE /api/projects/:id — delete assignment
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

  // GET /api/project-activities — return full activity log merged with all assignments from data.json
  router.get("/project-activities", async (_req, res) => {
    try {
      const [activities, allAssignments] = await Promise.all([
        getProjectActivities(),
        getProjectData(),
      ]);

      // Build map from existing activity log
      const map = new Map<string, { projectName: string; currentStatus: string; activities: Record<string, string> }>();
      for (const entry of activities) {
        const key = entry.projectName.trim().toLowerCase();
        if (map.has(key)) {
          const existing = map.get(key)!;
          existing.activities = { ...existing.activities, ...entry.activities };
        } else {
          map.set(key, { ...entry, activities: { ...entry.activities } });
        }
      }

      // Ensure ALL projects from data.json appear (even those with no logged activities)
      // Deduplicate by project name key
      const extractKey = (name: string): string => {
        const m = name.trim().match(/^([A-Z0-9]{1,4}-[A-Z0-9]{1,5}-\d{4,6})/i);
        return m ? m[1].toUpperCase() : name.trim().toLowerCase();
      };

      const projectKeyMap = new Map<string, string>(); // projectKey -> map key (lowercase name)
      for (const [key, _] of map) {
        const entry = map.get(key)!;
        const pKey = extractKey(entry.projectName);
        projectKeyMap.set(pKey, key);
      }

      for (const assignment of allAssignments) {
        const name = assignment.projectName.trim();
        const nameLower = name.toLowerCase();
        const pKey = extractKey(name);

        // Skip if already in map (by project number or exact name)
        if (map.has(nameLower) || projectKeyMap.has(pKey)) continue;

        // Skip completed projects from data.json
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

  // POST /api/project-activities — log activity for a project
  router.post("/project-activities", async (req, res) => {
    try {
      const { projectName, date, activity, status } = req.body;
      if (!projectName || !date || !activity) {
        return res.status(400).json({ error: "projectName, date and activity are required." });
      }
      const result = await upsertProjectActivity(projectName, date, activity, status);
      if (!result.success) return res.status(400).json({ error: result.message });
      res.json({ message: result.message });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Analytics Dashboard ─────────────────────────────────────────────────

  // GET /api/analytics — return aggregated analytics data
  router.get("/analytics", async (_req, res) => {
    try {
      const summary = await getAnalyticsSummary();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Projects Overview (deduplicated project list for display) ───────────

  // GET /api/projects-overview — unique projects with latest assignment info
  router.get("/projects-overview", async (_req, res) => {
    try {
      const [data, masterList] = await Promise.all([
        getProjectData(),
        getProjectMasterList(),
      ]);

      // Group by projectName, deduplicate
      const projectMap = new Map<string, {
        projectName: string;
        projectNumber: string | null;
        engineers: string[];
        status: string;
        latestEnd: string;
      }>();

      const [engineers] = await Promise.all([getEngineersMasterList()]);
      const engineerMasterNames = new Set(engineers.map((e) => e.name.trim().toLowerCase()));

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
        // Add engineer only if valid in master list and not duplicate
        const engName = a.engineerName.trim();
        if (
          engineerMasterNames.has(engName.toLowerCase()) &&
          !entry.engineers.some((e) => e.toLowerCase() === engName.toLowerCase())
        ) {
          entry.engineers.push(engName);
        }
        // Use latest end date
        if (a.endDate > entry.latestEnd) entry.latestEnd = a.endDate;
        // Status priority: In Progress > Completed
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
