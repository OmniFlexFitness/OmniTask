/** Google API OAuth scopes requested for OmniTask integrations. */
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
  'https://www.googleapis.com/auth/directory.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
] as const;

export function googleOAuthRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/auth/callback`;
}
