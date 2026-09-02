import { createContext, useContext, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { UserRole } from "@shared/schema";
import { rolePermissions } from "@shared/schema";

export type EngineerRole = 'admin' | 'engineer' | 'hr' | 'pic' | 'scm';

// Roles that get full read access everywhere (like Admin) but can only
// edit the Material Procurement Tracker — not engineers, roadmap, blog, etc.
export const VIEWER_ROLES: EngineerRole[] = ['hr', 'pic', 'scm'];

interface EngineerUser {
  id: string;
  username: string;
  name: string;
  role: EngineerRole;
  company?: string;
  email: string;
  status: string;
}

interface AuthContextType {
  user: EngineerUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  // True for Admin, HR, Project-In-Charge, SCM — anyone who should see
  // everything an Admin sees (read-only for HR/PIC/SCM).
  isFullAccessViewer: boolean;
  // True only for roles allowed to edit the Material Procurement Tracker
  // (Admin always; HR/PIC/SCM as a special case even though they can't
  // edit anything else in the app).
  canEditMaterials: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: keyof typeof rolePermissions.admin) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<EngineerUser | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("currentEngineer");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return null;
        }
      }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        throw new Error("Login failed");
      }
      const userData = await response.json() as EngineerUser;
      setUser(userData);
      localStorage.setItem("currentEngineer", JSON.stringify(userData));
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("currentEngineer");
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  const hasPermission = (permission: keyof typeof rolePermissions.admin): boolean => {
    if (!user) return false;
    // Admin has all permissions
    if (user.role === 'admin') return true;
    // Map engineer role to member permissions
    const userRole: UserRole = user.role === 'engineer' ? 'member' : 'admin';
    const permissions = rolePermissions[userRole];
    return permissions ? permissions[permission] : false;
  };

  const isAuthenticated = !!user;
  // Always treat username 'admin' as admin, in case stored role is stale
  const isAdmin = user?.role === 'admin' || user?.username?.toLowerCase() === 'admin';
  const isViewerRole = !!user && VIEWER_ROLES.includes(user.role);
  const isFullAccessViewer = isAdmin || isViewerRole;
  const canEditMaterials = isAdmin || isViewerRole;

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated, isAdmin, isFullAccessViewer, canEditMaterials, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
