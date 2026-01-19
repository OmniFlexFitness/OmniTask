import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  updateDoc,
  DocumentReference,
  collection,
  addDoc,
  query,
  where,
  getDocs,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { GoogleTasksService, GoogleTask, GoogleTasksResponse } from './google-tasks.service';
import { Task } from '../models/domain.model';

/**
 * Service responsible for synchronizing tasks and projects between OmniTask and Google Tasks.
 * This service breaks the circular dependency between TaskService and ProjectService by
 * centralizing all Google Tasks sync logic in one place.
 */
@Injectable({
  providedIn: 'root'
})
export class GoogleTasksSyncService {
  private firestore = inject(Firestore);
  private googleTasksService = inject(GoogleTasksService);
  private tasksCollection = collection(this.firestore, 'tasks');

  /**
   * Transform OmniTask Task data to Google Tasks API format
   * Maps local model fields to Google Tasks API fields
   */
  transformToGoogleTask(task: Partial<Task>): GoogleTask {
    const googleTask: GoogleTask = {};

    // Map title
    if (task.title !== undefined) {
      googleTask.title = task.title;
    }

    // Map description to notes
    if (task.description !== undefined) {
      googleTask.notes = task.description;
    }

    // Map status: OmniTask uses 'todo' | 'in-progress' | 'done'
    // Google Tasks uses 'needsAction' | 'completed'
    if (task.status !== undefined) {
      googleTask.status = task.status === 'done' ? 'completed' : 'needsAction';
    }

    // Map dueDate to due (RFC 3339 format)
    if (task.dueDate !== undefined) {
      if (task.dueDate instanceof Date) {
        googleTask.due = task.dueDate.toISOString();
      } else if (task.dueDate && typeof task.dueDate === 'object' && 'toDate' in task.dueDate) {
        // Handle Firestore Timestamp
        googleTask.due = (task.dueDate as any).toDate().toISOString();
      }
    }

    // Map completedAt to completed (RFC 3339 format)
    if (task.completedAt !== undefined) {
      if (task.completedAt instanceof Date) {
        googleTask.completed = task.completedAt.toISOString();
      } else if (task.completedAt && typeof task.completedAt === 'object' && 'toDate' in task.completedAt) {
        // Handle Firestore Timestamp
        googleTask.completed = (task.completedAt as any).toDate().toISOString();
      }
    }

    return googleTask;
  }

  /**
   * Transform Google Task to OmniTask format (reverse sync)
   * Note: Use null instead of undefined for optional fields (Firestore requirement)
   */
  public transformFromGoogleTask(
    googleTask: GoogleTask,
    projectId: string,
    googleTaskListId: string
  ): Partial<Task> {
    const taskData: Partial<Task> = {
      title: googleTask.title || 'Untitled',
      description: googleTask.notes || '',
      status: googleTask.status === 'completed' ? 'done' : 'todo',
      googleTaskId: googleTask.id,
      googleTaskListId,
      isGoogleTask: true,
      projectId,
      priority: 'medium',
      order: 0,
    };

    // Only add date fields if they have values (Firestore rejects undefined)
    if (googleTask.due) {
      taskData.dueDate = new Date(googleTask.due);
    }
    if (googleTask.completed) {
      taskData.completedAt = new Date(googleTask.completed);
    }

    return taskData;
  }

