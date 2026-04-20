import { Injectable, Injector, inject, runInInjectionContext, signal } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { Invite } from '../models/invite.model';
import {
  DEFAULT_USER_PERMISSIONS,
  UserPermissions,
  UserProfile,
  resolvePermissions,
} from '../models/user.model';

/**
 * CRUD + acceptance helpers for the `invites` collection. Invite creation is
 * intentionally restricted to super-admins by Firestore rules — this service
 * is just a typed wrapper around those writes.
 */
@Injectable({ providedIn: 'root' })
export class InvitesService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private injector = inject(Injector);
  private invitesCollection = collection(this.firestore, 'invites');

  loading = signal(false);
  error = signal<string | null>(null);

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Stream of all invites. Readable by admins/super-admins. */
  getAllInvites(): Observable<Invite[]> {
    const q = query(this.invitesCollection);
    return runInInjectionContext(this.injector, () => {
      return collectionData(q, { idField: 'id' }) as Observable<Invite[]>;
    });
  }

  /** Create a new pending invite for the given email. */
  async createInvite(
    email: string,
    role: 'admin' | 'user',
    permissions: Partial<UserPermissions>,
    note?: string,
  ): Promise<string> {
    const inviter = this.auth.currentUserSig();
    if (!inviter) throw new Error('Not authenticated');

    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new Error('A valid email is required.');
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      const merged: UserPermissions = { ...DEFAULT_USER_PERMISSIONS, ...permissions };
      const invite: Omit<Invite, 'id'> = {
        email: normalizedEmail,
        role,
        permissions: merged,
        invitedByUid: inviter.uid,
        invitedByEmail: inviter.email,
        invitedAt: new Date(),
        status: 'pending',
        acceptedAt: null,
        acceptedByUid: null,
        ...(note ? { note } : {}),
      };

      const ref = await addDoc(this.invitesCollection, invite);
      return ref.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create invite';
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  async revokeInvite(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, `invites/${id}`), {
      status: 'revoked',
    });
  }

  /**
   * Look up a pending invite by email. Returns the first pending match, or
   * null if none exists. Used at sign-in time to seed a new user's role and
   * permissions from the invite.
   */
  async findPendingInviteByEmail(email: string): Promise<Invite | null> {
    const normalized = this.normalizeEmail(email);
    if (!normalized) return null;

    const q = query(
      this.invitesCollection,
      where('email', '==', normalized),
      where('status', '==', 'pending'),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...(docSnap.data() as Omit<Invite, 'id'>) };
  }

  /** Mark an invite as accepted by the given user. */
  async markAccepted(inviteId: string, userUid: string): Promise<void> {
    await updateDoc(doc(this.firestore, `invites/${inviteId}`), {
      status: 'accepted',
      acceptedAt: new Date(),
      acceptedByUid: userUid,
    });
  }

  /**
   * Resolve the effective UserPermissions map that an invite should apply
   * when an invited user first signs in. Exposed so that AuthService can
   * compose the user profile without duplicating merge logic.
   */
  permissionsFromInvite(invite: Invite, existing?: UserProfile | null): UserPermissions {
    const base = resolvePermissions(existing);
    return { ...base, ...invite.permissions };
  }
}
