import { Type } from '@angular/core';
import { of, throwError, Subject, BehaviorSubject } from 'rxjs';

/**
 * Common Firebase Test Doubles
 */

export class MockAuthService {
  public user$ = new BehaviorSubject<{ uid: string; email: string; displayName: string } | null>({
    uid: 'user-123',
    email: 'hacker@omniflex.net',
    displayName: 'Neon Strider',
  });

  public currentUser = this.user$.asObservable();

  async signInWithGoogle() {
    return Promise.resolve();
  }
  async signIn() {
    return Promise.resolve();
  }
  async signUp() {
    return Promise.resolve();
  }
  async signOut() {
    return Promise.resolve();
  }
  async sendPasswordResetEmail() {
    return Promise.resolve();
  }
  async refreshGoogleTasksToken() {
    return Promise.resolve();
  }
}

export class MockFirestore {
  collection() {
    return {};
  }
  doc() {
    return {};
  }
}

export const mockFirestoreProvider = {
  provide: 'Firestore', // Usually injection token or object
  useClass: MockFirestore,
};

// Utilities to cleanly mock Observables
export function fakeAsyncResponse<T>(data: T) {
  return of(data);
}

export function fakeAsyncError(error: any) {
  return throwError(() => error);
}
