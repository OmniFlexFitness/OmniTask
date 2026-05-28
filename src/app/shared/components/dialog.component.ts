import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogService } from '../../core/services/dialog.service';

@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogComponent {
  readonly dialogService = inject(DialogService);

  onBackdrop(): void {
    // Only allow backdrop click to dismiss non-confirm dialogs.
    const d = this.dialogService.dialog();
    if (d.type === 'confirm') return;
    this.onCancel();
  }

  onConfirm(): void {
    this.dialogService.confirmAction();
  }

  onCancel(): void {
    this.dialogService.cancelAction();
  }
}
