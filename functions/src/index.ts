import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { google, tasks_v1 } from 'googleapis';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { VertexAI } from '@google-cloud/vertexai';
import * as nodemailer from 'nodemailer';
import { marked, Renderer } from 'marked';

// Initialize Firebase Admin
admin.initializeApp();
const db = getFirestore();

// Define secrets for OAuth (set via Firebase CLI: firebase functions:secrets:set GOOGLE_CLIENT_ID)
const googleClientId = defineSecret('GOOGLE_CLIENT_ID');
const googleClientSecret = defineSecret('GOOGLE_CLIENT_SECRET');
const nodemailerSmtpPassword = defineSecret('NODEMAILER_SMTP_PASSWORD');

// Sender email address for task notifications (configurable via environment variable)
// (Now managed by firestore-send-email extension DEFAULT_FROM)

// Google Tasks API client
const tasksApi = google.tasks('v1');
// Google People API client (for directory contacts)
const peopleApi = google.people('v1');

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
 * Convert markdown text to Gmail-compatible HTML with inline styles.
 * Uses marked with a custom renderer for email-safe output.
 */
function markdownToEmailHtml(markdown: string): string {
  const renderer = new Renderer();

  renderer.heading = function ({ tokens, depth }) {
    const sizes: Record<number, string> = {
      1: '22px', 2: '19px', 3: '16px', 4: '14px', 5: '13px', 6: '12px',
    };
    const size = sizes[depth] || '14px';
    const text = this.parser.parseInline(tokens);
    return `<h${depth} style="color:#e2e8f0;font-size:${size};margin:12px 0 6px 0;">${text}</h${depth}>`;
  };

  renderer.paragraph = function ({ tokens }) {
    const text = this.parser.parseInline(tokens);
    return `<p style="color:#94a3b8;margin:8px 0;line-height:1.6;">${text}</p>`;
  };

  renderer.blockquote = function ({ tokens }) {
    const body = this.parser.parse(tokens);
    return `<blockquote style="border-left:3px solid #8b5cf6;margin:10px 0;padding:8px 14px;color:#cbd5e1;background:#1e293b;border-radius:4px;">${body}</blockquote>`;
  };

  renderer.list = function (token) {
    const tag = token.ordered ? 'ol' : 'ul';
    let body = '';
    for (const item of token.items) {
      body += this.listitem(item);
    }
    return `<${tag} style="color:#94a3b8;margin:8px 0;padding-left:24px;line-height:1.6;">${body}</${tag}>`;
  };

  renderer.listitem = function (item) {
    let itemBody = '';
    if (item.task) {
      const checkbox = this.checkbox({ checked: !!item.checked, raw: '', type: 'checkbox' });
      itemBody += checkbox;
    }
    itemBody += this.parser.parse(item.tokens);
    return `<li style="margin:4px 0;">${itemBody}</li>`;
  };

  renderer.strong = function ({ tokens }) {
    const text = this.parser.parseInline(tokens);
    return `<strong style="color:#e2e8f0;font-weight:600;">${text}</strong>`;
  };

  renderer.em = function ({ tokens }) {
    const text = this.parser.parseInline(tokens);
    return `<em style="font-style:italic;">${text}</em>`;
  };

  renderer.del = function ({ tokens }) {
    const text = this.parser.parseInline(tokens);
    return `<del style="text-decoration:line-through;color:#64748b;">${text}</del>`;
  };

  renderer.codespan = function ({ text }) {
    const escaped = escapeHtml(text);
    const style = 'background:#0f172a;color:#a5b4fc;padding:2px 6px;' +
      'border-radius:4px;font-size:13px;';
    return `<code style="${style}">${escaped}</code>`;
  };

  renderer.code = function ({ text }) {
    const escaped = escapeHtml(text);
    const style = 'background:#0f172a;color:#a5b4fc;padding:12px 16px;border-radius:6px;' +
      'overflow-x:auto;font-size:13px;line-height:1.5;margin:10px 0;';
    return `<pre style="${style}"><code>${escaped}</code></pre>`;
  };

  renderer.link = function ({ href, tokens }) {
    const text = this.parser.parseInline(tokens);
    const cleanHref = href.trim();
    const isSafe = /^(https?|mailto|tel):/i.test(cleanHref) ||
      cleanHref.startsWith('#') ||
      cleanHref.startsWith('/');
    const safeHref = isSafe ? escapeHtml(cleanHref) : '#';
    return `<a href="${safeHref}" style="color:#8b5cf6;text-decoration:underline;">${text}</a>`;
  };

  renderer.image = function ({ href, text }) {
    const cleanHref = href.trim();
    if (!/^https?:/i.test(cleanHref)) return escapeHtml(text || '');
    const safeHref = escapeHtml(cleanHref);
    const alt = escapeHtml(text || '');
    const style = 'max-width:100%;height:auto;border-radius:4px;margin:8px 0;';
    return `<img src="${safeHref}" alt="${alt}" style="${style}">`;
  };

  renderer.html = function ({ text }) {
    return escapeHtml(text);
  };

  renderer.hr = function () {
    return `<hr style="border:none;border-top:1px solid #334155;margin:16px 0;">`;
  };

  renderer.br = function () {
    return '<br>';
  };

  return marked.parse(markdown, { renderer, async: false }) as string;
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
    ? `<div class="description">${markdownToEmailHtml(data.taskDescription)}</div>`
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

// Initialize Vertex AI with Gemini 1.5 Flash (cost-effective model)
const vertexAI = new VertexAI({
  project: 'omnitask-475422',
  location: 'us-east1',
});
const geminiModel = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
});

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
 * Firestore trigger: Send email notifications for task assignment & status changes
 * Supports multi-assignee (assigneeIds array) and admin notifications.
 *
 * Triggers on:
 * 1. Assignee list changes (new assignees added or removed)
 * 2. Status changes (if notifyAssignees is true and there are assignees)
 *
 * Admin rule: Always notifies bertin.kenol@omniflexfitness.com on any assignment
 * or status change involving assignees.
 */
