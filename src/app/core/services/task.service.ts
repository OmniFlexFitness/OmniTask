import { Injectable, inject, signal, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  collectionData,
  orderBy,
  writeBatch,
  DocumentReference,
  getDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { Task } from '../models/domain.model';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { GoogleTasksService, GoogleTask } from './google-tasks.service';
import { GoogleTasksSyncService } from './google-tasks-sync.service';
import { ProjectService } from './project.service';

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private googleTasksService = inject(GoogleTasksService);
  private googleTasksSyncService = inject(GoogleTasksSyncService);
  private projectService = inject(ProjectService);
  private injector = inject(Injector);
  private tasksCollection = collection(this.firestore, 'tasks');

  // Loading state for UI feedback
  loading = signal(false);
  error = signal<string | null>(null);

  /**
   * Helper to remove undefined values from an object before Firestore operations.
   * Firestore does not allow undefined as a field value.
   */
  private stripUndefined<T extends Record<string, unknown>>(obj: T): T {
    const result = {} as T;
    for (const key of Object.keys(obj) as (keyof T)[]) {
      if (obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    return result;
  }

  /**
   * Map section name to task status.
   * Used to sync status when dragging tasks between board columns.
   * @param sectionName - The name of the section/column
   * @returns The corresponding task status, or null if no match
   */
  sectionNameToStatus(sectionName: string): Task['status'] | null {
    const normalized = sectionName.toLowerCase().replace(/\s+/g, '-');
    if (normalized.includes('done') || normalized.includes('complete')) return 'done';
    if (
      normalized.includes('progress') ||
      normalized.includes('doing') ||
      normalized.includes('wip')
    )
      return 'in-progress';
    if (
      normalized.includes('todo') ||
      normalized.includes('to-do') ||
      normalized.includes('backlog')
    )
      return 'todo';
    return null; // Unknown section, don't change status
  }

  /**
   * Map task status to section ID.
   * Used to move tasks to the appropriate section when status changes.
   * @param status - The task status to find a section for
   * @param sections - The project's sections array
   * @returns The section ID that matches the status, or undefined if no match
   */
  statusToSectionId(
    status: Task['status'],
    sections: { id: string; name: string }[],
  ): string | undefined {
    for (const section of sections) {
      const sectionStatus = this.sectionNameToStatus(section.name);
      if (sectionStatus === status) {
        return section.id;
      }
    }
    return undefined;
  }

  /**
   * Transform Google Tasks API format to OmniTask Task data
   * Maps Google Tasks API fields to local model fields
   */
  private transformFromGoogleTask(googleTask: GoogleTask): Partial<Task> {
    const task: Partial<Task> = {};

    // Map title
    if (googleTask.title !== undefined) {
      task.title = googleTask.title;
    }

    // Map notes to description
    if (googleTask.notes !== undefined) {
      task.description = googleTask.notes;
    }

    // Map status: Google Tasks uses 'needsAction' | 'completed'
    // OmniTask uses 'todo' | 'in-progress' | 'done'
    if (googleTask.status !== undefined) {
      task.status = googleTask.status === 'completed' ? 'done' : 'todo';
    }

    // Map due to dueDate
    if (googleTask.due !== undefined) {
      task.dueDate = new Date(googleTask.due);
    }

    // Map completed to completedAt
    if (googleTask.completed !== undefined) {
      task.completedAt = new Date(googleTask.completed);
    }

    // Mark as Google Task
    if (googleTask.id !== undefined) {
      task.googleTaskId = googleTask.id;
      task.isGoogleTask = true;
    }

    return task;
  }

  /**
   * Get all tasks for a project, sorted by order
   */
  getTasksByProject(projectId: string): Observable<Task[]> {
    const q = query(
      this.tasksCollection,
      where('projectId', '==', projectId),
      orderBy('order', 'asc'),
    );
    return runInInjectionContext(this.injector, () => {
      return collectionData(q, { idField: 'id' }) as Observable<Task[]>;
    });
  }

  /**
   * Get tasks by section (for board view)
   */
  getTasksBySection(projectId: string, sectionId: string): Observable<Task[]> {
    const q = query(
      this.tasksCollection,
      where('projectId', '==', projectId),
      where('sectionId', '==', sectionId),
      orderBy('order', 'asc'),
    );
    return runInInjectionContext(this.injector, () => {
      return collectionData(q, { idField: 'id' }) as Observable<Task[]>;
    });
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(projectId: string, status: Task['status']): Observable<Task[]> {
    const q = query(
      this.tasksCollection,
      where('projectId', '==', projectId),
      where('status', '==', status),
      orderBy('order', 'asc'),
    );
    return runInInjectionContext(this.injector, () => {
      return collectionData(q, { idField: 'id' }) as Observable<Task[]>;
    });
  }

  /**
   * Get tasks with a due date within a date range (for calendar view)
   */
  getTasksByDateRange(projectId: string, startDate: Date, endDate: Date): Observable<Task[]> {
    const q = query(
      this.tasksCollection,
      where('projectId', '==', projectId),
      where('dueDate', '>=', startDate),
      where('dueDate', '<=', endDate),
      orderBy('dueDate', 'asc'),
    );
    return collectionData(q, { idField: 'id' }) as Observable<Task[]>;
  }

  /**
   * Get a single task by ID
   */
  async getTask(id: string): Promise<Task | null> {
    try {
      const docRef = doc(this.firestore, `tasks/${id}`);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as Task;
    } catch (err) {
      console.error('Failed to fetch task:', err);
      return null;
    }
  }

  /**
   * Helper to automatically add a user to the project if they are assigned a task
   */
  private async autoAddMember(projectId: string | undefined, userId: string | undefined) {
    if (!projectId || !userId) return;
    try {
      // We don't want to block task operations on this, so we suppress errors
      await this.projectService.addMember(projectId, userId);
    } catch (err) {
      console.warn('Auto-add member failed', err);
    }
  }

  /**
   * Create a new task
   * @param task - Task data to create
   * @param googleTaskListId - Optional Google Task List ID if the project is synced with Google Tasks
   */
  async createTask(
    task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>,
    googleTaskListId?: string,
  ): Promise<DocumentReference> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const user = this.auth.currentUserSig();
      // Strip undefined values - Firestore does not accept undefined as a field value
      const data = this.stripUndefined({
        ...task,
        createdById: user?.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await addDoc(this.tasksCollection, data);

      if (googleTaskListId) {
        try {
          const googleTaskData = this.googleTasksSyncService.transformToGoogleTask(task);
          const googleTask = await firstValueFrom(
            this.googleTasksService.createTask(googleTaskListId, googleTaskData),
          );
          await updateDoc(doc(this.tasksCollection, result.id), {
            googleTaskId: googleTask.id,
            googleTaskListId: googleTaskListId,
            isGoogleTask: true,
          });
        } catch (err) {
          console.error('Failed to create Google Task, rolling back Firestore task creation:', err);
          try {
            await deleteDoc(result);
          } catch (rollbackErr) {
            console.error(
              'Failed to rollback Firestore task after Google Task creation error:',
              rollbackErr,
            );
          }
          throw err;
        }
      }

      // Auto-add assignee to project members
      if (task.assignedToId) {
        void this.autoAddMember(task.projectId, task.assignedToId);
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create task';
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update an existing task
   */
  async updateTask(id: string, data: Partial<Task>, googleTaskListId?: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Fetch task before update to avoid race condition
      const taskDoc = await this.getTask(id);

      const taskRef = doc(this.firestore, `tasks/${id}`);
      // Strip undefined values - Firestore does not accept undefined as a field value
      await updateDoc(
        taskRef,
        this.stripUndefined({
          ...data,
          updatedAt: new Date(),
        }),
      );

      // Auto-add assignee to project members
      if (data.assignedToId && taskDoc) {
        void this.autoAddMember(taskDoc.projectId, data.assignedToId);
      }

      if (taskDoc?.googleTaskId) {
        const project = await this.projectService.getProject(taskDoc.projectId);
        if (project?.googleTaskListId) {
          try {
            const googleTaskData = this.googleTasksSyncService.transformToGoogleTask(data);
            await firstValueFrom(
              this.googleTasksService.updateTask(
                project.googleTaskListId,
                taskDoc.googleTaskId,
                googleTaskData,
              ),
            );
          } catch (err) {
            console.error('Failed to update Google Task, but task was updated in OmniTask:', err);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update task';
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(id: string, googleTaskListId?: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const taskDoc = await this.getTask(id);
      if (taskDoc?.googleTaskId && taskDoc?.googleTaskListId) {
        try {
          await this.googleTasksSyncService.deleteTaskInGoogle(
            taskDoc.googleTaskListId,
            taskDoc.googleTaskId,
          );
          // Only delete from Firestore after successful Google Tasks deletion
          await deleteDoc(doc(this.firestore, `tasks/${id}`));
          return;
        } catch (err) {
          console.error(
            'Failed to delete Google Task; OmniTask task was not deleted to avoid inconsistency:',
            err,
          );
          throw err;
        }
      }

      // Only delete from Firestore after successful Google Tasks deletion (or if not linked)
      await deleteDoc(doc(this.firestore, `tasks/${id}`));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete task';
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Mark task as complete.
   * Also moves the task to the "Done" section if one exists in the project.
   */
  async completeTask(id: string, googleTaskListId?: string): Promise<void> {
    // Get the task to find its project and determine the correct section
    const task = await this.getTask(id);
    let sectionId: string | undefined;

    if (task?.projectId) {
      const project = await this.projectService.getProject(task.projectId);
      if (project?.sections) {
        sectionId = this.statusToSectionId('done', project.sections);
      }
    }

    return this.updateTask(
      id,
      {
        status: 'done',
        completedAt: new Date(),
        ...(sectionId ? { sectionId } : {}),
      },
      googleTaskListId,
    );
  }

  /**
   * Reopen a completed task.
   * Also moves the task to the "To Do" section if one exists in the project.
   */
  async reopenTask(id: string, googleTaskListId?: string): Promise<void> {
    // Get the task to find its project and determine the correct section
    const task = await this.getTask(id);
    let sectionId: string | undefined;

    if (task?.projectId) {
      const project = await this.projectService.getProject(task.projectId);
      if (project?.sections) {
        // Move to "To Do" section when reopening
        sectionId = this.statusToSectionId('todo', project.sections);
      }
    }

    return this.updateTask(
      id,
      {
        status: 'todo',
        completedAt: null as any, // Use null to clear field (Firestore rejects undefined)
        ...(sectionId ? { sectionId } : {}),
      },
      googleTaskListId,
    );
  }

  /**
   * Reorder tasks (after drag-and-drop)
   * Updates the order field for multiple tasks in a batch.
   * Optionally updates sectionId and status (for board column sync).
   */
  async reorderTasks(
    tasks: { id: string; order: number; sectionId?: string; status?: Task['status'] }[],
  ): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const batch = writeBatch(this.firestore);

      for (const task of tasks) {
        const taskRef = doc(this.firestore, `tasks/${task.id}`);
        const updateData: {
          order: number;
          updatedAt: Date;
          sectionId?: string;
          status?: Task['status'];
          completedAt?: Date | null;
        } = {
          order: task.order,
          updatedAt: new Date(),
        };
        if (task.sectionId !== undefined) {
          updateData.sectionId = task.sectionId;
        }
        if (task.status !== undefined) {
          updateData.status = task.status;
          // Set completedAt when marking as done, clear when re-opening
          if (task.status === 'done') {
            updateData.completedAt = new Date();
          } else {
            updateData.completedAt = null;
          }
        }
        batch.update(taskRef, updateData);
      }

      await batch.commit();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reorder tasks';
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Bulk update tasks (e.g., bulk complete, bulk delete)
   * Note: This method does not sync changes to Google Tasks for linked tasks.
   * For operations that need Google Tasks sync, use individual update methods.
   */
  async bulkUpdateTasks(taskIds: string[], data: Partial<Task>): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const batch = writeBatch(this.firestore);

      for (const id of taskIds) {
        const taskRef = doc(this.firestore, `tasks/${id}`);
        batch.update(taskRef, { ...data, updatedAt: new Date() });
      }

      await batch.commit();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update tasks';
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Bulk delete tasks
   * Note: This method does not handle Google Tasks synchronization.
   * For tasks linked to Google Tasks, use the individual deleteTask method.
   */
  async bulkDeleteTasks(taskIds: string[]): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const batch = writeBatch(this.firestore);

      for (const id of taskIds) {
        const taskRef = doc(this.firestore, `tasks/${id}`);
        batch.delete(taskRef);
      }

      await batch.commit();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete tasks';
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }
}
