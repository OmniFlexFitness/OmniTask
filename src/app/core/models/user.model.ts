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

/**
 * Per-user customization of the personal "My Tasks" dashboard. Distinct from
 * the per-project `DashboardPreferences` (which an owner/admin sets for a whole
 * project) — these settings only affect what the signed-in user sees on their
 * own landing page. Every field is optional in storage; `resolveDashboardSettings`
 * fills in defaults so consumers always get a fully-populated object.
 */
export interface UserDashboardSettings {
  /** Which My Tasks pane opens by default when the user lands on the dashboard. */
  defaultMyTasksView: 'overview' | 'list' | 'available';
  /** Tighten vertical spacing on dashboard lists for denser layouts. */
  compactMode: boolean;
  /** Personal accent color (hex) used for dashboard highlights. */
  accentColor: string;
}

/**
 * Defaults applied when a user has not customized their dashboard. Centralized
 * so the settings form and the dashboard rendering stay in sync.
 */
export const DEFAULT_DASHBOARD_SETTINGS: UserDashboardSettings = {
  defaultMyTasksView: 'overview',
  compactMode: false,
  accentColor: '#00d2ff',
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

  // --- Individual profile details (all optional, user-editable) ---
  /** Short role/title shown on the user's profile and dashboard header. */
  jobTitle?: string;
  /** Free-text "about me" blurb. */
  bio?: string;
  /** IANA timezone identifier (e.g. "America/New_York"), for future scheduling UX. */
  timezone?: string;

  /**
   * Per-user dashboard configuration (default view, density, accent). Stored
   * as a partial so older documents and forward-compatible additions resolve
   * through `resolveDashboardSettings`.
   */
  dashboardSettings?: Partial<UserDashboardSettings>;

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

  /**
   * Project IDs the user has pinned to their dashboard. Pinned projects
   * surface in a dedicated panel at the top of the My Tasks dashboard so
   * the user can jump straight to the projects they care about. Order is
   * not preserved — the dashboard sorts pinned projects alphabetically.
   */
  pinnedProjectIds?: string[];

  /**
   * When false, the user opts out of assignment/status email notifications.
   * Undefined is treated as enabled (opt-out model).
   */
  emailNotificationsEnabled?: boolean;
}

/**
 * Resolve the effective permissions for a user, applying defaults for any
 * unset fields. Accepts null/undefined and returns a fully populated map.
 */
export function resolvePermissions(user?: UserProfile | null): UserPermissions {
  return { ...DEFAULT_USER_PERMISSIONS, ...(user?.permissions ?? {}) };
}

/**
 * Resolve a user's effective dashboard settings, applying defaults for any
 * unset field. Accepts null/undefined and returns a fully populated object.
 */
export function resolveDashboardSettings(
  user?: UserProfile | null,
): UserDashboardSettings {
  return { ...DEFAULT_DASHBOARD_SETTINGS, ...(user?.dashboardSettings ?? {}) };
}
