import { readDataFromGitHub, writeDataToGitHub, EngineerDailyData } from './github';

interface MSProjectTask {
  id: string;
  name: string;
  status: string;
  percentComplete: number;
  assignedTo?: string;
}

interface MSProjectProject {
  id: string;
  name: string;
  description?: string;
  tasks: MSProjectTask[];
}

export class MicrosoftProjectClient {
  private accessToken: string;
  private baseUrl = 'https://graph.microsoft.com/v1.0/me/projects';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async getProjects(): Promise<MSProjectProject[]> {
    try {
      const response = await fetch(this.baseUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }

      const data = await response.json();
      return data.value || [];
    } catch (error) {
      console.error('Error fetching Microsoft Projects:', error);
      throw error;
    }
  }

  async getProjectTasks(projectId: string): Promise<MSProjectTask[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}('${projectId}')/rootTasks`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch tasks: ${response.statusText}`);
      }

      const data = await response.json();
      return data.value || [];
    } catch (error) {
      console.error('Error fetching tasks:', error);
      throw error;
    }
  }
}

export async function syncMicrosoftProjectToGitHub(): Promise<{ success: boolean; message: string }> {
  try {
    const msToken = process.env.MICROSOFT_PROJECT_TOKEN;
    if (!msToken) {
      throw new Error('Microsoft Project token not configured');
    }

    const client = new MicrosoftProjectClient(msToken);
    
    // Get GitHub data
    const gitHubData = await readDataFromGitHub();
    
    // Fetch projects from Microsoft Project
    const msProjects = await client.getProjects();
    
    // Sync each project
    const syncedProjects = [];
    for (const project of msProjects) {
      const tasks = await client.getProjectTasks(project.id);
      
      syncedProjects.push({
        id: project.id,
        name: project.name,
        description: project.description || '',
        status: 'synced_from_ms_project',
        progress: Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100) || 0,
        priority: 'medium',
        dueDate: new Date().toISOString().split('T')[0],
        tasks: tasks.map(t => ({
          id: t.id,
          name: t.name,
          assignedTo: t.assignedTo,
          percentComplete: t.percentComplete,
          status: t.status,
        })),
      });
    }

    // Save synced data back to GitHub
    const updatedData = {
      ...gitHubData,
      microsoftProjectSync: {
        lastSync: new Date().toISOString(),
        projects: syncedProjects,
      },
    };

    await writeDataToGitHub(updatedData);

    return {
      success: true,
      message: `Successfully synced ${syncedProjects.length} projects from Microsoft Project`,
    };
  } catch (error) {
    console.error('Error syncing Microsoft Project:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to sync Microsoft Project',
    };
  }
}

export async function getMicrosoftProjectSyncStatus(): Promise<any> {
  try {
    const data = await readDataFromGitHub();
    return data.microsoftProjectSync || null;
  } catch (error) {
    console.error('Error getting sync status:', error);
    return null;
  }
}
