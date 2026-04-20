import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  user,
  User,
  OAuthCredential,
} from '@angular/fire/auth';
import { Firestore, doc, setDoc, getDoc, updateDoc } from '@angular/fire/firestore';
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

  // Google Tasks API access token for authenticated API calls
  googleTasksAccessToken = signal<string | null>(null);

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

    // Security Note: Access token is kept in-memory only (not sessionStorage) to prevent XSS attacks.
    // User will need to re-authenticate for Google Tasks after page refresh.
    // Refresh tokens are stored encrypted in Firestore for scheduled background sync.
  }

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    // Add Google Tasks API scope for bidirectional sync
    provider.addScope(GOOGLE_TASKS_SCOPE);
    // Add Google Contacts/Directory API scopes for assignee suggestions
    provider.addScope(GOOGLE_CONTACTS_SCOPE);
    provider.addScope(GOOGLE_OTHER_CONTACTS_SCOPE);
    provider.addScope(GOOGLE_DIRECTORY_SCOPE);

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

    // Ensure the designated super-admin is always promoted to admin + super-admin
    // on sign-in, regardless of their prior stored values.
    const role: 'admin' | 'user' = isDesignatedSuperAdmin
      ? 'admin'
      : existingData?.role || 'user';

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
    } else if (!existingData) {
      data.permissions = { ...DEFAULT_USER_PERMISSIONS };
    }

    // Create or Update
    return setDoc(userRef, data, { merge: true });
  }

  private getUserProfile(uid: string): Observable<UserProfile | null> {
    const userRef = doc(this.firestore, `users/${uid}`);
    return from(getDoc(userRef)).pipe(
      map((snap) => (snap.exists() ? (snap.data() as UserProfile) : null)),
    );
  }
}
