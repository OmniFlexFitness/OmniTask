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
exports.manualGoogleTasksSync = exports.scheduledGoogleTasksSync = exports.omniStatusToGoogleStatus = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const googleapis_1 = require("googleapis");
const firestore_1 = require("firebase-admin/firestore");
// Initialize Firebase Admin
admin.initializeApp();
const db = (0, firestore_1.getFirestore)();
// Define secrets for OAuth (set via Firebase CLI: firebase functions:secrets:set GOOGLE_CLIENT_ID)
const googleClientId = (0, params_1.defineSecret)('GOOGLE_CLIENT_ID');
const googleClientSecret = (0, params_1.defineSecret)('GOOGLE_CLIENT_SECRET');
// Google Tasks API client
const tasksApi = googleapis_1.google.tasks('v1');
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
        dueDate: googleTask.due ? firestore_1.Timestamp.fromDate(new Date(googleTask.due)) : undefined,
        completedAt: googleTask.completed
            ? firestore_1.Timestamp.fromDate(new Date(googleTask.completed))
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
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    });
                    updated++;
                }
            }
            else {
                // Create new task in OmniTask
                await db.collection('tasks').add({
                    ...taskData,
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
                added++;
            }
        }
        // Update project sync status
        await db.collection('projects').doc(project.id).update({
            syncStatus: 'synced',
            lastSyncAt: firestore_1.FieldValue.serverTimestamp(),
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
//# sourceMappingURL=index.js.map