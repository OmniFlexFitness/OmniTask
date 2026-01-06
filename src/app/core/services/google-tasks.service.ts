import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Task } from '../models/domain.model';

export interface GoogleTaskList {
  id: string;
  title: string;
}

@Injectable({
  providedIn: 'root'
})
export class GoogleTasksService {
  private http = inject(HttpClient);
  private readonly API_BASE_URL = 'https://tasks.googleapis.com/tasks/v1';

  constructor() { }

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

  createTask(taskListId: string, title: string): Observable<Task> {
    return this.http.post<Task>(`${this.API_BASE_URL}/lists/${taskListId}/tasks`, { title });
  }

  updateTask(taskListId: string, taskId: string, task: Partial<Task>): Observable<Task> {
    return this.http.put<Task>(`${this.API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`, task);
  }

  deleteTask(taskListId: string, taskId: string): Observable<any> {
    return this.http.delete(`${this.API_BASE_URL}/lists/${taskListId}/tasks/${taskId}`);
  }
}
