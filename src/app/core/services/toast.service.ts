import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  success(message: string): void {
    console.log('SUCCESS Toast:', message);
  }
  error(message: string): void {
    console.error('ERROR Toast:', message);
  }
}
