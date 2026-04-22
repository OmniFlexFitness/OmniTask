import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';

import { UserGroupService } from '../../../core/services/user-group.service';
import { UserGroup, UserGroupMember } from '../../../core/models/user-group.model';

/**
 * Button + dropdown for applying a saved {@link UserGroup} to the current
 * context. Consumers receive a flat list of {@link UserGroupMember} via the
 * {@link applyGroup} output — it's up to the parent to decide how to merge
 * those members into their own state (project.memberIds, task.assigneeIds,
 * permission bundles, etc.).
 */
@Component({
  selector: 'app-group-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './group-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupPickerComponent {
  private readonly groupService = inject(UserGroupService);
  private readonly host = inject(ElementRef<HTMLElement>);

  label = input<string>('Apply group');
  compact = input<boolean>(false);

  applyGroup = output<UserGroupMember[]>();

  groups = toSignal(this.groupService.getMyGroups(), { initialValue: [] });

  open = signal(false);

  toggle(): void {
    this.open.update((v) => !v);
  }

  pick(group: UserGroup): void {
    this.open.set(false);
    this.applyGroup.emit([...(group.members || [])]);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  trackById(_i: number, g: UserGroup) {
    return g.id;
  }
}
