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
import { Task, Section } from '../models/domain.model';
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
   * Map section name to task status (legacy fallback).
   * Used when a section doesn't have an explicit `status` field.
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
    return null;
  }

  /**
   * Get the status a section represents.
   * Prefers the data-driven `section.status` field, falls back to name-based matching.
   */
  getSectionStatus(section: { name: string; status?: Task['status'] }): Task['status'] | null {
    return section.status ?? this.sectionNameToStatus(section.name);
  }

  /**
   * Find the section that maps to a given status.
   * Prefers data-driven mapping (section.status), falls back to name-based matching.
   */
  findSectionForStatus(status: Task['status'], sections: Section[]): Section | undefined {
    // Prefer data-driven mapping
    const byField = sections.find((s) => s.status === status);
    if (byField) return byField;
    // Fallback to name-based matching for legacy sections
    return sections.find((s) => this.sectionNameToStatus(s.name) === status);
  }

  /**
   * Map task status to section ID (convenience wrapper).
   */
  statusToSectionId(status: Task['status'], sections: Section[]): string | undefined {
    return this.findSectionForStatus(status, sections)?.id;
  }

  /**
   * Reconcile derived task fields before any write.
   * Given a partial update, infer sectionId from status (or vice versa),
   * manage completedAt, and handle any future derived properties.
   *
   * This is the central reconciliation layer — all task mutations
   * flow through here to ensure consistency.
   */
  private async reconcileTaskFields(
    taskId: string,
    changes: Partial<Task>,
    existingTask?: Task | null,
  ): Promise<Partial<Task>> {
    const reconciled = { ...changes };
    const task = existingTask ?? (await this.getTask(taskId));
    if (!task) return reconciled;

    const project = await this.projectService.getProject(task.projectId);
    const sections: Section[] = project?.sections ?? [];

    // 1. Status changed → derive sectionId + completedAt
    if (reconciled.status && reconciled.status !== task.status) {
      // Find matching section for new status (unless sectionId was explicitly set)
      if (!reconciled.sectionId) {
        const matchingSection = this.findSectionForStatus(reconciled.status, sections);
        if (matchingSection) {
          reconciled.sectionId = matchingSection.id;
        }
      }
      // Manage completedAt
      if (reconciled.status === 'done' && !reconciled.completedAt) {
        reconciled.completedAt = new Date();
      } else if (reconciled.status !== 'done') {
        reconciled.completedAt = null;
      }
    }

    // 2. SectionId changed (e.g. drag-drop) → derive status
    if (reconciled.sectionId && reconciled.sectionId !== task.sectionId && !reconciled.status) {
      const targetSection = sections.find((s) => s.id === reconciled.sectionId);
      if (targetSection) {
        const derivedStatus = this.getSectionStatus(targetSection);
        if (derivedStatus) {
          reconciled.status = derivedStatus;
          if (derivedStatus === 'done') {
            reconciled.completedAt = new Date();
          } else {
            reconciled.completedAt = null;
          }
        }
      }
    }

    // Future derived properties can be added here

    return reconciled;
  }

  /**
   * Reconcile derived task fields for newly created tasks.
   * Ensures that if a task is created with a status but no sectionId,
   * or a sectionId but mismatched status, they are aligned.
   */
  private async reconcileNewTaskFields(
    task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>> {
    const reconciled = { ...task };
    if (!reconciled.projectId) return reconciled;

    const project = await this.projectService.getProject(reconciled.projectId);
    const sections: Section[] = project?.sections ?? [];

    // 1. Status is provided but no sectionId
    if (reconciled.status && !reconciled.sectionId) {
      const matchingSection = this.findSectionForStatus(reconciled.status, sections);
      if (matchingSection) {
        reconciled.sectionId = matchingSection.id;
      }
      if (reconciled.status === 'done' && !reconciled.completedAt) {
        reconciled.completedAt = new Date();
      }
    }
    // 2. SectionId is provided
    else if (reconciled.sectionId) {
      const targetSection = sections.find((s) => s.id === reconciled.sectionId);
      if (targetSection) {
        const derivedStatus = this.getSectionStatus(targetSection);
        if (derivedStatus && reconciled.status !== derivedStatus) {
          reconciled.status = derivedStatus;
          if (derivedStatus === 'done' && !reconciled.completedAt) {
            reconciled.completedAt = new Date();
          } else if (derivedStatus !== 'done') {
            reconciled.completedAt = undefined;
          }
        }
      }
    }

    return reconciled;
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
   * Get all tasks globally (for Admin view)
   */
  getAllTasks(): Observable<Task[]> {
    const q = query(this.tasksCollection, orderBy('createdAt', 'desc'));
    return runInInjectionContext(this.injector, () => {
      return collectionData(q, { idField: 'id' }) as Observable<Task[]>;
    });
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
   * Get subtasks for a specific parent task
   */
  getSubtasks(parentId: string): Observable<Task[]> {
    const q = query(
      this.tasksCollection,
      where('parentId', '==', parentId),
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

      // Reconcile derived fields for the new task
      const reconciled = await this.reconcileNewTaskFields(task);

      // Strip undefined values - Firestore does not accept undefined as a field value
      const data = this.stripUndefined({
        ...reconciled,
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
          console.warn('Google Tasks sync failed, task was created locally:', err);
          // Don't rollback or throw — Google Tasks sync is optional
        }
      }

      // Auto-add assignees to project members
      if (task.assigneeIds?.length) {
        for (const uid of task.assigneeIds) {
          void this.autoAddMember(task.projectId, uid);
        }
      } else if (task.assignedToId) {
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
      // Fetch task before update to use for reconciliation
      const taskDoc = await this.getTask(id);

      // Reconcile derived fields (sectionId, completedAt, etc.)
      const reconciled = await this.reconcileTaskFields(id, data, taskDoc);

      const taskRef = doc(this.firestore, `tasks/${id}`);
      // Strip undefined values - Firestore does not accept undefined as a field value
      await updateDoc(
        taskRef,
        this.stripUndefined({
          ...reconciled,
          updatedAt: new Date(),
        }),
      );

      // Auto-add assignees to project members
      if (reconciled.assigneeIds?.length && taskDoc) {
        for (const uid of reconciled.assigneeIds) {
          void this.autoAddMember(taskDoc.projectId, uid);
        }
      } else if (reconciled.assignedToId && taskDoc) {
        void this.autoAddMember(taskDoc.projectId, reconciled.assignedToId);
      }

      // Optional Google Tasks sync — never blocks the update
      if (taskDoc?.googleTaskId) {
        const project = await this.projectService.getProject(taskDoc.projectId);
        if (project?.googleTaskListId) {
          try {
            const googleTaskData = this.googleTasksSyncService.transformToGoogleTask(reconciled);
            await firstValueFrom(
              this.googleTasksService.updateTask(
                project.googleTaskListId,
                taskDoc.googleTaskId,
                googleTaskData,
              ),
            );
          } catch (err) {
            console.warn('Google Tasks sync failed, task was updated locally:', err);
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
   * Delete a task and all of its subtasks using batch deletion.
   * Uses BFS with a visited-set to prevent infinite loops from parentId cycles.
   */
  async deleteTask(id: string, googleTaskListId?: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Collect all descendant task IDs using BFS with cycle guard
      const toDelete: Task[] = [];
      const visited = new Set<string>();
      const queue = [id];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const taskDoc = await this.getTask(currentId);
        if (!taskDoc) continue;
        toDelete.push(taskDoc);

        // Find children of this task
        const subtasksQ = query(this.tasksCollection, where('parentId', '==', currentId));
        const snap = await firstValueFrom(collectionData(subtasksQ, { idField: 'id' }));
        for (const subtask of snap as Task[]) {
          if (!visited.has(subtask.id)) {
            queue.push(subtask.id);
          }
        }
      }

      // Best-effort Google Tasks cleanup for each linked task
      for (const task of toDelete) {
        if (task.googleTaskId && task.googleTaskListId) {
          try {
            await this.googleTasksSyncService.deleteTaskInGoogle(
              task.googleTaskListId,
              task.googleTaskId,
            );
          } catch (err) {
            console.warn('Google Tasks sync failed for task', task.id, err);
          }
        }
      }

      // Batch-delete all collected tasks atomically
      const batch = writeBatch(this.firestore);
      for (const task of toDelete) {
        batch.delete(doc(this.firestore, `tasks/${task.id}`));
      }
      await batch.commit();
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
   * Reconciliation layer handles sectionId and completedAt automatically.
   */
  async completeTask(id: string, googleTaskListId?: string): Promise<void> {
    return this.updateTask(id, { status: 'done' }, googleTaskListId);
  }

  /**
   * Reopen a completed task.
   * Reconciliation layer handles sectionId and completedAt automatically.
   */
  async reopenTask(id: string, googleTaskListId?: string): Promise<void> {
    return this.updateTask(id, { status: 'todo' }, googleTaskListId);
  }

  /**
   * Reorder tasks (after drag-and-drop).
   * Updates order, sectionId, and derives status/completedAt via section mapping.
   * Extensible: any additional fields on the update objects are persisted.
   */
  async reorderTasks(
    tasks: {
      id: string;
      order: number;
      sectionId?: string;
      status?: Task['status'];
      currentStatus?: Task['status'];
    }[],
  ): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const batch = writeBatch(this.firestore);

      // Statuses are now preferably resolved by the caller and passed via `status` and `currentStatus`.
      // The component calling this (e.g. TaskBoardViewComponent) already has project sections and tasks in memory.

      for (const task of tasks) {
        const taskRef = doc(this.firestore, `tasks/${task.id}`);
        const updateData: Record<string, unknown> = {
          order: task.order,
          updatedAt: new Date(),
        };

        if (task.sectionId !== undefined) {
          updateData['sectionId'] = task.sectionId;
        }

        // Derive status from section if not explicitly provided (legacy fallback)
        if (
          task.sectionId !== undefined &&
          task.status === undefined &&
          task.currentStatus === undefined
        ) {
          const sampleTask = await this.getTask(task.id);
          if (sampleTask?.projectId) {
            const project = await this.projectService.getProject(sampleTask.projectId);
            const targetSection = project?.sections?.find((s) => s.id === task.sectionId);
            if (targetSection) {
              const derivedStatus = this.getSectionStatus(targetSection);
              if (derivedStatus) {
                updateData['status'] = derivedStatus;
                if (sampleTask.status !== derivedStatus) {
                  updateData['completedAt'] = derivedStatus === 'done' ? new Date() : null;
                }
              }
            }
          }
        }

        if (task.status !== undefined) {
          updateData['status'] = task.status;

          if (task.currentStatus !== undefined) {
            if (task.status !== task.currentStatus) {
              updateData['completedAt'] = task.status === 'done' ? new Date() : null;
            }
          } else if (task.sectionId === undefined) {
            // fallback
            updateData['completedAt'] = task.status === 'done' ? new Date() : null;
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
