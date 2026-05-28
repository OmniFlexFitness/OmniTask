import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  addDoc,
  query,
  orderBy,
  doc,
  deleteDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { TaskComment } from '../models/collaboration.model';
import { AuthService } from '../auth/auth.service';
import { ActivityService } from './activity.service';

@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly activityService = inject(ActivityService);
  private readonly injector = inject(Injector);

  watchComments(taskId: string): Observable<TaskComment[]> {
    const q = query(
      collection(this.firestore, `tasks/${taskId}/comments`),
      orderBy('createdAt', 'asc'),
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' }),
    ) as Observable<TaskComment[]>;
  }

  async addComment(taskId: string, body: string): Promise<void> {
    const user = this.auth.currentUserSig();
    if (!user) throw new Error('Must be signed in to comment');
    const trimmed = body.trim();
    if (!trimmed) return;

    await addDoc(collection(this.firestore, `tasks/${taskId}/comments`), {
      taskId,
      authorId: user.uid,
      authorName: user.displayName || user.email,
      body: trimmed,
      createdAt: new Date(),
    });
    void this.activityService.logCommentAdded(taskId);
  }

  async deleteComment(taskId: string, commentId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `tasks/${taskId}/comments/${commentId}`));
  }
}
