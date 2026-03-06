import { Injectable, inject } from '@angular/core';
import { TaskService } from './task.service';
import { Task } from '../models/domain.model';

@Injectable({
  providedIn: 'root',
})
export class TaskDependencyService {
  private taskService = inject(TaskService);

  /**
   * Adds a dependency where blockerId blocks blockedId.
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

    // Update both tasks. They don't have to be in a transaction conceptually
    // for this scale, but firing both updates.
    await Promise.all([
      this.taskService.updateTask(blockerId, { blockingIds: newBlockingIds }),
      this.taskService.updateTask(blockedId, { blockedByIds: newBlockedByIds }),
    ]);
  }

  /**
   * Removes a dependency where blockerId blocked blockedId.
   */
  async removeDependency(blockerId: string, blockedId: string): Promise<void> {
    const blockerTask = await this.taskService.getTask(blockerId);
    const blockedTask = await this.taskService.getTask(blockedId);

    if (blockerTask) {
      const newBlockingIds = (blockerTask.blockingIds || []).filter((id) => id !== blockedId);
      await this.taskService.updateTask(blockerId, { blockingIds: newBlockingIds });
    }

    if (blockedTask) {
      const newBlockedByIds = (blockedTask.blockedByIds || []).filter((id) => id !== blockerId);
      await this.taskService.updateTask(blockedId, { blockedByIds: newBlockedByIds });
    }
  }

  /**
   * Checks if starting from `startId` and walking down `blockingIds`, we can reach `targetId`.
   * Used for cycle detection before adding a new dependency.
   */
  private async detectCycle(startId: string, targetId: string): Promise<boolean> {
    const visited = new Set<string>();
    const queue = [startId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (currentId === targetId) return true;

      if (!visited.has(currentId)) {
        visited.add(currentId);
        const task = await this.taskService.getTask(currentId);
        if (task && task.blockingIds) {
          queue.push(...task.blockingIds);
        }
      }
    }

    return false;
  }
}
