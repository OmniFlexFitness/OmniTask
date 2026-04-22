import { Injectable, inject, signal, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  or,
  collectionData,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, of, switchMap, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { UserGroup, UserGroupMember } from '../models/user-group.model';

/**
 * CRUD for user groups. Groups are lightweight saved selections that can be
 * applied to anywhere the app accepts a list of assignees (project members,
 * task assignees, and so on).
 */
@Injectable({ providedIn: 'root' })
export class UserGroupService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);

  private readonly groupsCollection = collection(this.firestore, 'userGroups');

  loading = signal(false);
  error = signal<string | null>(null);

  /**
   * Groups visible to the current user: groups they own plus any group
   * marked as shared. Sorted alphabetically.
   */
  getMyGroups(): Observable<UserGroup[]> {
    return this.auth.user$.pipe(
      switchMap((user) => {
        if (!user) return of([] as UserGroup[]);
        const q = query(
          this.groupsCollection,
          or(where('ownerId', '==', user.uid), where('shared', '==', true)),
        );
        return runInInjectionContext(this.injector, () => {
          return collectionData(q, { idField: 'id' }) as Observable<UserGroup[]>;
        });
      }),
      map((groups) => groups.sort((a, b) => a.name.localeCompare(b.name))),
    );
  }

  async getGroup(id: string): Promise<UserGroup | null> {
    try {
      const ref = doc(this.firestore, `userGroups/${id}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return { id: snap.id, ...(snap.data() as Omit<UserGroup, 'id'>) };
    } catch (err) {
      console.error('Failed to fetch group:', err);
      return null;
    }
  }

  async createGroup(
    name: string,
    members: UserGroupMember[] = [],
    options: { description?: string; color?: string; shared?: boolean } = {},
  ): Promise<string> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const user = this.auth.currentUserSig();
      if (!user) throw new Error('Not authenticated');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Group name cannot be empty');

      const dedupedMembers = this.dedupeMembers(members);
      const payload: Omit<UserGroup, 'id'> = {
        name: trimmed,
        description: options.description?.trim() || '',
        color: options.color || '#8b5cf6',
        memberIds: dedupedMembers.map((m) => m.id),
        members: dedupedMembers,
        ownerId: user.uid,
        shared: options.shared ?? true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      const ref = await addDoc(this.groupsCollection, payload);
      return ref.id;
    } catch (err) {
      console.error('Failed to create group:', err);
      this.error.set('Failed to create group. Please try again.');
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  async updateGroup(
    id: string,
    updates: Partial<Pick<UserGroup, 'name' | 'description' | 'color' | 'shared'>>,
  ): Promise<void> {
    const ref = doc(this.firestore, `userGroups/${id}`);
    const payload: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (updates.name !== undefined) payload['name'] = updates.name.trim();
    if (updates.description !== undefined) payload['description'] = updates.description.trim();
    if (updates.color !== undefined) payload['color'] = updates.color;
    if (updates.shared !== undefined) payload['shared'] = updates.shared;
    await updateDoc(ref, payload);
  }

  async deleteGroup(id: string): Promise<void> {
    const ref = doc(this.firestore, `userGroups/${id}`);
    await deleteDoc(ref);
  }

  async addMember(groupId: string, member: UserGroupMember): Promise<void> {
    const group = await this.getGroup(groupId);
    if (!group) throw new Error('Group not found');
    if (group.memberIds.includes(member.id)) return;
    const members = this.dedupeMembers([...(group.members || []), member]);
    await this.writeMembers(groupId, members);
  }

  async removeMember(groupId: string, memberId: string): Promise<void> {
    const group = await this.getGroup(groupId);
    if (!group) throw new Error('Group not found');
    const members = (group.members || []).filter((m) => m.id !== memberId);
    await this.writeMembers(groupId, members);
  }

  async setMembers(groupId: string, members: UserGroupMember[]): Promise<void> {
    await this.writeMembers(groupId, this.dedupeMembers(members));
  }

  private async writeMembers(groupId: string, members: UserGroupMember[]): Promise<void> {
    const ref = doc(this.firestore, `userGroups/${groupId}`);
    await updateDoc(ref, {
      memberIds: members.map((m) => m.id),
      members,
      updatedAt: Timestamp.now(),
    });
  }

  private dedupeMembers(members: UserGroupMember[]): UserGroupMember[] {
    const seen = new Map<string, UserGroupMember>();
    for (const m of members) {
      if (!m?.id) continue;
      if (!seen.has(m.id)) seen.set(m.id, m);
    }
    return [...seen.values()].sort((a, b) =>
      (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''),
    );
  }
}
