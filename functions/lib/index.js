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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceSuperAdmin = exports.enhanceTaskDescription = exports.suggestDueDate = exports.suggestTaskPriority = exports.generateSubtasks = exports.syncWeeklyBlockReminders = exports.syncRecurringTaskReminders = exports.checkScheduledReminders = exports.sendTaskAssignmentEmail = exports.searchWorkspaceContacts = exports.getWorkspaceContacts = exports.manualGoogleTasksSync = exports.scheduledGoogleTasksSync = void 0;
exports.omniStatusToGoogleStatus = omniStatusToGoogleStatus;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const googleapis_1 = require("googleapis");
const firestore_2 = require("firebase-admin/firestore");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vertexai_1 = require("@google-cloud/vertexai");
const nodemailer = __importStar(require("nodemailer"));
const marked_1 = require("marked");
const sanitize_html_1 = __importDefault(require("sanitize-html"));
// Initialize Firebase Admin
admin.initializeApp();
const db = (0, firestore_2.getFirestore)();
// Define secrets for OAuth (set via Firebase CLI: firebase functions:secrets:set GOOGLE_CLIENT_ID)
const googleClientId = (0, params_1.defineSecret)('GOOGLE_CLIENT_ID');
const googleClientSecret = (0, params_1.defineSecret)('GOOGLE_CLIENT_SECRET');
const nodemailerSmtpPassword = (0, params_1.defineSecret)('NODEMAILER_SMTP_PASSWORD');
// Sender email address for task notifications (configurable via environment variable)
// (Now managed by firestore-send-email extension DEFAULT_FROM)
// Google Tasks API client
const tasksApi = googleapis_1.google.tasks('v1');
// Google People API client (for directory contacts)
const peopleApi = googleapis_1.google.people('v1');
// Email template cache (loaded once for performance)
let emailTemplateCache = null;
/**
 * Escape HTML entities to prevent XSS attacks
 */
