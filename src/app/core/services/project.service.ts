import { Injectable, inject } from '@angular/core';
import { Firestore, collection, addDoc, doc, updateDoc, deleteDoc, query, where, collectionData } from '@angular/fire/firestore';
import { Project } from '../models/domain.model';
import { AuthService } from '../auth/auth.service';
import { Observable, switchMap, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  
  private projectsCollection = collection(this.firestore, 'projects');

  getMyProjects(): Observable<Project[]> {
    return this.auth.user$.pipe(
      switchMap(user => {
        if (!user) return of([]);
        // Query projects where user is owner or member
        // Firestore "array-contains" limitation allows only one array check. 
        // We'll check memberIds which should include owner.
        const q = query(this.projectsCollection, where('memberIds', 'array-contains', user.uid));
        return collectionData(q, { idField: 'id' }) as Observable<Project[]>;
      })
    );
  }

  async createProject(name: string, description: string) {
    const user = this.auth.currentUserSig();
    if (!user) throw new Error('Not authenticated');

    const project: Omit<Project, 'id'> = {
      name,
      description,
      ownerId: user.uid,
      memberIds: [user.uid],
      createdAt: new Date() as any, // Firestore converts JS Date to Timestamp on write
      status: 'active'
    };

    return addDoc(this.projectsCollection, project);
  }

  async updateProject(id: string, data: Partial<Project>) {
     const docRef = doc(this.firestore, `projects/${id}`);
     return updateDoc(docRef, data);
  }
}
