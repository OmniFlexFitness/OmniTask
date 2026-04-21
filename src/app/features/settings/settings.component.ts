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
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';

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
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private storage = inject(Storage);

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

  constructor() {
    // Initialize from current user
    effect(() => {
      const user = this.currentUser();
      if (user) {
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
      }
    });
  }

  selectColor(color: string) {
    this.selectedColor.set(color);
  }

  async onPhotoSelected(event: Event) {
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
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `users/${user.uid}/avatar/${Date.now()}.${ext}`;
      const storageRef = ref(this.storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const userRef = doc(this.firestore, 'users', user.uid);
      await updateDoc(userRef, { photoURL: url });
      this.authService.currentUserSig.set({ ...user, photoURL: url });
    } catch (err) {
      console.error('Failed to upload avatar:', err);
      this.photoError.set('Failed to upload image. Please try again.');
    } finally {
      this.uploadingPhoto.set(false);
      input.value = '';
    }
  }

  async removePhoto() {
    const user = this.currentUser();
    if (!user) return;
    try {
      const userRef = doc(this.firestore, 'users', user.uid);
      await updateDoc(userRef, { photoURL: '' });
      this.authService.currentUserSig.set({ ...user, photoURL: '' });
    } catch (err) {
      console.error('Failed to clear avatar:', err);
    }
  }

  async saveProfile() {
    const user = this.currentUser();
    if (!user) return;

    this.saving.set(true);
    this.saveSuccess.set(null);
    try {
      const userRef = doc(this.firestore, 'users', user.uid);
      await updateDoc(userRef, {
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
