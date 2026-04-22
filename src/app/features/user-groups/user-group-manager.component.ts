import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, debounceTime, switchMap } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { ContactsService } from '../../core/services/contacts.service';
import { DialogService } from '../../core/services/dialog.service';
import { UserGroupService } from '../../core/services/user-group.service';
import { Contact } from '../../core/models/contact.model';
import { UserGroup, UserGroupMember } from '../../core/models/user-group.model';

const PALETTE = [
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

/**
 * CRUD UI for {@link UserGroup} documents. Drops into any container — used
 * by Settings (for personal groups) and the admin dashboard (for shared org
 * groups). Members are picked from the ContactsService so the same pool of
 * users is available as elsewhere in the app.
 */
@Component({
  selector: 'app-user-group-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './user-group-manager.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserGroupManagerComponent {
  private readonly groupService = inject(UserGroupService);
  private readonly contactsService = inject(ContactsService);
  private readonly dialogService = inject(DialogService);
  private readonly auth = inject(AuthService);

  palette = PALETTE;

  groups = toSignal(this.groupService.getMyGroups(), { initialValue: [] });

  editingId = signal<string | null>(null);
  showCreate = signal(false);

  // Create form state
  newName = signal('');
  newDescription = signal('');
  newColor = signal(PALETTE[0]);
  newShared = signal(true);
  newMembers = signal<UserGroupMember[]>([]);
  saving = signal(false);

  // Search for member picker (shared between create & edit)
  searchControl = new FormControl('');
  private searchSubject = new BehaviorSubject<string>('');
  showSearchResults = signal(false);

  searchResults = toSignal(
    this.searchSubject.pipe(
      debounceTime(200),
      switchMap((q) => this.contactsService.searchContacts(q || '')),
    ),
    { initialValue: [] as Contact[] },
  );

  constructor() {
    this.searchControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.searchSubject.next(v || ''));
  }

  currentUid = computed(() => this.auth.currentUserSig()?.uid || '');

  canEdit(group: UserGroup): boolean {
    const uid = this.currentUid();
    if (!uid) return false;
    if (group.ownerId === uid) return true;
    const perms = this.auth.currentUserSig()?.permissions;
    return !!perms?.isSuperAdmin;
  }

  // ---- Create flow ----

  openCreate(): void {
    this.newName.set('');
    this.newDescription.set('');
    this.newColor.set(this.randomColor());
    this.newShared.set(true);
    this.newMembers.set([]);
    this.editingId.set(null);
    this.showCreate.set(true);
  }

  cancelCreate(): void {
    this.showCreate.set(false);
    this.searchControl.setValue('');
  }

  async saveNewGroup(): Promise<void> {
    const name = this.newName().trim();
    if (!name) {
      await this.dialogService.alert('Group name is required.', 'Missing name');
      return;
    }
    this.saving.set(true);
    try {
      await this.groupService.createGroup(name, this.newMembers(), {
        description: this.newDescription(),
        color: this.newColor(),
        shared: this.newShared(),
      });
      this.showCreate.set(false);
    } catch (err) {
      console.error('Failed to create group', err);
      await this.dialogService.alert(
        'Failed to create group. Please try again.',
        'Error',
      );
    } finally {
      this.saving.set(false);
    }
  }

  addMemberToNew(contact: Contact): void {
    const member = this.contactToMember(contact);
    const current = this.newMembers();
    if (current.some((m) => m.id === member.id)) return;
    this.newMembers.set([...current, member]);
    this.searchControl.setValue('');
  }

  removeMemberFromNew(id: string): void {
    this.newMembers.update((list) => list.filter((m) => m.id !== id));
  }

  // ---- Edit flow (inline per-group) ----

  startEdit(group: UserGroup): void {
    if (!this.canEdit(group)) return;
    this.editingId.set(group.id);
    this.showCreate.set(false);
    this.searchControl.setValue('');
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.searchControl.setValue('');
  }

  async addMemberToGroup(group: UserGroup, contact: Contact): Promise<void> {
    if (!this.canEdit(group)) return;
    const member = this.contactToMember(contact);
    try {
      await this.groupService.addMember(group.id, member);
      this.searchControl.setValue('');
    } catch (err) {
      console.error('Failed to add member to group', err);
    }
  }

  async removeMemberFromGroup(group: UserGroup, memberId: string): Promise<void> {
    if (!this.canEdit(group)) return;
    try {
      await this.groupService.removeMember(group.id, memberId);
    } catch (err) {
      console.error('Failed to remove member from group', err);
    }
  }

  async renameGroup(group: UserGroup, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed || trimmed === group.name) return;
    await this.groupService.updateGroup(group.id, { name: trimmed });
  }

  async updateGroupDescription(group: UserGroup, description: string): Promise<void> {
    if ((description || '') === (group.description || '')) return;
    await this.groupService.updateGroup(group.id, { description });
  }

  async updateGroupColor(group: UserGroup, color: string): Promise<void> {
    if (color === group.color) return;
    await this.groupService.updateGroup(group.id, { color });
  }

  async toggleShared(group: UserGroup): Promise<void> {
    await this.groupService.updateGroup(group.id, { shared: !group.shared });
  }

  async deleteGroup(group: UserGroup): Promise<void> {
    if (!this.canEdit(group)) return;
    const ok = await this.dialogService.confirm(
      `Delete group "${group.name}"? This cannot be undone.`,
      'Delete group',
    );
    if (!ok) return;
    try {
      await this.groupService.deleteGroup(group.id);
      if (this.editingId() === group.id) this.editingId.set(null);
    } catch (err) {
      console.error('Failed to delete group', err);
    }
  }

  // ---- Helpers ----

  private contactToMember(contact: Contact): UserGroupMember {
    return {
      id: contact.id,
      email: contact.email,
      displayName: contact.displayName || contact.email,
      photoURL: contact.photoURL,
    };
  }

  private randomColor(): string {
    return PALETTE[Math.floor(Math.random() * PALETTE.length)];
  }

  getInitials(name: string, email = ''): string {
    const base = name || email || '?';
    return base
      .split(/\s+|@/)
      .map((part) => part.charAt(0).toUpperCase())
      .filter(Boolean)
      .slice(0, 2)
      .join('');
  }

  avatarColor(seed: string): string {
    const key = seed || '';
    const hash = key.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return PALETTE[hash % PALETTE.length];
  }

  trackById(_i: number, g: UserGroup) {
    return g.id;
  }

  trackMember(_i: number, m: UserGroupMember) {
    return m.id;
  }
}
