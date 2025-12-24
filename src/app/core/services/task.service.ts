import { Injectable, inject } from '@angular/core';
import { Firestore, collection, addDoc, doc, updateDoc, deleteDoc, query, where, collectionData, orderBy } from '@angular/fire/firestore';
import { Task } from '../models/domain.model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private firestore = inject(Firestore);
  private tasksCollection = collection(this.firestore, 'tasks');

  getTasksByProject(projectId: string): Observable<Task[]> {
    const q = query(
        this.tasksCollection, 
        where('projectId', '==', projectId),
        orderBy('createdAt', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Task[]>;
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) {
    const data = {
        ...task,
        createdAt: new Date(),
        updatedAt: new Date()
    };
    return addDoc(this.tasksCollection, data);
  }

  async updateTask(id: string, data: Partial<Task>) {
    return updateDoc(doc(this.firestore, `tasks/${id}`), {
        ...data,
        updatedAt: new Date()
    });
  }
}
