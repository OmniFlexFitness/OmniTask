import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Reminder that the app is talking to the local Firebase Emulator Suite and not
 * to production. Rendered only when the active environment configures emulators
 * (the `local` build configuration), so production bundles show nothing.
 *
 * It replaces the plain warning strip the Firebase Auth SDK injects by default
 * (that one is switched off in app.config.ts): same message, but loud in the
 * brand's own neon pink with a hazard edge, so it cannot be mistaken for page
 * content.
 */
@Component({
  selector: 'app-emulator-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (active) {
      <div class="emu-banner" role="status" aria-live="polite">
        <span class="emu-badge"><i class="emu-dot" aria-hidden="true"></i>Emulator mode</span>
        <span class="emu-text">
          Local data only. Nothing here reaches production.
          <span class="emu-warn">Do not use production credentials.</span>
        </span>
        <span class="emu-project" title="Offline-only Firebase project">{{ projectId }}</span>
      </div>
    }
  `,
  styleUrl: './emulator-banner.component.css',
})
export class EmulatorBannerComponent implements OnInit, OnDestroy {
  readonly active = !!environment.emulators;
  readonly projectId = environment.firebase.projectId;

  // Content must not hide under the fixed bar; styles.css reads this class.
  ngOnInit(): void {
    if (this.active) document.body.classList.add('has-emulator-banner');
  }

  ngOnDestroy(): void {
    document.body.classList.remove('has-emulator-banner');
  }
}
