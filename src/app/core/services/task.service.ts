import { Injectable, inject, signal } from '@angular/core';
import { Firestore, collection, addDoc, doc, updateDoc, deleteDoc, query, where, collectionData, orderBy, writeBatch, DocumentReference, getDoc } from '@angular/fire/firestore';
import { Task } from '../models/domain.model';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { GoogleTasksService, GoogleTask } from './google-tasks.service';
import { ProjectService } from './project.service';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private googleTasksService = inject(GoogleTasksService);
  private projectService = inject(ProjectService);
  private tasksCollection = collection(this.firestore, 'tasks');

  // Loading state for UI feedback
  loading = signal(false);
  error = signal<string | null>(null);

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
      orderBy('order', 'asc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Task[]>;
  }

  /**
   * Get tasks by section (for board view)
   */
  getTasksBySection(projectId: string, sectionId: string): Observable<Task[]> {
    const q = query(
      this.tasksCollection,
      where('projectId', '==', projectId),
      where('sectionId', '==', sectionId),
      orderBy('order', 'asc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Task[]>;
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(projectId: string, status: Task['status']): Observable<Task[]> {
    const q = query(
      this.tasksCollection,
      where('projectId', '==', projectId),
      where('status', '==', status),
      orderBy('order', 'asc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Task[]>;
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
      orderBy('dueDate', 'asc')
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
   * Create a new task
   */
  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<DocumentReference> {
    this.loading.set(true);
    this.error.set(null);
    
    try {
      const user = this.auth.currentUserSig();
      const data = {
        ...task,
        createdById: user?.uid,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const result = await addDoc(this.tasksCollection, data);

      const project = await this.projectService.getProject(task.projectId);
      if (project?.googleTaskListId) {
        try {
          const googleTaskData = this.transformToGoogleTask(task);
          const googleTask = await firstValueFrom(this.googleTasksService.createTask(project.googleTaskListId, googleTaskData));
          await updateDoc(doc(this.tasksCollection, result.id), { googleTaskId: googleTask.id });
        } catch (err) {
          console.error('Failed to create Google Task, rolling back Firestore task creation:', err);
          try {
            await deleteDoc(result);
          } catch (rollbackErr) {
            console.error('Failed to rollback Firestore task after Google Task creation error:', rollbackErr);
          }
          throw err;
        }
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
  async updateTask(id: string, data: Partial<Task>): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const taskRef = doc(this.firestore, `tasks/${id}`);
      await updateDoc(taskRef, {
        ...data,
        updatedAt: new Date()
      });

      const taskDoc = await this.getTask(id);
      if (taskDoc?.googleTaskId) {
        const project = await this.projectService.getProject(taskDoc.projectId);
        if (project?.googleTaskListId) {
          try {
            const googleTaskData = this.transformToGoogleTask(data);
            await firstValueFrom(this.googleTasksService.updateTask(project.googleTaskListId, taskDoc.googleTaskId, googleTaskData));
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
  async deleteTask(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const taskDoc = await this.getTask(id);
      if (taskDoc?.googleTaskId) {
        const project = await this.projectService.getProject(taskDoc.projectId);
        if (project?.googleTaskListId) {
          try {
            await firstValueFrom(
              this.googleTasksService.deleteTask(project.googleTaskListId, taskDoc.googleTaskId)
            );
            // Only delete from Firestore after successful Google Tasks deletion
            await deleteDoc(doc(this.firestore, `tasks/${id}`));
            return;
          } catch (err) {
            console.error('Failed to delete Google Task; OmniTask task was not deleted to avoid inconsistency:', err);
            throw err;
          }
        }
      }
      // If there is no linked Google Task or no Google Task list, just delete from Firestore
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
   * Mark task as complete
   */
  async completeTask(id: string): Promise<void> {
    return this.updateTask(id, {
      status: 'done',
      completedAt: new Date()
    });
  }

  /**
   * Reopen a completed task
   */
  async reopenTask(id: string): Promise<void> {
    return this.updateTask(id, {
      status: 'in-progress',
      completedAt: undefined
    });
  }

  /**
   * Reorder tasks (after drag-and-drop)
   * Updates the order field for multiple tasks in a batch
   */
  async reorderTasks(tasks: { id: string; order: number; sectionId?: string }[]): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const batch = writeBatch(this.firestore);
      
      for (const task of tasks) {
        const taskRef = doc(this.firestore, `tasks/${task.id}`);
        const updateData: { order: number; updatedAt: Date; sectionId?: string } = {
          order: task.order,
          updatedAt: new Date()
        };
        if (task.sectionId !== undefined) {
          updateData.sectionId = task.sectionId;
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
