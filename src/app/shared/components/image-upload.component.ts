import { Component, input, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';

@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-upload.component.html',
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
