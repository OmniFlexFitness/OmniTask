import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 py-6 sm:px-0">
        <h1 class="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p class="mt-2 text-gray-600">Welcome back, {{ auth.currentUserSig()?.displayName }}</p>
        
        <div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <!-- Stats Cards Placeholder -->
          <div class="bg-white overflow-hidden shadow rounded-lg">
            <div class="px-4 py-5 sm:p-6">
               <dt class="text-sm font-medium text-gray-500 truncate">Open Tasks</dt>
               <dd class="mt-1 text-3xl font-semibold text-gray-900">0</dd>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class DashboardComponent {
  auth = inject(AuthService);
}
