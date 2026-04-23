import {
  Component,
  inject,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { UserGroupManagerComponent } from '../user-groups/user-group-manager.component';

const AVATAR_COLORS = [
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Orange', value: '#f97316' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, UserGroupManagerComponent],
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  private readonly authService = inject(AuthService);
  private readonly storage = inject(Storage);

  currentUser = this.authService.currentUserSig;
  avatarColors = AVATAR_COLORS;

  selectedColor = signal<string>('#8b5cf6');
  displayName = '';
  saving = signal(false);
  saveSuccess = signal<boolean | null>(null);

  // Profile photo upload state
  uploadingPhoto = signal(false);
  photoError = signal<string | null>(null);

  userInitials = computed(() => {
    const name = this.currentUser()?.displayName || '';
    return name
      .split(' ')
      .map((n) => n.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
  });

  // Tracks which user identity has been seeded into the form so later
  // profile mutations (e.g. photoURL updates) don't clobber pending edits.
  private seededUid: string | null = null;

  constructor() {
    effect(() => {
      const user = this.currentUser();
      if (!user || this.seededUid === user.uid) return;

      this.seededUid = user.uid;
      this.displayName = user.displayName || '';
      if (user.avatarColor) {
        this.selectedColor.set(user.avatarColor);
      } else {
        // Generate default from email
        const hash = (user.email || '')
          .split('')
          .reduce((acc, char) => acc + char.charCodeAt(0), 0);
        this.selectedColor.set(AVATAR_COLORS[hash % AVATAR_COLORS.length].value);
      }
    });
  }

  selectColor(color: string): void {
    this.selectedColor.set(color);
  }

  /**
   * Delete the previous avatar blob (if any). Failures are non-fatal — the
   * app just logs them so they don't block UI updates when the file is
   * already gone, was never uploaded to our bucket, or the URL isn't a
   * Firebase Storage URL we can resolve.
   */
  private async deletePreviousPhoto(photoURL: string | undefined): Promise<void> {
    if (!photoURL) return;
    try {
      const previousRef = ref(this.storage, photoURL);
      await deleteObject(previousRef);
    } catch (err) {
      console.warn('Could not delete previous avatar blob:', err);
    }
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.photoError.set(null);

    if (!file.type.startsWith('image/')) {
      this.photoError.set('Please select an image file.');
      input.value = '';
      return;
    }
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      this.photoError.set('Image must be under 5 MB.');
      input.value = '';
      return;
    }

    const user = this.currentUser();
    if (!user) return;

    this.uploadingPhoto.set(true);
    const previousPhotoURL = user.photoURL;
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `users/${user.uid}/avatar/${Date.now()}.${ext}`;
      const storageRef = ref(this.storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await this.authService.updateProfile({ photoURL: url });

      // Firestore is the source of truth — only clear the old blob after
      // the new URL is saved so a failed write doesn't leave the user
      // pointing at a deleted file.
      await this.deletePreviousPhoto(previousPhotoURL);
    } catch (err) {
      console.error('Failed to upload avatar:', err);
      this.photoError.set('Failed to upload image. Please try again.');
    } finally {
      this.uploadingPhoto.set(false);
      input.value = '';
    }
  }

  async removePhoto(): Promise<void> {
    const user = this.currentUser();
    if (!user) return;
    this.photoError.set(null);
    const previousPhotoURL = user.photoURL;
    try {
      await this.authService.updateProfile({ photoURL: '' });
      await this.deletePreviousPhoto(previousPhotoURL);
    } catch (err) {
      console.error('Failed to clear avatar:', err);
      this.photoError.set('Failed to remove photo. Please try again.');
    }
  }

  async saveProfile(): Promise<void> {
    const user = this.currentUser();
    if (!user) return;

    this.saving.set(true);
    this.saveSuccess.set(null);
    try {
      await this.authService.updateProfile({
        displayName: this.displayName,
        avatarColor: this.selectedColor(),
      });
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(null), 3000);
    } catch (error: unknown) {
      console.error('Failed to save profile:', error);
      this.saveSuccess.set(false);
    } finally {
      this.saving.set(false);
    }
  }
}
