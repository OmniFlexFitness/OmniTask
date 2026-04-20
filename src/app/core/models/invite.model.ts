import { UserPermissions } from './user.model';

/**
 * An invite lets a super-admin pre-configure the role and permissions that
 * will be applied to a user the first time they sign in with the invited
 * email. Matching happens in `AuthService.updateUserData` — we do not
 * rely on a token-based acceptance link because sign-in is already gated
 * by Google OAuth, so possession of the email is proof enough.
 */
export interface Invite {
  id?: string;
  /** Normalized (lower-cased, trimmed) email address. */
  email: string;
  role: 'admin' | 'user';
  permissions: UserPermissions;
  invitedByUid: string;
  invitedByEmail: string;
  invitedAt: Date;
  status: 'pending' | 'accepted' | 'revoked';
  acceptedAt?: Date | null;
  acceptedByUid?: string | null;
  note?: string;
}
