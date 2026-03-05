import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { AuthService } from './core/auth/auth.service';
import { BehaviorSubject } from 'rxjs';

describe('App', () => {
  beforeEach(async () => {
    const mockAuthService = {
      user$: new BehaviorSubject(null),
      loading$: new BehaviorSubject(false),
      signInWithGoogle: jasmine.createSpy('signInWithGoogle'),
      signOut: jasmine.createSpy('signOut'),
    };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
