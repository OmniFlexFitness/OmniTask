import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./core/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
        { 
            path: '', 
            loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) 
        },
        {
            path: 'projects/:id',
            loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
        }
    ]
  },
  { path: '**', redirectTo: '' }
];
