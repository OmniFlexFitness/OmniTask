import { Injectable, inject, signal } from '@angular/core';
import { Auth, GoogleAuthProvider, signInWithPopup, user, User } from '@angular/fire/auth';
import { Firestore, doc, setDoc, getDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { UserProfile } from '../models/user.model';
import { DialogService } from '../services/dialog.service';
import { switchMap, map } from 'rxjs/operators';
import { of, from, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private dialogService = inject(DialogService);

  user$ = user(this.auth);
  currentUserSig = signal<UserProfile | null>(null);

  constructor() {
    this.user$.pipe(
      switchMap(firebaseUser => {
        if (!firebaseUser) return of(null);
        return this.getUserProfile(firebaseUser.uid);
      })
    ).subscribe(profile => {
      this.currentUserSig.set(profile);
    });
  }

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      hd: 'omniflexfitness.com' // Hint to prompt for omniflexfitness.com domain
    });

    try {
      const credential = await signInWithPopup(this.auth, provider);
      const user = credential.user;
      
      // Strict Domain Check
      // In a real app, this should also be enforced by Firebase Security Rules or Blocking Functions
      if (!user.email?.endsWith('@omniflexfitness.com')) {
         await this.auth.signOut();
         throw new Error('Unauthorized Access: OmniFlexFitness account required.');
      }

      await this.updateUserData(user);
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Login failed', error);
      await this.dialogService.alert(
        error instanceof Error ? error.message : 'Login failed',
        'Login Error'
      );
    }
  }

  async logout() {
    await this.auth.signOut();
    this.currentUserSig.set(null);
    this.router.navigate(['/login']);
  }

  private async updateUserData(user: User) {
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const snap = await getDoc(userRef);
    const data: UserProfile = {
      uid: user.uid,
      email: user.email!,
      displayName: user.displayName || 'User',
      photoURL: user.photoURL || '',
      domain: 'omniflexfitness.com',
      role: snap.exists() ? (snap.data() as UserProfile).role : 'user', // Default to user, preserve if exists
      createdAt: snap.exists() ? (snap.data() as UserProfile).createdAt : new Date(),
      lastLoginAt: new Date()
    };
    
    // Create or Update
    return setDoc(userRef, data, { merge: true });
  }

  private getUserProfile(uid: string): Observable<UserProfile | null> {
    const userRef = doc(this.firestore, `users/${uid}`);
    return from(getDoc(userRef)).pipe(
      map(snap => snap.exists() ? snap.data() as UserProfile : null)
    );
  }
}
