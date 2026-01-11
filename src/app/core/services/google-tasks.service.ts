import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Task } from '../models/domain.model';
import { Timestamp } from '@angular/fire/firestore';

export interface GoogleTaskList {
  id: string;
  title: string;
}

/**
 * Google Tasks API task structure
 * https://developers.google.com/workspace/tasks/reference/rest/v1/tasks#Task
 */
export interface GoogleTask {
  id?: string;
  title: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  due?: string; // RFC3339 timestamp
  completed?: string; // RFC3339 timestamp
  updated?: string;
  deleted?: boolean;
  hidden?: boolean;
  position?: string;
  parent?: string;
  links?: Array<{
    type: string;
    description: string;
    link: string;
  }>;
  etag?: string;
}

/**
 * Partial Google Task for update operations
 */
export interface GoogleTaskUpdate {
  title?: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  due?: string;
  completed?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GoogleTasksService {
  private http = inject(HttpClient);
  private readonly API_BASE_URL = 'https://tasks.googleapis.com/tasks/v1';

  // TODO: Implement authentication with Google

  /**
   * Convert local Task model to Google Task API format
   */
  private toGoogleTask(task: Partial<Task>): GoogleTaskUpdate {
    const googleTask: GoogleTaskUpdate = {};
    
    if (task.title !== undefined) {
      googleTask.title = task.title;
    }
    
    if (task.description !== undefined) {
      googleTask.notes = task.description;
    }
    
    if (task.status !== undefined) {
      // Google Tasks API only supports 'needsAction' and 'completed'
      // Map 'in-progress' to 'needsAction' since it's not complete yet
      googleTask.status = task.status === 'done' ? 'completed' : 'needsAction';
    }
    
    if (task.dueDate !== undefined) {
      // Convert Firestore Timestamp or Date to RFC3339 format
      let date: Date;
      if (task.dueDate instanceof Date) {
        date = task.dueDate;
      } else if (task.dueDate instanceof Timestamp) {
        date = task.dueDate.toDate();
      } else {
        // Fallback: assume it's already a Date-like object or can be converted
        date = new Date(task.dueDate as any);
      }
      googleTask.due = date.toISOString();
    }
    
    if (task.completedAt !== undefined) {
      let date: Date;
      if (task.completedAt instanceof Date) {
        date = task.completedAt;
      } else if (task.completedAt instanceof Timestamp) {
        date = task.completedAt.toDate();
      } else {
        // Fallback: assume it's already a Date-like object or can be converted
        date = new Date(task.completedAt as any);
      }
      googleTask.completed = date.toISOString();
    }
    
    return googleTask;
  }

  /**
   * Convert Google Task API format to local Task model
   */
  private fromGoogleTask(googleTask: GoogleTask, projectId: string): Partial<Task> {
    const task: Partial<Task> = {
      googleTaskId: googleTask.id,
      isGoogleTask: true,
      projectId
    };
    
    if (googleTask.title !== undefined) {
      task.title = googleTask.title;
    }
    
    if (googleTask.notes !== undefined) {
      task.description = googleTask.notes;
    }
    
    if (googleTask.status !== undefined) {
      // Google Tasks API only has 'needsAction' and 'completed'
      // We map to 'todo' and 'done' - 'in-progress' status is lost in round-trip
      task.status = googleTask.status === 'completed' ? 'done' : 'todo';
    }
    
    if (googleTask.due !== undefined) {
      task.dueDate = new Date(googleTask.due);
    }
    
    if (googleTask.completed !== undefined) {
      task.completedAt = new Date(googleTask.completed);
    }
    
    if (googleTask.updated !== undefined) {
      task.updatedAt = new Date(googleTask.updated);
    }
    
    return task;
  }

  getTaskLists(): Observable<any> {
    return this.http.get(`${this.API_BASE_URL}/users/@me/lists`);
  }

  createTaskList(title: string): Observable<GoogleTaskList> {
    return this.http.post<GoogleTaskList>(`${this.API_BASE_URL}/users/@me/lists`, { title });
  }

  deleteTaskList(taskListId: string): Observable<any> {
    return this.http.delete(`${this.API_BASE_URL}/users/@me/lists/${taskListId}`);
  }

  getTasks(taskListId: string): Observable<any> {
    return this.http.get(`${this.API_BASE_URL}/lists/${taskListId}/tasks`);
  }

  createTask(taskListId: string, title: string): Observable<GoogleTask> {
    return this.http.post<GoogleTask>(`${this.API_BASE_URL}/lists/${taskListId}/tasks`, { title });
  }

  updateTask(taskListId: string, taskId: string, task: Partial<Task>): Observable<GoogleTask> {
    const googleTaskUpdate = this.toGoogleTask(task);
    return this.http.put<GoogleTask>(`${this.API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`, googleTaskUpdate);
  }

  deleteTask(taskListId: string, taskId: string): Observable<any> {
    return this.http.delete(`${this.API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`);
  }
}
