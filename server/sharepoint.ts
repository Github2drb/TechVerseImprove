// SharePoint Integration for Team Performance Data
// Uses Microsoft Graph API via MICROSOFT_ACCESS_TOKEN environment variable.
// On Render.com (or any host), set MICROSOFT_ACCESS_TOKEN in the environment/secrets panel.
// If SharePoint is not used, routes will return empty data gracefully.

import { Client } from '@microsoft/microsoft-graph-client';

export async function getSharePointClient(): Promise<Client> {
  const token = process.env.MICROSOFT_ACCESS_TOKEN;
  if (!token) {
    throw new Error('MICROSOFT_ACCESS_TOKEN environment variable is not set.');
  }
  return Client.init({
    authProvider: (done) => {
      done(null, token);
    },
  });
}

// Graceful stub: returns empty data if SharePoint is not configured
export async function getSharePointData(): Promise<any[]> {
  try {
    const client = await getSharePointClient();
    // Implement actual SharePoint calls here when token is available
    return [];
  } catch (error) {
    console.warn('SharePoint not configured or token expired. Returning empty data.');
    return [];
  }
}

// Stub functions to satisfy routes.ts imports
export async function isSharePointConnected(): Promise<boolean> {
  return false;
}

export async function getAttendanceData(): Promise<any[]> {
  return [];
}

export function calculatePerformanceScore(data: any): number {
  return 0;
}
