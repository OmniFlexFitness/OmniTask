/**
 * Granular feature-level permissions that can be toggled per user by a
 * super-admin. When a field is undefined on a user document, the
 * corresponding DEFAULT_USER_PERMISSIONS value is used.
 */
export interface UserPermissions {
  canCreateProjects: boolean;
  canCreateTasks: boolean;
  canDeleteProjects: boolean;
  canDeleteTasks: boolean;
  canInviteMembers: boolean;
  /**
   * Grants access to the admin dashboard permissions management UI and the
   * ability to modify other users' permissions / roles.
   */
  isSuperAdmin: boolean;
}

/**
 * Defaults applied to any authenticated user whose profile does not yet
 * define a permissions map. These are intentionally permissive for the
 * basic "do work" actions so that existing users are not locked out after
 * this feature is deployed — permissions can then be tightened per-user
 * via the admin dashboard.
 */
export const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  canCreateProjects: true,
  canCreateTasks: true,
  canDeleteProjects: true,
  canDeleteTasks: true,
  canInviteMembers: true,
  isSuperAdmin: false,
};

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  profileImage?: string; // Custom profile image URL (Firebase Storage)
  avatarColor?: string; // Custom color for placeholder avatars
  domain: string;
  role: 'admin' | 'user';
  permissions?: UserPermissions;
  createdAt: Date;
  lastLoginAt: Date;

  // Google Tasks scheduled sync fields
  hasGoogleTasksOfflineAccess?: boolean;
  googleTasksOfflineAccessGrantedAt?: Date;
  googleTasksRefreshToken?: string | null; // Encrypted refresh token for Cloud Functions

  /**
   * UID of the user this user reports to (their direct manager).
   * Used by the "My Tasks" dashboard to surface reporting lines. Optional.
   */
  reportsToId?: string;
  /** Cached display name of the manager for UI (refreshed when the link is set). */
  reportsToName?: string;
  /** Cached email of the manager for UI. */
  reportsToEmail?: string;

  /**
   * Spreadsheet ID of the user's personal "My Tasks" sheet, written by
   * MyTasksSheetSyncService. When present, writes to the user's tasks mirror
   * into this sheet (in addition to any project-level sheet).
   */
  myTasksSheetId?: string;
  myTasksSheetTabName?: string;
  lastMyTasksSheetSyncAt?: Date;
  myTasksSheetSyncStatus?: 'synced' | 'pending' | 'error';
}

/**
 * Resolve the effective permissions for a user, applying defaults for any
 * unset fields. Accepts null/undefined and returns a fully populated map.
 */
export function resolvePermissions(user?: UserProfile | null): UserPermissions {
  return { ...DEFAULT_USER_PERMISSIONS, ...(user?.permissions ?? {}) };
}
