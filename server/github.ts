import { Octokit } from '@octokit/rest';
async function validateAndNormalizeAssignment(
  assignment: any,
  masterEngineers: Array<{ name: string }>
): Promise<{ valid: boolean; normalized: any; warnings: string[] }> {
  const warnings: string[] = [];
  
  // Validate engineer name
  if (assignment.engineerName) {
    const canonical = findCanonicalEngineerName(assignment.engineerName, masterEngineers);
    if (canonical && canonical !== assignment.engineerName) {
      warnings.push(`Engineer name normalized: "${assignment.engineerName}" → "${canonical}"`);
      assignment.engineerName = canonical;
    } else if (!canonical) {
      warnings.push(`Warning: Engineer "${assignment.engineerName}" not found in master list`);
    }
  }
  
  // Normalize project name using extractProjectNumber for consistency
  if (assignment.projectName) {
    const projectNum = extractProjectNumber(assignment.projectName);
    // Optional: store normalized project number for indexing
    assignment._projectKey = projectNum;
  }
  
  return { valid: true, normalized: assignment, warnings };
}

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

export async function getGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

export interface EngineerDailyData {
  engineerName: string;
  date: string;
  targetTasks: Array<{ id: string; text: string }>;
  completedActivities: Array<{ id: string; text: string }>;
}

