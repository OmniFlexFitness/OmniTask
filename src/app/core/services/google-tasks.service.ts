import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface GoogleTaskList {
  id: string;
  title: string;
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
}

@Injectable({
  providedIn: 'root'
})
export class GoogleTasksService {
  private http = inject(HttpClient);
  private readonly API_BASE_URL = 'https://tasks.googleapis.com/tasks/v1';

  // TODO: Implement authentication with Google

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

  createTask(taskListId: string, task: GoogleTask): Observable<GoogleTask> {
    return this.http.post<GoogleTask>(`${this.API_BASE_URL}/lists/${taskListId}/tasks`, task);
  }

  updateTask(taskListId: string, taskId: string, task: GoogleTask): Observable<GoogleTask> {
    return this.http.put<GoogleTask>(`${this.API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`, task);
  }

  deleteTask(taskListId: string, taskId: string): Observable<any> {
    return this.http.delete(`${this.API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`);
  }
}