function escapeHtml(text) {
    const htmlEscapeMap = {
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
 * Render markdown task description as sanitized HTML with inline styles
 * suitable for email clients (which typically strip <style> blocks and class
 * attributes). Returns a string of HTML — empty string for missing/blank input.
 */
function renderDescriptionForEmail(markdown) {
    if (!markdown || !markdown.trim())
        return '';
    // Obsidian-style highlights: ==text== → <mark>text</mark>
    const preprocessed = markdown.replace(/==([^=]+?)==/g, '<mark>$1</mark>');
    // Parse with GFM + line breaks so user formatting survives the round-trip.
    const rawHtml = marked_1.marked.parse(preprocessed, { gfm: true, breaks: true });
    // Sanitize — the description is user-provided and flows through an HTML email,
    // so we strip scripts/handlers but keep all the formatting tags the editor
    // can emit (bold, headings, lists, links, tables, blockquotes, images, code).
    const cleanHtml = (0, sanitize_html_1.default)(rawHtml, {
        allowedTags: [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'p', 'br', 'hr', 'div', 'span',
            'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark',
            'ul', 'ol', 'li',
            'a', 'img',
            'blockquote',
            'code', 'pre',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'input',
        ],
        allowedAttributes: {
            a: ['href', 'name', 'target', 'rel', 'title'],
            img: ['src', 'alt', 'title', 'width', 'height'],
            input: ['type', 'checked', 'disabled'],
            '*': ['style'],
        },
        allowedSchemes: ['http', 'https', 'mailto', 'tel'],
        transformTags: {
            // Force links to open externally and be safe
            a: sanitize_html_1.default.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
        },
    });
    // Inject inline styles — email clients (Gmail, Outlook) strip <style> blocks,
    // so each formatting tag needs its CSS inlined. We rewrite well-known tags
    // to carry a style="" attribute, preserving any style the user already set.
    const inline = {
        h1: 'font-size:20px;font-weight:700;color:#f1f5f9;margin:16px 0 8px;line-height:1.3;',
        h2: 'font-size:18px;font-weight:700;color:#f1f5f9;margin:14px 0 8px;line-height:1.3;',
        h3: 'font-size:16px;font-weight:600;color:#f1f5f9;margin:12px 0 6px;line-height:1.3;',
        h4: 'font-size:14px;font-weight:600;color:#e2e8f0;margin:10px 0 6px;line-height:1.3;',
        h5: 'font-size:13px;font-weight:600;color:#e2e8f0;margin:8px 0 4px;line-height:1.3;',
        h6: 'font-size:12px;font-weight:600;color:#cbd5e1;margin:8px 0 4px;line-height:1.3;',
        p: 'margin:0 0 10px;line-height:1.6;color:#cbd5e1;',
        strong: 'font-weight:700;color:#f8fafc;',
        b: 'font-weight:700;color:#f8fafc;',
        em: 'font-style:italic;',
        i: 'font-style:italic;',
        del: 'text-decoration:line-through;color:#94a3b8;',
        s: 'text-decoration:line-through;color:#94a3b8;',
        u: 'text-decoration:underline;',
        mark: 'background:#fde68a;color:#78350f;padding:0 3px;border-radius:2px;',
        a: 'color:#22d3ee;text-decoration:underline;',
        ul: 'margin:0 0 10px;padding-left:22px;color:#cbd5e1;',
        ol: 'margin:0 0 10px;padding-left:22px;color:#cbd5e1;',
        li: 'margin-bottom:4px;line-height:1.5;',
        blockquote: 'border-left:3px solid #64748b;margin:10px 0;padding:4px 0 4px 12px;color:#94a3b8;font-style:italic;',
        code: 'background:#1e293b;color:#22d3ee;padding:1px 5px;border-radius:3px;font-family:Consolas,Monaco,monospace;font-size:13px;',
        pre: 'background:#0f172a;border:1px solid #334155;border-radius:6px;padding:12px;margin:10px 0;overflow-x:auto;font-family:Consolas,Monaco,monospace;font-size:13px;color:#cbd5e1;',
        table: 'border-collapse:collapse;margin:10px 0;width:100%;',
        th: 'background:#1e293b;text-align:left;padding:6px 10px;font-weight:600;color:#e2e8f0;border:1px solid #334155;font-size:13px;',
        td: 'padding:6px 10px;border:1px solid #334155;color:#cbd5e1;font-size:14px;',
        hr: 'border:none;border-top:1px solid #334155;margin:14px 0;',
        img: 'max-width:100%;border-radius:6px;',
    };
    // Rewrite open-tags to carry inline styles. We preserve any existing style
    // attribute by appending — the user's own colors should win.
    const styled = cleanHtml.replace(/<(\/?)(h[1-6]|p|strong|b|em|i|u|s|del|mark|a|ul|ol|li|blockquote|code|pre|table|th|td|hr|img)([^>]*)>/gi, (match, slash, tag, rest) => {
        if (slash)
            return match; // closing tag
        const tagLower = tag.toLowerCase();
        const baseStyle = inline[tagLower];
        if (!baseStyle)
            return match;
        const styleMatch = rest.match(/\sstyle\s*=\s*"([^"]*)"/i);
        if (styleMatch) {
            const existing = styleMatch[1].trim().replace(/;?$/, ';');
            const newAttrs = rest.replace(/\sstyle\s*=\s*"[^"]*"/i, ` style="${baseStyle}${existing}"`);
            return `<${tag}${newAttrs}>`;
        }
        return `<${tag}${rest} style="${baseStyle}">`;
    });
    return styled;
}
/**
 * Load email template from file (cached for performance)
 */
function loadEmailTemplate() {
    try {
        if (!emailTemplateCache) {
            const templatePath = path.join(__dirname, 'email-templates', 'task-assignment.html');
            emailTemplateCache = fs.readFileSync(templatePath, 'utf-8');
        }
        return emailTemplateCache;
    }
    catch (error) {
        console.error('Failed to load email template:', error);
        // Fallback to a minimal inline template
        return `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;color:#1f2937;">
  <h1 style="color:#8b5cf6;">New Task Assigned</h1>
  <p style="color:#6b7280;">Project: {{PROJECT_NAME}}</p>
  <h2>{{TASK_TITLE}}</h2>
  {{TASK_DESCRIPTION}}
  <p><strong>Priority:</strong> {{TASK_PRIORITY}}</p>
  {{DUE_DATE_HTML}}
  <p><a href="{{TASK_URL}}" style="color:#8b5cf6;">View Task</a></p>
</body>
</html>
    `.trim();
    }
}
/**
 * Populate email template with task data
 */
function populateEmailTemplate(data) {
    let html = loadEmailTemplate();
    // Escape all user-provided content to prevent XSS
    html = html.replace(/{{PROJECT_NAME}}/g, escapeHtml(data.projectName));
    html = html.replace(/{{TASK_TITLE}}/g, escapeHtml(data.taskTitle));
    // Render markdown description to sanitized, inline-styled HTML so email
    // clients (Gmail, Outlook) display formatted text instead of raw markdown.
    const descriptionBody = renderDescriptionForEmail(data.taskDescription);
    const descriptionHtml = descriptionBody
        ? `<div class="description" style="margin-top:12px;color:#cbd5e1;font-size:14px;line-height:1.6;">${descriptionBody}</div>`
        : '';
    html = html.replace(/{{TASK_DESCRIPTION}}/g, descriptionHtml);
    html = html.replace(/{{TASK_PRIORITY}}/g, escapeHtml(data.taskPriority.toUpperCase()));
    const dueDateHtml = data.dueDateStr
        ? `
      <span style="display:inline-block;background:#1e293b;padding:8px 12px;border-radius:6px;font-size:13px;">
        <span style="color:#64748b;">Due:</span>
        <span style="color:#e2e8f0;">${escapeHtml(data.dueDateStr)}</span>
      </span>
      `
        : '';
    html = html.replace(/{{DUE_DATE_HTML}}/g, dueDateHtml);
    // URL doesn't need escaping as it's constructed server-side, but validate it's safe
    html = html.replace(/{{TASK_URL}}/g, data.taskUrl);
    return html;
}
// Initialize Vertex AI with Gemini 1.5 Flash (cost-effective model)
const vertexAI = new vertexai_1.VertexAI({
    project: 'omnitask-475422',
    location: 'us-east1',
});
const geminiModel = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
});
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
        // Check if it's a permission error using error code
        if (error?.code === 403 || error?.response?.status === 403) {
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
exports.sendTaskAssignmentEmail = (0, firestore_1.onDocumentWritten)({
    document: 'tasks/{taskId}',
    memory: '256MiB',
    secrets: [nodemailerSmtpPassword],
}, async (event) => {
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
    const beforeIds = [
        ...(before?.assigneeIds ?? (before?.assignedToId ? [before.assignedToId] : [])),
        ...(before?.subtasks?.flatMap((s) => s.assigneeIds ?? []) ?? []),
    ];
    const afterIds = [
        ...(after.assigneeIds ?? (after.assignedToId ? [after.assignedToId] : [])),
        ...(after.subtasks?.flatMap((s) => s.assigneeIds ?? []) ?? []),
    ];
    const uniqueBeforeIds = [...new Set(beforeIds)];
    const uniqueAfterIds = [...new Set(afterIds)];
    const addedIds = uniqueAfterIds.filter((id) => !uniqueBeforeIds.includes(id));
    const removedIds = uniqueBeforeIds.filter((id) => !uniqueAfterIds.includes(id));
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
    async function resolveEmail(assigneeId, assigneeName) {
        // Unwrap nested assignment strings if format is "id|email@domain.com"
        const parts = assigneeId.split('|');
        const actualId = parts[0];
        const potentialEmail = parts.length > 1 ? parts[1] : actualId;
        // Try users collection first by ID
        try {
            const userDoc = await db.collection('users').doc(actualId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.email)
                    return userData.email;
            }
        }
        catch (err) {
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
    const afterNames = after.assigneeNames ?? (after.assigneeName ? [after.assigneeName] : []);
    // ── Get project name ─────────────────────────────────────────────────
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
    // ── Format due date ─────────────────────────────────────────────────
    let dueDateStr;
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
    const recipientEmails = new Set();
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
        const assignedSubtasks = after.subtasks.filter((s) => s.assigneeIds && s.assigneeIds.length > 0);
        if (assignedSubtasks.length > 0) {
            console.log(`Task has ${assignedSubtasks.length} subtask(s) with assignees`);
        }
    }
    // Sanitize title to prevent email header injection via newlines
    const safeTitle = (after.title || '').replace(/\r\n|\r|\n/g, ' ');
    let emailSubject;
    if (assigneesChanged && addedIds.length > 0) {
        emailSubject = `📋 You've been assigned: ${safeTitle || 'New Task'}`;
    }
    else if (statusChangedActual) {
        const statusLabel = after.status === 'done'
            ? '✅ Done'
            : after.status === 'in-progress'
                ? '🔄 In Progress'
                : '📋 To Do';
        emailSubject = `📋 Status updated to ${statusLabel}: ${safeTitle || 'Task'}`;
    }
    else {
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
                sentAt: firestore_2.FieldValue.serverTimestamp(),
                success: true,
            });
        }
        catch (error) {
            console.error(`Failed to send email to ${recipientEmail}:`, error);
            // Log failed notification
            await db.collection('notifications').add({
                type: assigneesChanged ? 'task_assignment' : 'task_status_change',
                taskId: event.params.taskId,
                recipientEmail,
                sentAt: firestore_2.FieldValue.serverTimestamp(),
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
});
// Helper to send reminder emails
async function sendReminderEmail(transporter, email, title, description, timeString, offset, typeStr) {
    const renderedDescription = renderDescriptionForEmail(description);
    const descriptionBlock = renderedDescription
        ? `<div class="description" style="margin-top:12px;color:#cbd5e1;font-size:14px;line-height:1.6;">${renderedDescription}</div>`
        : '';
    const emailHtml = loadEmailTemplate()
        .replace(/{{PROJECT_NAME}}/g, escapeHtml(typeStr))
        .replace(/{{TASK_TITLE}}/g, escapeHtml(`Reminder: ${title}`))
        .replace(/{{TASK_DESCRIPTION}}/g, descriptionBlock)
        .replace(/{{TASK_PRIORITY}}/g, 'HIGH')
        .replace(/{{DUE_DATE_HTML}}/g, `<p>Starts in ${offset === 0 ? 'now' : offset + ' minutes'} (at ${timeString})</p>`)
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
exports.checkScheduledReminders = (0, scheduler_1.onSchedule)({
    schedule: 'every 5 minutes',
    timeZone: 'America/New_York',
    memory: '256MiB',
    secrets: [nodemailerSmtpPassword],
}, async (event) => {
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
            await sendReminderEmail(transporter, data.email, data.title, data.description || '', data.timeString, data.offset, data.type === 'recurring' ? 'Daily Schedule' : 'Weekly Schedule');
            emailsSent++;
            console.log(`Sent ${data.type} reminder to ${data.email} for ${data.title}`);
            // Only compute next triggerAt or delete if send was successful
            if (data.type === 'recurring') {
                const nextDate = data.triggerAt.toDate();
                nextDate.setDate(nextDate.getDate() + 1);
                batch.update(doc.ref, { triggerAt: admin.firestore.Timestamp.fromDate(nextDate) });
            }
            else if (data.type === 'weekly' && data.repeating) {
                const nextDate = data.triggerAt.toDate();
                nextDate.setDate(nextDate.getDate() + 7);
                batch.update(doc.ref, { triggerAt: admin.firestore.Timestamp.fromDate(nextDate) });
            }
            else {
                batch.delete(doc.ref);
            }
        }
        catch (err) {
            console.error(`Failed to send reminder to ${data.email}, leaving in queue for retry:`, err);
        }
    }
    await batch.commit();
    console.log(`Completed checkScheduledReminders. Emails sent: ${emailsSent}`);
});
/**
 * Synchronize recurring tasks to the top-level reminders collection
 */
exports.syncRecurringTaskReminders = (0, firestore_1.onDocumentWritten)('users/{uid}/recurringTasks/{taskId}', async (event) => {
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
        if (t <= now)
            t.setDate(t.getDate() + 1);
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
});
/**
 * Synchronize weekly blocks to the top-level reminders collection
 */
exports.syncWeeklyBlockReminders = (0, firestore_1.onDocumentWritten)('users/{uid}/weeklyBlocks/{blockId}', async (event) => {
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
        }
        else {
            if (after.weekDate) {
                const [yearStr, monthStr, dayStr] = after.weekDate.split('-');
                const targetDate = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
                let offsetDays = after.dayOfWeek - 1;
                if (after.dayOfWeek === 0)
                    offsetDays = 6;
                targetDate.setDate(targetDate.getDate() + offsetDays);
                t = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), h, m, 0, 0);
                t.setMinutes(t.getMinutes() - r);
            }
            if (t <= now)
                continue;
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
});
/**
 * Generate subtasks from a task title and description using Gemini
 * Breaks down complex tasks into actionable subtasks
 */
