import { createContext, useContext, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import type { UserRole } from "@shared/schema";
import { rolePermissions } from "@shared/schema";

interface EngineerUser {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'engineer' | 'stores' | 'documentation';
  company?: string;
  email: string;
  status: string;
}

interface AuthContextType {
  user: EngineerUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isStores: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  logoutAdmin: () => void;
  hasPermission: (permission: keyof typeof rolePermissions.admin) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<EngineerUser | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("currentEngineer");
      if (stored) {
        try { return JSON.parse(stored); } catch { return null; }
      }
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [adminStepDown, setAdminStepDown] = useState(false);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) throw new Error("Login failed");
      const userData = await response.json() as EngineerUser;
      setUser(userData);
      setAdminStepDown(false);
      localStorage.setItem("currentEngineer", JSON.stringify(userData));
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } finally {
      setIsLoading(false);
    }
  };

  const logoutAdmin = () => setAdminStepDown(true);

  const logout = () => {
    setUser(null);
    setAdminStepDown(false);
    localStorage.removeItem("currentEngineer");
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  const hasPermission = (permission: keyof typeof rolePermissions.admin): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    // stores and engineer both get member-level permissions
    const userRole: UserRole = 'member';
    const permissions = rolePermissions[userRole];
    return permissions ? permissions[permission] : false;
  };

  const isAuthenticated = !!user;
  const isAdmin = !adminStepDown && (
    user?.role === 'admin' || user?.username?.toLowerCase() === 'admin'
  );
  const isStores = !adminStepDown && (
    user?.role === 'stores' || user?.role === 'admin' || user?.username?.toLowerCase() === 'admin'
  );

  return (
    <AuthContext.Provider value={{
      user, isLoading, isAuthenticated,
      isAdmin, isStores,
      login, logout, logoutAdmin, hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
