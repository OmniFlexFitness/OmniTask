import { Timestamp } from '@angular/fire/firestore';

type FirestoreDate = Timestamp | Date;

/**
 * Cached details for a group member, used to render the group in the UI
 * without having to re-fetch every contact. The canonical identifier is
 * {@link id} which is a {@link Contact.id} — either a UID (for authenticated
 * app users) or an email address (for Google Directory / preset contacts).
 */
export interface UserGroupMember {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

/**
 * A named collection of users that can be invoked to bulk-assign people to
 * a project, a task, or anywhere an individual user can be referenced.
 *
 * Groups are lightweight references — they expand into their member IDs at
 * assignment time rather than being stored on the target entity. This
 * preserves the existing shape of {@link Project.memberIds} and
 * {@link Task.assigneeIds} while letting the UI apply a whole group in one
 * click.
 */
export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  /** Accent color for group chips in the UI. */
  color?: string;
  /** Canonical list of member IDs (Contact.id) ready for assignment. */
  memberIds: string[];
  /** Cached member details for display — kept in sync on add/remove. */
  members: UserGroupMember[];
  /** UID of the user who created the group. */
  ownerId: string;
  /**
   * When true, every authenticated user can read and apply this group.
   * When false, only the owner (and admins/super-admins) can see it.
   * Defaults to true so teams get a shared namespace by default.
   */
  shared: boolean;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}
