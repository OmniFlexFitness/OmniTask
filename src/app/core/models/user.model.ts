export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  domain: string;
  role: 'admin' | 'user';
  createdAt: Date;
  lastLoginAt: Date;
  
  // Google Tasks scheduled sync fields
  hasGoogleTasksOfflineAccess?: boolean;
  googleTasksOfflineAccessGrantedAt?: Date;
  googleTasksRefreshToken?: string | null; // Encrypted refresh token for Cloud Functions
}
