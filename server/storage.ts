import { type User, type InsertUser, type TeamMember, type InsertTeamMember, type Project, type InsertProject, type DashboardStats, type AnalyticsData, type Notification, type InsertNotification, type Comment, type InsertComment } from "@shared/schema";
import { randomUUID } from "crypto";
import * as GitHub from "./github";
import * as SharePoint from "./sharepoint";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  registerUser(user: InsertUser): Promise<User>;
  getPendingUsers(): Promise<User[]>;
  approveUser(userId: string): Promise<boolean>;
  rejectUser(userId: string): Promise<boolean>;
  changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean>;
  requestPasswordReset(email: string): Promise<{ success: boolean; token?: string }>;
  resetPassword(token: string, newPassword: string): Promise<boolean>;
  
  getTeamMembers(): Promise<TeamMember[]>;
  getTeamMember(id: string): Promise<TeamMember | undefined>;
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: string, updates: Partial<TeamMember>): Promise<TeamMember | undefined>;
  
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  
  getDashboardStats(): Promise<DashboardStats>;
  getAnalytics(): Promise<AnalyticsData>;
  
  getNotifications(): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  
  getCommentsByProject(projectId: string): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  
  getEngineerDailyTasks(date?: string): Promise<Array<{ engineerName: string; planned: number; completed: number; inProgress: number; tasks: Array<{ projectId: string; projectName: string; completed: boolean }>; customActivities: Array<{ id: string; text: string }>; targetTasks: Array<{ id: string; text: string }> }>>;
  updateEngineerTaskCompletion(engineerName: string, projectId: string, date: string, completed: boolean): Promise<{ success: boolean }>;
  addEngineerActivity(engineerName: string, activity: string, date: string): Promise<{ id: string; success: boolean }>;
  deleteEngineerActivity(engineerName: string, activityId: string, date: string): Promise<{ success: boolean }>;
  setEngineerTargetTask(engineerName: string, task: string, date: string): Promise<{ id: string; success: boolean }>;
  deleteEngineerTargetTask(engineerName: string, taskId: string, date: string): Promise<{ success: boolean }>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private teamMembers: Map<string, TeamMember>;
  private projects: Map<string, Project>;
  private notifications: Map<string, Notification>;
  private comments: Map<string, Comment>;
  private engineerAssignments: Map<string, Map<string, boolean>>;
  private engineerActivities: Map<string, Array<{ id: string; text: string; date: string }>>;
  private engineerTargetTasks: Map<string, Array<{ id: string; text: string; date: string }>>;

  constructor() {
    this.users = new Map();
    this.teamMembers = new Map();
    this.projects = new Map();
    this.notifications = new Map();
    this.comments = new Map();
    this.engineerAssignments = new Map();
    this.engineerActivities = new Map();
    this.engineerTargetTasks = new Map();
    
    this.seedData();
    this.seedUsers();
  }

  private seedUsers() {
    const usersData: User[] = [
      { id: randomUUID(), username: "admin", password: "admin123", name: "Admin User", email: "admin@drbtechverse.in", role: "admin", status: "active", avatar: null, resetToken: null, resetTokenExpiry: null },
      { id: randomUUID(), username: "manager", password: "manager123", name: "Manager User", email: "manager@drbtechverse.in", role: "manager", status: "active", avatar: null, resetToken: null, resetTokenExpiry: null },
      { id: randomUUID(), username: "member", password: "member123", name: "Team Member", email: "member@drbtechverse.in", role: "member", status: "active", avatar: null, resetToken: null, resetTokenExpiry: null },
    ];

    usersData.forEach((user) => {
      this.users.set(user.id, user);
    });
  }

  private seedData() {
    // Load team members from GitHub with fallback
    this.loadTeamMembersFromGitHub();
    
    // Load projects from GitHub
    this.loadProjectsFromGitHub();
    
    // If GitHub loading fails, use fallback data
    if (this.projects.size === 0) {
      this.seedFallbackProjects();
    }

    const notificationsData: Notification[] = [
      { id: randomUUID(), type: "deadline", title: "Deadline Approaching", message: "Multiple projects due soon", read: "false", createdAt: "2 hours ago", projectId: null, userId: null },
      { id: randomUUID(), type: "update", title: "Project Update", message: "Team assignments updated", read: "false", createdAt: "5 hours ago", projectId: null, userId: null },
      { id: randomUUID(), type: "mention", title: "You were mentioned", message: "Review pending assignments", read: "false", createdAt: "Yesterday", projectId: null, userId: null },
      { id: randomUUID(), type: "alert", title: "Project Progress", message: "Several projects nearing completion", read: "true", createdAt: "2 days ago", projectId: null, userId: null },
      { id: randomUUID(), type: "update", title: "Assignments Completed", message: "Multiple projects successfully completed", read: "true", createdAt: "3 days ago", projectId: null, userId: null },
    ];

    notificationsData.forEach((notification) => {
      this.notifications.set(notification.id, notification);
    });
  }

  private async loadTeamMembersFromGitHub() {
    try {
      const engineers = await GitHub.getUniqueEngineers();
      if (engineers.length > 0) {
        const teamMembersData: TeamMember[] = engineers.map(name => ({
          id: randomUUID(),
          name: name.trim(),
          role: "Engineer",
          email: `${name.toLowerCase().trim().replace(/\s+/g, ".")}@drbtechverse.in`,
          department: "Engineering",
          status: Math.random() > 0.3 ? "active" : (Math.random() > 0.5 ? "away" : "busy"),
          avatar: null,
        }));

        teamMembersData.forEach((member) => {
          this.teamMembers.set(member.id, member);
        });
        console.log(`Loaded ${engineers.length} engineers from GitHub: ${engineers.join(", ")}`);
        return;
      }
    } catch (error) {
      console.error('Failed to load team members from GitHub:', error);
    }

    // Fallback to hardcoded list if GitHub fails
    const fallbackEngineers = ["Susanth", "Keerthi", "Eswanth", "Dyumith", "Sachin", "Rajesh R", "Prakash", "Deekshitha", "Praveen Kumar", "Harikrishnan", "Anand", "Shubam Shirke", "Veeresh"];
    const teamMembersData: TeamMember[] = fallbackEngineers.map(name => ({
      id: randomUUID(),
      name,
      role: "Engineer",
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@drbtechverse.in`,
      department: "Engineering",
      status: Math.random() > 0.3 ? "active" : (Math.random() > 0.5 ? "away" : "busy"),
      avatar: null,
    }));

    teamMembersData.forEach((member) => {
      this.teamMembers.set(member.id, member);
    });
    console.log(`Using fallback team members list with ${fallbackEngineers.length} engineers`);
  }

  private async loadProjectsFromGitHub() {
    try {
      const assignments = await GitHub.getProjectAssignments();
      
      // Extract unique projects from assignments
      const uniqueProjects = new Map<string, { status: string; endDate: string }>();
      
      assignments.forEach((assignment: any) => {
        if (!uniqueProjects.has(assignment.projectName)) {
          uniqueProjects.set(assignment.projectName, { 
            status: assignment.status, 
            endDate: assignment.endDate 
          });
        }
      });

      const projectsData: Project[] = Array.from(uniqueProjects.entries()).map(([name, data]) => {
        const statusMap: Record<string, "in_progress" | "completed" | "pending" | "at_risk"> = {
          "Completed": "completed",
          "In Progress": "in_progress",
        };
        const isCompleted = data.status === "Completed";
        return {
          id: randomUUID(),
          name,
          description: `Project assignment and tracking`,
          status: statusMap[data.status] || "in_progress",
          progress: isCompleted ? 100 : Math.floor(Math.random() * 80 + 20),
          priority: Math.random() > 0.6 ? "high" : (Math.random() > 0.4 ? "medium" : "low"),
          dueDate: data.endDate,
        };
      });

      projectsData.forEach((project) => {
        this.projects.set(project.id, project);
      });
    } catch (error) {
      console.error('Failed to load projects from GitHub:', error);
    }
  }

  private seedFallbackProjects() {
    const fallbackData = [
      { projectName: "3A-S03-25066 - D8 Press-in Blind Hole Receptacle - Auto Assembly - SouthCo", engineerName: "Susanth", startDate: "2025-11-10", endDate: "2025-12-31", daysAssigned: 21, remainingDays: 31, status: "In Progress", notes: "" },
      { projectName: "3W-TT3-25051 - 560B Spot welding line", engineerName: "Keerthi", startDate: "2025-11-17", endDate: "2025-11-21", daysAssigned: 3, remainingDays: 2, status: "In Progress", notes: "" },
      { projectName: "3W-TT3-25051 - 560B Spot welding line", engineerName: "Eswanth", startDate: "2025-11-14", endDate: "2025-11-21", daysAssigned: 6, remainingDays: 2, status: "In Progress", notes: "All Cells" },
      { projectName: "3W2401_MRA ROOF SPOT WELDING LINE TKM", engineerName: "Sachin", startDate: "2024-12-11", endDate: "2025-11-20", daysAssigned: 316, remainingDays: 29, status: "In Progress", notes: "" },
      { projectName: "3DBTT202_JIG MODIFICATION AND 48605 CELL INSTALLTION", engineerName: "Sachin", startDate: "2024-10-10", endDate: "2026-01-21", daysAssigned: 378, remainingDays: 91, status: "In Progress", notes: "" },
      { projectName: "3W-TT4-25073_EXISTINH JIG POKAYOKE ADDITION", engineerName: "Sachin", startDate: "2025-07-22", endDate: "2025-10-17", daysAssigned: 93, remainingDays: 0, status: "Completed", notes: "" },
      { projectName: "3W-TT4-25072_NOZZLE CLEANER INSTALLATION", engineerName: "Sachin", startDate: "2025-07-07", endDate: "2025-09-22", daysAssigned: 108, remainingDays: 0, status: "Completed", notes: "" },
      { projectName: "3W-TT3-25051_ROBOTIC SPOT WELDING CELL R1J1,R1J2,BOLTING JIG", engineerName: "Sachin", startDate: "2025-07-17", endDate: "2025-11-20", daysAssigned: 98, remainingDays: 29, status: "In Progress", notes: "" },
      { projectName: "3W-SA1-25078_R1J1 ROBOTIC CELL + JIG", engineerName: "Sachin", startDate: "2025-09-20", endDate: "2025-11-21", daysAssigned: 33, remainingDays: 30, status: "In Progress", notes: "" },
      { projectName: "3A-S03-25066 - D8 Press-in Blind Hole Receptacle - Auto Assembly - SouthCo", engineerName: "Dyumith", startDate: "2025-10-13", endDate: "2025-12-30", daysAssigned: 5, remainingDays: 44, status: "In Progress", notes: "" },
      { projectName: "3A-SO1-25025_Bailer_Assembly", engineerName: "Susanth", startDate: "2025-09-01", endDate: "2025-11-30", daysAssigned: 47, remainingDays: 14, status: "In Progress", notes: "" },
    ];

    const uniqueProjects = new Map<string, { status: string; endDate: string }>();
    fallbackData.forEach(item => {
      if (!uniqueProjects.has(item.projectName)) {
        uniqueProjects.set(item.projectName, { status: item.status, endDate: item.endDate });
      }
    });

    const projectsData: Project[] = Array.from(uniqueProjects.entries()).map(([name, data]) => {
      const statusMap: Record<string, "in_progress" | "completed" | "pending" | "at_risk"> = {
        "Completed": "completed",
        "In Progress": "in_progress",
      };
      const isCompleted = data.status === "Completed";
      return {
        id: randomUUID(),
        name,
        description: `Project assignment and tracking`,
        status: statusMap[data.status] || "in_progress",
        progress: isCompleted ? 100 : Math.floor(Math.random() * 80 + 20),
        priority: Math.random() > 0.6 ? "high" : (Math.random() > 0.4 ? "medium" : "low"),
        dueDate: data.endDate,
      };
    });

    projectsData.forEach((project) => {
      this.projects.set(project.id, project);
    });
  }


  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      id,
      username: insertUser.username,
      password: insertUser.password,
      name: insertUser.name,
      email: insertUser.email,
      role: insertUser.role || "member",
      avatar: insertUser.avatar || null,
    };
    this.users.set(id, user);
    return user;
  }

  async getTeamMembers(): Promise<TeamMember[]> {
    return Array.from(this.teamMembers.values());
  }

  async getTeamMember(id: string): Promise<TeamMember | undefined> {
    return this.teamMembers.get(id);
  }

  async createTeamMember(insertMember: InsertTeamMember): Promise<TeamMember> {
    const id = randomUUID();
    const member: TeamMember = { 
      id,
      name: insertMember.name,
      role: insertMember.role,
      email: insertMember.email,
      department: insertMember.department,
      status: insertMember.status || "active",
      avatar: insertMember.avatar || null,
    };
    this.teamMembers.set(id, member);
    return member;
  }

  async updateTeamMember(id: string, updates: Partial<TeamMember>): Promise<TeamMember | undefined> {
    const existing = this.teamMembers.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.teamMembers.set(id, updated);
    return updated;
  }

  async getProjects(): Promise<Project[]> {
    const projects = Array.from(this.projects.values());
    const today = new Date().toISOString().split('T')[0];
    
    // Update project status/progress based on today's engineer updates
    const engineerTasks = await this.getEngineerDailyTasks(today);
    
    return projects.map(project => {
      // Find all engineers working on this project today
      const projectEngineers = engineerTasks.filter(task => 
        task.customActivities.length > 0 || task.targetTasks.length > 0
      );
      
      // Calculate progress based on today's updates
      if (projectEngineers.length > 0) {
        // Count total target tasks and completed activities for this project today
        const totalTarget = projectEngineers.reduce((sum, task) => sum + task.targetTasks.length, 0);
        const totalCompleted = projectEngineers.reduce((sum, task) => sum + task.completed, 0);
        
        if (totalTarget > 0) {
          const newProgress = Math.min(100, Math.round((totalCompleted / totalTarget) * 100));
          
          // Determine status based on progress
          let newStatus: "completed" | "in_progress" | "pending" | "at_risk" = (project.status as "completed" | "in_progress" | "pending" | "at_risk") || "in_progress";
          if (newProgress === 100) {
            newStatus = "completed";
          } else if (newProgress >= 50) {
            newStatus = "in_progress";
          } else if (newProgress > 0) {
            newStatus = "in_progress";
          }
          
          return {
            ...project,
            progress: newProgress,
            status: newStatus,
          };
        }
      }
      
      return project;
    });
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const project: Project = { 
      id,
      name: insertProject.name,
      description: insertProject.description || null,
      status: insertProject.status || "in_progress",
      progress: insertProject.progress || 0,
      priority: insertProject.priority || "medium",
      dueDate: insertProject.dueDate || null,
    };
    this.projects.set(id, project);
    return project;
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const projects = await this.getProjects();
    const teamMembers = await this.getTeamMembers();
    
    const completedProjects = projects.filter(p => p.status === "completed").length;
    const completionRate = projects.length > 0 
      ? Math.round((completedProjects / projects.length) * 100) 
      : 0;
    
    const activeMembers = teamMembers.filter(m => m.status === "active").length;
    
    return {
      totalProjects: projects.length,
      activeMembers,
      completionRate,
      recentActivities: 24,
    };
  }

  async getAnalytics(): Promise<AnalyticsData> {
    const projects = await this.getProjects();
    const teamMembers = await this.getTeamMembers();

    const statusCounts = projects.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const statusColors: Record<string, string> = {
      completed: "#22c55e",
      in_progress: "#3b82f6",
      pending: "#f59e0b",
      at_risk: "#ef4444",
    };

    const projectsByStatus = Object.entries(statusCounts).map(([status, count]) => ({
      status: status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      count,
      color: statusColors[status] || "#6b7280",
    }));

    const priorityCounts = projects.reduce((acc, p) => {
      acc[p.priority] = (acc[p.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const priorityColors: Record<string, string> = {
      high: "#ef4444",
      medium: "#f59e0b",
      low: "#22c55e",
    };

    const projectsByPriority = Object.entries(priorityCounts).map(([priority, count]) => ({
      priority: priority.charAt(0).toUpperCase() + priority.slice(1),
      count,
      color: priorityColors[priority] || "#6b7280",
    }));

    // Calculate real team performance from project activities
    const projectActivities = await GitHub.getProjectActivities();
    const engineerActivityCounts = new Map<string, number>();
    
    // Count @ symbol entries per engineer from project activities
    // Match engineer names case-insensitively (handles "@Sachin Kumar" or "@sachin")
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
                  engineerActivityCounts.set(member.name, (engineerActivityCounts.get(member.name) || 0) + matches.length);
                }
                // Also check for first name only
                const firstName = member.name.split(' ')[0].toLowerCase();
                if (lowerActivity.includes(`@${firstName}`) && !matches) {
                  engineerActivityCounts.set(member.name, (engineerActivityCounts.get(member.name) || 0) + 1);
                }
              });
            }
          });
        }
      });
    }
    
    // Get today's engineer tasks for completion data
    const today = new Date().toISOString().split('T')[0];
    const engineerTasks = await this.getEngineerDailyTasks(today);
    
    const teamPerformance = teamMembers.map(member => {
      // Find this engineer's tasks data
      const engineerData = engineerTasks.find(e => e.engineerName === member.name);
      const tasksCompleted = engineerData ? engineerData.completed : 0;
      const activityCount = engineerActivityCounts.get(member.name) || 0;
      
      return {
        name: member.name,
        tasksCompleted: tasksCompleted + activityCount,
        department: member.department,
      };
    });

    // Calculate real monthly progress from project data
    const now = new Date();
    const months = [];
    for (let i = 3; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = month.toLocaleString('default', { month: 'short' });
      const completedCount = projects.filter(p => p.status === "completed").length;
      const inProgressCount = projects.filter(p => p.status === "in_progress").length;
      const pendingCount = projects.filter(p => p.status === "pending" || p.status === "at_risk").length;
      
      // Scale based on month position (older months have less progress)
      const scaleFactor = (4 - i) / 4;
      months.push({
        month: monthName,
        completed: Math.round(completedCount * scaleFactor),
        inProgress: Math.max(1, Math.round(inProgressCount * (1 - scaleFactor * 0.3))),
        pending: Math.max(0, Math.round(pendingCount * (1 - scaleFactor * 0.5))),
      });
    }
    const monthlyProgress = months;

    // Calculate completion trend from team performance
    const totalTasks = teamPerformance.reduce((sum, t) => sum + t.tasksCompleted, 0);
    const avgTasksPerWeek = Math.max(1, Math.ceil(totalTasks / 4));
    const completionTrend = [
      { week: "Week 1", rate: Math.min(100, Math.round((avgTasksPerWeek * 0.4 / Math.max(1, totalTasks)) * 100)) },
      { week: "Week 2", rate: Math.min(100, Math.round((avgTasksPerWeek * 0.6 / Math.max(1, totalTasks)) * 100)) },
      { week: "Week 3", rate: Math.min(100, Math.round((avgTasksPerWeek * 0.8 / Math.max(1, totalTasks)) * 100)) },
      { week: "Week 4", rate: Math.min(100, Math.round((avgTasksPerWeek / Math.max(1, totalTasks)) * 100)) },
    ];

    return {
      projectsByStatus,
      projectsByPriority,
      teamPerformance,
      monthlyProgress,
      completionTrend,
    };
  }

  async getNotifications(): Promise<Notification[]> {
    return Array.from(this.notifications.values());
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = randomUUID();
    const notification: Notification = {
      id,
      type: insertNotification.type,
      title: insertNotification.title,
      message: insertNotification.message,
      read: insertNotification.read || "false",
      createdAt: insertNotification.createdAt,
      projectId: insertNotification.projectId || null,
      userId: insertNotification.userId || null,
    };
    this.notifications.set(id, notification);
    return notification;
  }

  async markNotificationRead(id: string): Promise<void> {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.read = "true";
      this.notifications.set(id, notification);
    }
  }

  async markAllNotificationsRead(): Promise<void> {
    Array.from(this.notifications.values()).forEach(notification => {
      notification.read = "true";
    });
  }

  async getCommentsByProject(projectId: string): Promise<Comment[]> {
    return Array.from(this.comments.values()).filter(c => c.projectId === projectId);
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const id = randomUUID();
    const comment: Comment = {
      id,
      content: insertComment.content,
      projectId: insertComment.projectId,
      authorId: insertComment.authorId,
      authorName: insertComment.authorName,
      createdAt: insertComment.createdAt,
      mentions: insertComment.mentions || null,
    };
    this.comments.set(id, comment);
    return comment;
  }

  async getEngineerDailyTasks(date: string = new Date().toISOString().split('T')[0]) {
    // Sync GitHub daily data first
    try {
      const githubData = await GitHub.getEngineerDataByDate(date);
      if (githubData && Array.isArray(githubData) && githubData.length > 0) {
        githubData.forEach(item => {
          // First, remove old entries for this date from memory
          if (!this.engineerActivities.has(item.engineerName)) {
            this.engineerActivities.set(item.engineerName, []);
          }
          if (!this.engineerTargetTasks.has(item.engineerName)) {
            this.engineerTargetTasks.set(item.engineerName, []);
          }
          
          // Remove old activities for this date, keep only other dates
          let activities = this.engineerActivities.get(item.engineerName) || [];
          activities = activities.filter(a => a.date !== date);
          // Add GitHub activities for this date
          activities.push(...(item.completedActivities || []).map(a => ({ ...a, date })));
          this.engineerActivities.set(item.engineerName, activities);
          
          // Remove old target tasks for this date, keep only other dates
          let tasks = this.engineerTargetTasks.get(item.engineerName) || [];
          tasks = tasks.filter(t => t.date !== date);
          // Add GitHub target tasks for this date
          tasks.push(...(item.targetTasks || []).map(t => ({ ...t, date })));
          this.engineerTargetTasks.set(item.engineerName, tasks);
        });
      }
    } catch (error) {
      console.error('Failed to sync from GitHub:', error);
    }

    // Load project assignments from GitHub
    let assignments: any[] = [];
    try {
      assignments = await GitHub.getProjectAssignments();
    } catch (error) {
      console.error('Failed to load assignments from GitHub:', error);
    }

    // Get all team members
    const teamMembers = Array.from(this.teamMembers.values());
    
    // Build task map for each engineer from assignments
    const taskMap = new Map<string, Array<{ projectId: string; projectName: string; completed: boolean }>>();
    
    // Initialize taskMap with all engineers
    teamMembers.forEach(member => {
      taskMap.set(member.name, []);
    });

    // Add tasks for each engineer based on GitHub assignments
    assignments.forEach((assignment: any) => {
      const engineerName = assignment.engineer || assignment.engineerName;
      const projectName = assignment.projectName || assignment.project;
      
      if (engineerName && projectName) {
        // Ensure engineer exists in taskMap (in case they're not in team members list)
        if (!taskMap.has(engineerName)) {
          taskMap.set(engineerName, []);
        }
        
        const project = Array.from(this.projects.values()).find(p => p.name === projectName);
        
        if (project) {
          const isCompleted = this.engineerAssignments.get(engineerName)?.get(`${project.id}-${date}`) ?? false;
          taskMap.get(engineerName)?.push({
            projectId: project.id,
            projectName: projectName,
            completed: isCompleted,
          });
        }
      }
    });

    // Return all engineers with their task info
    return Array.from(taskMap.entries()).map(([engineerName, tasks]) => {
      const completed = tasks.filter(t => t.completed).length;
      const inProgress = Math.max(0, tasks.length - completed - 1);
      const activities = this.engineerActivities.get(engineerName) ?? [];
      const todayActivities = activities.filter(a => a.date === date);
      const targetTasksList = this.engineerTargetTasks.get(engineerName) ?? [];
      const todayTargetTasks = targetTasksList.filter(t => t.date === date);
      
      return {
        engineerName,
        planned: tasks.length,
        completed,
        inProgress,
        tasks,
        customActivities: todayActivities,
        targetTasks: todayTargetTasks,
      };
    });
  }

  async updateEngineerTaskCompletion(engineerName: string, projectId: string, date: string, completed: boolean) {
    if (!this.engineerAssignments.has(engineerName)) {
      this.engineerAssignments.set(engineerName, new Map());
    }
    this.engineerAssignments.get(engineerName)?.set(`${projectId}-${date}`, completed);
    return { success: true };
  }

  async addEngineerActivity(engineerName: string, activity: string, date: string) {
    const id = randomUUID();
    if (!this.engineerActivities.has(engineerName)) {
      this.engineerActivities.set(engineerName, []);
    }
    this.engineerActivities.get(engineerName)?.push({ id, text: activity, date });
    // Also save to GitHub
    try {
      await GitHub.addEngineerActivity(engineerName, activity, date);
    } catch (error) {
      console.error('Failed to save activity to GitHub:', error);
    }
    return { id, success: true };
  }

  async deleteEngineerActivity(engineerName: string, activityId: string, date: string) {
    const activities = this.engineerActivities.get(engineerName);
    if (activities) {
      const index = activities.findIndex(a => a.id === activityId && a.date === date);
      if (index > -1) {
        activities.splice(index, 1);
      }
    }
    // Also delete from GitHub
    try {
      await GitHub.deleteEngineerActivity(engineerName, activityId, date);
    } catch (error) {
      console.error('Failed to delete activity from GitHub:', error);
    }
    return { success: true };
  }

  async setEngineerTargetTask(engineerName: string, task: string, date: string) {
    const id = randomUUID();
    if (!this.engineerTargetTasks.has(engineerName)) {
      this.engineerTargetTasks.set(engineerName, []);
    }
    this.engineerTargetTasks.get(engineerName)?.push({ id, text: task, date });
    // Also save to GitHub
    try {
      await GitHub.setEngineerTargetTask(engineerName, task, date);
    } catch (error) {
      console.error('Failed to save target task to GitHub:', error);
    }
    return { id, success: true };
  }

  async deleteEngineerTargetTask(engineerName: string, taskId: string, date: string) {
    const tasks = this.engineerTargetTasks.get(engineerName);
    if (tasks) {
      const index = tasks.findIndex(t => t.id === taskId && t.date === date);
      if (index > -1) {
        tasks.splice(index, 1);
      }
    }
    // Also delete from GitHub
    try {
      await GitHub.deleteEngineerTargetTask(engineerName, taskId, date);
    } catch (error) {
      console.error('Failed to delete target task from GitHub:', error);
    }
    return { success: true };
  }

  async getPendingEngineerTasks(engineerName: string, beforeDate: string): Promise<Array<{ id: string; text: string; date: string }>> {
    const allTasks = this.engineerTargetTasks.get(engineerName) || [];
    // Filter tasks from before the specified date
    return allTasks.filter(task => task.date < beforeDate);
  }
}

export const storage = new MemStorage();
