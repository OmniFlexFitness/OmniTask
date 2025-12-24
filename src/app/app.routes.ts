import { Routes } from '@angular/router';
import { LoginComponent } from './core/auth/login.component';
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
        // TODO: Add Dashboard and Project routes here
        // For now just a placeholder for the verified connection
        { 
            path: '', 
            loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) // We will create this
        }
    ]
  },
  { path: '**', redirectTo: '' }
];
