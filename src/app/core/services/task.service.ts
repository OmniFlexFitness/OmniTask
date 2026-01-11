import { Injectable, inject, signal } from '@angular/core';
import { Firestore, collection, addDoc, doc, updateDoc, deleteDoc, query, where, collectionData, orderBy, writeBatch, DocumentReference, getDoc } from '@angular/fire/firestore';
import { Task } from '../models/domain.model';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { GoogleTasksService, GoogleTaskUpdate } from './google-tasks.service';

/**
 * Transform OmniTask task data to Google Task format
 */
function toGoogleTaskUpdate(task: Partial<Task>): GoogleTaskUpdate {
  const googleTask: GoogleTaskUpdate = {};
  
  if (task.title !== undefined) {
    googleTask.title = task.title;
  }
  
  if (task.description !== undefined) {
    googleTask.notes = task.description;
  }
  
  if (task.status !== undefined) {
    googleTask.status = task.status === 'done' ? 'completed' : 'needsAction';
  }
  
  if (task.dueDate !== undefined && task.dueDate) {
    const date = task.dueDate instanceof Date 
      ? task.dueDate 
      : (task.dueDate as any)?.toDate?.() || null;
    if (date) {
      googleTask.due = date.toISOString();
    }
  }
  
  return googleTask;
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private googleTasksService = inject(GoogleTasksService);
  private tasksCollection = collection(this.firestore, 'tasks');

  // Loading state for UI feedback
  loading = signal(false);
  error = signal<string | null>(null);

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
  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>, googleTaskListId?: string): Promise<DocumentReference> {
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

      // Only sync to Google Tasks if authenticated and googleTaskListId is provided
      if (googleTaskListId && this.googleTasksService.isAuthenticated()) {
        try {
          const googleTask = await firstValueFrom(this.googleTasksService.createTask(googleTaskListId, task.title));
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
  async updateTask(id: string, data: Partial<Task>, googleTaskListId?: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Fetch task data before updating to avoid race conditions
      const taskDoc = await this.getTask(id);
      
      const taskRef = doc(this.firestore, `tasks/${id}`);
      await updateDoc(taskRef, {
        ...data,
        updatedAt: new Date()
      });

      // Only sync to Google Tasks if authenticated and task is linked
      if (taskDoc?.googleTaskId && googleTaskListId && this.googleTasksService.isAuthenticated()) {
        try {
          const googleTaskUpdate = toGoogleTaskUpdate(data);
          await firstValueFrom(this.googleTasksService.updateTask(googleTaskListId, taskDoc.googleTaskId, googleTaskUpdate));
        } catch (err) {
          console.error('Failed to update Google Task, but task was updated in OmniTask:', err);
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
      
      // Delete from Google Tasks first if authenticated and linked
      if (taskDoc?.googleTaskId && googleTaskListId && this.googleTasksService.isAuthenticated()) {
        try {
          await firstValueFrom(
            this.googleTasksService.deleteTask(googleTaskListId, taskDoc.googleTaskId)
          );
        } catch (err) {
          console.error('Failed to delete Google Task; OmniTask task was not deleted to avoid inconsistency:', err);
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
   * Mark task as complete
   */
  async completeTask(id: string, googleTaskListId?: string): Promise<void> {
    return this.updateTask(id, {
      status: 'done',
      completedAt: new Date()
    }, googleTaskListId);
  }

  /**
   * Reopen a completed task
   */
  async reopenTask(id: string, googleTaskListId?: string): Promise<void> {
    return this.updateTask(id, {
      status: 'in-progress',
      completedAt: undefined
    }, googleTaskListId);
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
