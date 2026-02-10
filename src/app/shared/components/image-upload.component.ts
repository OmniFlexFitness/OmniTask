import { Component, input, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';

@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="image-upload-container">
      <!-- Preview Area -->
      <div
        class="relative group cursor-pointer rounded-xl overflow-hidden border-2 border-dashed transition-all duration-300"
        [style.border-color]="uploading() ? 'rgba(0, 210, 255, 0.4)' : 'rgba(224, 64, 251, 0.4)'"
        [style.width]="width()"
        [style.height]="height()"
        (click)="fileInput.click()"
      >
        <!-- Current Image or Placeholder -->
        @if (currentImageUrl()) {
          <img
            [src]="currentImageUrl()"
            [alt]="altText()"
            class="w-full h-full object-cover"
          />
          <div
            class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center"
          >
            <div class="text-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-8 w-8 mx-auto mb-2 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p class="text-sm text-white font-medium">Change Image</p>
            </div>
          </div>
        } @else {
          <div
            class="w-full h-full flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-12 w-12 mb-3 transition-all duration-300"
              [style.color]="uploading() ? '#00d2ff' : 'rgb(100, 116, 139)'"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            @if (uploading()) {
              <div class="flex items-center gap-2">
                <div class="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style="border-color: #00d2ff; border-top-color: transparent;"></div>
                <p class="text-sm text-slate-400">Uploading...</p>
              </div>
            } @else {
              <p class="text-sm text-slate-400 font-medium">{{ placeholder() }}</p>
              <p class="text-xs text-slate-500 mt-1">Click to upload</p>
            }
          </div>
        }

        <!-- Upload Progress Bar -->
        @if (uploading()) {
          <div class="absolute bottom-0 left-0 right-0 h-1" style="background-color: rgba(30, 41, 59, 0.8);">
            <div
              class="h-full transition-all duration-300 animate-pulse"
              style="width: 60%; background: linear-gradient(to right, #e040fb, #00d2ff);"
            ></div>
          </div>
        }
      </div>

      <!-- File Input -->
      <input
        #fileInput
        type="file"
        accept="image/*"
        class="hidden"
        (change)="onFileSelected($event)"
        [disabled]="uploading()"
      />

      <!-- Error Message -->
      @if (error()) {
        <div
          class="mt-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2"
        >
          {{ error() }}
        </div>
      }

      <!-- Remove Button -->
      @if (currentImageUrl() && showRemove()) {
        <button
          class="mt-2 text-xs text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1"
          (click)="removeImage(); $event.stopPropagation()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          Remove Image
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        --cyber-purple: #e040fb;
        --cyber-blue: #00d2ff;
      }
    `,
  ],
})
export class ImageUploadComponent {
  private storage = inject(Storage);

  // Inputs
  currentImageUrl = input<string | null>(null);
  storagePath = input.required<string>(); // e.g., 'projects/projectId/cover'
  width = input<string>('200px');
  height = input<string>('200px');
  placeholder = input<string>('Upload Image');
  altText = input<string>('Uploaded image');
  showRemove = input<boolean>(true);
  maxSizeMB = input<number>(5); // Max file size in MB

  // Outputs
  imageUploaded = output<string>(); // Emits the download URL
  imageRemoved = output<void>();

  // State
  uploading = signal(false);
  error = signal<string | null>(null);

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      this.error.set('Please select an image file');
      return;
    }

    // Validate file size
    const maxSizeBytes = this.maxSizeMB() * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.error.set(`File size must be less than ${this.maxSizeMB()}MB`);
      return;
    }

    this.error.set(null);
    this.uploading.set(true);

    try {
      // Generate unique filename using timestamp and random string to prevent collisions
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 15);
      const fileExt = file.name.split('.').pop() || 'jpg';
      const uniqueFilename = `${timestamp}_${randomStr}.${fileExt}`;

      // Create storage reference with unique filename
      const storageRef = ref(this.storage, `${this.storagePath()}/${uniqueFilename}`);

      // Upload file
      await uploadBytes(storageRef, file);

      // Get download URL
      const downloadURL = await getDownloadURL(storageRef);

      this.imageUploaded.emit(downloadURL);
    } catch (err) {
      console.error('Upload failed:', err);
      this.error.set('Failed to upload image. Please try again.');
    } finally {
      this.uploading.set(false);
      // Reset input
      input.value = '';
    }
  }

  removeImage() {
    this.imageRemoved.emit();
  }
}
