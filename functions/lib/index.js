"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTaskAssignmentEmail = exports.searchWorkspaceContacts = exports.getWorkspaceContacts = exports.manualGoogleTasksSync = exports.scheduledGoogleTasksSync = exports.omniStatusToGoogleStatus = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const googleapis_1 = require("googleapis");
const firestore_2 = require("firebase-admin/firestore");
// Initialize Firebase Admin
admin.initializeApp();
const db = (0, firestore_2.getFirestore)();
// Define secrets for OAuth (set via Firebase CLI: firebase functions:secrets:set GOOGLE_CLIENT_ID)
const googleClientId = (0, params_1.defineSecret)('GOOGLE_CLIENT_ID');
const googleClientSecret = (0, params_1.defineSecret)('GOOGLE_CLIENT_SECRET');
// Service account email for sending emails (with domain-wide delegation)
const gmailServiceAccountKey = (0, params_1.defineSecret)('GMAIL_SERVICE_ACCOUNT_KEY');
// Sender email address for task notifications
const TASK_NOTIFICATION_SENDER = 'task@omniflexfitness.com';
// Google Tasks API client
const tasksApi = googleapis_1.google.tasks('v1');
// Google People API client (for directory contacts)
const peopleApi = googleapis_1.google.people('v1');
// Gmail API client
const gmailApi = googleapis_1.google.gmail('v1');
/**
 * Convert Google Task status to OmniTask status
 */
function googleStatusToOmniStatus(googleStatus) {
    return googleStatus === 'completed' ? 'done' : 'todo';
}
/**
 * Convert OmniTask status to Google Task status
 * Used for push sync (OmniTask -> Google Tasks) - exported for future use
 */
function omniStatusToGoogleStatus(omniStatus) {
    return omniStatus === 'done' ? 'completed' : 'needsAction';
}
exports.omniStatusToGoogleStatus = omniStatusToGoogleStatus;
/**
 * Transform a Google Task to OmniTask format
 */
function transformGoogleTaskToOmniTask(googleTask, projectId, googleTaskListId) {
    return {
        title: googleTask.title || 'Untitled',
        description: googleTask.notes || '',
        status: googleStatusToOmniStatus(googleTask.status ?? undefined),
        dueDate: googleTask.due ? firestore_2.Timestamp.fromDate(new Date(googleTask.due)) : undefined,
        completedAt: googleTask.completed
            ? firestore_2.Timestamp.fromDate(new Date(googleTask.completed))
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
async function syncProject(project, accessToken) {
    if (!project.googleTaskListId) {
        return { success: false, added: 0, updated: 0, error: 'No Google Task list linked' };
    }
    try {
        // Set up authenticated client
        const oauth2Client = new googleapis_1.google.auth.OAuth2();
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
        const omniTasks = new Map();
        omniTasksSnapshot.forEach((doc) => {
            const task = { id: doc.id, ...doc.data() };
            if (task.googleTaskId) {
                omniTasks.set(task.googleTaskId, task);
            }
        });
        let added = 0;
        let updated = 0;
        // Process each Google Task
        for (const googleTask of googleTasks) {
            if (!googleTask.id)
                continue;
            const existingOmniTask = omniTasks.get(googleTask.id);
            const taskData = transformGoogleTaskToOmniTask(googleTask, project.id, project.googleTaskListId);
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
                        updatedAt: firestore_2.FieldValue.serverTimestamp(),
                    });
                    updated++;
                }
            }
            else {
                // Create new task in OmniTask
                await db.collection('tasks').add({
                    ...taskData,
                    createdAt: firestore_2.FieldValue.serverTimestamp(),
                    updatedAt: firestore_2.FieldValue.serverTimestamp(),
                });
                added++;
            }
        }
        // Update project sync status
        await db.collection('projects').doc(project.id).update({
            syncStatus: 'synced',
            lastSyncAt: firestore_2.FieldValue.serverTimestamp(),
        });
        return { success: true, added, updated };
    }
    catch (error) {
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
exports.scheduledGoogleTasksSync = (0, scheduler_1.onSchedule)({
    schedule: 'every 5 minutes',
    timeZone: 'America/New_York',
    memory: '256MiB',
    secrets: [googleClientId, googleClientSecret],
}, async (context) => {
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
        const project = { id: projectDoc.id, ...projectDoc.data() };
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
            const oauth2Client = new googleapis_1.google.auth.OAuth2(googleClientId.value(), googleClientSecret.value());
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
                console.log(`Synced project ${project.id}: added ${result.added}, updated ${result.updated}`);
                synced++;
            }
            else {
                console.error(`Failed to sync project ${project.id}: ${result.error}`);
                failed++;
            }
        }
        catch (error) {
            console.error(`Error syncing project ${project.id}:`, error);
            failed++;
        }
    }
    console.log(`Sync complete: ${synced} succeeded, ${failed} failed`);
});
/**
 * Callable function for manual sync from the frontend
 * This can be called directly by authenticated users
 */
