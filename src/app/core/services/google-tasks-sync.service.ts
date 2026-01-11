import { Injectable, inject } from '@angular/core';
import { Firestore, doc, updateDoc, DocumentReference } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { GoogleTasksService, GoogleTask } from './google-tasks.service';
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

  /**
   * Transform OmniTask Task data to Google Tasks API format
   * Maps local model fields to Google Tasks API fields
   */
  private transformToGoogleTask(task: Partial<Task>): GoogleTask {
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
