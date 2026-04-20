/**
 * Application-wide constants
 */

/**
 * Default version number shown when version.json cannot be loaded
 */
export const DEFAULT_VERSION = '0.0.01';

/**
 * Email of the designated super-admin. This user has implicit access to the
 * admin dashboard and can grant or revoke permissions for any other user
 * (and cannot be demoted through the UI).
 */
export const SUPER_ADMIN_EMAIL = 'bertin.kenol@omniflexfitness.com';

/**
 * Primary organization domain. Users with this email domain are highlighted
 * in the permissions management UI.
 */
export const ORG_DOMAIN = 'omniflexfitness.com';
