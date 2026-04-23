export interface Contact {
  id: string; // email or uid
  email: string;
  displayName: string;
  photoURL?: string;
  source: 'workspace' | 'google-contacts' | 'google-directory' | 'default-domain' | 'cached';
}
