import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  addDoc,
  query,
  orderBy,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { TaskActivityEntry } from '../models/collaboration.model';
import { AuthService } from '../auth/auth.service';
import { Task } from '../models/domain.model';

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);

  watchActivity(taskId: string): Observable<TaskActivityEntry[]> {
    const q = query(
      collection(this.firestore, `tasks/${taskId}/activity`),
      orderBy('createdAt', 'desc'),
    );
    return runInInjectionContext(this.injector, () =>
      collectionData(q, { idField: 'id' }),
    ) as Observable<TaskActivityEntry[]>;
  }

  async logTaskChanges(taskId: string, before: Task, patch: Partial<Task>): Promise<void> {
    const user = this.auth.currentUserSig();
    if (!user) return;

    const messages: string[] = [];
    for (const key of ['status', 'priority', 'sectionId', 'title'] as const) {
      if (patch[key] === undefined) continue;
      const prev = before[key];
      const next = patch[key];
      if (prev === next) continue;
      messages.push(`changed ${key} from "${String(prev ?? '')}" to "${String(next ?? '')}"`);
    }

    if (messages.length === 0) return;

    await this.appendEntry(taskId, user.uid, user.displayName || user.email || 'User', messages.join('; '));
  }

  async logCommentAdded(taskId: string): Promise<void> {
    const user = this.auth.currentUserSig();
    if (!user) return;

    await this.appendEntry(taskId, user.uid, user.displayName || user.email || 'User', 'added a comment');
  }

  private async appendEntry(
    taskId: string,
    actorId: string,
    actorName: string,
    message: string,
  ): Promise<void> {
    await addDoc(collection(this.firestore, `tasks/${taskId}/activity`), {
      taskId,
      actorId,
      actorName,
      message,
      createdAt: new Date(),
    });
  }
}
