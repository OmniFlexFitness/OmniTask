import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { google, tasks_v1 } from 'googleapis';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin
admin.initializeApp();
const db = getFirestore();

// Define secrets for OAuth (set via Firebase CLI: firebase functions:secrets:set GOOGLE_CLIENT_ID)
const googleClientId = defineSecret('GOOGLE_CLIENT_ID');
const googleClientSecret = defineSecret('GOOGLE_CLIENT_SECRET');
// Service account email for sending emails (with domain-wide delegation)
const gmailServiceAccountKey = defineSecret('GMAIL_SERVICE_ACCOUNT_KEY');

// Sender email address for task notifications (configurable via environment variable)
const TASK_NOTIFICATION_SENDER = process.env.TASK_NOTIFICATION_SENDER || 'task@omniflexfitness.com';

// Google Tasks API client
const tasksApi = google.tasks('v1');
// Google People API client (for directory contacts)
const peopleApi = google.people('v1');
// Gmail API client
const gmailApi = google.gmail('v1');

// Email template cache (loaded once for performance)
let emailTemplateCache: string | null = null;

/**
 * Escape HTML entities to prevent XSS attacks
 */
function escapeHtml(text: string): string {
  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return text.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char]);
}

/**
 * Load email template from file (cached for performance)
 */
function loadEmailTemplate(): string {
  try {
    if (!emailTemplateCache) {
      const templatePath = path.join(__dirname, 'email-templates', 'task-assignment.html');
      emailTemplateCache = fs.readFileSync(templatePath, 'utf-8');
    }
    return emailTemplateCache;
  } catch (error) {
    console.error('Failed to load email template:', error);
    // Fallback to a minimal inline template
    return `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; padding: 20px;">
  <h1>New Task Assigned</h1>
  <p>Project: {{PROJECT_NAME}}</p>
  <h2>{{TASK_TITLE}}</h2>
  {{TASK_DESCRIPTION}}
  <p>Priority: {{TASK_PRIORITY}}</p>
  {{DUE_DATE_HTML}}
  <p><a href="{{TASK_URL}}">View Task</a></p>
</body>
</html>
    `.trim();
  }
}

/**
 * Populate email template with task data
 */
function populateEmailTemplate(data: {
  projectName: string;
  taskTitle: string;
  taskDescription?: string;
  taskPriority: string;
  dueDateStr?: string;
  taskUrl: string;
}): string {
  let html = loadEmailTemplate();

  // Escape all user-provided content to prevent XSS
  html = html.replace(/{{PROJECT_NAME}}/g, escapeHtml(data.projectName));
  html = html.replace(/{{TASK_TITLE}}/g, escapeHtml(data.taskTitle));
  
  const descriptionHtml = data.taskDescription 
    ? `<p class="description">${escapeHtml(data.taskDescription)}</p>` 
    : '';
  html = html.replace(/{{TASK_DESCRIPTION}}/g, descriptionHtml);
  
  html = html.replace(/{{TASK_PRIORITY}}/g, escapeHtml(data.taskPriority.toUpperCase()));
  
  const dueDateHtml = data.dueDateStr
    ? `
      <span class="meta-item">
        <span class="meta-label">Due:</span>
        <span class="meta-value">${escapeHtml(data.dueDateStr)}</span>
      </span>
      `
    : '';
  html = html.replace(/{{DUE_DATE_HTML}}/g, dueDateHtml);
  
  // URL doesn't need escaping as it's constructed server-side, but validate it's safe
  html = html.replace(/{{TASK_URL}}/g, data.taskUrl);

  return html;
}

// JWT client for Gmail API (initialized outside function handler for performance)
let jwtClient: InstanceType<typeof google.auth.JWT> | null = null;

/**
 * Get or initialize JWT client for Gmail API
 */
