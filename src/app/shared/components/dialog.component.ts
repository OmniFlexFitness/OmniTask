import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogService } from '../../core/services/dialog.service';

@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (dialogService.dialog().isOpen) {
    <div class="fixed inset-0 z-[9999] flex items-center justify-center">
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        (click)="onCancel()"
      ></div>

      <!-- Dialog Card -->
      <div
        class="relative bg-slate-900/95 border border-white/20 rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden"
        style="box-shadow: 0 0 40px rgba(139, 92, 246, 0.3)"
      >
        <!-- Header with gradient accent -->
        @if (dialogService.dialog().title) {
        <div
          class="px-6 py-4 border-b border-white/10"
          [ngClass]="{
            'bg-gradient-to-r from-cyan-600/20 to-blue-600/20': dialogService.dialog().type === 'info',
            'bg-gradient-to-r from-purple-600/20 to-fuchsia-600/20': dialogService.dialog().type === 'confirm',
            'bg-gradient-to-r from-red-600/20 to-orange-600/20': dialogService.dialog().type === 'error',
            'bg-gradient-to-r from-yellow-600/20 to-amber-600/20': dialogService.dialog().type === 'warning'
          }"
        >
          <h3 class="text-lg font-semibold text-white">
            {{ dialogService.dialog().title }}
          </h3>
        </div>
        }

        <!-- Message Body -->
        <div class="px-6 py-6">
          <p class="text-slate-200 whitespace-pre-wrap leading-relaxed">
            {{ dialogService.dialog().message }}
          </p>
        </div>

        <!-- Action Buttons -->
        <div class="px-6 py-4 bg-slate-950/50 border-t border-white/10 flex justify-end gap-3">
          @if (dialogService.dialog().cancelText) {
          <button
            class="px-4 py-2 rounded-lg border border-white/20 text-slate-300 hover:bg-white/5 hover:text-white transition-all duration-200"
            (click)="onCancel()"
          >
            {{ dialogService.dialog().cancelText }}
          </button>
          }
          <button
            class="px-4 py-2 rounded-lg font-medium transition-all duration-200"
            [ngClass]="{
              'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white': dialogService.dialog().type === 'info',
              'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white': dialogService.dialog().type === 'confirm',
              'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white': dialogService.dialog().type === 'error',
              'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-white': dialogService.dialog().type === 'warning'
            }"
            (click)="onConfirm()"
          >
            {{ dialogService.dialog().confirmText }}
          </button>
        </div>
      </div>
    </div>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
})
export class DialogComponent {
  dialogService = inject(DialogService);

  onConfirm(): void {
    this.dialogService.confirmAction();
  }

  onCancel(): void {
    this.dialogService.cancelAction();
  }
}
