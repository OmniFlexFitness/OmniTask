import { Component, inject, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './auth.service';
import { VersionService } from '../services/version.service';
import { DEFAULT_VERSION } from '../constants';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  host: {
    style: 'display:block; position:absolute; inset:0; z-index:9999; overflow:hidden;',
  },
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit {
  authService = inject(AuthService);
  private readonly versionService = inject(VersionService);

  version = signal<string>(DEFAULT_VERSION);

  ngOnInit() {
    this.versionService.getVersion().subscribe((v) => this.version.set(v));
  }

  login() {
    this.authService.loginWithGoogle();
  }
}
