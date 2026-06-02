import { TestBed } from '@angular/core/testing';
import { Functions } from '@angular/fire/functions';
import { GithubService } from './github.service';

/**
 * Unit tests for the client GitHub service. These cover the deterministic,
 * security-relevant behavior that runs without hitting a callable: the OAuth
 * state (CSRF) guard, return-URL handling, and initial state. The actual GitHub
 * API behavior is server-side and covered by the Cloud Functions test suite.
 */
describe('GithubService', () => {
  let service: GithubService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GithubService, { provide: Functions, useValue: {} }],
    });
    service = TestBed.inject(GithubService);
    sessionStorage.clear();
  });

  it('is created with empty initial state', () => {
    expect(service).toBeTruthy();
    expect(service.connection()).toBeNull();
    expect(service.loading()).toBeFalse();
  });

  it('completeConnect rejects when no OAuth state was stored', async () => {
    await expectAsync(service.completeConnect('code', 'whatever')).toBeRejectedWithError(
      /state mismatch/i,
    );
  });

  it('completeConnect rejects a mismatched OAuth state (CSRF guard)', async () => {
    sessionStorage.setItem('omnitask.github.oauth.state', 'expected');
    await expectAsync(service.completeConnect('code', 'attacker')).toBeRejectedWithError(
      /state mismatch/i,
    );
  });

  it('completeConnect rejects a null returned state even if one was stored', async () => {
    sessionStorage.setItem('omnitask.github.oauth.state', 'expected');
    await expectAsync(service.completeConnect('code', null)).toBeRejectedWithError(
      /state mismatch/i,
    );
  });

  it('consumeReturnUrl returns the stored value once, then defaults', () => {
    sessionStorage.setItem('omnitask.github.oauth.return', '/projects/p1');
    expect(service.consumeReturnUrl()).toBe('/projects/p1');
    // Consumed — a second read falls back to the default.
    expect(service.consumeReturnUrl()).toBe('/settings');
  });

  it('redirectUri points at the GitHub callback route on the current origin', () => {
    expect(service.redirectUri()).toBe(`${window.location.origin}/auth/github/callback`);
  });
});
