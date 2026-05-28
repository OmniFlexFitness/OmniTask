import { Component, input, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { CommentService } from '../../../core/services/comment.service';
import { ActivityService } from '../../../core/services/activity.service';
import { AuthService } from '../../../core/auth/auth.service';
import { switchMap } from 'rxjs';

@Component({
  selector: 'app-task-collaboration-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-collaboration-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskCollaborationPanelComponent {
  private readonly commentService = inject(CommentService);
  private readonly activityService = inject(ActivityService);
  private readonly authService = inject(AuthService);

  taskId = input.required<string>();

  newComment = '';
  posting = signal(false);

  comments = toSignal(
    toObservable(this.taskId).pipe(switchMap((id) => this.commentService.watchComments(id))),
    { initialValue: [] },
  );

  activity = toSignal(
    toObservable(this.taskId).pipe(switchMap((id) => this.activityService.watchActivity(id))),
    { initialValue: [] },
  );

  currentUserId = () => this.authService.currentUserSig()?.uid;

  async postComment(): Promise<void> {
    const body = this.newComment.trim();
    if (!body) return;

    this.posting.set(true);
    try {
      await this.commentService.addComment(this.taskId(), body);
      this.newComment = '';
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      this.posting.set(false);
    }
  }

  async removeComment(commentId: string): Promise<void> {
    try {
      await this.commentService.deleteComment(this.taskId(), commentId);
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  }

  formatDate(value: unknown): string {
    if (!value) return '';
    try {
      const anyVal = value as { toDate?: () => Date };
      const d = anyVal?.toDate ? anyVal.toDate() : new Date(value as string);
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
    } catch {
      return '';
    }
  }
}
