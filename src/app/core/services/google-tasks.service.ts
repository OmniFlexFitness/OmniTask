import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface GoogleTaskList {
  id: string;
  title: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  due?: string;
  completed?: string;
  updated?: string;
}

export interface GoogleTaskUpdate {
  title?: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  due?: string;
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

  getTaskLists(): Observable<any> {
  getTaskLists(): Observable<any> {
    return this.http.get(`${this.API_BASE_URL}/users/@me/lists`);
  }

  createTaskList(title: string): Observable<GoogleTaskList> {
    return this.http.post<GoogleTaskList>(`${this.API_BASE_URL}/users/@me/lists`, { title });
  }

  deleteTaskList(taskListId: string): Observable<any> {
    return this.http.delete(`${this.API_BASE_URL}/users/@me/lists/${taskListId}`);
  }

  getTasks(taskListId: string): Observable<GoogleTask[]> {
    return this.http.get<GoogleTask[]>(`${this.API_BASE_URL}/lists/${taskListId}/tasks`);
  }

  createTask(taskListId: string, title: string): Observable<GoogleTask> {
    return this.http.post<GoogleTask>(`${this.API_BASE_URL}/lists/${taskListId}/tasks`, { title });
  }

  updateTask(taskListId: string, taskId: string, task: GoogleTaskUpdate): Observable<GoogleTask> {
    return this.http.put<GoogleTask>(`${this.API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`, task);
  }

  deleteTask(taskListId: string, taskId: string): Observable<any> {
    return this.http.delete(`${this.API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`);
  }
}
