import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface GoogleTaskList {
  id: string;
  title: string;
}

export interface GoogleTaskListsResponse {
  kind: string;
  etag: string;
  items: GoogleTaskList[];
}

export interface GoogleTasksResponse {
  kind: string;
  etag: string;
  items: GoogleTask[];
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  due?: string; // RFC 3339 timestamp
  completed?: string; // RFC 3339 timestamp
  parent?: string;
  position?: string;
  updated?: string; // RFC 3339 timestamp
  selfLink?: string;
  etag?: string;
  kind?: string;
  links?: Array<{
    type: string;
    description: string;
    link: string;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class GoogleTasksService {
  private http = inject(HttpClient);
  private readonly API_BASE_URL = 'https://tasks.googleapis.com/tasks/v1';

  // Authentication state - tracks whether user has connected Google Tasks
  isAuthenticated = signal(false);

  // TODO: Implement authentication with Google

  getTaskLists(): Observable<GoogleTaskListsResponse> {
    return this.http.get<GoogleTaskListsResponse>(`${this.API_BASE_URL}/users/@me/lists`);
  }

  createTaskList(title: string): Observable<GoogleTaskList> {
    return this.http.post<GoogleTaskList>(`${this.API_BASE_URL}/users/@me/lists`, { title });
  }

  deleteTaskList(taskListId: string): Observable<any> {
    return this.http.delete(`${this.API_BASE_URL}/users/@me/lists/${taskListId}`);
  }

  getTasks(taskListId: string): Observable<GoogleTasksResponse> {
    return this.http.get<GoogleTasksResponse>(`${this.API_BASE_URL}/lists/${taskListId}/tasks`);
  }

  createTask(taskListId: string, title: string): Observable<GoogleTask> {
    return this.http.post<GoogleTask>(`${this.API_BASE_URL}/lists/${taskListId}/tasks`, { title });
  }

  updateTask(taskListId: string, taskId: string, task: Partial<GoogleTask>): Observable<GoogleTask> {
    return this.http.put<GoogleTask>(`${this.API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`, task);
  }

  deleteTask(taskListId: string, taskId: string): Observable<any> {
    return this.http.delete(`${this.API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`);
  }
}