export const sendTaskAssignmentEmail = onDocumentWritten(
  {
    document: 'tasks/{taskId}',
    memory: '256MiB',
    secrets: [nodemailerSmtpPassword],
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    // Skip if task was deleted
    if (!after) {
      console.log('Task deleted, skipping email notification');
      return;
    }

    // Admin email - always receives notifications about assignment/status changes
    const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'bertin.kenol@omniflexfitness.com';

    // Check notifyAssignees flag (default true for backward compatibility)
    // Fortified behavior: If someone drags a task (status change) and doesn't explicitly pass notifyAssignees,
    // we default to true to guarantee assignee state updates.
    const statusChangedActual = before && before.status !== after.status;
    const notifySettingChanged = before?.notifyAssignees !== after?.notifyAssignees;
    let shouldNotify = after.notifyAssignees !== false;

    if (statusChangedActual && !notifySettingChanged) {
      // It's a status change but the notify setting wasn't explicitly touched.
      shouldNotify = true;
    }

    // ── Determine what changed ───────────────────────────────────────────
    // Multi-assignee: use assigneeIds array, fall back to assignedToId for legacy
    // Also include nested subtask assignees
    const beforeIds: string[] = [
      ...(before?.assigneeIds ?? (before?.assignedToId ? [before.assignedToId] : [])),
      ...(before?.subtasks?.flatMap((s: any) => s.assigneeIds ?? []) ?? []),
    ];

    const afterIds: string[] = [
      ...(after.assigneeIds ?? (after.assignedToId ? [after.assignedToId] : [])),
      ...(after.subtasks?.flatMap((s: any) => s.assigneeIds ?? []) ?? []),
    ];

    const uniqueBeforeIds = [...new Set(beforeIds)];
    const uniqueAfterIds = [...new Set(afterIds)];

    const addedIds = uniqueAfterIds.filter((id: string) => !uniqueBeforeIds.includes(id));
    const removedIds = uniqueBeforeIds.filter((id: string) => !uniqueAfterIds.includes(id));
    const assigneesChanged = addedIds.length > 0 || removedIds.length > 0;

    // Nothing relevant changed → skip
    if (!assigneesChanged && !statusChangedActual) {
      console.log('No assignee or status change, skipping email notification');
      return;
    }

    // If status changed but no assignees, nothing to notify about
    if (statusChangedActual && !assigneesChanged && uniqueAfterIds.length === 0) {
      console.log('Status changed but no assignees, skipping notification');
      return;
    }

    // If notification is disabled, still allow admin-only notifications
    // (admin always gets notified — do NOT skip here)
    // Only skip if notify is off AND there's no assignment change AND no status change with assignees
    if (!shouldNotify && !assigneesChanged && !(statusChangedActual && uniqueAfterIds.length > 0)) {
      console.log('notifyAssignees is false and no relevant change for admin, skipping');
      return;
    }

    // ── Resolve emails ───────────────────────────────────────────────────
    /**
     * Resolve an assignee ID (could be a UID or email) to an email address.
     */
    async function resolveEmail(assigneeId: string, assigneeName?: string): Promise<string | null> {
      // Unwrap nested assignment strings if format is "id|email@domain.com"
      const parts = assigneeId.split('|');
      const actualId = parts[0];
      const potentialEmail = parts.length > 1 ? parts[1] : actualId;

      // Try users collection first by ID
      try {
        const userDoc = await db.collection('users').doc(actualId).get();
        if (userDoc.exists) {
          const userData = userDoc.data() as { email?: string };
          if (userData.email) return userData.email;
        }
      } catch (err) {
        console.warn(`Failed to look up user ${actualId}:`, err);
      }

      // If the potentialEmail is a valid email, trust it for external assignment
      if (potentialEmail && potentialEmail.includes('@') && potentialEmail.includes('.')) {
        return potentialEmail;
      }

      // Fallback: check assigneeName
      if (assigneeName && assigneeName.includes('@') && assigneeName.includes('.')) {
        return assigneeName;
      }

      return null;
    }

    // Build name map from after data for display
    const afterNames: string[] =
      after.assigneeNames ?? (after.assigneeName ? [after.assigneeName] : []);

    // ── Get project name ─────────────────────────────────────────────────
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

    // ── Format due date ─────────────────────────────────────────────────
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

    // ── Build email content ──────────────────────────────────────────────
    const taskUrl = `https://omnitask.omniflexfitness.com/projects/${after.projectId}`;

    const emailHtml = populateEmailTemplate({
      projectName,
      taskTitle: after.title || 'Untitled Task',
      taskDescription: after.description,
      taskPriority: after.priority || 'medium',
      dueDateStr,
      taskUrl,
    });

    // ── Collect recipients and send emails ────────────────────────────────
    const recipientEmails = new Set<string>();

    // 1. If assignees were added, email the NEW assignees
    if (assigneesChanged && addedIds.length > 0 && shouldNotify) {
      for (let i = 0; i < addedIds.length; i++) {
        const idx = afterIds.indexOf(addedIds[i]);
        const name = afterNames[idx] || undefined;
        const email = await resolveEmail(addedIds[i], name);
        if (email && email.includes('@')) {
          recipientEmails.add(email);
        }
      }
    }

    // 2. If status changed and notify is on, email ALL current assignees
    if (statusChangedActual && shouldNotify && uniqueAfterIds.length > 0) {
      for (let i = 0; i < uniqueAfterIds.length; i++) {
        // We only map names from afterNames for the direct assigneeIds (not subtasks)
        // Subtask assignees just get emails without personalized greeting names if index out of bounds
        const name = afterNames[i] || undefined;
        const email = await resolveEmail(uniqueAfterIds[i], name);
        if (email && email.includes('@')) {
          recipientEmails.add(email);
        }
      }
    }

    // 3. Always add admin email for any relevant change
    recipientEmails.add(ADMIN_EMAIL);

    if (recipientEmails.size === 0) {
      console.log('No valid recipient emails resolved, skipping');
      return;
    }

    // Log subtask info
    if (after.subtasks && after.subtasks.length > 0) {
      const assignedSubtasks = after.subtasks.filter(
        (s: { assigneeIds?: string[] }) => s.assigneeIds && s.assigneeIds.length > 0,
      );
      if (assignedSubtasks.length > 0) {
        console.log(`Task has ${assignedSubtasks.length} subtask(s) with assignees`);
      }
    }

    // Sanitize title to prevent email header injection via newlines
    const safeTitle = (after.title || '').replace(/\r\n|\r|\n/g, ' ');

    let emailSubject: string;
    if (assigneesChanged && addedIds.length > 0) {
      emailSubject = `📋 You've been assigned: ${safeTitle || 'New Task'}`;
    } else if (statusChangedActual) {
      const statusLabel =
        after.status === 'done'
          ? '✅ Done'
          : after.status === 'in-progress'
            ? '🔄 In Progress'
            : '📋 To Do';
      emailSubject = `📋 Status updated to ${statusLabel}: ${safeTitle || 'Task'}`;
    } else {
      emailSubject = `📋 Task update: ${safeTitle || 'Task'}`;
    }

    // Configure nodemailer with SMTP Password
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.NODEMAILER_SMTP_USER || 'admin@omniflexfitness.com',
        pass: nodemailerSmtpPassword.value(),
      },
    });

    // Send to each recipient by writing to the 'mail' collection (Now sending directly via nodemailer)
    for (const recipientEmail of recipientEmails) {
      try {
        await transporter.sendMail({
          from: '"OmniTask" <omnitask@omniflexfitness.com>',
          to: recipientEmail,
          subject: emailSubject,
          html: emailHtml,
        });

        console.log(`Email sent to ${recipientEmail} for task: ${after.title}`);

        // Log notification to Firestore for audit
        await db.collection('notifications').add({
          type: assigneesChanged ? 'task_assignment' : 'task_status_change',
          taskId: event.params.taskId,
          recipientEmail,
          sentAt: FieldValue.serverTimestamp(),
          success: true,
        });
      } catch (error) {
        console.error(`Failed to send email to ${recipientEmail}:`, error);

        // Log failed notification
        await db.collection('notifications').add({
          type: assigneesChanged ? 'task_assignment' : 'task_status_change',
          taskId: event.params.taskId,
          recipientEmail,
          sentAt: FieldValue.serverTimestamp(),
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
);

// Helper to send reminder emails
async function sendReminderEmail(
  transporter: nodemailer.Transporter,
  email: string,
  title: string,
  description: string,
  timeString: string,
  offset: number,
  typeStr: string,
) {
  const emailHtml = loadEmailTemplate()
    .replace(/{{PROJECT_NAME}}/g, escapeHtml(typeStr))
    .replace(/{{TASK_TITLE}}/g, escapeHtml(`Reminder: ${title}`))
    .replace(/{{TASK_DESCRIPTION}}/g, `<div class="description">${markdownToEmailHtml(description)}</div>`)
    .replace(/{{TASK_PRIORITY}}/g, 'HIGH')
    .replace(
      /{{DUE_DATE_HTML}}/g,
      `<p>Starts in ${offset === 0 ? 'now' : offset + ' minutes'} (at ${timeString})</p>`,
    )
    .replace(/{{TASK_URL}}/g, 'https://omnitask.omniflexfitness.com/schedule');

  await transporter.sendMail({
    from: process.env.NODEMAILER_SMTP_USER || '"OmniTask Schedule" <omnitask@omniflexfitness.com>',
    to: email,
    subject: `⏰ Reminder: ${title} starts ${offset === 0 ? 'now' : 'in ' + offset + ' minutes'}`,
    html: emailHtml,
  });
}

/**
 * Scheduled function that runs every 5 minutes to check for upcoming task reminders.
 * Queries the top-level 'reminders' collection to avoid N+1 queries.
 */
export const checkScheduledReminders = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/New_York',
    memory: '256MiB',
    secrets: [nodemailerSmtpPassword],
  },
  async (event) => {
    console.log('Starting checkScheduledReminders...');

    const now = admin.firestore.Timestamp.now();
    const remindersSnap = await db.collection('reminders').where('triggerAt', '<=', now).get();

    if (remindersSnap.empty) {
      console.log('No reminders to send.');
      return;
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.NODEMAILER_SMTP_USER || 'admin@omniflexfitness.com',
        pass: nodemailerSmtpPassword.value(),
      },
    });

    let emailsSent = 0;
    const batch = db.batch();

    for (const doc of remindersSnap.docs) {
      const data = doc.data();

      try {
        await sendReminderEmail(
          transporter,
          data.email,
          data.title,
          data.description || '',
          data.timeString,
          data.offset,
          data.type === 'recurring' ? 'Daily Schedule' : 'Weekly Schedule',
        );
        emailsSent++;
        console.log(`Sent ${data.type} reminder to ${data.email} for ${data.title}`);
        
        // Only compute next triggerAt or delete if send was successful
        if (data.type === 'recurring') {
          const nextDate = data.triggerAt.toDate();
          nextDate.setDate(nextDate.getDate() + 1);
          batch.update(doc.ref, { triggerAt: admin.firestore.Timestamp.fromDate(nextDate) });
        } else if (data.type === 'weekly' && data.repeating) {
          const nextDate = data.triggerAt.toDate();
          nextDate.setDate(nextDate.getDate() + 7);
          batch.update(doc.ref, { triggerAt: admin.firestore.Timestamp.fromDate(nextDate) });
        } else {
          batch.delete(doc.ref);
        }
      } catch (err) {
        console.error(`Failed to send reminder to ${data.email}, leaving in queue for retry:`, err);
      }
    }

    await batch.commit();
    console.log(`Completed checkScheduledReminders. Emails sent: ${emailsSent}`);
  },
);

