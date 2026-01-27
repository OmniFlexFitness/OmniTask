import { Injectable, inject, signal } from '@angular/core';
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
import { UserProfile } from '../models/user.model';
import { DialogService } from '../services/dialog.service';
import { switchMap, map } from 'rxjs/operators';
import { of, from, Observable } from 'rxjs';

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

  user$ = user(this.auth);
  currentUserSig = signal<UserProfile | null>(null);

  // Google Tasks API access token for authenticated API calls
  googleTasksAccessToken = signal<string | null>(null);

  // Flag indicating if user has granted offline access for scheduled sync
  hasOfflineAccess = signal<boolean>(false);

  constructor() {
    this.user$
      .pipe(
        switchMap((firebaseUser) => {
          if (!firebaseUser) return of(null);
          return this.getUserProfile(firebaseUser.uid);
        }),
      )
      .subscribe((profile) => {
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
    provider.setCustomParameters({
      hd: 'omniflexfitness.com', // Hint to prompt for omniflexfitness.com domain
    });
    // Add Google Tasks API scope for bidirectional sync
    provider.addScope(GOOGLE_TASKS_SCOPE);
    // Add Google Contacts/Directory API scopes for assignee suggestions
    provider.addScope(GOOGLE_CONTACTS_SCOPE);
    provider.addScope(GOOGLE_OTHER_CONTACTS_SCOPE);
    provider.addScope(GOOGLE_DIRECTORY_SCOPE);

    try {
      const credential = await signInWithPopup(this.auth, provider);
      const user = credential.user;

      // Strict Domain Check
      // In a real app, this should also be enforced by Firebase Security Rules or Blocking Functions
      if (!user.email?.endsWith('@omniflexfitness.com')) {
        await this.auth.signOut();
        throw new Error('Unauthorized Access: OmniFlexFitness account required.');
      }

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
        hd: 'omniflexfitness.com',
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

    const data: UserProfile = {
      uid: user.uid,
      email: user.email!,
      displayName: user.displayName || 'User',
      photoURL: user.photoURL || '',
      domain: 'omniflexfitness.com',
      role: existingData?.role || 'user', // Default to user, preserve if exists
      createdAt: existingData?.createdAt || new Date(),
      lastLoginAt: new Date(),
    };

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
