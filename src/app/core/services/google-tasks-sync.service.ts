import { Injectable, inject } from '@angular/core';
import { Firestore, doc, updateDoc, DocumentReference } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { GoogleTasksService } from './google-tasks.service';
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
      this.googleTasksService.createTask(googleTaskListId, taskTitle)
    );
    // Update the Firestore task with both the Google Task ID and the list ID for future operations
    await updateDoc(taskDocRef, { 
      googleTaskId: googleTask.id,
      googleTaskListId: googleTaskListId
    });
    return googleTask.id!;
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
      await firstValueFrom(
        this.googleTasksService.updateTask(googleTaskListId, googleTaskId, taskData)
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