/**
 * Synchronize recurring tasks to the top-level reminders collection
 */
export const syncRecurringTaskReminders = onDocumentWritten(
  'users/{uid}/recurringTasks/{taskId}',
  async (event) => {
    const { uid, taskId } = event.params;
    const after = event.data?.after?.data();

    // Always clear old generic reminders for this task id
    const oldReminders = await db.collection('reminders').where('taskId', '==', taskId).get();
    const batch = db.batch();
    oldReminders.forEach((doc) => batch.delete(doc.ref));

    if (!after || !after.enabled || !after.reminders || after.reminders.length === 0) {
      await batch.commit();
      return;
    }

    const userDoc = await db.collection('users').doc(uid).get();
    const email = userDoc.data()?.email;
    if (!email) {
      await batch.commit();
      return;
    }

    const [h, m] = after.time.split(':').map(Number);
    const now = new Date();

    for (const r of after.reminders) {
      const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      t.setMinutes(t.getMinutes() - r);
      if (t <= now) t.setDate(t.getDate() + 1);

      const newRef = db.collection('reminders').doc();
      batch.set(newRef, {
        type: 'recurring',
        userId: uid,
        email,
        taskId,
        title: after.title,
        description: after.description || '',
        timeString: after.time,
        offset: r,
        triggerAt: admin.firestore.Timestamp.fromDate(t),
      });
    }

    await batch.commit();
  },
);

