import { Component, input, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { ContactsService } from '../../../core/services/contacts.service';
import { Contact } from '../../../core/models/contact.model';
import { DialogService } from '../../../core/services/dialog.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PermissionsService } from '../../../core/services/permissions.service';
import { Project, getProjectRole, isProjectManager } from '../../../core/models/domain.model';
import { UserGroupMember } from '../../../core/models/user-group.model';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, switchMap, startWith } from 'rxjs';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { GroupPickerComponent } from '../../../shared/components/group-picker/group-picker.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-member-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, GroupPickerComponent],
  templateUrl: './project-member-manager.component.html',
})
export class ProjectMemberManagerComponent {
  project = input.required<Project>();

  projectService = inject(ProjectService);
  contactsService = inject(ContactsService);
  dialogService = inject(DialogService);
  private auth = inject(AuthService);
  private permissions = inject(PermissionsService);

  applyingGroup = signal(false);

  // Search Control
  searchControl = new FormControl('');
  showResults = signal(false);

  // Contacts Data (All users map)
  allContacts = toSignal(this.contactsService.getContacts(), { initialValue: [] });

  // Filtered Search Results
  searchResults = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      switchMap((term) => this.contactsService.searchContacts(term || '')),
    ),
    { initialValue: [] },
  );

  /** UID of the signed-in user. */
  private readonly currentUserId = computed(() => this.auth.currentUserSig()?.uid ?? null);

  /** Global super-admins manage every project regardless of project role. */
  private readonly isGlobalAdmin = computed(() => this.permissions.currentPermissions().isSuperAdmin);

  /** The signed-in user's role in this project ('owner' | 'admin' | 'member' | null). */
  readonly myRole = computed(() => getProjectRole(this.project(), this.currentUserId()));

  /** Owner-only capabilities: appoint/remove admins, transfer ownership, etc. */
  readonly isOwner = computed(() => this.myRole() === 'owner' || this.isGlobalAdmin());

  /** Manager capabilities: add/remove members and appear in admin controls. */
  readonly canManageMembers = computed(
    () => isProjectManager(this.project(), this.currentUserId()) || this.isGlobalAdmin(),
  );

  // Owner contact (project creator / current owner).
  owner = computed(() => {
    const p = this.project();
    return this.allContacts().filter((c) => c.id === p.ownerId);
  });

  // Project admins (granted elevated rights) — excludes the owner.
  admins = computed(() => {
    const p = this.project();
    const adminIds = new Set(p.adminIds ?? []);
    return this.allContacts().filter((c) => c.id !== p.ownerId && adminIds.has(c.id));
  });

  // Plain members: in memberIds but neither owner nor admin.
  members = computed(() => {
    const p = this.project();
    const adminIds = new Set(p.adminIds ?? []);
    return this.allContacts().filter(
      (c) => p.memberIds.includes(c.id) && c.id !== p.ownerId && !adminIds.has(c.id),
    );
  });

  isMember(userId: string): boolean {
    return this.project().memberIds.includes(userId);
  }

  async addMember(user: Contact) {
    this.searchControl.setValue('');
    this.showResults.set(false);

    try {
      await this.projectService.addMember(this.project().id, user.id);
    } catch (err) {
      console.error('Failed to add member', err);
      await this.dialogService.alert(this.friendlyError(err), 'Could not add member');
    }
  }

  /**
   * Apply a user group: add every member of the group to the project's
   * memberIds. Already-present members are skipped. We batch the update so
   * applying a large group doesn't produce N separate writes.
   */
  async applyGroup(members: UserGroupMember[]) {
    if (!members?.length || this.applyingGroup()) return;
    this.applyingGroup.set(true);
    try {
      const project = this.project();
      const existing = new Set(project.memberIds || []);
      const toAdd = members.map((m) => m.id).filter((id) => id && !existing.has(id));
      if (toAdd.length === 0) return;
      const newMemberIds = [...(project.memberIds || []), ...toAdd];
      await this.projectService.updateProject(project.id, { memberIds: newMemberIds });
    } catch (err) {
      console.error('Failed to apply group to project', err);
      await this.dialogService.alert(
        'Failed to apply group to project. Please try again.',
        'Error',
      );
    } finally {
      this.applyingGroup.set(false);
    }
  }

  async removeMember(userId: string) {
    if (
      !(await this.dialogService.confirm(
        'Are you sure you want to remove this member from the project?',
        'Remove Member',
      ))
    )
      return;

    try {
      await this.projectService.removeMember(this.project().id, userId);
    } catch (err) {
      console.error('Failed to remove member', err);
      await this.dialogService.alert(this.friendlyError(err), 'Could not remove member');
    }
  }

  /** Grant a member project-admin rights (owner only). */
  async makeAdmin(member: Contact) {
    if (
      !(await this.dialogService.confirm(
        `Give ${member.displayName || member.email} admin rights on this project? ` +
          `They will be able to manage members and edit project settings.`,
        'Make Project Admin',
      ))
    )
      return;
    try {
      await this.projectService.setProjectAdmin(this.project().id, member.id, true);
    } catch (err) {
      console.error('Failed to grant project admin', err);
      await this.dialogService.alert(this.friendlyError(err), 'Could not update role');
    }
  }

  /** Revoke a member's project-admin rights (owner only). */
  async removeAdmin(member: Contact) {
    if (
      !(await this.dialogService.confirm(
        `Remove ${member.displayName || member.email}'s admin rights? ` +
          `They will remain a project member.`,
        'Remove Admin Rights',
      ))
    )
      return;
    try {
      await this.projectService.setProjectAdmin(this.project().id, member.id, false);
    } catch (err) {
      console.error('Failed to revoke project admin', err);
      await this.dialogService.alert(this.friendlyError(err), 'Could not update role');
    }
  }

  /** Transfer project ownership to another member (owner only). */
  async makeOwner(member: Contact) {
    if (
      !(await this.dialogService.confirm(
        `Transfer ownership of this project to ${member.displayName || member.email}? ` +
          `You will become a project admin and lose owner-only rights ` +
          `(deleting the project and transferring ownership).`,
        'Transfer Ownership',
      ))
    )
      return;
    try {
      await this.projectService.transferOwnership(this.project().id, member.id);
    } catch (err) {
      console.error('Failed to transfer ownership', err);
      await this.dialogService.alert(this.friendlyError(err), 'Could not transfer ownership');
    }
  }

  /** Surface a friendly message for permission-denied and known errors. */
  private friendlyError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    if (/permission|insufficient|PERMISSION_DENIED/i.test(message)) {
      return 'You do not have permission to perform this action on this project.';
    }
    return message || 'Something went wrong. Please try again.';
  }

  /**
   * Generate a consistent color for avatars based on email
   */
  getAvatarColor(email: string): string {
    const colors = [
      '#8b5cf6',
      '#3b82f6',
      '#06b6d4',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#ec4899',
      '#6366f1',
      '#14b8a6',
      '#f97316',
    ];
    const hash = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  /**
   * Get initials from display name
   */
  getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
  }
}