exports.manualGoogleTasksSync = (0, https_1.onCall)({
    memory: '256MiB',
}, async (request) => {
    // Verify authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { projectId, accessToken } = request.data;
    if (!projectId || !accessToken) {
        throw new https_1.HttpsError('invalid-argument', 'Missing projectId or accessToken');
    }
    // Verify user has access to project
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Project not found');
    }
    const project = { id: projectDoc.id, ...projectDoc.data() };
    // Verify user is owner or member
    if (project.ownerId !== request.auth.uid) {
        const projectData = projectDoc.data();
        if (!projectData?.memberIds?.includes(request.auth.uid)) {
            throw new https_1.HttpsError('permission-denied', 'User does not have access to this project');
        }
    }
    // Perform sync
    const result = await syncProject(project, accessToken);
    return result;
});
/**
 * Callable function to get workspace contacts from Google Directory
 * This function uses the People API to fetch directory contacts
 * which works for Google Workspace users to see other users in their organization
 */
exports.getWorkspaceContacts = (0, https_1.onCall)({
    memory: '256MiB',
}, async (request) => {
    // Verify authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { accessToken, pageSize = 100 } = request.data;
    if (!accessToken) {
        throw new https_1.HttpsError('invalid-argument', 'Missing accessToken');
    }
    try {
        // Set up authenticated client
        const oauth2Client = new googleapis_1.google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        // Fetch directory people using People API
        const response = await peopleApi.people.listDirectoryPeople({
            readMask: 'names,emailAddresses,photos',
            sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'],
            pageSize: Math.min(pageSize, 1000),
            auth: oauth2Client,
        });
        const people = response.data.people || [];
        const contacts = [];
        for (const person of people) {
            // Get primary or first email
            const emailAddress = person.emailAddresses?.find((e) => e.metadata?.primary) || person.emailAddresses?.[0];
            const email = emailAddress?.value;
            if (!email)
                continue; // Skip contacts without email
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
    }
    catch (error) {
        console.error('Failed to fetch workspace contacts:', error);
        // Check if it's a permission error
        if (error instanceof Error && error.message.includes('403')) {
            throw new https_1.HttpsError('permission-denied', 'Unable to access directory contacts. This may require Google Workspace admin permissions.');
        }
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Failed to fetch workspace contacts');
    }
});
/**
 * Callable function to search workspace contacts
 * Uses the People API searchDirectoryPeople endpoint
 */
exports.searchWorkspaceContacts = (0, https_1.onCall)({
    memory: '256MiB',
}, async (request) => {
    // Verify authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { accessToken, query, pageSize = 20 } = request.data;
    if (!accessToken) {
        throw new https_1.HttpsError('invalid-argument', 'Missing accessToken');
    }
    if (!query || !query.trim()) {
        return { contacts: [], totalCount: 0 };
    }
    try {
        // Set up authenticated client
        const oauth2Client = new googleapis_1.google.auth.OAuth2();
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
        const contacts = [];
        for (const person of people) {
            const emailAddress = person.emailAddresses?.find((e) => e.metadata?.primary) || person.emailAddresses?.[0];
            const email = emailAddress?.value;
            if (!email)
                continue;
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
    }
    catch (error) {
        console.error('Failed to search workspace contacts:', error);
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Failed to search workspace contacts');
    }
});
/**
 * Firestore trigger: Send email notification when a task is assigned
 * Triggers on task create/update and sends email if assignee changed
 */
exports.sendTaskAssignmentEmail = (0, firestore_1.onDocumentWritten)({
    document: 'tasks/{taskId}',
    secrets: [gmailServiceAccountKey],
    memory: '256MiB',
}, async (event) => {
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
        }
        catch (err) {
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
        }
        catch (err) {
            console.warn('Failed to lookup project:', err);
        }
    }
    // Format due date if present
    let dueDateStr = '';
    if (after.dueDate) {
        const dueDate = after.dueDate.toDate ? after.dueDate.toDate() : new Date(after.dueDate);
        dueDateStr = dueDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }
    // Build email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e4e4e7; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #16213e; border-radius: 12px; padding: 24px; }
    h1 { color: #8b5cf6; margin: 0 0 8px 0; font-size: 24px; }
    .project { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
    .task-title { background: #1e293b; border-left: 4px solid #8b5cf6; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .task-title h2 { color: #f1f5f9; margin: 0; font-size: 20px; }
    .description { color: #94a3b8; margin-top: 8px; }
    .meta { display: flex; gap: 16px; margin: 16px 0; }
    .meta-item { background: #1e293b; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
    .meta-label { color: #64748b; }
    .meta-value { color: #e2e8f0; }
    .cta { display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 16px; font-weight: 500; }
    .footer { color: #64748b; font-size: 12px; margin-top: 24px; border-top: 1px solid #334155; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📋 New Task Assigned</h1>
    <p class="project">In project: ${projectName}</p>
    
    <div class="task-title">
      <h2>${after.title || 'Untitled Task'}</h2>
      ${after.description ? `<p class="description">${after.description}</p>` : ''}
    </div>
    
    <div class="meta">
      <span class="meta-item">
        <span class="meta-label">Priority:</span>
        <span class="meta-value">${(after.priority || 'medium').toUpperCase()}</span>
      </span>
      ${dueDateStr
        ? `
      <span class="meta-item">
        <span class="meta-label">Due:</span>
        <span class="meta-value">${dueDateStr}</span>
      </span>
      `
        : ''}
    </div>
    
    <a href="https://omnitask.omniflexfitness.com/projects/${after.projectId}" class="cta">
      View Task in OmniTask
    </a>
    
    <div class="footer">
      This email was sent by OmniTask because you were assigned a task.<br>
      OmniFlex Fitness Task Management
    </div>
  </div>
</body>
</html>
    `.trim();
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
        // Parse service account key from secret
        const serviceAccountKey = JSON.parse(gmailServiceAccountKey.value());
        // Create JWT client with domain-wide delegation
        const jwtClient = new googleapis_1.google.auth.JWT({
            email: serviceAccountKey.client_email,
            key: serviceAccountKey.private_key,
            scopes: ['https://www.googleapis.com/auth/gmail.send'],
            subject: TASK_NOTIFICATION_SENDER, // Impersonate this user
        });
        // Authorize and send email
        await jwtClient.authorize();
        await gmailApi.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedEmail,
            },
            auth: jwtClient,
        });
        console.log(`Email sent to ${assigneeEmail} for task: ${after.title}`);
        // Log notification to Firestore for audit
        await db.collection('notifications').add({
            type: 'task_assignment',
            taskId: event.params.taskId,
            recipientEmail: assigneeEmail,
            sentAt: firestore_2.FieldValue.serverTimestamp(),
            success: true,
        });
    }
    catch (error) {
        console.error('Failed to send email notification:', error);
        // Log failed notification
        await db.collection('notifications').add({
            type: 'task_assignment',
            taskId: event.params.taskId,
            recipientEmail: assigneeEmail,
            sentAt: firestore_2.FieldValue.serverTimestamp(),
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
//# sourceMappingURL=index.js.map