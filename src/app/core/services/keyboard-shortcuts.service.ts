import { Injectable, inject, signal } from '@angular/core';
import { DialogService } from './dialog.service';

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService {
  private readonly dialogService = inject(DialogService);

  helpOpen = signal(false);

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    const el = target as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  handleGlobalKeydown(event: KeyboardEvent): void {
    if (this.isTypingTarget(event.target)) return;

    const key = event.key.toLowerCase();

    if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.helpOpen.update((v) => !v);
      return;
    }

    if (event.key === 'Escape') {
      if (this.dialogService.dialog().isOpen) {
        this.dialogService.cancelAction();
        return;
      }
      if (this.helpOpen()) {
        event.preventDefault();
        this.helpOpen.set(false);
        return;
      }
      document.dispatchEvent(new CustomEvent('ot:escape'));
      return;
    }

    if ((event.ctrlKey || event.metaKey) && key === 'k') {
      event.preventDefault();
      document.dispatchEvent(new CustomEvent('ot:focus-search'));
    }
  }
}
