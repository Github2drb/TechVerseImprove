import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("pending_approval"),
  avatar: text("avatar"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const userRoles = z.enum(["admin", "manager", "member"]);
export type UserRole = z.infer<typeof userRoles>;

export const rolePermissions: Record<string, { canManageUsers: boolean; canManageProjects: boolean; canEditComments: boolean; canViewAnalytics: boolean }> = {
  admin: { canManageUsers: true, canManageProjects: true, canEditComments: true, canViewAnalytics: true },
  manager: { canManageUsers: false, canManageProjects: true, canEditComments: true, canViewAnalytics: true },
  member: { canManageUsers: false, canManageProjects: false, canEditComments: true, canViewAnalytics: false },
};

export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  role: text("role").notNull(),
  email: text("email").notNull(),
  avatar: text("avatar"),
  department: text("department").notNull(),
  status: text("status").notNull().default("active"),
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
});

export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("in_progress"),
  progress: integer("progress").notNull().default(0),
  priority: text("priority").notNull().default("medium"),
  dueDate: text("due_date"),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export const dashboardStats = z.object({
  totalProjects: z.number(),
  activeMembers: z.number(),
  completionRate: z.number(),
  recentActivities: z.number(),
});

export type DashboardStats = z.infer<typeof dashboardStats>;

export const navigationCard = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  icon: z.string(),
  href: z.string(),
  status: z.enum(["active", "coming_soon"]),
  gradient: z.string(),
});

export type NavigationCard = z.infer<typeof navigationCard>;

export const analyticsData = z.object({
  projectsByStatus: z.array(z.object({
    status: z.string(),
    count: z.number(),
    color: z.string(),
  })),
  projectsByPriority: z.array(z.object({
    priority: z.string(),
    count: z.number(),
    color: z.string(),
  })),
  teamPerformance: z.array(z.object({
    name: z.string(),
    tasksCompleted: z.number(),
    department: z.string(),
  })),
  monthlyProgress: z.array(z.object({
    month: z.string(),
    completed: z.number(),
    inProgress: z.number(),
    pending: z.number(),
  })),
  completionTrend: z.array(z.object({
    week: z.string(),
    rate: z.number(),
  })),
});

export type AnalyticsData = z.infer<typeof analyticsData>;

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: text("read").notNull().default("false"),
  createdAt: text("created_at").notNull(),
  projectId: varchar("project_id"),
  userId: varchar("user_id"),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  projectId: varchar("project_id").notNull(),
  authorId: varchar("author_id").notNull(),
  authorName: text("author_name").notNull(),
  createdAt: text("created_at").notNull(),
  mentions: text("mentions"),
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
});

export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

// Engineer Weekly Assignment Schema
export const engineerWeeklyAssignmentSchema = z.object({
  id: z.string(),
  engineerName: z.string(),
  weekStart: z.string(), // ISO date string for week start (Monday)
  projectName: z.string(),
  projectTargetDate: z.string().optional(), // Target date for project completion
  resourceLockedFrom: z.string().optional(), // Date when resource is locked from
  resourceLockedTill: z.string().optional(), // Date when resource lock ends
  internalTarget: z.string().optional(), // Internal target date
  customerTarget: z.string().optional(), // Customer target date
  tasks: z.array(z.object({
    id: z.string(),
    taskName: z.string(),
    targetDate: z.string().optional(),
    completionDate: z.string().optional(),
    status: z.enum(["not_started", "in_progress", "completed", "blocked"]),
  })),
  currentStatus: z.enum(["not_started", "in_progress", "completed", "on_hold", "blocked"]),
  notes: z.string().optional(),
  constraint: z.string().optional(),
});

export const insertEngineerWeeklyAssignmentSchema = engineerWeeklyAssignmentSchema.omit({ id: true });

export type EngineerWeeklyAssignment = z.infer<typeof engineerWeeklyAssignmentSchema>;
export type InsertEngineerWeeklyAssignment = z.infer<typeof insertEngineerWeeklyAssignmentSchema>;