/**
 * Synchronize weekly blocks to the top-level reminders collection
 */
export const syncWeeklyBlockReminders = onDocumentWritten(
  'users/{uid}/weeklyBlocks/{blockId}',
  async (event) => {
    const { uid, blockId } = event.params;
    const after = event.data?.after?.data();

    // Always clear old generic reminders for this block id
    const oldReminders = await db.collection('reminders').where('taskId', '==', blockId).get();
    const batch = db.batch();
    oldReminders.forEach((doc) => batch.delete(doc.ref));

    if (!after || !after.reminders || after.reminders.length === 0) {
      await batch.commit();
      return;
    }

    const userDoc = await db.collection('users').doc(uid).get();
    const email = userDoc.data()?.email;
    if (!email) {
      await batch.commit();
      return;
    }

    const [h, m] = after.startTime.split(':').map(Number);
    const now = new Date();

    for (const r of after.reminders) {
      let t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      t.setMinutes(t.getMinutes() - r);

      if (after.repeating) {
        while (t.getDay() !== after.dayOfWeek || t <= now) {
          t.setDate(t.getDate() + 1);
        }
      } else {
        if (after.weekDate) {
          const [yearStr, monthStr, dayStr] = after.weekDate.split('-');
          const targetDate = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));

          let offsetDays = after.dayOfWeek - 1;
          if (after.dayOfWeek === 0) offsetDays = 6;
          targetDate.setDate(targetDate.getDate() + offsetDays);

          t = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth(),
            targetDate.getDate(),
            h,
            m,
            0,
            0,
          );
          t.setMinutes(t.getMinutes() - r);
        }
        if (t <= now) continue;
      }

      const newRef = db.collection('reminders').doc();
      batch.set(newRef, {
        type: 'weekly',
        userId: uid,
        email,
        taskId: blockId,
        title: after.title,
        description: after.description || '',
        timeString: after.startTime,
        offset: r,
        repeating: after.repeating,
        dayOfWeek: after.dayOfWeek,
        triggerAt: admin.firestore.Timestamp.fromDate(t),
      });
    }

    await batch.commit();
  },
);

