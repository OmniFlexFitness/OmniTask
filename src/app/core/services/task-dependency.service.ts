import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, writeBatch } from '@angular/fire/firestore';
import { TaskService } from './task.service';
import { Task } from '../models/domain.model';

/** Maximum number of hops allowed in cycle detection to avoid excessive reads */
const MAX_CYCLE_DETECTION_DEPTH = 50;

@Injectable({
  providedIn: 'root',
})
export class TaskDependencyService {
  private taskService = inject(TaskService);
  private firestore = inject(Firestore);

  /**
   * Adds a dependency where blockerId blocks blockedId.
   * Uses a writeBatch for atomic update of both tasks.
   * Includes cycle detection before applying.
   */
  async addDependency(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new Error('A task cannot block itself.');
    }

    // 1. Cycle detection: if blockedId eventually blocks blockerId, we have a cycle.
    const hasCycle = await this.detectCycle(blockedId, blockerId);
    if (hasCycle) {
      throw new Error('Adding this dependency would create a cycle.');
    }

    const blockerTask = await this.taskService.getTask(blockerId);
    const blockedTask = await this.taskService.getTask(blockedId);

    if (!blockerTask || !blockedTask) {
      throw new Error('One or both tasks do not exist.');
    }

    const newBlockingIds = Array.from(new Set([...(blockerTask.blockingIds || []), blockedId]));
    const newBlockedByIds = Array.from(new Set([...(blockedTask.blockedByIds || []), blockerId]));

    // Atomic update of both tasks using writeBatch
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, `tasks/${blockerId}`), {
      blockingIds: newBlockingIds,
      updatedAt: new Date(),
    });
    batch.update(doc(this.firestore, `tasks/${blockedId}`), {
      blockedByIds: newBlockedByIds,
      updatedAt: new Date(),
    });
    await batch.commit();
  }

  /**
   * Removes a dependency where blockerId blocked blockedId.
   * Uses a writeBatch for atomic update of both tasks.
   */
  async removeDependency(blockerId: string, blockedId: string): Promise<void> {
    const blockerTask = await this.taskService.getTask(blockerId);
    const blockedTask = await this.taskService.getTask(blockedId);

    const batch = writeBatch(this.firestore);
    let hasUpdates = false;

    if (blockerTask) {
      const newBlockingIds = (blockerTask.blockingIds || []).filter((id) => id !== blockedId);
      batch.update(doc(this.firestore, `tasks/${blockerId}`), {
        blockingIds: newBlockingIds,
        updatedAt: new Date(),
      });
      hasUpdates = true;
    }

    if (blockedTask) {
      const newBlockedByIds = (blockedTask.blockedByIds || []).filter((id) => id !== blockerId);
      batch.update(doc(this.firestore, `tasks/${blockedId}`), {
        blockedByIds: newBlockedByIds,
        updatedAt: new Date(),
      });
      hasUpdates = true;
    }

    if (hasUpdates) {
      await batch.commit();
    }
  }

  /**
   * Checks if starting from `startId` and walking down `blockingIds`, we can reach `targetId`.
   * Limited to MAX_CYCLE_DETECTION_DEPTH hops to prevent excessive sequential reads.
   */
  private async detectCycle(startId: string, targetId: string): Promise<boolean> {
    const visited = new Set<string>();
    const queue = [startId];
    let depth = 0;

    while (queue.length > 0 && depth < MAX_CYCLE_DETECTION_DEPTH) {
      const currentId = queue.shift()!;
      if (currentId === targetId) return true;

      if (!visited.has(currentId)) {
        visited.add(currentId);
        depth++;
        const task = await this.taskService.getTask(currentId);
        if (task && task.blockingIds) {
          queue.push(...task.blockingIds);
        }
      }
    }

    return false;
  }
}
