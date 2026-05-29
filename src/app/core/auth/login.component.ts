import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
export class LoginComponent {
  readonly authService = inject(AuthService);
  private readonly versionService = inject(VersionService);

  readonly version = toSignal(this.versionService.getVersion(), {
    initialValue: DEFAULT_VERSION,
  });

  login() {
    this.authService.loginWithGoogle();
  }
}
