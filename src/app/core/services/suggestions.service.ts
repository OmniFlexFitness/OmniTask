import { Injectable, inject } from '@angular/core';
import { ProjectService } from './project.service';
import { TaskService } from './task.service'; // Assuming TaskService allows querying tasks
import { Tag } from '../models/domain.model';
import { Observable, map, take } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SuggestionsService {
  private projectService = inject(ProjectService);
  private taskService = inject(TaskService);

  /**
   * Get all tags from all user projects
   */
  getAllTags(): Observable<Tag[]> {
    return this.projectService.getAllTags();
  }

  /**
   * Get recently used tags (simplified for now to just return all tags)
   */
  getRecentTags(): Observable<Tag[]> {
    return this.getAllTags().pipe(take(1));
  }
}
