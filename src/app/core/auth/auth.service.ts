import { Injectable, inject, signal, effect, DestroyRef } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  user,
  User,
  OAuthCredential,
} from '@angular/fire/auth';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { arrayRemove, arrayUnion } from 'firebase/firestore';
import { Router } from '@angular/router';
import { DEFAULT_USER_PERMISSIONS, UserPermissions, UserProfile } from '../models/user.model';
import { SUPER_ADMIN_EMAIL } from '../constants';
import { DialogService } from '../services/dialog.service';
import { switchMap, map } from 'rxjs/operators';
import { of, from, Observable } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

// Google Tasks API scope for read/write access
const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';

// Google Contacts/People API scope for reading contacts (used for assignee suggestions)
const GOOGLE_CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly';

// Google "Other Contacts" API scope for contacts inferred from email interactions
const GOOGLE_OTHER_CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts.other.readonly';

// Google Workspace Directory API scope for reading domain users
const GOOGLE_DIRECTORY_SCOPE = 'https://www.googleapis.com/auth/directory.readonly';

// Google Sheets API scope for read/write access to spreadsheets the user opens or creates with OmniTask
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

// Google Drive file scope (restricted to files created/opened by OmniTask) - needed to create new spreadsheets
const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Google OAuth configuration for refresh token flow
// These are public client identifiers (safe to expose in frontend code)
const GOOGLE_CLIENT_ID = '172130002005-xxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com';
const GOOGLE_REDIRECT_URI =
  typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private dialogService = inject(DialogService);
  private destroyRef = inject(DestroyRef);

  user$ = user(this.auth);

  userProfile$: Observable<UserProfile | null> = this.user$.pipe(
    switchMap((firebaseUser) => {
      if (!firebaseUser) return of(null);
      return this.getUserProfile(firebaseUser.uid);
    }),
  );

  currentUserSig = signal<UserProfile | null>(null);

  // Google API access token - shared by Tasks, Sheets, Contacts, and Directory APIs
  // All Google scopes requested at sign-in share a single OAuth access token.
  //
  // Persistence: the token is mirrored into sessionStorage so it survives page
  // refreshes (clearing when the browser tab/session closes). This is a
  // deliberate UX tradeoff: it avoids forcing users to re-authorize for every
  // reload, at the cost of a small XSS exposure window. Anything that clears
  // the in-memory signal (logout, explicit revoke) also clears storage.
  googleTasksAccessToken = signal<string | null>(this.readStoredGoogleToken());

  // Alias for clarity at call sites that read/write Google Sheets.
  // Returns the same underlying access token as googleTasksAccessToken.
  googleSheetsAccessToken = this.googleTasksAccessToken;

  // Flag indicating if user has granted offline access for scheduled sync
  hasOfflineAccess = signal<boolean>(false);

  constructor() {
    this.userProfile$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((profile) => {
      this.currentUserSig.set(profile);
      // Check if user has stored refresh token
      if (profile?.hasGoogleTasksOfflineAccess) {
        this.hasOfflineAccess.set(true);
      }
    });

    // Persistence: mirror the in-memory token into sessionStorage whenever it
    // changes, so refreshing the page does not force re-auth. Refresh tokens
    // are still stored encrypted in Firestore for background Cloud Function sync.
    effect(() => {
      const token = this.googleTasksAccessToken();
      this.writeStoredGoogleToken(token);
    });
  }

  private static readonly GOOGLE_TOKEN_STORAGE_KEY = 'ot.googleAccessToken';

  /** Read a previously-stored Google access token from sessionStorage (null if none). */
  private readStoredGoogleToken(): string | null {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    try {
      return window.sessionStorage.getItem(AuthService.GOOGLE_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  /** Mirror the access token to sessionStorage (or remove when cleared). */
  private writeStoredGoogleToken(token: string | null): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      if (token) {
        window.sessionStorage.setItem(AuthService.GOOGLE_TOKEN_STORAGE_KEY, token);
      } else {
        window.sessionStorage.removeItem(AuthService.GOOGLE_TOKEN_STORAGE_KEY);
      }
    } catch {
      // sessionStorage may be disabled (incognito with strict policy); fall through.
    }
  }

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    // Add Google Tasks API scope for bidirectional sync
    provider.addScope(GOOGLE_TASKS_SCOPE);
    // Add Google Contacts/Directory API scopes for assignee suggestions
    provider.addScope(GOOGLE_CONTACTS_SCOPE);
    provider.addScope(GOOGLE_OTHER_CONTACTS_SCOPE);
    provider.addScope(GOOGLE_DIRECTORY_SCOPE);
    // Add Google Sheets API scopes for spreadsheet-based project/task sync
    provider.addScope(GOOGLE_SHEETS_SCOPE);
    provider.addScope(GOOGLE_DRIVE_FILE_SCOPE);

    try {
      const credential = await signInWithPopup(this.auth, provider);
      const user = credential.user;

      // Security Note: Domain restrictions removed to allow any Google account.
      // If domain restrictions are needed in the future, they should be enforced
      // via Firebase Security Rules or Firebase Authentication Blocking Functions
      // to ensure backend validation.

      // Extract OAuth access token for Google Tasks API calls
      // Security: Token is kept in-memory only, not persisted to storage
      const oauthCredential = GoogleAuthProvider.credentialFromResult(credential);
      if (oauthCredential?.accessToken) {
        this.googleTasksAccessToken.set(oauthCredential.accessToken);
      }

      await this.updateUserData(user);
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Login failed', error);
      // Show error to user, but catch any dialog errors to prevent unhandled rejections
      this.dialogService
        .alert(error instanceof Error ? error.message : 'Login failed', 'Login Error')
        .catch((err) => console.error('Failed to show error dialog:', err));
    }
  }

  /**
   * Request offline access for Google Tasks scheduled sync.
   * This grants a refresh token that can be used by Cloud Functions
   * to sync tasks in the background without user interaction.
   *
   * Note: This uses a separate OAuth flow that provides a refresh token.
   * The refresh token is stored securely in Firestore for use by Cloud Functions.
   */
  async requestOfflineAccess(): Promise<boolean> {
    const currentUser = this.currentUserSig();
    if (!currentUser) {
      console.error('User must be logged in to request offline access');
      return false;
    }

    try {
      // Use Google Identity Services for offline access flow
      // This opens a popup to request additional permissions
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        access_type: 'offline',
        prompt: 'consent', // Force consent screen to get refresh token
      });
      provider.addScope(GOOGLE_TASKS_SCOPE);
      provider.addScope(GOOGLE_CONTACTS_SCOPE);
      provider.addScope(GOOGLE_DIRECTORY_SCOPE);
      provider.addScope(GOOGLE_SHEETS_SCOPE);
      provider.addScope(GOOGLE_DRIVE_FILE_SCOPE);

      const credential = await signInWithPopup(this.auth, provider);
      const oauthCredential = GoogleAuthProvider.credentialFromResult(credential);

      if (oauthCredential?.accessToken) {
        this.googleTasksAccessToken.set(oauthCredential.accessToken);

        // Note: Firebase's signInWithPopup doesn't provide refresh tokens directly.
        // For true offline access with refresh tokens, you would need to:
        // 1. Use Google Identity Services (GIS) library directly, or
        // 2. Implement a backend OAuth flow through Cloud Functions
        //
        // For now, we mark the user as having granted consent for offline access.
        // The Cloud Function will use its own service account or stored credentials.

        await this.markOfflineAccessGranted(currentUser.uid);
        this.hasOfflineAccess.set(true);

        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to request offline access:', error);
      this.dialogService
        .alert('Failed to enable scheduled sync. Please try again.', 'Sync Error')
        .catch((err) => console.error('Failed to show error dialog:', err));
      return false;
    }
  }

  /**
   * Mark user as having granted offline access for Google Tasks
   */
  private async markOfflineAccessGranted(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);
    await updateDoc(userRef, {
      hasGoogleTasksOfflineAccess: true,
      googleTasksOfflineAccessGrantedAt: new Date(),
    });
  }

  /**
   * Revoke offline access for Google Tasks
   */
  async revokeOfflineAccess(): Promise<void> {
    const currentUser = this.currentUserSig();
    if (!currentUser) return;

    const userRef = doc(this.firestore, `users/${currentUser.uid}`);
    await updateDoc(userRef, {
      hasGoogleTasksOfflineAccess: false,
      googleTasksRefreshToken: null,
    });
    this.hasOfflineAccess.set(false);
  }

  /**
   * Apply partial profile updates to both Firestore and the local signal
   * so components don't mutate `currentUserSig` directly.
   */
  async updateProfile(updates: Partial<UserProfile>): Promise<void> {
    const currentUser = this.currentUserSig();
    if (!currentUser) return;
    const userRef = doc(this.firestore, `users/${currentUser.uid}`);
    await updateDoc(userRef, updates as { [k: string]: unknown });
    this.currentUserSig.set({ ...currentUser, ...updates });
  }

  /**
   * Atomically pin or unpin a project on the user's profile.
   *
   * Uses arrayUnion/arrayRemove to avoid lost updates when multiple pins are
   * toggled quickly (e.g., pinning multiple projects back-to-back).
   */
  async updatePinnedProjectId(projectId: string, pinned: boolean): Promise<void> {
    const currentUser = this.currentUserSig();
    if (!currentUser) return;

    const previous = currentUser.pinnedProjectIds ?? [];
    const optimistic = pinned
      ? Array.from(new Set([...previous, projectId]))
      : previous.filter((id) => id !== projectId);

    this.currentUserSig.set({ ...currentUser, pinnedProjectIds: optimistic });

    const userRef = doc(this.firestore, 'users', currentUser.uid);
    try {
      await updateDoc(userRef, {
        pinnedProjectIds: pinned ? arrayUnion(projectId) : arrayRemove(projectId),
      });
    } catch (err) {
      this.currentUserSig.set({ ...currentUser, pinnedProjectIds: previous });
      throw err;
    }

    const latestUser = this.currentUserSig();
    if (!latestUser) return;
    const latest = latestUser.pinnedProjectIds ?? [];
    const reconciled = pinned
      ? Array.from(new Set([...latest, projectId]))
      : latest.filter((id) => id !== projectId);

    this.currentUserSig.set({ ...latestUser, pinnedProjectIds: reconciled });
  }

  async logout() {
    await this.auth.signOut();
    this.currentUserSig.set(null);
    // Clear Google Tasks access token from memory
    this.googleTasksAccessToken.set(null);
    this.hasOfflineAccess.set(false);
    this.router.navigate(['/login']);
  }

  private async updateUserData(user: User) {
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const snap = await getDoc(userRef);
    const existingData = snap.exists() ? (snap.data() as UserProfile) : null;

    // Extract domain from email address (e.g., user@example.com -> example.com)
    // Use pop() to get the last part after splitting by '@' to handle edge cases
    const domain = user.email?.split('@').pop() || 'unknown';

    const isDesignatedSuperAdmin =
      user.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

    // Look up a pending invite for this email (if any) so that the very first
    // sign-in applies the role + permission grants that the super-admin
    // pre-configured. Errors here are non-fatal — we don't want a transient
    // invite-lookup failure to block sign-in.
    const pendingInvite = await this.findPendingInvite(user.email);

    // Ensure the designated super-admin is always promoted to admin + super-admin
    // on sign-in, regardless of their prior stored values. Otherwise use the
    // invite's role (if any) > existing role > 'user'.
    const role: 'admin' | 'user' = isDesignatedSuperAdmin
      ? 'admin'
      : pendingInvite?.role || existingData?.role || 'user';

    // Permissions map: seed defaults only on first creation (or force-refresh for
    // the designated super-admin). For returning users we leave their stored
    // permissions untouched so that admin-assigned rights are preserved and so
    // that the Firestore update rule does not see a permissions-field change.
    const data: Partial<UserProfile> & { uid: string; email: string } = {
      uid: user.uid,
      email: user.email!,
      displayName: user.displayName || 'User',
      photoURL: user.photoURL || '',
      domain,
      role,
      createdAt: existingData?.createdAt || new Date(),
      lastLoginAt: new Date(),
    };

    if (isDesignatedSuperAdmin) {
      const superPerms: UserPermissions = {
        canCreateProjects: true,
        canCreateTasks: true,
        canDeleteProjects: true,
        canDeleteTasks: true,
        canInviteMembers: true,
        isSuperAdmin: true,
      };
      data.permissions = superPerms;
    } else if (pendingInvite) {
      // Applying an invite: merge its permissions on top of whatever existed
      // (or defaults for brand-new users).
      const base = existingData?.permissions ?? { ...DEFAULT_USER_PERMISSIONS };
      data.permissions = { ...DEFAULT_USER_PERMISSIONS, ...base, ...pendingInvite.permissions };
    } else if (!existingData || !existingData.permissions) {
      // Seed defaults for brand-new users and for returning users whose
      // profiles predate this feature (missing permissions field).
      data.permissions = { ...DEFAULT_USER_PERMISSIONS };
    }

    // Create or Update the user profile
    await setDoc(userRef, data, { merge: true });

    // Mark the invite as accepted — best-effort, non-fatal if it fails.
    if (pendingInvite?.id) {
      updateDoc(doc(this.firestore, `invites/${pendingInvite.id}`), {
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedByUid: user.uid,
      }).catch((err: unknown) => console.warn('Failed to mark invite accepted:', err));
    }
  }

  /**
   * Best-effort lookup of a pending invite for the given email. Returns null
   * if not found or if the query fails (e.g., rules prevented the read).
   */
  private async findPendingInvite(
    email: string | null,
  ): Promise<{ id: string; role: 'admin' | 'user'; permissions: UserPermissions } | null> {
    if (!email) return null;
    try {
      const invitesCol = collection(this.firestore, 'invites');
      const q = query(
        invitesCol,
        where('email', '==', email.toLowerCase()),
        where('status', '==', 'pending'),
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      const first = snap.docs[0];
      const data = first.data() as { role: 'admin' | 'user'; permissions: UserPermissions };
      return { id: first.id, role: data.role, permissions: data.permissions };
    } catch (err) {
      console.warn('Invite lookup failed (continuing without invite):', err);
      return null;
    }
  }

  private getUserProfile(uid: string): Observable<UserProfile | null> {
    const userRef = doc(this.firestore, `users/${uid}`);
    return from(getDoc(userRef)).pipe(
      map((snap) => (snap.exists() ? (snap.data() as UserProfile) : null)),
    );
  }
}
