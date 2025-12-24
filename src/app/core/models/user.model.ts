export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  domain: string;
  role: 'admin' | 'user';
  createdAt: Date;
  lastLoginAt: Date;
}