  /**
   * Remove undefined values from an object before writing to Firestore
   * Firestore does not accept undefined values in documents
   */
  private cleanForFirestore<T extends object>(obj: T): Partial<T> {
    const cleaned: Partial<T> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        (cleaned as any)[key] = value;
      }
    }
    return cleaned;
  }

  /**
   * Normalize a task title for matching purposes
   * Makes matching case-insensitive and whitespace-tolerant
   */
  private normalizeTitle(title: string): string {
    return title.toLowerCase().trim().replace(/\s+/g, ' '); // Collapse multiple spaces
  }

  /**
   * Pull tasks from Google Tasks and sync with OmniTask (bidirectional)
   * Uses last-write-wins: whichever task was updated more recently takes precedence
   * Returns counts of added, updated (from Google), and pushed (to Google) tasks
   */
  async pullFromGoogleTasks(
    projectId: string,
    googleTaskListId: string,
    lastSyncAt?: Date
  ): Promise<{ added: number; updated: number; pushed: number }> {
    // Fetch tasks from Google, optionally only those updated since lastSyncAt
    const updatedMin = lastSyncAt?.toISOString();
    let response: GoogleTasksResponse;

    try {
      response = await firstValueFrom(
        this.googleTasksService.getTasks(googleTaskListId, true, updatedMin)
      );
    } catch (err) {
      console.error('Failed to fetch Google Tasks:', err);
      throw err;
    }

    const googleTasks = response.items || [];
    let added = 0;
    let updated = 0;
    let pushed = 0;
    let linked = 0; // Track tasks linked by title match

    // Build maps for matching - get ALL tasks in the project
    const allTasksQuery = query(this.tasksCollection, where('projectId', '==', projectId));
    const allTasksSnapshot = await getDocs(allTasksQuery);

    // Map 1: Tasks with googleTaskId (primary match)
    const tasksByGoogleId = new Map<string, { id: string; updatedAt: Date; taskData: any }>();
    // Map 2: Tasks by normalized title (fallback match for duplicates)
    const tasksByTitle = new Map<
      string,
      { id: string; updatedAt: Date; taskData: any; hasGoogleId: boolean }
    >();

    allTasksSnapshot.forEach((taskDoc) => {
      const data = taskDoc.data();
      const docInfo = {
        id: taskDoc.id,
        updatedAt: data['updatedAt']?.toDate?.() || new Date(0),
        taskData: data,
      };

      // Add to googleTaskId map if present
      if (data['googleTaskId']) {
        tasksByGoogleId.set(data['googleTaskId'], docInfo);
      }

      // Add to title map for fallback matching
      const normalizedTitle = this.normalizeTitle(data['title'] || '');
      if (normalizedTitle && !tasksByTitle.has(normalizedTitle)) {
        tasksByTitle.set(normalizedTitle, {
          ...docInfo,
          hasGoogleId: !!data['googleTaskId'],
        });
      }
    });

    // Process each Google Task
    for (const googleTask of googleTasks) {
      if (!googleTask.id) continue;

      const googleUpdated = googleTask.updated ? new Date(googleTask.updated) : new Date(0);
      const normalizedGoogleTitle = this.normalizeTitle(googleTask.title || '');

      // Try to find existing task: first by googleTaskId, then by title
      let existing = tasksByGoogleId.get(googleTask.id);
      let matchedByTitle = false;

      if (!existing && normalizedGoogleTitle) {
        // Fallback: match by title (to prevent duplicates)
        const titleMatch = tasksByTitle.get(normalizedGoogleTitle);
        if (titleMatch && !titleMatch.hasGoogleId) {
          // Found a task with same title that isn't linked to any Google Task
          existing = titleMatch;
          matchedByTitle = true;
        }
      }

      if (existing) {
        if (matchedByTitle) {
          // Link this OmniTask to the Google Task (first-time link)
          await updateDoc(doc(this.firestore, `tasks/${existing.id}`), {
            googleTaskId: googleTask.id,
            googleTaskListId: googleTaskListId,
            isGoogleTask: true,
            updatedAt: new Date(),
          });
          linked++;
          // Remove from title map to prevent re-matching
          tasksByTitle.delete(normalizedGoogleTitle);
        } else {
          // Already linked - compare timestamps for sync
          if (googleUpdated > existing.updatedAt) {
            // Google is newer - pull changes to OmniTask
            const taskData = this.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
            await updateDoc(doc(this.firestore, `tasks/${existing.id}`), {
              ...taskData,
              updatedAt: new Date(),
            });
            updated++;
          } else if (existing.updatedAt > googleUpdated) {
            // OmniTask is newer - push changes to Google
            try {
              const googleTaskData = this.transformToGoogleTask(existing.taskData);
              await firstValueFrom(
                this.googleTasksService.updateTask(googleTaskListId, googleTask.id, googleTaskData)
              );
              pushed++;
            } catch (pushErr) {
              console.error('Failed to push task to Google:', pushErr);
            }
          }
        }
        // Mark as processed
        tasksByGoogleId.delete(googleTask.id);
      } else {
        // No match found - create new task in OmniTask
        const taskData = this.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
        await addDoc(this.tasksCollection, {
          ...taskData,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        added++;
      }
    }

    console.log(
      `Sync result: ${added} added, ${updated} updated, ${pushed} pushed, ${linked} linked by title`
    );
    return { added, updated, pushed };
  }

  /**
   * Create a Google Task List for a project
   * @returns The Google Task List ID if successful, undefined otherwise
   */
  async createTaskListForProject(projectId: string, projectName: string): Promise<string | undefined> {
    try {
      const taskList = await firstValueFrom(this.googleTasksService.createTaskList(projectName));
      const projectDocRef = doc(this.firestore, `projects/${projectId}`);
      await updateDoc(projectDocRef, { googleTaskListId: taskList.id });
      return taskList.id;
    } catch (err) {
      console.error('Failed to create Google Task list, but project was created in OmniTask:', err);
      // Non-fatal error, the project is still created locally.
      // We could add a mechanism to retry syncing later.
      return undefined;
    }
  }

  /**
   * Delete a Google Task List for a project
   */
  async deleteTaskListForProject(googleTaskListId: string): Promise<void> {
    await firstValueFrom(this.googleTasksService.deleteTaskList(googleTaskListId));
  }

  /**
   * Create a Google Task for an OmniTask task
   * @returns The Google Task ID if successful, throws error otherwise
   */
  async createTaskInGoogle(
    taskDocRef: DocumentReference,
    googleTaskListId: string,
    taskTitle: string
  ): Promise<string> {
    const googleTask = await firstValueFrom(
      this.googleTasksService.createTask(googleTaskListId, { title: taskTitle })
    );
    // Verify the Google Task was created with an ID
    if (!googleTask.id) {
      throw new Error('Google Task created without ID');
    }
    // Update the Firestore task with both the Google Task ID and the list ID for future operations
    await updateDoc(taskDocRef, { 
      googleTaskId: googleTask.id,
      googleTaskListId: googleTaskListId
    });
    return googleTask.id;
  }

  /**
   * Update a Google Task when an OmniTask task is updated
   */
  async updateTaskInGoogle(
    googleTaskListId: string,
    googleTaskId: string,
    taskData: Partial<Task>
  ): Promise<void> {
    try {
      const googleTaskData = this.transformToGoogleTask(taskData);
      await firstValueFrom(
        this.googleTasksService.updateTask(googleTaskListId, googleTaskId, googleTaskData)
      );
    } catch (err) {
      console.error('Failed to update Google Task, but task was updated in OmniTask:', err);
      // Non-fatal - the local update succeeded
    }
  }

  /**
   * Delete a Google Task when an OmniTask task is deleted
   */
  async deleteTaskInGoogle(googleTaskListId: string, googleTaskId: string): Promise<void> {
    await firstValueFrom(
      this.googleTasksService.deleteTask(googleTaskListId, googleTaskId)
    );
  }
}