// =============================================================================
// Vertex AI - AI-Powered Task Features
// =============================================================================

/**
 * AI Subtask interface matching OmniTask Subtask model
 */
interface AISubtask {
  id: string;
  title: string;
  completed: boolean;
}

/**
 * Generate subtasks from a task title and description using Gemini
 * Breaks down complex tasks into actionable subtasks
 */
export const generateSubtasks = onCall<{
  taskTitle: string;
  taskDescription?: string;
  projectContext?: string;
}>({ memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { taskTitle, taskDescription, projectContext } = request.data;

  if (!taskTitle?.trim()) {
    throw new HttpsError('invalid-argument', 'Task title is required');
  }

  const prompt = `You are a task management assistant. Break down this task into 3-5 actionable subtasks.

Task: ${taskTitle}
${taskDescription ? `Description: ${taskDescription}` : ''}
${projectContext ? `Project Context: ${projectContext}` : ''}

Return a JSON array of subtask objects. Each object should have:
- "title": A clear, actionable subtask title (string)
- "completed": false (boolean)

Only return the JSON array, no other text or markdown formatting.
Example: [{"title": "Research options", "completed": false}, {"title": "Draft proposal", "completed": false}]`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    // Clean the response - remove markdown code blocks if present
    const cleanedText = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Parse and validate response
    const parsedSubtasks = JSON.parse(cleanedText);

    // Add unique IDs to subtasks
    const subtasks: AISubtask[] = parsedSubtasks.map((st: { title: string }) => ({
      id: `subtask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: st.title,
      completed: false,
    }));

    return { subtasks, success: true };
  } catch (error) {
    console.error('Failed to generate subtasks:', error);
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'Failed to generate subtasks',
    );
  }
});

/**
 * Suggest task priority based on title and description using Gemini
 * Returns low, medium, or high priority with reasoning
 */
export const suggestTaskPriority = onCall<{
  taskTitle: string;
  taskDescription?: string;
  dueDate?: string;
}>({ memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { taskTitle, taskDescription, dueDate } = request.data;

  if (!taskTitle?.trim()) {
    throw new HttpsError('invalid-argument', 'Task title is required');
  }

  const prompt = `You are a task management assistant. Analyze this task and suggest an appropriate priority level.

Task: ${taskTitle}
${taskDescription ? `Description: ${taskDescription}` : ''}
${dueDate ? `Due Date: ${dueDate}` : ''}

Consider factors like:
- Urgency (deadline proximity)
- Importance (impact if not completed)
- Complexity (effort required)
- Keywords indicating priority (urgent, ASAP, critical, important, etc.)

Return a JSON object with:
- "priority": One of "low", "medium", or "high"
- "reasoning": A brief explanation (1-2 sentences)

Only return the JSON object, no other text or markdown formatting.
Example: {"priority": "high", "reasoning": "Contains urgent deadline and critical business impact."}`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    const cleanedText = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleanedText);

    // Validate priority value
    const validPriorities = ['low', 'medium', 'high'];
    const priority = validPriorities.includes(parsed.priority) ? parsed.priority : 'medium';

    return {
      priority,
      reasoning: parsed.reasoning || 'Based on task context analysis.',
      success: true,
    };
  } catch (error) {
    console.error('Failed to suggest priority:', error);
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'Failed to suggest priority',
    );
  }
});

/**
 * Suggest a due date based on task complexity and description using Gemini
 * Estimates effort and suggests a realistic deadline
 */
export const suggestDueDate = onCall<{
  taskTitle: string;
  taskDescription?: string;
  projectDeadline?: string;
}>({ memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { taskTitle, taskDescription, projectDeadline } = request.data;

  if (!taskTitle?.trim()) {
    throw new HttpsError('invalid-argument', 'Task title is required');
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const prompt = `You are a task management assistant. Analyze this task and suggest a realistic due date.

Task: ${taskTitle}
${taskDescription ? `Description: ${taskDescription}` : ''}
${projectDeadline ? `Project Deadline: ${projectDeadline}` : ''}
Today's Date: ${todayStr}

Consider factors like:
- Task complexity and scope
- Typical time needed for similar tasks
- Buffer for unexpected delays
- If there's a project deadline, ensure the task due date is before it

Return a JSON object with:
- "dueDate": Suggested date in ISO format (YYYY-MM-DD)
- "estimatedDays": Number of days from today
- "reasoning": Brief explanation of the estimate

Only return the JSON object, no other text or markdown formatting.
Example: {"dueDate": "2026-02-05", "estimatedDays": 7, "reasoning": "Medium complexity task typically requires about a week."}`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    const cleanedText = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleanedText);

    return {
      dueDate: parsed.dueDate,
      estimatedDays: parsed.estimatedDays || 7,
      reasoning: parsed.reasoning || 'Based on task complexity analysis.',
      success: true,
    };
  } catch (error) {
    console.error('Failed to suggest due date:', error);
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'Failed to suggest due date',
    );
  }
});

/**
 * Enhance a task description with more detail and actionable information using Gemini
 * Improves brief descriptions with structure and clarity
 */
export const enhanceTaskDescription = onCall<{
  taskTitle: string;
  taskDescription: string;
  projectContext?: string;
}>({ memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { taskTitle, taskDescription, projectContext } = request.data;

  if (!taskTitle?.trim()) {
    throw new HttpsError('invalid-argument', 'Task title is required');
  }

  if (!taskDescription?.trim()) {
    throw new HttpsError('invalid-argument', 'Task description is required');
  }

  const prompt = `You are a task management assistant. Enhance this task description to be more detailed, clear, and actionable.

Task Title: ${taskTitle}
Current Description: ${taskDescription}
${projectContext ? `Project Context: ${projectContext}` : ''}

Improve the description by:
- Adding specific, actionable steps if appropriate
- Clarifying any vague language
- Adding acceptance criteria or definition of done
- Keeping it concise but comprehensive
- Using markdown formatting for readability (headers, lists, etc.)

Return a JSON object with:
- "enhancedDescription": The improved description (string, can include markdown)
- "additions": What was added or improved (brief summary)

Only return the JSON object, no other text or markdown formatting around the JSON.`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    const cleanedText = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleanedText);

    return {
      enhancedDescription: parsed.enhancedDescription || taskDescription,
      additions: parsed.additions || 'Added structure and clarity.',
      success: true,
    };
  } catch (error) {
    console.error('Failed to enhance description:', error);
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'Failed to enhance description',
    );
  }
});

// ---------------------------------------------------------------------------
// Super-admin enforcement
// ---------------------------------------------------------------------------

/**
 * Designated super-admin email. Must match SUPER_ADMIN_EMAIL in
 * src/app/core/constants.ts. The Cloud Function below guarantees that whenever
 * this user's document is created or modified it is forced back into an
 * admin + isSuperAdmin state — so bertin cannot be accidentally demoted and
 * is promoted immediately on first sign-in regardless of any client races.
 */
const SUPER_ADMIN_EMAIL = 'bertin.kenol@omniflexfitness.com';

const SUPER_ADMIN_PERMISSIONS = {
  canCreateProjects: true,
  canCreateTasks: true,
  canDeleteProjects: true,
  canDeleteTasks: true,
  canInviteMembers: true,
  isSuperAdmin: true,
};

export const enforceSuperAdmin = onDocumentWritten(
  {
    document: 'users/{uid}',
    memory: '256MiB',
  },
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) return; // user deleted — nothing to do

    const email: string | undefined = after.email;
    if (email?.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) return;

    const needsRoleFix = after.role !== 'admin';
    const currentPerms = after.permissions || {};
    const needsPermsFix = Object.keys(SUPER_ADMIN_PERMISSIONS).some(
      (k) =>
        (currentPerms as Record<string, boolean>)[k] !==
        (SUPER_ADMIN_PERMISSIONS as Record<string, boolean>)[k],
    );

    if (!needsRoleFix && !needsPermsFix) return;

    console.log(
      `enforceSuperAdmin: reasserting admin/super-admin on ${email} ` +
        `(roleFix=${needsRoleFix}, permsFix=${needsPermsFix})`,
    );
    await db
      .doc(`users/${event.params.uid}`)
      .set(
        {
          role: 'admin',
          permissions: SUPER_ADMIN_PERMISSIONS,
        },
        { merge: true },
      );
  },
);
