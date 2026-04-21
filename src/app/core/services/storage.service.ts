import { Injectable, inject } from '@angular/core';
import {
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from '@angular/fire/storage';
import { AuthService } from '../auth/auth.service';

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
];

/**
 * Thin wrapper around Firebase Storage for uploading project-scoped images.
 * Paths are deterministic so updates overwrite the same object, and callers
 * can optionally clean up prior URLs.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly storage = inject(Storage);
  private readonly auth = inject(AuthService);

  /**
   * Upload a project icon image. Returns the public download URL.
   * Throws if the file is too large, wrong type, or the user is unauthenticated.
   */
  async uploadProjectIcon(projectId: string, file: File): Promise<string> {
    this.assertValidImage(file);
    const user = this.auth.currentUserSig();
    if (!user) throw new Error('Must be signed in to upload');

    const ext = this.extensionFor(file);
    const path = `projects/${projectId}/icon-${Date.now()}.${ext}`;
    const objectRef = ref(this.storage, path);
    await uploadBytes(objectRef, file, { contentType: file.type });
    return await getDownloadURL(objectRef);
  }

  /**
   * Best-effort delete of a previously uploaded Firebase Storage object.
   * Accepts either a storage path or a download URL; silently swallows errors
   * so replacements aren't blocked by stale cleanup.
   */
  async deleteByUrl(url: string | undefined | null): Promise<void> {
    if (!url) return;
    try {
      const objectRef = ref(this.storage, url);
      await deleteObject(objectRef);
    } catch (err) {
      console.warn('StorageService.deleteByUrl failed (ignored):', err);
    }
  }

  private assertValidImage(file: File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      throw new Error(
        `Unsupported image type "${file.type}". Use PNG, JPEG, WEBP, GIF, or SVG.`,
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(0);
      throw new Error(`Image is too large. Max ${mb} MB.`);
    }
  }

  private extensionFor(file: File): string {
    const byMime: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
    };
    if (byMime[file.type]) return byMime[file.type];
    const dot = file.name.lastIndexOf('.');
    return dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : 'png';
  }
}