export async function readDataFromGitHub(): Promise<{ engineerDailyData: EngineerDailyData[] }> {
  try {
    const octokit = await getGitHubClient();
    const response = await octokit.repos.getContent({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'data.json',
    });

    if (Array.isArray(response.data)) {
      throw new Error('Expected a file, got a directory');
    }

    if (!('content' in response.data)) {
      throw new Error('File has no content');
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    const data = JSON.parse(content);
    
    // Ensure the data has engineerDailyData array
    if (!data.engineerDailyData) {
      data.engineerDailyData = [];
    }
    
    return { engineerDailyData: data.engineerDailyData || [] };
  } catch (error) {
    console.error('Error reading from GitHub:', error);
    return { engineerDailyData: [] };
  }
}

export async function writeDataToGitHub(data: { engineerDailyData: EngineerDailyData[] }): Promise<boolean> {
  try {
    const octokit = await getGitHubClient();
    
    // Get current file to get the SHA
    const currentFile = await octokit.repos.getContent({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'data.json',
    });

    if (Array.isArray(currentFile.data)) {
      throw new Error('Expected a file, got a directory');
    }

    if (!('sha' in currentFile.data)) {
      throw new Error('File has no sha');
    }

    const sha = currentFile.data.sha;
    const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

    await octokit.repos.createOrUpdateFileContents({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'data.json',
      message: `Update engineer daily tasks and activities - ${new Date().toISOString()}`,
      content: newContent,
      sha: sha,
    });

    return true;
  } catch (error) {
    console.error('Error writing to GitHub:', error);
    return false;
  }
}

// Separate functions for daily activities (target tasks and completed activities)
export async function readDailyActivitiesFromGitHub(): Promise<{ engineerDailyData: EngineerDailyData[] }> {
  try {
    const octokit = await getGitHubClient();
    const response = await octokit.repos.getContent({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'daily-activities.json',
    });

    if (Array.isArray(response.data)) {
      throw new Error('Expected a file, got a directory');
    }

    if (!('content' in response.data)) {
      throw new Error('File has no content');
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    const data = JSON.parse(content);
    
    // Ensure the data has engineerDailyData array
    if (!data.engineerDailyData) {
      data.engineerDailyData = [];
    }
    
    return { engineerDailyData: data.engineerDailyData || [] };
  } catch (error) {
    console.error('Error reading daily activities from GitHub:', error);
    return { engineerDailyData: [] };
  }
}

export async function writeDailyActivitiesToGitHub(data: { engineerDailyData: EngineerDailyData[] }): Promise<boolean> {
  try {
    const octokit = await getGitHubClient();
    
    try {
      // Try to get current file to get the SHA
      const currentFile = await octokit.repos.getContent({
        owner: 'Github2drb',
        repo: 'Controls_Team_Tracker',
        path: 'daily-activities.json',
      });

      if (Array.isArray(currentFile.data)) {
        throw new Error('Expected a file, got a directory');
      }

      if (!('sha' in currentFile.data)) {
        throw new Error('File has no sha');
      }

      const sha = currentFile.data.sha;
      const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

      await octokit.repos.createOrUpdateFileContents({
        owner: 'Github2drb',
        repo: 'Controls_Team_Tracker',
        path: 'daily-activities.json',
        message: `Update engineer daily activities - ${new Date().toISOString()}`,
        content: newContent,
        sha: sha,
      });
    } catch (error: any) {
      // If file doesn't exist, create it
      if (error.status === 404) {
        const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
        await octokit.repos.createOrUpdateFileContents({
          owner: 'Github2drb',
          repo: 'Controls_Team_Tracker',
          path: 'daily-activities.json',
          message: `Create daily activities file - ${new Date().toISOString()}`,
          content: newContent,
        });
      } else {
        throw error;
      }
    }

    return true;
  } catch (error) {
    console.error('Error writing daily activities to GitHub:', error);
    return false;
  }
}

export async function getEngineerDataByDate(date: string): Promise<EngineerDailyData[]> {
  const data = await readDailyActivitiesFromGitHub();
  return (data?.engineerDailyData || []).filter(item => item.date === date);
}

export async function addEngineerActivity(engineerName: string, activity: string, date: string): Promise<{ id: string; success: boolean }> {
  const data = await readDailyActivitiesFromGitHub();
  const id = Math.random().toString(36).substr(2, 9);
  
  const existingIndex = data.engineerDailyData.findIndex(item => item.engineerName === engineerName && item.date === date);
  
  if (existingIndex > -1) {
    data.engineerDailyData[existingIndex].completedActivities.push({ id, text: activity });
  } else {
    data.engineerDailyData.push({
      engineerName,
      date,
      targetTasks: [],
      completedActivities: [{ id, text: activity }],
    });
  }
  
  await writeDailyActivitiesToGitHub(data);
  return { id, success: true };
}

export async function deleteEngineerActivity(engineerName: string, activityId: string, date: string): Promise<{ success: boolean }> {
  const data = await readDailyActivitiesFromGitHub();
  const index = data.engineerDailyData.findIndex(item => item.engineerName === engineerName && item.date === date);
  
  if (index > -1) {
    data.engineerDailyData[index].completedActivities = data.engineerDailyData[index].completedActivities.filter(a => a.id !== activityId);
  }
  
  await writeDailyActivitiesToGitHub(data);
  return { success: true };
}

export async function setEngineerTargetTask(engineerName: string, task: string, date: string): Promise<{ id: string; success: boolean }> {
  const data = await readDailyActivitiesFromGitHub();
  const id = Math.random().toString(36).substr(2, 9);
  
  const existingIndex = data.engineerDailyData.findIndex(item => item.engineerName === engineerName && item.date === date);
  
  if (existingIndex > -1) {
    data.engineerDailyData[existingIndex].targetTasks.push({ id, text: task });
  } else {
    data.engineerDailyData.push({
      engineerName,
      date,
      targetTasks: [{ id, text: task }],
      completedActivities: [],
    });
  }
  
  await writeDailyActivitiesToGitHub(data);
  return { id, success: true };
}

export async function deleteEngineerTargetTask(engineerName: string, taskId: string, date: string): Promise<{ success: boolean }> {
  const data = await readDailyActivitiesFromGitHub();
  const index = data.engineerDailyData.findIndex(item => item.engineerName === engineerName && item.date === date);
  
  if (index > -1) {
    data.engineerDailyData[index].targetTasks = data.engineerDailyData[index].targetTasks.filter(t => t.id !== taskId);
  }
  
  await writeDailyActivitiesToGitHub(data);
  return { success: true };
}

export interface ProjectAssignment {
  projectName: string;
  engineer: string;
  startDate: string;
  endDate: string;
  daysAssigned: number;
  remainingDays: number;
  status: string;
  notes: string;
}

export async function getUniqueEngineers(includeUnassigned: boolean = false): Promise<string[]> {
  try {
    const octokit = await getGitHubClient();
    const [dataResponse, masterResponse] = await Promise.all([
      octokit.repos.getContent({
        owner: 'Github2drb',
        repo: 'Controls_Team_Tracker',
        path: 'data.json',
      }),
      octokit.repos.getContent({
        owner: 'Github2drb',
        repo: 'Controls_Team_Tracker',
        path: 'engineers_master_list.json',
      })
    ]);
    if (Array.isArray(dataResponse.data) || !('content' in dataResponse.data)) {
      throw new Error('Invalid data.json response');
    }
    const dataContent = Buffer.from(dataResponse.data.content, 'base64').toString('utf-8');
    const data = JSON.parse(dataContent);

    if (Array.isArray(masterResponse.data) || !('content' in masterResponse.data)) {
      throw new Error('Invalid engineers_master_list.json response');
    }
    const masterContent = Buffer.from(masterResponse.data.content, 'base64').toString('utf-8');
    const masterData = JSON.parse(masterContent);
    const masterEngineers: Array<{ name: string; id: string }> = masterData.engineers || [];
    
    
    // Extract engineer names from assignments
    const assignments: ProjectAssignment[] = data.assignments || data.data || [];
    const assignedEngineers = new Set<string>();
    
    assignments.forEach((assignment: ProjectAssignment) => {
      if (assignment.engineer || assignment.engineerName) {
        const name = (assignment.engineer || assignment.engineerName).trim();
        if (name) assignedEngineers.add(name);
      }
    });
    if (includeUnassigned) {
      // Return ALL engineers from master list, sorted
      return masterEngineers.map(e => e.name).sort();
    } else {
      // Return only assigned engineers, but normalize against master list
      const normalizedAssigned = new Set<string>();
      
      for (const assignedName of assignedEngineers) {
        const canonical = findCanonicalEngineerName(assignedName, masterEngineers);
        normalizedAssigned.add(canonical || assignedName);
      }
      
      return Array.from(normalizedAssigned).sort();
    }
    } catch (error) {
    console.error('Error fetching unique engineers from GitHub:', error);
    return [];
  }
}
    
    

export async function getProjectAssignments(): Promise<ProjectAssignment[]> {
  try {
    const octokit = await getGitHubClient();
    const response = await octokit.repos.getContent({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'data.json',
    });

    if (Array.isArray(response.data)) {
      throw new Error('Expected a file, got a directory');
    }

    if (!('content' in response.data)) {
      throw new Error('File has no content');
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    const data = JSON.parse(content);
    
    // Try multiple field names to find assignments
    const assignments = data.assignments || data.projectAssignments || data.projects || data.data || [];
    
    // Ensure all assignments have required fields with fallbacks
    return (Array.isArray(assignments) ? assignments : []).map((item: any) => ({
      projectName: item.projectName || item.project || '',
      engineer: item.engineer || item.engineerName || '',
      startDate: item.startDate || '',
      endDate: item.endDate || '',
      daysAssigned: item.daysAssigned || 0,
      remainingDays: item.remainingDays || 0,
      status: item.status || 'In Progress',
      notes: item.notes || '',
    }));
  } catch (error) {
    console.error('Error fetching project assignments from GitHub:', error);
    return [];
  }
}

export interface ProjectStatusEntry {
  engineerName: string;
  projectName: string;
  statuses: Record<string, string>; // date -> status
}

export interface ProjectStatusData {
  projectStatuses: ProjectStatusEntry[];
  lastUpdated: string;
}

export async function readProjectStatusFromGitHub(): Promise<ProjectStatusData> {
  try {
    const octokit = await getGitHubClient();
    const response = await octokit.repos.getContent({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'project-status.json',
    });

    if (Array.isArray(response.data)) {
      throw new Error('Expected a file, got a directory');
    }

    if (!('content' in response.data)) {
      throw new Error('File has no content');
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    if (error.status === 404) {
      return { projectStatuses: [], lastUpdated: new Date().toISOString() };
    }
    console.error('Error reading project status from GitHub:', error);
    return { projectStatuses: [], lastUpdated: new Date().toISOString() };
  }
}

export async function writeProjectStatusToGitHub(data: ProjectStatusData): Promise<boolean> {
  try {
    const octokit = await getGitHubClient();
    
    let sha: string | undefined;
    try {
      const currentFile = await octokit.repos.getContent({
        owner: 'Github2drb',
        repo: 'Controls_Team_Tracker',
        path: 'project-status.json',
      });

      if (!Array.isArray(currentFile.data) && 'sha' in currentFile.data) {
        sha = currentFile.data.sha;
      }
    } catch (error: any) {
      if (error.status !== 404) throw error;
    }

    const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

    await octokit.repos.createOrUpdateFileContents({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'project-status.json',
      message: `Update project status tracking - ${new Date().toISOString()}`,
      content: newContent,
      ...(sha ? { sha } : {}),
    });

    return true;
  } catch (error) {
    console.error('Error writing project status to GitHub:', error);
    return false;
  }
}

export async function updateProjectStatus(
  engineerName: string,
  projectName: string,
  date: string,
  status: string
): Promise<{ success: boolean }> {
  const data = await readProjectStatusFromGitHub();
  
  let entry = data.projectStatuses.find(
    (p) => p.engineerName === engineerName && p.projectName === projectName
  );
  
  if (!entry) {
    entry = { engineerName, projectName, statuses: {} };
    data.projectStatuses.push(entry);
  }
  
  entry.statuses[date] = status;
  data.lastUpdated = new Date().toISOString();
  
  const success = await writeProjectStatusToGitHub(data);
  return { success };
}

export async function getProjectStatusTracking(): Promise<Array<{
  engineerName: string;
  projectName: string;
  currentStatus: string;
  statuses: Record<string, string>;
  completionPercentage: number;
}>> {
  const assignments = await getProjectAssignments();
  const statusData = await readProjectStatusFromGitHub();
  
  // Generate date range from Dec 5, 2024 to Feb 28, 2025
  const startDate = new Date('2024-12-05');
  const endDate = new Date('2025-02-28');
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  return assignments.map((assignment) => {
    const statusEntry = statusData.projectStatuses.find(
      (p) => p.engineerName === assignment.engineer && p.projectName === assignment.projectName
    );
    
    const statuses = statusEntry?.statuses || {};
    
    // Calculate completion percentage based on total days in the range
    // Not just filled days, but the entire Dec 5 - Feb 28 range
    const completedCount = Object.values(statuses).filter(
      (s) => s === 'Completed' || s === 'Done'
    ).length;
    
    // Calculate percentage based on the full date range to accurately track progress
    const completionPercentage = Math.round((completedCount / totalDays) * 100);
    
    return {
      engineerName: assignment.engineer,
      projectName: assignment.projectName,
      currentStatus: assignment.status,
      statuses,
      completionPercentage,
    };
  });
}

// Project Activities - New functionality
export interface ProjectActivity {
  projectName: string;
  currentStatus: string;
  activities: Record<string, string>;
}

interface ProjectActivitiesData {
  projectActivities: Array<{
    projectName: string;
    currentStatus: string;
    activities: Record<string, string>;
  }>;
  lastUpdated: string;
}

async function readProjectActivitiesFromGitHub(): Promise<ProjectActivitiesData> {
  try {
    const octokit = await getGitHubClient();
    const response = await octokit.repos.getContent({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'project-activities.json',
    });

    if (Array.isArray(response.data) || !('content' in response.data)) {
      throw new Error('Invalid file response');
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    if (error.status === 404) {
      return { projectActivities: [], lastUpdated: new Date().toISOString() };
    }
    console.error('Error reading project activities from GitHub:', error);
    return { projectActivities: [], lastUpdated: new Date().toISOString() };
  }
}

async function writeProjectActivitiesToGitHub(data: ProjectActivitiesData): Promise<boolean> {
  try {
    const octokit = await getGitHubClient();
    const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    
    let sha: string | undefined;
    try {
      const currentFile = await octokit.repos.getContent({
        owner: 'Github2drb',
        repo: 'Controls_Team_Tracker',
        path: 'project-activities.json',
      });
      if (!Array.isArray(currentFile.data) && 'sha' in currentFile.data) {
        sha = currentFile.data.sha;
      }
    } catch (error: any) {
      if (error.status !== 404) throw error;
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'project-activities.json',
      message: `Update project activities - ${new Date().toISOString()}`,
      content: newContent,
      sha,
    });

    return true;
  } catch (error) {
    console.error('Error writing project activities to GitHub:', error);
    return false;
  }
}

/**
 * Extracts the project number from a project name.
 * e.g. "3A-DK2-25143 Leak Testing Machine" -> "3A-DK2-25143"
 * e.g. " 3W-TK1-25102 (27 MC)" -> "3W-TK1-25102"
 * Falls back to the full trimmed+lowercased name if no code pattern is found.
 */
function extractProjectNumber(projectName: string): string {
  const match = projectName.trim().match(/^([A-Z0-9]{1,4}-[A-Z0-9]{2,5}-\d{4,6})/i);
  return match ? match[1].toUpperCase() : projectName.trim().toLowerCase();
}

export async function getProjectActivities(): Promise<ProjectActivity[]> {
  const assignments = await getProjectAssignments();
  const activitiesData = await readProjectActivitiesFromGitHub();

  // Deduplicate by project number. When the same project number appears multiple
  // times (possibly with different suffixes/descriptions), keep the longest name
  // so we display the most descriptive version.
  const uniqueProjects = new Map<string, { projectName: string; status: string }>();
  assignments.forEach((assignment) => {
    const key = extractProjectNumber(assignment.projectName);
    const existing = uniqueProjects.get(key);
    if (!existing || assignment.projectName.trim().length > existing.projectName.trim().length) {
      uniqueProjects.set(key, {
        projectName: assignment.projectName.trim(),
        status: assignment.status,
      });
    }
  });

  return Array.from(uniqueProjects.values()).map(({ projectName, status }) => {
    // Match stored activity entry by project number so renamed variants still match
    const key = extractProjectNumber(projectName);
    const activityEntry = activitiesData.projectActivities.find(
      (p) => extractProjectNumber(p.projectName) === key
    );

    return {
      projectName,
      currentStatus: activityEntry?.currentStatus || status,
      activities: activityEntry?.activities || {},
    };
  });
}

export async function updateProjectActivity(
  projectName: string,
  date: string,
  activity: string
): Promise<{ success: boolean }> {
  const data = await readProjectActivitiesFromGitHub();
  
  let entry = data.projectActivities.find((p) => p.projectName === projectName);
  if (!entry) {
    entry = { projectName, currentStatus: "In Progress", activities: {} };
    data.projectActivities.push(entry);
  }
  
  if (activity) {
    entry.activities[date] = activity;
  } else {
    delete entry.activities[date];
  }
  data.lastUpdated = new Date().toISOString();
  
  const success = await writeProjectActivitiesToGitHub(data);
  return { success };
}

export async function updateProjectCurrentStatus(
  projectName: string,
  status: string
): Promise<{ success: boolean }> {
  const data = await readProjectActivitiesFromGitHub();
  
  let entry = data.projectActivities.find((p) => p.projectName === projectName);
  if (!entry) {
    entry = { projectName, currentStatus: status, activities: {} };
    data.projectActivities.push(entry);
  } else {
    entry.currentStatus = status;
  }
  data.lastUpdated = new Date().toISOString();
  
  const success = await writeProjectActivitiesToGitHub(data);
  return { success };
}

// Weekly Assignments Types and Functions
export interface WeeklyAssignmentTask {
  id: string;
  taskName: string;
  targetDate?: string;
  completionDate?: string;
  status: "not_started" | "in_progress" | "completed" | "blocked";
}

export interface WeeklyAssignment {
  id: string;
  engineerName: string;
  weekStart: string;
  projectName: string;
  projectTargetDate?: string;
  resourceLockedFrom?: string;
  resourceLockedTill?: string;
  internalTarget?: string;
  customerTarget?: string;
  tasks: WeeklyAssignmentTask[];
  currentStatus: "not_started" | "in_progress" | "completed" | "on_hold" | "blocked";
  notes?: string;
  constraint?: string;
}

interface WeeklyAssignmentsData {
  assignments: WeeklyAssignment[];
  lastUpdated: string;
}

async function readWeeklyAssignmentsFromGitHub(): Promise<WeeklyAssignmentsData> {
  try {
    const octokit = await getGitHubClient();
    const response = await octokit.repos.getContent({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'weekly-assignments.json',
    });

    if (Array.isArray(response.data) || !('content' in response.data)) {
      throw new Error('Invalid file response');
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    if (error.status === 404) {
      return { assignments: [], lastUpdated: new Date().toISOString() };
    }
    console.error('Error reading weekly assignments from GitHub:', error);
    return { assignments: [], lastUpdated: new Date().toISOString() };
  }
}

async function writeWeeklyAssignmentsToGitHub(data: WeeklyAssignmentsData): Promise<boolean> {
  try {
    const octokit = await getGitHubClient();
    const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    
    let sha: string | undefined;
    try {
      const currentFile = await octokit.repos.getContent({
        owner: 'Github2drb',
        repo: 'Controls_Team_Tracker',
        path: 'weekly-assignments.json',
      });
      if (!Array.isArray(currentFile.data) && 'sha' in currentFile.data) {
        sha = currentFile.data.sha;
      }
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'weekly-assignments.json',
      message: 'Update weekly assignments',
      content: newContent,
      sha,
    });
    return true;
  } catch (error) {
    console.error('Error writing weekly assignments to GitHub:', error);
    return false;
  }
}

export async function getWeeklyAssignments(weekStart?: string): Promise<WeeklyAssignment[]> {
  const data = await readWeeklyAssignmentsFromGitHub();
  if (weekStart) {
    return data.assignments.filter(a => a.weekStart === weekStart);
  }
  return data.assignments;
}

export async function upsertWeeklyAssignment(assignment: WeeklyAssignment): Promise<{ success: boolean; assignment?: WeeklyAssignment }> {
  const data = await readWeeklyAssignmentsFromGitHub();
  
  const existingIndex = data.assignments.findIndex(a => a.id === assignment.id);
  if (existingIndex >= 0) {
    data.assignments[existingIndex] = assignment;
  } else {
    data.assignments.push(assignment);
  }
  data.lastUpdated = new Date().toISOString();
  
  const success = await writeWeeklyAssignmentsToGitHub(data);
  return { success, assignment: success ? assignment : undefined };
}

export async function deleteWeeklyAssignment(id: string): Promise<{ success: boolean }> {
  const data = await readWeeklyAssignmentsFromGitHub();
  
  const existingIndex = data.assignments.findIndex(a => a.id === id);
  if (existingIndex >= 0) {
    data.assignments.splice(existingIndex, 1);
    data.lastUpdated = new Date().toISOString();
    const success = await writeWeeklyAssignmentsToGitHub(data);
    return { success };
  }
  return { success: false };
}

export async function updateAssignmentTask(
  assignmentId: string,
  task: WeeklyAssignmentTask
): Promise<{ success: boolean }> {
  const data = await readWeeklyAssignmentsFromGitHub();
  
  const assignment = data.assignments.find(a => a.id === assignmentId);
  if (!assignment) {
    return { success: false };
  }
  
  const taskIndex = assignment.tasks.findIndex(t => t.id === task.id);
  if (taskIndex >= 0) {
    assignment.tasks[taskIndex] = task;
  } else {
    assignment.tasks.push(task);
  }
  data.lastUpdated = new Date().toISOString();
  
  const success = await writeWeeklyAssignmentsToGitHub(data);
  return { success };
}

export async function deleteAssignmentTask(
  assignmentId: string,
  taskId: string
): Promise<{ success: boolean }> {
  const data = await readWeeklyAssignmentsFromGitHub();
  
  const assignment = data.assignments.find(a => a.id === assignmentId);
  if (!assignment) {
    return { success: false };
  }
  
  const taskIndex = assignment.tasks.findIndex(t => t.id === taskId);
  if (taskIndex >= 0) {
    assignment.tasks.splice(taskIndex, 1);
    data.lastUpdated = new Date().toISOString();
    const success = await writeWeeklyAssignmentsToGitHub(data);
    return { success };
  }
  return { success: false };
}

// Engineer Daily Tasks Types and Functions
export interface EngineerTaskConfig {
  id: string;
  name: string;
  initials: string;
}

interface EngineerMasterListData {
  engineers: EngineerTaskConfig[];
  lastUpdated: string;
}

interface EngineerDailyTasksData {
  engineers: EngineerTaskConfig[];
  lastUpdated: string;
}

// Read engineers from master list file
export async function readEngineerMasterListFromGitHub(): Promise<EngineerMasterListData> {
  try {
    const octokit = await getGitHubClient();
    const response = await octokit.repos.getContent({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'engineers_master_list.json',
    });

    if (Array.isArray(response.data) || !('content' in response.data)) {
      throw new Error('Invalid file response');
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    if (error.status === 404) {
      return { engineers: [], lastUpdated: new Date().toISOString() };
    }
    console.error('Error reading engineer master list from GitHub:', error);
    return { engineers: [], lastUpdated: new Date().toISOString() };
  }
}

// Write engineers to master list file
export async function writeEngineerMasterListToGitHub(data: EngineerMasterListData): Promise<boolean> {
  try {
    const octokit = await getGitHubClient();
    const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    
    let sha: string | undefined;
    try {
      const currentFile = await octokit.repos.getContent({
        owner: 'Github2drb',
        repo: 'Controls_Team_Tracker',
        path: 'engineers_master_list.json',
      });
      if (!Array.isArray(currentFile.data) && 'sha' in currentFile.data) {
        sha = currentFile.data.sha;
      }
    } catch (error: any) {
      if (error.status !== 404) throw error;
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'engineers_master_list.json',
      message: `Update engineers master list - ${new Date().toISOString()}`,
      content: newContent,
      sha,
    });

    return true;
  } catch (error) {
    console.error('Error writing engineer master list to GitHub:', error);
    return false;
  }
}

// Initialize master list with default engineers
export async function initializeEngineerMasterList(): Promise<{ success: boolean }> {
  const existingData = await readEngineerMasterListFromGitHub();
  
  if (existingData.engineers.length === 0) {
    const defaultEngineers: EngineerTaskConfig[] = [
      { id: "1", name: "Susanth", initials: "S" },
      { id: "2", name: "Keerthi", initials: "K" },
      { id: "4", name: "Dyumith", initials: "D" },
      { id: "5", name: "Sachin", initials: "S" },
      { id: "7", name: "Prakash", initials: "P" },
      { id: "8", name: "Deekshitha", initials: "D" },
      { id: "9", name: "Praveen", initials: "PK" },
      { id: "10", name: "Harikrishnan", initials: "H" },
      { id: "12", name: "Shubam", initials: "SS" },
      { id: "13", name: "Veeresh", initials: "V" },
    ];
    
    const data: EngineerMasterListData = {
      engineers: defaultEngineers,
      lastUpdated: new Date().toISOString(),
    };
    
    const success = await writeEngineerMasterListToGitHub(data);
    return { success };
  }
  
  return { success: true };
}

export async function readEngineerDailyTasksFromGitHub(): Promise<EngineerDailyTasksData> {
  try {
    const octokit = await getGitHubClient();
    const response = await octokit.repos.getContent({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'engineer-daily-tasks.json',
    });

    if (Array.isArray(response.data) || !('content' in response.data)) {
      throw new Error('Invalid file response');
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    if (error.status === 404) {
      return { engineers: [], lastUpdated: new Date().toISOString() };
    }
    console.error('Error reading engineer daily tasks from GitHub:', error);
    return { engineers: [], lastUpdated: new Date().toISOString() };
  }
}

export async function writeEngineerDailyTasksToGitHub(data: EngineerDailyTasksData): Promise<boolean> {
  try {
    const octokit = await getGitHubClient();
    const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    
    let sha: string | undefined;
    try {
      const currentFile = await octokit.repos.getContent({
        owner: 'Github2drb',
        repo: 'Controls_Team_Tracker',
        path: 'engineer-daily-tasks.json',
      });
      if (!Array.isArray(currentFile.data) && 'sha' in currentFile.data) {
        sha = currentFile.data.sha;
      }
    } catch (error: any) {
      if (error.status !== 404) throw error;
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'engineer-daily-tasks.json',
      message: `Update engineer daily tasks config - ${new Date().toISOString()}`,
      content: newContent,
      sha,
    });

    return true;
  } catch (error) {
    console.error('Error writing engineer daily tasks to GitHub:', error);
    return false;
  }
}

export async function getEngineerDailyTasksConfig(): Promise<EngineerTaskConfig[]> {
  // Read from engineers_master_list.json as the source of truth
  const masterData = await readEngineerMasterListFromGitHub();
  
  // If master list is empty, try to initialize it
  if (masterData.engineers.length === 0) {
    await initializeEngineerMasterList();
    const newData = await readEngineerMasterListFromGitHub();
    return newData.engineers;
  }
  
  return masterData.engineers;
}

export async function removeEngineersFromConfig(namesToRemove: string[]): Promise<{ success: boolean }> {
  try {
    const existingData = await readEngineerDailyTasksFromGitHub();
    const lowerCaseNames = namesToRemove.map(n => n.toLowerCase());
    
    const filteredEngineers = existingData.engineers.filter(
      e => !lowerCaseNames.includes(e.name.toLowerCase())
    );
    
    const data: EngineerDailyTasksData = {
      engineers: filteredEngineers,
      lastUpdated: new Date().toISOString(),
    };
    
    const success = await writeEngineerDailyTasksToGitHub(data);
    return { success };
  } catch (error) {
    console.error('Error removing engineers from config:', error);
    return { success: false };
  }
}

export async function initializeEngineerDailyTasksFile(): Promise<{ success: boolean }> {
  const existingData = await readEngineerDailyTasksFromGitHub();
  
  if (existingData.engineers.length === 0) {
    const defaultEngineers: EngineerTaskConfig[] = [
      { id: "1", name: "Susanth", initials: "S" },
      { id: "2", name: "Keerthi", initials: "K" },
      { id: "4", name: "Dyumith", initials: "D" },
      { id: "5", name: "Sachin", initials: "S" },
      { id: "7", name: "Prakash", initials: "P" },
      { id: "8", name: "Deekshitha", initials: "D" },
      { id: "9", name: "Praveen", initials: "PK" },
      { id: "10", name: "Harikrishnan", initials: "H" },
      { id: "12", name: "Shubam", initials: "SS" },
      { id: "13", name: "Veeresh", initials: "V" },
    ];
    
    const data: EngineerDailyTasksData = {
      engineers: defaultEngineers,
      lastUpdated: new Date().toISOString(),
    };
    
    const success = await writeEngineerDailyTasksToGitHub(data);
    return { success };
  }
  
  return { success: true };
}

// ==================== ENGINEER AUTHENTICATION ====================

export interface EngineerCredential {
  id: string;
  name: string;
  username: string;
  password: string;
  role: 'admin' | 'engineer';
  company?: string; // For outsourced engineers: Ampere, PAES, D.I.C.S
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

interface EngineerCredentialsData {
  engineers: EngineerCredential[];
  lastUpdated: string;
}

// Read engineer credentials from GitHub
export async function readEngineerCredentialsFromGitHub(): Promise<EngineerCredentialsData> {
  try {
    const octokit = await getGitHubClient();
    const response = await octokit.repos.getContent({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'engineers_auth.json',
    });

    if (Array.isArray(response.data) || !('content' in response.data)) {
      throw new Error('Invalid file response');
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    if (error.status === 404) {
      return { engineers: [], lastUpdated: new Date().toISOString() };
    }
    console.error('Error reading engineer credentials from GitHub:', error);
    return { engineers: [], lastUpdated: new Date().toISOString() };
  }
}

// Write engineer credentials to GitHub
export async function writeEngineerCredentialsToGitHub(data: EngineerCredentialsData): Promise<boolean> {
  try {
    const octokit = await getGitHubClient();
    const newContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    
    let sha: string | undefined;
    try {
      const currentFile = await octokit.repos.getContent({
        owner: 'Github2drb',
        repo: 'Controls_Team_Tracker',
        path: 'engineers_auth.json',
      });
      if (!Array.isArray(currentFile.data) && 'sha' in currentFile.data) {
        sha = currentFile.data.sha;
      }
    } catch (error: any) {
      if (error.status !== 404) throw error;
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: 'Github2drb',
      repo: 'Controls_Team_Tracker',
      path: 'engineers_auth.json',
      message: `Update engineer credentials - ${new Date().toISOString()}`,
      content: newContent,
      sha,
    });

    return true;
  } catch (error) {
    console.error('Error writing engineer credentials to GitHub:', error);
    return false;
  }
}

// Authenticate engineer
export async function authenticateEngineer(username: string, password: string): Promise<EngineerCredential | null> {
  const data = await readEngineerCredentialsFromGitHub();
  const engineer = data.engineers.find(
    e => e.username.toLowerCase() === username.toLowerCase() && e.password === password && e.isActive
  );
  
  if (engineer) {
    // Update last login
    engineer.lastLogin = new Date().toISOString();
    // Always ensure the admin username has admin role
    if (engineer.username.toLowerCase() === 'admin') {
      engineer.role = 'admin';
    }
    await writeEngineerCredentialsToGitHub(data);
  }
  
  return engineer || null;
}

// Update engineer password
export async function updateEngineerPassword(username: string, newPassword: string): Promise<boolean> {
  const data = await readEngineerCredentialsFromGitHub();
  const engineer = data.engineers.find(e => e.username.toLowerCase() === username.toLowerCase());
  
  if (!engineer) return false;
  
  engineer.password = newPassword;
  data.lastUpdated = new Date().toISOString();
  
  return await writeEngineerCredentialsToGitHub(data);
}

// Initialize engineer credentials from master list
export async function initializeEngineerCredentials(): Promise<{ success: boolean; created: number }> {
  const masterList = await readEngineerMasterListFromGitHub();
  const existingCreds = await readEngineerCredentialsFromGitHub();
  
  let created = 0;
  const existingUsernames = new Set(existingCreds.engineers.map(e => e.username.toLowerCase()));
  
  for (const eng of masterList.engineers) {
    // Generate username from name (lowercase, no spaces)
    const username = eng.name.replace(/\s*\([^)]*\)\s*/g, '').trim().toLowerCase().replace(/\s+/g, '.');
    
    if (!existingUsernames.has(username)) {
      // Extract company from parenthetical if present
      const companyMatch = eng.name.match(/\(([^)]+)\)/);
      const company = companyMatch ? companyMatch[1] : undefined;
      
      existingCreds.engineers.push({
        id: eng.id,
        name: eng.name,
        username,
        password: 'drb@123', // Default password
        role: 'engineer',
        company,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      created++;
    }
  }
  
  // Add admin account if not exists, or fix role if it's wrong
  const existingAdmin = existingCreds.engineers.find(e => e.username.toLowerCase() === 'admin');
  if (!existingAdmin) {
    existingCreds.engineers.push({
      id: 'admin-1',
      name: 'Admin',
      username: 'admin',
      password: 'admin@drb',
      role: 'admin',
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    created++;
  } else if (existingAdmin.role !== 'admin') {
    // Fix corrupted admin role
    existingAdmin.role = 'admin';
  }
  
  existingCreds.lastUpdated = new Date().toISOString();
  const success = await writeEngineerCredentialsToGitHub(existingCreds);
  
  return { success, created };
}

// Add/Update engineer credential
export async function upsertEngineerCredential(engineer: Partial<EngineerCredential> & { name: string }): Promise<{ success: boolean; engineer?: EngineerCredential }> {
  const data = await readEngineerCredentialsFromGitHub();
  
  const existingIndex = data.engineers.findIndex(
    e => e.id === engineer.id || e.username?.toLowerCase() === engineer.username?.toLowerCase()
  );
  
  if (existingIndex >= 0) {
    // Update existing
    data.engineers[existingIndex] = {
      ...data.engineers[existingIndex],
      ...engineer,
    };
  } else {
    // Create new
    const username = engineer.username || engineer.name.replace(/\s*\([^)]*\)\s*/g, '').trim().toLowerCase().replace(/\s+/g, '.');
    const newEngineer: EngineerCredential = {
      id: engineer.id || `eng-${Date.now()}`,
      name: engineer.name,
      username,
      password: engineer.password || 'drb@123',
      role: engineer.role || 'engineer',
      company: engineer.company,
      isActive: engineer.isActive !== false,
      createdAt: new Date().toISOString(),
    };
    data.engineers.push(newEngineer);
  }
  
  data.lastUpdated = new Date().toISOString();
  const success = await writeEngineerCredentialsToGitHub(data);
  
  return { success, engineer: existingIndex >= 0 ? data.engineers[existingIndex] : data.engineers[data.engineers.length - 1] };
}

// Delete engineer credential
export async function deleteEngineerCredential(id: string): Promise<boolean> {
  const data = await readEngineerCredentialsFromGitHub();
  const initialLength = data.engineers.length;
  
  data.engineers = data.engineers.filter(e => e.id !== id);
  
  if (data.engineers.length === initialLength) return false;
  
  data.lastUpdated = new Date().toISOString();
  return await writeEngineerCredentialsToGitHub(data);
}
