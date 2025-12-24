import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <nav class="bg-indigo-600">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <span class="text-white font-bold text-xl">OmniFlex</span>
            </div>
            <div class="hidden md:block">
              <div class="ml-10 flex items-baseline space-x-4">
                <a routerLink="/" class="text-white hover:bg-indigo-500 px-3 py-2 rounded-md text-sm font-medium">Dashboard</a>
                <a routerLink="/projects" class="text-indigo-100 hover:bg-indigo-500 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Projects</a>
                <a routerLink="/tasks" class="text-indigo-100 hover:bg-indigo-500 hover:text-white px-3 py-2 rounded-md text-sm font-medium">My Tasks</a>
              </div>
            </div>
          </div>
          <div class="hidden md:block">
            <div class="ml-4 flex items-center md:ml-6">
              <div class="flex items-center space-x-3">
                 <span class="text-sm text-indigo-100">{{ auth.currentUserSig()?.email }}</span>
                 <button (click)="auth.logout()" class="text-indigo-200 hover:text-white text-sm">Logout</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `
})
export class NavbarComponent {
  auth = inject(AuthService);
}
