import { Injectable, signal, computed } from '@angular/core';

export interface DialogConfig {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'error' | 'confirm';
}

interface DialogState extends DialogConfig {
  isOpen: boolean;
  resolve?: (value: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  private dialogState = signal<DialogState>({
    isOpen: false,
    message: '',
    type: 'info',
  });

  // Public read-only signal for components to subscribe to
  dialog = computed(() => this.dialogState());

  /**
   * Show an informational alert dialog
   */
  async alert(message: string, title?: string): Promise<void> {
    return new Promise((resolve) => {
      this.dialogState.set({
        isOpen: true,
        message,
        title,
        type: 'info',
        confirmText: 'OK',
        resolve: () => {
          resolve();
          this.close();
        },
      });
    });
  }

  /**
   * Show a confirmation dialog with OK/Cancel buttons
   */
  async confirm(message: string, title?: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.dialogState.set({
        isOpen: true,
        message,
        title: title || 'Confirm',
        type: 'confirm',
        confirmText: 'OK',
        cancelText: 'Cancel',
        resolve: (value: boolean) => {
          resolve(value);
          this.close();
        },
      });
    });
  }

  /**
   * Show a custom dialog with full configuration options
   */
  async show(config: DialogConfig): Promise<boolean> {
    return new Promise((resolve) => {
      this.dialogState.set({
        isOpen: true,
        ...config,
        confirmText: config.confirmText || 'OK',
        cancelText: config.cancelText || 'Cancel',
        resolve: (value: boolean) => {
          resolve(value);
          this.close();
        },
      });
    });
  }

  /**
   * Confirm action (user clicked OK/Confirm)
   */
  confirmAction(): void {
    const state = this.dialogState();
    if (state.resolve) {
      state.resolve(true);
    }
  }

  /**
   * Cancel action (user clicked Cancel or closed dialog)
   */
  cancelAction(): void {
    const state = this.dialogState();
    if (state.resolve) {
      state.resolve(false);
    }
  }

  /**
   * Close the dialog
   */
  private close(): void {
    this.dialogState.set({
      isOpen: false,
      message: '',
      type: 'info',
    });
  }
}