async function getGmailJwtClient(): Promise<InstanceType<typeof google.auth.JWT>> {
  try {
    if (!jwtClient) {
      const serviceAccountKey = JSON.parse(gmailServiceAccountKey.value());
      jwtClient = new google.auth.JWT({
        email: serviceAccountKey.client_email,
        key: serviceAccountKey.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.send'],
        subject: TASK_NOTIFICATION_SENDER, // Impersonate this user
      });
      await jwtClient.authorize();
    }
    return jwtClient;
  } catch (error) {
    // If authorization fails, clear cache and try once more
    jwtClient = null;
    const serviceAccountKey = JSON.parse(gmailServiceAccountKey.value());
    const newClient = new google.auth.JWT({
      email: serviceAccountKey.client_email,
      key: serviceAccountKey.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: TASK_NOTIFICATION_SENDER,
    });
    await newClient.authorize();
    jwtClient = newClient;
    return jwtClient;
  }
}

/**
 * Contact interface for workspace contacts
 */
interface WorkspaceContact {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  source: 'google-directory' | 'google-contacts';
}

/**
 * Interface matching OmniTask domain model
 */
interface OmniTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  order: number;
  dueDate?: Timestamp;
  completedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  googleTaskId?: string;
  googleTaskListId?: string;
  isGoogleTask?: boolean;
}

interface Project {
  id: string;
  name: string;
  ownerId: string;
  googleTaskListId?: string;
  syncEnabled?: boolean;
  lastSyncAt?: Timestamp;
  syncStatus?: 'synced' | 'pending' | 'error';
}

/**
 * Convert Google Task status to OmniTask status
 */
function googleStatusToOmniStatus(
  googleStatus: string | undefined,
): 'todo' | 'in-progress' | 'done' {
  return googleStatus === 'completed' ? 'done' : 'todo';
}

/**
 * Convert OmniTask status to Google Task status
 * Used for push sync (OmniTask -> Google Tasks) - exported for future use
 */
export function omniStatusToGoogleStatus(
  omniStatus: 'todo' | 'in-progress' | 'done',
): 'needsAction' | 'completed' {
  return omniStatus === 'done' ? 'completed' : 'needsAction';
}

/**
 * Transform a Google Task to OmniTask format
 */
function transformGoogleTaskToOmniTask(
  googleTask: tasks_v1.Schema$Task,
  projectId: string,
  googleTaskListId: string,
): Partial<OmniTask> {
  return {
    title: googleTask.title || 'Untitled',
    description: googleTask.notes || '',
    status: googleStatusToOmniStatus(googleTask.status ?? undefined),
    dueDate: googleTask.due ? Timestamp.fromDate(new Date(googleTask.due)) : undefined,
    completedAt: googleTask.completed
      ? Timestamp.fromDate(new Date(googleTask.completed))
      : undefined,
    googleTaskId: googleTask.id || undefined,
    googleTaskListId,
    isGoogleTask: true,
    projectId,
    priority: 'medium', // Default priority
    order: 0, // Will be set based on position
  };
}

/**
 * Sync a single project with its linked Google Task list
 * This function is the core of bidirectional sync
 */