exports.generateSubtasks = (0, https_1.onCall)({ memory: '256MiB' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { taskTitle, taskDescription, projectContext } = request.data;
    if (!taskTitle?.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'Task title is required');
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
        const subtasks = parsedSubtasks.map((st) => ({
            id: `subtask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: st.title,
            completed: false,
        }));
        return { subtasks, success: true };
    }
    catch (error) {
        console.error('Failed to generate subtasks:', error);
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Failed to generate subtasks');
    }
});
/**
 * Suggest task priority based on title and description using Gemini
 * Returns low, medium, or high priority with reasoning
 */
exports.suggestTaskPriority = (0, https_1.onCall)({ memory: '256MiB' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { taskTitle, taskDescription, dueDate } = request.data;
    if (!taskTitle?.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'Task title is required');
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
    }
    catch (error) {
        console.error('Failed to suggest priority:', error);
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Failed to suggest priority');
    }
});
/**
 * Suggest a due date based on task complexity and description using Gemini
 * Estimates effort and suggests a realistic deadline
 */
exports.suggestDueDate = (0, https_1.onCall)({ memory: '256MiB' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { taskTitle, taskDescription, projectDeadline } = request.data;
    if (!taskTitle?.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'Task title is required');
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
    }
    catch (error) {
        console.error('Failed to suggest due date:', error);
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Failed to suggest due date');
    }
});
/**
 * Enhance a task description with more detail and actionable information using Gemini
 * Improves brief descriptions with structure and clarity
 */
exports.enhanceTaskDescription = (0, https_1.onCall)({ memory: '256MiB' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { taskTitle, taskDescription, projectContext } = request.data;
    if (!taskTitle?.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'Task title is required');
    }
    if (!taskDescription?.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'Task description is required');
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
    }
    catch (error) {
        console.error('Failed to enhance description:', error);
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Failed to enhance description');
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
exports.enforceSuperAdmin = (0, firestore_1.onDocumentWritten)({
    document: 'users/{uid}',
    memory: '256MiB',
}, async (event) => {
    const after = event.data?.after?.data();
    if (!after)
        return; // user deleted — nothing to do
    const email = after.email;
    if (email?.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase())
        return;
    const needsRoleFix = after.role !== 'admin';
    const currentPerms = after.permissions || {};
    const needsPermsFix = Object.keys(SUPER_ADMIN_PERMISSIONS).some((k) => currentPerms[k] !==
        SUPER_ADMIN_PERMISSIONS[k]);
    if (!needsRoleFix && !needsPermsFix)
        return;
    console.log(`enforceSuperAdmin: reasserting admin/super-admin on ${email} ` +
        `(roleFix=${needsRoleFix}, permsFix=${needsPermsFix})`);
    await db
        .doc(`users/${event.params.uid}`)
        .set({
        role: 'admin',
        permissions: SUPER_ADMIN_PERMISSIONS,
    }, { merge: true });
});
//# sourceMappingURL=index.js.map