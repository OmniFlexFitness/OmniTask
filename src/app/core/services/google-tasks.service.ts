import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string; // RFC 3339 timestamp of last update
}

export interface GoogleTaskListsResponse {
  items: GoogleTaskList[];
  nextPageToken?: string;
}

/**
 * Google Tasks API task representation
 * Based on https://developers.google.com/tasks/reference/rest/v1/tasks
 */
export interface GoogleTask {
  id?: string;
  title?: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  due?: string; // RFC 3339 timestamp
  completed?: string; // RFC 3339 timestamp
  updated?: string; // RFC 3339 timestamp of last modification
}

/**
 * Google Tasks API response for listing tasks
 */
export interface GoogleTasksResponse {
  items: GoogleTask[];
  nextPageToken?: string;
}

@Injectable({
  providedIn: 'root',
})
export class GoogleTasksService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly API_BASE_URL = 'https://tasks.googleapis.com/tasks/v1';

  // Authentication state - computed from auth service token
  isAuthenticated = computed(() => !!this.authService.googleTasksAccessToken());

  /**
   * Get HTTP headers with OAuth access token
   */
  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.googleTasksAccessToken();
    if (!token) {
      throw new Error('Google Tasks not authenticated. Please sign in again.');
    }
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  /**
   * Get all task lists for the authenticated user
   */
  getTaskLists(): Observable<GoogleTaskListsResponse> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Tasks not authenticated'));
    }
    return this.http.get<GoogleTaskListsResponse>(`${this.API_BASE_URL}/users/@me/lists`, {
      headers: this.getAuthHeaders(),
    });
  }

  /**
   * Create a new task list
   */
  createTaskList(title: string): Observable<GoogleTaskList> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Tasks not authenticated'));
    }
    return this.http.post<GoogleTaskList>(
      `${this.API_BASE_URL}/users/@me/lists`,
      { title },
      { headers: this.getAuthHeaders() },
    );
  }

  /**
   * Delete a task list
   */
  deleteTaskList(taskListId: string): Observable<void> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Tasks not authenticated'));
    }
    return this.http.delete<void>(`${this.API_BASE_URL}/users/@me/lists/${taskListId}`, {
      headers: this.getAuthHeaders(),
    });
  }

  /**
   * Get all tasks in a task list
   * @param showCompleted Include completed tasks (default: true)
   * @param updatedMin Only return tasks modified after this timestamp (for sync)
   */
  getTasks(
    taskListId: string,
    showCompleted = true,
    updatedMin?: string,
  ): Observable<GoogleTasksResponse> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Tasks not authenticated'));
    }
    let url = `${this.API_BASE_URL}/lists/${taskListId}/tasks?showCompleted=${showCompleted}&showHidden=true`;
    if (updatedMin) {
      url += `&updatedMin=${encodeURIComponent(updatedMin)}`;
    }
    return this.http.get<GoogleTasksResponse>(url, {
      headers: this.getAuthHeaders(),
    });
  }

  /**
   * Create a task in a task list
   */
  createTask(taskListId: string, task: GoogleTask): Observable<GoogleTask> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Tasks not authenticated'));
    }
    return this.http.post<GoogleTask>(`${this.API_BASE_URL}/lists/${taskListId}/tasks`, task, {
      headers: this.getAuthHeaders(),
    });
  }

  /**
   * Update a task
   * Note: Google Tasks API requires PATCH for partial updates
   * The task ID must be included in the request body
   */
  updateTask(taskListId: string, taskId: string, task: GoogleTask): Observable<GoogleTask> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Tasks not authenticated'));
    }
    // Include the task ID in the body as required by the API
    const taskWithId = { ...task, id: taskId };
    return this.http.patch<GoogleTask>(
      `${this.API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`,
      taskWithId,
      { headers: this.getAuthHeaders() },
    );
  }

  /**
   * Delete a task
   */
  deleteTask(taskListId: string, taskId: string): Observable<void> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Tasks not authenticated'));
    }
    return this.http.delete<void>(`${this.API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`, {
      headers: this.getAuthHeaders(),
    });
  }
}