async function syncProject(
  project: Project & { id: string },
  accessToken: string,
): Promise<{ success: boolean; added: number; updated: number; error?: string }> {
  if (!project.googleTaskListId) {
    return { success: false, added: 0, updated: 0, error: 'No Google Task list linked' };
  }

  try {
    // Set up authenticated client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    // Fetch tasks from Google
    const googleResponse = await tasksApi.tasks.list({
      tasklist: project.googleTaskListId,
      showCompleted: true,
      showHidden: true,
      auth: oauth2Client,
    });

    const googleTasks = googleResponse.data.items || [];

    // Fetch existing OmniTask tasks for this project
    const omniTasksSnapshot = await db
      .collection('tasks')
      .where('projectId', '==', project.id)
      .get();

    const omniTasks = new Map<string, OmniTask>();
    omniTasksSnapshot.forEach((doc) => {
      const task = { id: doc.id, ...doc.data() } as OmniTask;
      if (task.googleTaskId) {
        omniTasks.set(task.googleTaskId, task);
      }
    });

    let added = 0;
    let updated = 0;

    // Process each Google Task
    for (const googleTask of googleTasks) {
      if (!googleTask.id) continue;

      const existingOmniTask = omniTasks.get(googleTask.id);
      const taskData = transformGoogleTaskToOmniTask(
        googleTask,
        project.id,
        project.googleTaskListId,
      );

      if (existingOmniTask) {
        // Update existing task if Google's is newer
        const googleUpdated = googleTask.updated ? new Date(googleTask.updated) : new Date(0);
        const omniUpdated = existingOmniTask.updatedAt?.toDate() || new Date(0);

        if (googleUpdated > omniUpdated) {
          await db
            .collection('tasks')
            .doc(existingOmniTask.id)
            .update({
              ...taskData,
              updatedAt: FieldValue.serverTimestamp(),
            });
          updated++;
        }
      } else {
        // Create new task in OmniTask
        await db.collection('tasks').add({
          ...taskData,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        added++;
      }
    }

    // Update project sync status
    await db.collection('projects').doc(project.id).update({
      syncStatus: 'synced',
      lastSyncAt: FieldValue.serverTimestamp(),
    });

    return { success: true, added, updated };
  } catch (error) {
    console.error(`Sync failed for project ${project.id}:`, error);

    // Update project sync status to error
    await db.collection('projects').doc(project.id).update({
      syncStatus: 'error',
    });

    return {
      success: false,
      added: 0,
      updated: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Scheduled function that runs every 5 minutes to sync all enabled projects
 * Note: This requires users to have stored their OAuth tokens securely
 * For production, consider using Firebase Authentication with Google provider
 * and refresh tokens stored securely in Firestore
 */
export const scheduledGoogleTasksSync = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/New_York',
    memory: '256MiB',
    secrets: [googleClientId, googleClientSecret],
  },
  async (context) => {
    console.log('Starting scheduled Google Tasks sync');

    // Find all projects with sync enabled
    const projectsSnapshot = await db.collection('projects').where('syncEnabled', '==', true).get();

    console.log(`Found ${projectsSnapshot.size} projects with sync enabled`);

    // Note: In production, you'd need to retrieve the user's OAuth token
    // This could be stored in Firestore when the user authenticates
    // For now, this is a placeholder - the actual token retrieval would depend
    // on how you want to store and manage tokens

    let synced = 0;
    let failed = 0;

    for (const projectDoc of projectsSnapshot.docs) {
      const project = { id: projectDoc.id, ...projectDoc.data() } as Project & { id: string };

      // Get user's OAuth token (you'd need to implement token storage)
      const userDoc = await db.collection('users').doc(project.ownerId).get();
      const userData = userDoc.data();

      if (!userData?.googleTasksRefreshToken) {
        console.log(`No refresh token for user ${project.ownerId}, skipping project ${project.id}`);
        failed++;
        continue;
      }

      try {
        // Refresh the access token using the stored refresh token
        // Access secrets via .value() method
        const oauth2Client = new google.auth.OAuth2(
          googleClientId.value(),
          googleClientSecret.value(),
        );

        oauth2Client.setCredentials({
          refresh_token: userData.googleTasksRefreshToken,
        });

        const tokens = await oauth2Client.refreshAccessToken();
        const accessToken = tokens.credentials.access_token;

        if (!accessToken) {
          console.error(`Failed to refresh token for user ${project.ownerId}`);
          failed++;
          continue;
        }

        const result = await syncProject(project, accessToken);
        if (result.success) {
          console.log(
            `Synced project ${project.id}: added ${result.added}, updated ${result.updated}`,
          );
          synced++;
        } else {
          console.error(`Failed to sync project ${project.id}: ${result.error}`);
          failed++;
        }
      } catch (error) {
        console.error(`Error syncing project ${project.id}:`, error);
        failed++;
      }
    }

    console.log(`Sync complete: ${synced} succeeded, ${failed} failed`);
  },
);

/**
 * Callable function for manual sync from the frontend
 * This can be called directly by authenticated users
 */
export const manualGoogleTasksSync = onCall<{ projectId: string; accessToken: string }>(
  {
    memory: '256MiB',
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { projectId, accessToken } = request.data;

    if (!projectId || !accessToken) {
      throw new HttpsError('invalid-argument', 'Missing projectId or accessToken');
    }

    // Verify user has access to project
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      throw new HttpsError('not-found', 'Project not found');
    }

    const project = { id: projectDoc.id, ...projectDoc.data() } as Project & { id: string };

    // Verify user is owner or member
    if (project.ownerId !== request.auth.uid) {
      const projectData = projectDoc.data();
      if (!projectData?.memberIds?.includes(request.auth.uid)) {
        throw new HttpsError('permission-denied', 'User does not have access to this project');
      }
    }

    // Perform sync
    const result = await syncProject(project, accessToken);

    return result;
  },
);

/**
 * Callable function to get workspace contacts from Google Directory
 * This function uses the People API to fetch directory contacts
 * which works for Google Workspace users to see other users in their organization
 */
export const getWorkspaceContacts = onCall<{ accessToken: string; pageSize?: number }>(
  {
    memory: '256MiB',
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { accessToken, pageSize = 100 } = request.data;

    if (!accessToken) {
      throw new HttpsError('invalid-argument', 'Missing accessToken');
    }

    try {
      // Set up authenticated client
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      // Fetch directory people using People API
      const response = await peopleApi.people.listDirectoryPeople({
        readMask: 'names,emailAddresses,photos',
        sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'],
        pageSize: Math.min(pageSize, 1000),
        auth: oauth2Client,
      });

      const people = response.data.people || [];

      const contacts: WorkspaceContact[] = [];

      for (const person of people) {
        // Get primary or first email
        const emailAddress =
          person.emailAddresses?.find((e) => e.metadata?.primary) || person.emailAddresses?.[0];
        const email = emailAddress?.value;

        if (!email) continue; // Skip contacts without email

        // Get primary or first name
        const nameData = person.names?.find((n) => n.metadata?.primary) || person.names?.[0];
        const displayName = nameData?.displayName || email.split('@')[0];

        // Get primary or first photo
        const photoData = person.photos?.find((p) => p.metadata?.primary) || person.photos?.[0];
        const photoURL = photoData?.url || undefined;

        contacts.push({
          id: email,
          email,
          displayName,
          photoURL,
          source: 'google-directory',
        });
      }

      // Sort by display name
      contacts.sort((a, b) => a.displayName.localeCompare(b.displayName));

      return {
        contacts,
        totalCount: contacts.length,
      };
    } catch (error) {
      console.error('Failed to fetch workspace contacts:', error);

      // Check if it's a permission error using error code
      if ((error as any)?.code === 403 || (error as any)?.response?.status === 403) {
        throw new HttpsError(
          'permission-denied',
          'Unable to access directory contacts. This may require Google Workspace admin permissions.',
        );
      }

      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to fetch workspace contacts',
      );
    }
  },
);

/**
 * Callable function to search workspace contacts
 * Uses the People API searchDirectoryPeople endpoint
 */
export const searchWorkspaceContacts = onCall<{
  accessToken: string;
  query: string;
  pageSize?: number;
}>(
  {
    memory: '256MiB',
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { accessToken, query, pageSize = 20 } = request.data;

    if (!accessToken) {
      throw new HttpsError('invalid-argument', 'Missing accessToken');
    }

    if (!query || !query.trim()) {
      return { contacts: [], totalCount: 0 };
    }

    try {
      // Set up authenticated client
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      // Search directory people using People API
      const response = await peopleApi.people.searchDirectoryPeople({
        query: query.trim(),
        readMask: 'names,emailAddresses,photos',
        sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'],
        pageSize: Math.min(pageSize, 100),
        auth: oauth2Client,
      });

      const people = response.data.people || [];

      const contacts: WorkspaceContact[] = [];

      for (const person of people) {
        const emailAddress =
          person.emailAddresses?.find((e) => e.metadata?.primary) || person.emailAddresses?.[0];
        const email = emailAddress?.value;

        if (!email) continue;

        const nameData = person.names?.find((n) => n.metadata?.primary) || person.names?.[0];
        const displayName = nameData?.displayName || email.split('@')[0];

        const photoData = person.photos?.find((p) => p.metadata?.primary) || person.photos?.[0];
        const photoURL = photoData?.url || undefined;

        contacts.push({
          id: email,
          email,
          displayName,
          photoURL,
          source: 'google-directory',
        });
      }

      return {
        contacts,
        totalCount: contacts.length,
      };
    } catch (error) {
      console.error('Failed to search workspace contacts:', error);

      throw new HttpsError(
        'internal',
        error instanceof Error ? error.message : 'Failed to search workspace contacts',
      );
    }
  },
);

/**
 * Firestore trigger: Send email notification when a task is assigned
 * Triggers on task create/update and sends email if assignee changed
 */
export const sendTaskAssignmentEmail = onDocumentWritten(
  {
    document: 'tasks/{taskId}',
    secrets: [gmailServiceAccountKey],
    memory: '256MiB',
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    // Skip if task was deleted
    if (!after) {
      console.log('Task deleted, skipping email notification');
      return;
    }

    // Check if assignee was added or changed
    const wasNewlyAssigned = !before?.assignedToId && after.assignedToId;
    const assigneeChanged = before?.assignedToId !== after.assignedToId && after.assignedToId;

    if (!wasNewlyAssigned && !assigneeChanged) {
      console.log('No assignee change, skipping email notification');
      return;
    }

    // Get assignee email - prefer email lookup from users collection, fallback to assigneeName
    let assigneeEmail = after.assigneeName;

    if (after.assignedToId) {
      try {
        const userDoc = await db.collection('users').doc(after.assignedToId).get();
        if (userDoc.exists) {
          assigneeEmail = userDoc.data()?.email || assigneeEmail;
        }
      } catch (err) {
        console.warn('Failed to lookup assignee user:', err);
      }
    }

    if (!assigneeEmail || !assigneeEmail.includes('@')) {
      console.log('No valid assignee email, skipping notification');
      return;
    }

    // Get project name for context
    let projectName = 'a project';
    if (after.projectId) {
      try {
        const projectDoc = await db.collection('projects').doc(after.projectId).get();
        if (projectDoc.exists) {
          projectName = projectDoc.data()?.name || projectName;
        }
      } catch (err) {
        console.warn('Failed to lookup project:', err);
      }
    }

    // Format due date if present
    let dueDateStr: string | undefined;
    if (after.dueDate) {
      const dueDate = after.dueDate.toDate ? after.dueDate.toDate() : new Date(after.dueDate);
      dueDateStr = dueDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    // Build email HTML from template
    const emailHtml = populateEmailTemplate({
      projectName,
      taskTitle: after.title || 'Untitled Task',
      taskDescription: after.description,
      taskPriority: after.priority || 'medium',
      dueDateStr,
      taskUrl: `https://omnitask.omniflexfitness.com/projects/${after.projectId}`,
    });

    // Build email message
    const emailSubject = `📋 You've been assigned: ${after.title || 'New Task'}`;

    // Create raw email (RFC 2822 format)
    const rawEmail = [
      `From: OmniTask <${TASK_NOTIFICATION_SENDER}>`,
      `To: ${assigneeEmail}`,
      `Subject: ${emailSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      emailHtml,
    ].join('\r\n');

    // Base64url encode the email
    const encodedEmail = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    try {
      // Get initialized JWT client (reused across invocations for performance)
      const client = await getGmailJwtClient();

      await gmailApi.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
        },
        auth: client,
      });

      console.log(`Email sent to ${assigneeEmail} for task: ${after.title}`);

      // Log notification to Firestore for audit
      await db.collection('notifications').add({
        type: 'task_assignment',
        taskId: event.params.taskId,
        recipientEmail: assigneeEmail,
        sentAt: FieldValue.serverTimestamp(),
        success: true,
      });
    } catch (error) {
      console.error('Failed to send email notification:', error);

      // Log failed notification
      await db.collection('notifications').add({
        type: 'task_assignment',
        taskId: event.params.taskId,
        recipientEmail: assigneeEmail,
        sentAt: FieldValue.serverTimestamp(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
);
