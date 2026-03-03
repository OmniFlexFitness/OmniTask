import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogService } from '../../core/services/dialog.service';

@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dialog.component.html',
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
