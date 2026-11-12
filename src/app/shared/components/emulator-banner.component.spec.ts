import { TestBed } from '@angular/core/testing';
import { EmulatorBannerComponent } from './emulator-banner.component';
import { environment } from '../../../environments/environment';

describe('EmulatorBannerComponent', () => {
  afterEach(() => document.body.classList.remove('has-emulator-banner'));

  it('shows nothing and reserves no space when no emulators are configured (production)', () => {
    expect(environment.emulators).toBeNull();
    const fixture = TestBed.createComponent(EmulatorBannerComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.emu-banner')).toBeNull();
    expect(document.body.classList.contains('has-emulator-banner')).toBeFalse();
  });

  it('shows the warning and reserves space when emulators are configured, and cleans up', () => {
    const fixture = TestBed.createComponent(EmulatorBannerComponent);
    // The environment is a build-time constant; flip the component's own flag the way the
    // local configuration would set it.
    (fixture.componentInstance as { active: boolean }).active = true;
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('.emu-banner') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('Emulator mode');
    expect(el.textContent).toContain('Do not use production credentials');
    expect(document.body.classList.contains('has-emulator-banner')).toBeTrue();
    fixture.destroy();
    expect(document.body.classList.contains('has-emulator-banner')).toBeFalse();
  });
});
