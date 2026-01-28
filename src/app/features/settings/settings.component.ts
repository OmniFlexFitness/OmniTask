import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';

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
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div class="max-w-2xl mx-auto">
        <!-- Header -->
        <header class="mb-8">
          <h1 class="text-2xl font-bold text-white mb-2">Settings</h1>
          <p class="text-slate-400">Manage your profile and preferences</p>
        </header>

        <!-- Profile Section -->
        <section class="bg-slate-900/50 border border-white/10 rounded-2xl p-6 mb-6">
          <h2 class="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 text-purple-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                clip-rule="evenodd"
              />
            </svg>
            Profile
          </h2>

          <!-- Current Avatar Preview -->
          <div class="flex items-center gap-6 mb-8">
            <div class="relative">
              @if (currentUser()?.photoURL) {
                <img
                  [src]="currentUser()!.photoURL"
                  class="w-20 h-20 rounded-full object-cover border-2 border-purple-500"
                  alt="Profile photo"
                />
              } @else {
                <div
                  class="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white border-2 border-white/20"
                  [style.background-color]="selectedColor()"
                >
                  {{ userInitials() }}
                </div>
              }
            </div>
            <div>
              <h3 class="text-lg font-medium text-white">{{ currentUser()?.displayName }}</h3>
              <p class="text-slate-400 text-sm">{{ currentUser()?.email }}</p>
            </div>
          </div>

          <!-- Avatar Color Picker -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-slate-300 mb-3">
              Avatar Color
              <span class="text-slate-500 font-normal ml-2">(Used when no profile photo)</span>
            </label>
            <div class="flex flex-wrap gap-3">
              @for (color of avatarColors; track color.value) {
                <button
                  type="button"
                  (click)="selectColor(color.value)"
                  class="w-10 h-10 rounded-full transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900"
                  [class.ring-2]="selectedColor() === color.value"
                  [class.ring-white]="selectedColor() === color.value"
                  [class.ring-offset-2]="selectedColor() === color.value"
                  [class.ring-offset-slate-900]="selectedColor() === color.value"
                  [style.background-color]="color.value"
                  [title]="color.name"
                >
                  @if (selectedColor() === color.value) {
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5 text-white mx-auto"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  }
                </button>
              }
            </div>
          </div>

          <!-- Display Name -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-slate-300 mb-2">Display Name</label>
            <input
              type="text"
              [(ngModel)]="displayName"
              class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
            />
          </div>

          <!-- Save Button -->
          <button
            (click)="saveProfile()"
            [disabled]="saving()"
            class="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            @if (saving()) {
              <svg
                class="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Saving...
            } @else {
              Save Changes
            }
          </button>

          <!-- Save feedback -->
          @if (saveSuccess() === true) {
            <p class="mt-3 text-sm text-emerald-400 flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clip-rule="evenodd"
                />
              </svg>
              Profile updated successfully!
            </p>
          } @else if (saveSuccess() === false) {
            <p class="mt-3 text-sm text-red-400">Failed to save profile. Please try again.</p>
          }
        </section>

        <!-- Account Info -->
        <section class="bg-slate-900/50 border border-white/10 rounded-2xl p-6">
          <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 text-cyan-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clip-rule="evenodd"
              />
            </svg>
            Account Information
          </h2>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between">
              <span class="text-slate-400">Email</span>
              <span class="text-white">{{ currentUser()?.email }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">Domain</span>
              <span class="text-white">{{ currentUser()?.domain }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">Role</span>
              <span class="text-white capitalize">{{ currentUser()?.role }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
})
export class SettingsComponent {
  private authService = inject(AuthService);
  private firestore = inject(Firestore);

  currentUser = this.authService.currentUserSig;
  avatarColors = AVATAR_COLORS;

  selectedColor = signal<string>('#8b5cf6');
  displayName = '';
  saving = signal(false);
  saveSuccess = signal<boolean | null>(null);

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
