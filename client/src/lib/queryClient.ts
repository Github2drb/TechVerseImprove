import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Get admin auth header for protected routes
export function getAdminAuthHeader(): Record<string, string> {
  const userStr = localStorage.getItem("currentEngineer");
  if (!userStr) return {};
  
  try {
    const user = JSON.parse(userStr);
    const isAdminUser = user.role === 'admin' || user.username?.toLowerCase() === 'admin';
    if (isAdminUser) {
      const authData = btoa(JSON.stringify({ username: user.username, role: 'admin' }));
      return { "X-Admin-Auth": authData };
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  includeAdminAuth: boolean = false,
): Promise<Response> {
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  
  if (includeAdminAuth) {
    Object.assign(headers, getAdminAuthHeader());
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
  includeAdminAuth?: boolean;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior, includeAdminAuth = false }) =>
  async ({ queryKey }) => {
    const headers: Record<string, string> = {};
    
    if (includeAdminAuth) {
      Object.assign(headers, getAdminAuthHeader());
    }
    
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Create a fetch function with admin auth for specific queries
export async function fetchWithAdminAuth(url: string): Promise<any> {
  const headers: Record<string, string> = { ...getAdminAuthHeader() };
  
  const res = await fetch(url, {
    credentials: "include",
    headers,
  });
  
  await throwIfResNotOk(res);
  return await res.json();
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // staleTime 0 so each mount fetches fresh data.
      staleTime: 0,
      refetchOnMount: true,
      // Retry transient failures (503 from a GitHub hiccup) with backoff.
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      // Keep previously-fetched data in the cache for 1h. If a refetch fails,
      // React Query keeps serving the last good data instead of going empty.
      gcTime: 60 * 60 * 1000,
    },
    mutations: {
      retry: false,
    },
  },
});
