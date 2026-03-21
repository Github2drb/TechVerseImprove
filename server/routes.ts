import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTeamMemberSchema, insertProjectSchema, insertNotificationSchema, insertCommentSchema } from "@shared/schema";
import { z } from "zod";
import * as GitHub from "./github";
import * as SharePoint from "./sharepoint";
import * as fs from "fs";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Helper to verify admin authorization from request header
async function verifyAdminAuth(req: any): Promise<boolean> {
  const authHeader = req.headers['x-admin-auth'];
  if (!authHeader) return false;
  
  try {
    const decoded = JSON.parse(Buffer.from(authHeader, 'base64').toString());
    if (!decoded.username || !decoded.role) return false;
    
    // Verify this is actually an admin in the credentials
    const credentials = await GitHub.readEngineerCredentialsFromGitHub();
    const admin = credentials.engineers.find(e => 
      e.username === decoded.username && e.role === 'admin' && e.isActive
    );
    return !!admin;
  } catch {
    return false;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = loginSchema.parse(req.body);
      
      // First try GitHub-based engineer authentication
      const engineer = await GitHub.authenticateEngineer(username, password);
      if (engineer) {
        // Block inactive engineers from logging in
        if (!engineer.isActive) {
          return res.status(401).json({ message: "Account is deactivated. Please contact administrator." });
        }
        
        // Store session information
        (req as any).session = { 
          userId: engineer.id, 
          role: engineer.role, 
          isAdmin: engineer.role === 'admin' 
        };
        
        return res.json({
          id: engineer.id,
          username: engineer.username,
          name: engineer.name,
          role: engineer.role,
          company: engineer.company,
          email: `${engineer.username}@drbtechverse.com`,
          status: 'active',
        });
      }
      
      // Fall back to storage-based authentication
      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data" });
      }
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    res.status(401).json({ message: "Not authenticated" });
  });

  // Engineer credentials management (admin-only routes)
  app.get("/api/engineer-credentials", async (req, res) => {
    try {
      // Verify admin authorization
      const isAdmin = await verifyAdminAuth(req);
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const data = await GitHub.readEngineerCredentialsFromGitHub();
      // Return without passwords for security
      const safeEngineers = data.engineers.map(({ password, ...rest }) => rest);
      res.json({ engineers: safeEngineers, lastUpdated: data.lastUpdated });
    } catch (error) {
      console.error('Error fetching engineer credentials:', error);
      res.status(500).json({ message: "Failed to fetch engineer credentials" });
    }
  });

  app.post("/api/engineer-credentials/initialize", async (req, res) => {
    try {
      // Verify admin authorization
      const isAdmin = await verifyAdminAuth(req);
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const result = await GitHub.initializeEngineerCredentials();
      res.json(result);
    } catch (error) {
      console.error('Error initializing engineer credentials:', error);
      res.status(500).json({ message: "Failed to initialize engineer credentials" });
    }
  });

  app.post("/api/engineer-credentials", async (req, res) => {
    try {
      // Verify admin authorization
      const isAdmin = await verifyAdminAuth(req);
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const engineer = req.body;
      const result = await GitHub.upsertEngineerCredential(engineer);
      if (result.success && result.engineer) {
        const { password, ...safeEngineer } = result.engineer;
        res.json({ success: true, engineer: safeEngineer });
      } else {
        res.status(500).json({ message: "Failed to save engineer credential" });
      }
    } catch (error) {
      console.error('Error saving engineer credential:', error);
      res.status(500).json({ message: "Failed to save engineer credential" });
    }
  });

  app.put("/api/engineer-credentials/:id", async (req, res) => {
    try {
      // Verify admin authorization
      const isAdmin = await verifyAdminAuth(req);
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { id } = req.params;
      const engineer = { ...req.body, id };
      const result = await GitHub.upsertEngineerCredential(engineer);
      if (result.success && result.engineer) {
        const { password, ...safeEngineer } = result.engineer;
        res.json({ success: true, engineer: safeEngineer });
      } else {
        res.status(500).json({ message: "Failed to update engineer credential" });
      }
    } catch (error) {
      console.error('Error updating engineer credential:', error);
      res.status(500).json({ message: "Failed to update engineer credential" });
    }
  });

  app.delete("/api/engineer-credentials/:id", async (req, res) => {
    try {
      // Verify admin authorization
      const isAdmin = await verifyAdminAuth(req);
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { id } = req.params;
      const success = await GitHub.deleteEngineerCredential(id);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ message: "Engineer not found" });
      }
    } catch (error) {
      console.error('Error deleting engineer credential:', error);
      res.status(500).json({ message: "Failed to delete engineer credential" });
    }
  });

  app.post("/api/engineer-credentials/reset-password", async (req, res) => {
    try {
      const { username, newPassword } = req.body;
      if (!username || !newPassword) {
        return res.status(400).json({ message: "Username and new password required" });
      }
      const success = await GitHub.updateEngineerPassword(username, newPassword);
      if (success) {
        res.json({ success: true, message: "Password updated successfully" });
      } else {
        res.status(404).json({ message: "Engineer not found" });
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.get("/api/engineer-daily-tasks", async (req, res) => {
    try {
      const date = req.query.date as string || new Date().toISOString().split('T')[0];
      const tasks = await storage.getEngineerDailyTasks(date);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch engineer daily tasks" });
    }
  });

  app.patch("/api/engineer-daily-tasks/:engineer/:project", async (req, res) => {
    try {
      const { engineer, project } = req.params;
      const { completed } = req.body;
      const date = new Date().toISOString().split('T')[0];
      const result = await storage.updateEngineerTaskCompletion(engineer, project, date, completed);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to update engineer task" });
    }
  });

  app.post("/api/engineer-daily-activities/:engineer", async (req, res) => {
    try {
      const { engineer } = req.params;
      const { activity, date } = req.body;
      const result = await storage.addEngineerActivity(engineer, activity, date);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to add engineer activity" });
    }
  });

  app.delete("/api/engineer-daily-activities/:engineer/:activityId", async (req, res) => {
    try {
      const { engineer, activityId } = req.params;
      const { date } = req.body;
      const result = await storage.deleteEngineerActivity(engineer, activityId, date);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to delete engineer activity" });
    }
  });

  app.post("/api/engineer-target-tasks/:engineer", async (req, res) => {
    try {
      const { engineer } = req.params;
      const { task, date } = req.body;
      const result = await storage.setEngineerTargetTask(engineer, task, date);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to add target task" });
    }
  });

  app.delete("/api/engineer-target-tasks/:engineer/:taskId", async (req, res) => {
    try {
      const { engineer, taskId } = req.params;
      const { date } = req.body;
      const result = await storage.deleteEngineerTargetTask(engineer, taskId, date);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to delete target task" });
    }
  });
  
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/analytics", async (req, res) => {
    try {
      const analytics = await storage.getAnalytics();
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/engineer-workload", async (req, res) => {
    try {
      const assignments = await GitHub.getProjectAssignments();
      
      // Get current and next month
      const now = new Date();
      const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' });
      const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextMonth = nextMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
      
      // Group assignments by engineer with deduplication
      const engineerMap = new Map<string, Map<string, { projectName: string; status: string; scopeOfWork: string }>>();
      
      assignments.forEach((assignment) => {
        const engineer = assignment.engineer;
        if (!engineer) return;
        
        if (!engineerMap.has(engineer)) {
          engineerMap.set(engineer, new Map());
        }
        // Use projectName as key to deduplicate
        const projectsMap = engineerMap.get(engineer)!;
        if (!projectsMap.has(assignment.projectName)) {
          projectsMap.set(assignment.projectName, {
            projectName: assignment.projectName,
            status: assignment.status || 'In Progress',
            scopeOfWork: assignment.notes || 'Not specified',
          });
        }
      });
      
      // Convert to array format
      const engineers = Array.from(engineerMap.entries()).map(([name, projectsMap]) => {
        const projects = Array.from(projectsMap.values());
        return {
          name,
          projects,
          projectCount: projects.length,
        };
      }).sort((a, b) => b.projectCount - a.projectCount);
      
      // Calculate total unique assignments
      const totalUniqueAssignments = engineers.reduce((sum, eng) => sum + eng.projectCount, 0);
      
      res.json({
        currentMonth,
        nextMonth,
        engineers,
        totalEngineers: engineers.length,
        totalAssignments: totalUniqueAssignments,
      });
    } catch (error) {
      console.error('Error fetching engineer workload:', error);
      res.status(500).json({ message: "Failed to fetch engineer workload" });
    }
  });

  app.get("/api/team-members", async (req, res) => {
    try {
      const members = await storage.getTeamMembers();
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.get("/api/team-members/:id", async (req, res) => {
    try {
      const member = await storage.getTeamMember(req.params.id);
      if (!member) {
        return res.status(404).json({ message: "Team member not found" });
      }
      res.json(member);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch team member" });
    }
  });

  app.post("/api/team-members", async (req, res) => {
    try {
      const validatedData = insertTeamMemberSchema.parse(req.body);
      const member = await storage.createTeamMember(validatedData);
      res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create team member" });
    }
  });

  app.patch("/api/team-members/:id", async (req, res) => {
    try {
      // Note: In production, implement proper session/JWT authentication
      // For now, this endpoint should only be called by authenticated admin users
      // The frontend enforces this restriction by hiding the edit button for non-admins
      
      const id = req.params.id;
      const updates = req.body;
      
      // Only allow updating name field
      const allowedUpdates = { name: updates.name };
      
      const updated = await storage.updateTeamMember(id, allowedUpdates);
      if (!updated) {
        return res.status(404).json({ message: "Team member not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update team member" });
    }
  });

  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getProjects();
      // Sort projects: in_progress/at_risk first, then by progress descending
      const sorted = projects.sort((a, b) => {
        const priorityOrder: Record<string, number> = { 
          "in_progress": 0, 
          "at_risk": 1, 
          "completed": 2, 
          "pending": 3 
        };
        const priorityDiff = (priorityOrder[a.status] || 3) - (priorityOrder[b.status] || 3);
        if (priorityDiff !== 0) return priorityDiff;
        return (b.progress || 0) - (a.progress || 0);
      });
      res.json(sorted);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const validatedData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(validatedData);
      res.status(201).json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.get("/api/notifications", async (req, res) => {
    try {
      const notifications = await storage.getNotifications();
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const validatedData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(validatedData);
      res.status(201).json(notification);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create notification" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      await storage.markAllNotificationsRead();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  app.get("/api/projects/:projectId/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByProject(req.params.projectId);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/projects/:projectId/comments", async (req, res) => {
    try {
      const validatedData = insertCommentSchema.parse({
        ...req.body,
        projectId: req.params.projectId,
      });
      const comment = await storage.createComment(validatedData);
      res.status(201).json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  app.get("/api/pending-tasks/:engineer", async (req, res) => {
    try {
      const { engineer } = req.params;
      const today = new Date().toISOString().split('T')[0];
      const pendingTasks = await storage.getPendingEngineerTasks(engineer, today);
      res.json(pendingTasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch pending tasks" });
    }
  });

  app.get("/api/project-status-tracking", async (req, res) => {
    try {
      const statusTracking = await GitHub.getProjectStatusTracking();
      res.json(statusTracking);
    } catch (error) {
      console.error('Error fetching project status tracking:', error);
      res.status(500).json({ message: "Failed to fetch project status tracking" });
    }
  });

  const projectStatusUpdateSchema = z.object({
    engineerName: z.string().min(1, "Engineer name is required"),
    projectName: z.string().min(1, "Project name is required"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    status: z.enum(["", "Not Started", "In Progress", "On Hold", "Blocked", "Completed", "Cancelled"]),
  }).refine(
    (data) => {
      const date = new Date(data.date);
      const startDate = new Date('2024-12-05');
      const endDate = new Date('2025-02-28');
      return date >= startDate && date <= endDate;
    },
    { message: "Date must be between December 5, 2024 and February 28, 2025" }
  );

  app.post("/api/project-status-tracking", async (req, res) => {
    try {
      const validated = projectStatusUpdateSchema.parse(req.body);
      const result = await GitHub.updateProjectStatus(
        validated.engineerName,
        validated.projectName,
        validated.date,
        validated.status
      );
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      console.error('Error updating project status:', error);
      res.status(500).json({ message: "Failed to update project status" });
    }
  });

  app.get("/api/project-assignments", async (req, res) => {
    try {
      const assignments = await GitHub.getProjectAssignments();
      res.json(assignments);
    } catch (error) {
      console.error('Error fetching project assignments:', error);
      res.status(500).json({ message: "Failed to fetch project assignments" });
    }
  });

  // New project activities endpoints
  app.get("/api/project-activities", async (req, res) => {
    try {
      const activities = await GitHub.getProjectActivities();
      res.json(activities);
    } catch (error) {
      console.error('Error fetching project activities:', error);
      res.status(500).json({ message: "Failed to fetch project activities" });
    }
  });

  const projectActivitySchema = z.object({
    projectName: z.string().min(1, "Project name is required"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    activity: z.string(),
  });

  app.post("/api/project-activities", async (req, res) => {
    try {
      const validated = projectActivitySchema.parse(req.body);
      const result = await GitHub.updateProjectActivity(
        validated.projectName,
        validated.date,
        validated.activity
      );
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      console.error('Error updating project activity:', error);
      res.status(500).json({ message: "Failed to update project activity" });
    }
  });

  const projectStatusSchema = z.object({
    projectName: z.string().min(1, "Project name is required"),
    status: z.enum([
      "Design Stage",
      "Procurement Stage", 
      "Mechanical Assembly Stage",
      "Electrical Assembly Stage",
      "PLC Power Up Stage",
      "IO Check Stage",
      "Trials Stage",
      "Completed",
      "Dispatch Stage"
    ]),
  });

  app.post("/api/project-activities/status", async (req, res) => {
    try {
      const validated = projectStatusSchema.parse(req.body);
      const result = await GitHub.updateProjectCurrentStatus(
        validated.projectName,
        validated.status
      );
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation failed", errors: error.errors });
      }
      console.error('Error updating project status:', error);
      res.status(500).json({ message: "Failed to update project status" });
    }
  });

  app.get("/api/analytics/performance", async (req, res) => {
    try {
      const isConnected = await SharePoint.isSharePointConnected();
      const teamMembers = await storage.getTeamMembers();
      const projectActivities = await GitHub.getProjectActivities();
      const assignments = await GitHub.getProjectAssignments();
      
      // Count @ entries per engineer from project activities
      // Match engineer names case-insensitively (handles "@Sachin Kumar" or "@sachin")
      const engineerNames = teamMembers.map(m => m.name.toLowerCase());
      const atMentionCounts = new Map<string, number>();
      if (projectActivities && typeof projectActivities === 'object') {
        Object.values(projectActivities).forEach((project: any) => {
          if (project && project.activities) {
            Object.values(project.activities).forEach((activity: any) => {
              if (typeof activity === 'string') {
                const lowerActivity = activity.toLowerCase();
                // Check for each engineer name in the activity text
                teamMembers.forEach(member => {
                  const namePattern = new RegExp(`@${member.name.toLowerCase().replace(/\s+/g, '\\s*')}`, 'gi');
                  const matches = activity.match(namePattern);
                  if (matches) {
                    atMentionCounts.set(member.name, (atMentionCounts.get(member.name) || 0) + matches.length);
                  }
                  // Also check for first name only
                  const firstName = member.name.split(' ')[0].toLowerCase();
                  if (lowerActivity.includes(`@${firstName}`) && !matches) {
                    atMentionCounts.set(member.name, (atMentionCounts.get(member.name) || 0) + 1);
                  }
                });
              }
            });
          }
        });
      }
      
      // Count completed projects per engineer
      const completedProjectCounts = new Map<string, number>();
      assignments.forEach((a: any) => {
        const engineer = a.engineer || a.engineerName;
        if (a.status === "Completed" && engineer) {
          completedProjectCounts.set(engineer, (completedProjectCounts.get(engineer) || 0) + 1);
        }
      });
      
      // Get attendance data if SharePoint connected
      let attendanceStats: SharePoint.EngineerAttendanceStats[] = [];
      if (isConnected) {
        attendanceStats = await SharePoint.getAttendanceData();
      }
      
      // Calculate performance for each team member
      const performanceData = teamMembers.map(member => {
        const attendanceStat = attendanceStats.find(a => a.engineerName === member.name);
        const attendanceRate = attendanceStat?.updateRate || 0;
        const completedProjects = completedProjectCounts.get(member.name) || 0;
        const atMentions = atMentionCounts.get(member.name) || 0;
        const taskCompletionRate = Math.min((completedProjects * 15), 100);
        
        const overallScore = SharePoint.calculatePerformanceScore(
          attendanceRate,
          taskCompletionRate,
          completedProjects,
          atMentions
        );
        
        return {
          engineerName: member.name,
          attendanceScore: Math.round(attendanceRate * 0.25),
          taskCompletionScore: Math.round(taskCompletionRate * 0.35),
          projectsCompletedScore: Math.round(Math.min(completedProjects * 10, 100) * 0.25),
          dataEntryScore: Math.round(Math.min(atMentions * 5, 100) * 0.15),
          overallScore,
          details: {
            attendanceRate,
            completedProjects,
            atMentions
          }
        };
      });
      
      // Note which data sources are available
      const dataSources = {
        sharepoint: isConnected && attendanceStats.length > 0,
        github: assignments.length > 0,
        activities: projectActivities && Object.keys(projectActivities).length > 0
      };
      
      const hasAnyData = dataSources.github || dataSources.activities;
      if (!hasAnyData) {
        return res.status(503).json({
          message: "Unable to fetch performance data - external services unavailable",
          connected: false,
          dataSources
        });
      }
      
      res.json({
        connected: isConnected,
        message: dataSources.sharepoint 
          ? "Full performance data available" 
          : "Partial data - attendance unavailable from SharePoint",
        dataSources,
        data: performanceData
      });
    } catch (error) {
      console.error('Error fetching performance data:', error);
      res.status(503).json({ 
        message: "Failed to fetch performance data - external service unavailable",
        connected: false,
        dataSources: { sharepoint: false, github: false, activities: false }
      });
    }
  });

  // Get project names from data.json
  app.get("/api/project-names", async (req, res) => {
    try {
      const octokit = await GitHub.getGitHubClient();
      const response = await octokit.repos.getContent({
        owner: 'Github2drb',
        repo: 'Controls_Team_Tracker',
        path: 'data.json',
      });

      if (Array.isArray(response.data) || !('content' in response.data)) {
        throw new Error('Invalid file response');
      }

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      const data = JSON.parse(content);
      
      // Extract unique project names
      const allNames = (data.data || []).map((item: any) => item.projectName);
      const projectNames = Array.from(new Set(allNames)) as string[];
      res.json(projectNames.sort());
    } catch (error) {
      console.error('Error fetching project names:', error);
      res.status(503).json({ message: "Failed to fetch project names" });
    }
  });

  // Engineer Daily Tasks Config from GitHub
  app.get("/api/engineer-daily-tasks-config", async (req, res) => {
    try {
      const engineers = await GitHub.getEngineerDailyTasksConfig();
      res.json(engineers);
    } catch (error) {
      console.error('Error fetching engineer daily tasks config:', error);
      res.status(503).json({ message: "Failed to fetch engineer daily tasks config" });
    }
  });

  app.post("/api/engineer-daily-tasks-config/initialize", async (req, res) => {
    try {
      const result = await GitHub.initializeEngineerDailyTasksFile();
      res.json(result);
    } catch (error) {
      console.error('Error initializing engineer daily tasks config:', error);
      res.status(500).json({ message: "Failed to initialize engineer daily tasks config" });
    }
  });

  // Initialize engineers master list on GitHub
  app.post("/api/engineers-master-list/initialize", async (req, res) => {
    try {
      const result = await GitHub.initializeEngineerMasterList();
      res.json(result);
    } catch (error) {
      console.error('Error initializing engineers master list:', error);
      res.status(500).json({ message: "Failed to initialize engineers master list" });
    }
  });

  // Update engineers master list on GitHub
  app.put("/api/engineers-master-list", async (req, res) => {
    try {
      const { engineers } = req.body;
      if (!Array.isArray(engineers)) {
        return res.status(400).json({ message: "Engineers must be an array" });
      }
      const data = {
        engineers: engineers.map((eng: { id?: string; name: string; initials?: string }, index: number) => {
          // Generate initials, filtering out parenthetical company names
          const nameParts = eng.name.replace(/\s*\([^)]*\)\s*/g, '').trim().split(' ').filter(Boolean);
          const generatedInitials = nameParts.map((n: string) => n[0]).join('').toUpperCase();
          return {
            id: eng.id || `eng-${index + 1}`,
            name: eng.name,
            initials: eng.initials || generatedInitials
          };
        }),
        lastUpdated: new Date().toISOString()
      };
      const success = await GitHub.writeEngineerMasterListToGitHub(data);
      if (success) {
        res.json({ success: true, engineers: data.engineers });
      } else {
        res.status(500).json({ message: "Failed to update engineers master list" });
      }
    } catch (error) {
      console.error('Error updating engineers master list:', error);
      res.status(500).json({ message: "Failed to update engineers master list" });
    }
  });

  // Weekly Assignments Endpoints
  app.get("/api/weekly-assignments", async (req, res) => {
    try {
      const weekStart = req.query.weekStart as string | undefined;
      const assignments = await GitHub.getWeeklyAssignments(weekStart);
      res.json(assignments);
    } catch (error) {
      console.error('Error fetching weekly assignments:', error);
      res.status(503).json({ message: "Failed to fetch weekly assignments" });
    }
  });

  app.post("/api/weekly-assignments", async (req, res) => {
    try {
      const { id, engineerName, weekStart, projectName, projectTargetDate, tasks, currentStatus, notes } = req.body;
      
      if (!engineerName || !weekStart || !projectName) {
        return res.status(400).json({ message: "Missing required fields: engineerName, weekStart, projectName" });
      }
      
      const assignmentId = id || `${engineerName}-${weekStart}-${Date.now()}`;
      const assignment: GitHub.WeeklyAssignment = {
        id: assignmentId,
        engineerName,
        weekStart,
        projectName,
        projectTargetDate,
        resourceLockedFrom: req.body.resourceLockedFrom,
        resourceLockedTill: req.body.resourceLockedTill,
        internalTarget: req.body.internalTarget,
        customerTarget: req.body.customerTarget,
        tasks: tasks || [],
        currentStatus: currentStatus || "not_started",
        notes,
        constraint: req.body.constraint
      };
      
      const result = await GitHub.upsertWeeklyAssignment(assignment);
      if (result.success) {
        res.json(result.assignment);
      } else {
        res.status(500).json({ message: "Failed to save assignment" });
      }
    } catch (error) {
      console.error('Error saving weekly assignment:', error);
      res.status(500).json({ message: "Failed to save assignment" });
    }
  });

  app.patch("/api/weekly-assignments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const assignments = await GitHub.getWeeklyAssignments();
      const existing = assignments.find(a => a.id === id);
      
      if (!existing) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      
      const updated: GitHub.WeeklyAssignment = { ...existing, ...req.body, id };
      const result = await GitHub.upsertWeeklyAssignment(updated);
      
      if (result.success) {
        res.json(result.assignment);
      } else {
        res.status(500).json({ message: "Failed to update assignment" });
      }
    } catch (error) {
      console.error('Error updating weekly assignment:', error);
      res.status(500).json({ message: "Failed to update assignment" });
    }
  });

  app.delete("/api/weekly-assignments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await GitHub.deleteWeeklyAssignment(id);
      
      if (result.success) {
        res.json({ message: "Assignment deleted" });
      } else {
        res.status(404).json({ message: "Assignment not found" });
      }
    } catch (error) {
      console.error('Error deleting weekly assignment:', error);
      res.status(500).json({ message: "Failed to delete assignment" });
    }
  });

  // Task management within assignments
  app.post("/api/weekly-assignments/:assignmentId/tasks", async (req, res) => {
    try {
      const { assignmentId } = req.params;
      const { taskName, targetDate, completionDate, status } = req.body;
      
      if (!taskName) {
        return res.status(400).json({ message: "Task name is required" });
      }
      
      const task: GitHub.WeeklyAssignmentTask = {
        id: `task-${Date.now()}`,
        taskName,
        targetDate,
        completionDate,
        status: status || "not_started"
      };
      
      const result = await GitHub.updateAssignmentTask(assignmentId, task);
      
      if (result.success) {
        res.json(task);
      } else {
        res.status(500).json({ message: "Failed to add task" });
      }
    } catch (error) {
      console.error('Error adding task:', error);
      res.status(500).json({ message: "Failed to add task" });
    }
  });

  app.patch("/api/weekly-assignments/:assignmentId/tasks/:taskId", async (req, res) => {
    try {
      const { assignmentId, taskId } = req.params;
      const assignments = await GitHub.getWeeklyAssignments();
      const assignment = assignments.find(a => a.id === assignmentId);
      
      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      
      const existingTask = assignment.tasks.find(t => t.id === taskId);
      if (!existingTask) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      const updatedTask: GitHub.WeeklyAssignmentTask = { ...existingTask, ...req.body, id: taskId };
      const result = await GitHub.updateAssignmentTask(assignmentId, updatedTask);
      
      if (result.success) {
        res.json(updatedTask);
      } else {
        res.status(500).json({ message: "Failed to update task" });
      }
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  app.delete("/api/weekly-assignments/:assignmentId/tasks/:taskId", async (req, res) => {
    try {
      const { assignmentId, taskId } = req.params;
      const result = await GitHub.deleteAssignmentTask(assignmentId, taskId);
      
      if (result.success) {
        res.json({ message: "Task deleted" });
      } else {
        res.status(404).json({ message: "Task not found" });
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Save all weekly assignments for a week (explicit save action)
  app.post("/api/weekly-assignments/save-all", async (req, res) => {
    try {
      const { weekStart } = req.body;
      const assignments = await GitHub.getWeeklyAssignments(weekStart);
      
      // Force a re-save of all assignments for this week to ensure GitHub is up to date
      for (const assignment of assignments) {
        await GitHub.upsertWeeklyAssignment(assignment);
      }
      
      res.json({ 
        success: true, 
        message: "All assignments saved",
        count: assignments.length,
        assignments 
      });
    } catch (error) {
      console.error('Error saving all assignments:', error);
      res.status(500).json({ message: "Failed to save assignments" });
    }
  });

  return httpServer;
}
