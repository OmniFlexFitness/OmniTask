import { Injectable, inject, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  where,
} from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';
import {
  GithubConnectionStatus,
  GithubLinkResult,
  TaskGithubActor,
  TaskGithubFieldValue,
  TaskGithubLink,
  TaskGithubRelationship,
} from '../models/github.model';

/**
 * Client surface for the GitHub Issues integration. All GitHub API access is
 * server-side (Cloud Functions); this service only invokes callables and holds
 * the connection-status signal for the UI. Tokens never reach the browser.
 */
@Injectable({ providedIn: 'root' })
export class GithubService {
  private readonly functions = inject(Functions);
  private readonly firestore = inject(Firestore);

  private static readonly STATE_KEY = 'omnitask.github.oauth.state';
  private static readonly RETURN_KEY = 'omnitask.github.oauth.return';

  /** Current connection status; null until first loaded. */
  readonly connection = signal<GithubConnectionStatus | null>(null);
  readonly loading = signal<boolean>(false);

  /** GitHub user-to-server OAuth authorize endpoint. */
  private static readonly AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';

  redirectUri(): string {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/auth/github/callback`;
  }

  async loadConnection(): Promise<GithubConnectionStatus> {
    this.loading.set(true);
    try {
      const fn = httpsCallable<void, GithubConnectionStatus>(this.functions, 'getGithubConnection');
      const result = await fn();
      this.connection.set(result.data);
      return result.data;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Begin the user-to-server OAuth flow by redirecting to GitHub. The App must
   * already be installed on the user's repos; GitHub returns to our callback.
   */
  async startConnect(returnUrl = '/settings'): Promise<void> {
    const fn = httpsCallable<void, { clientId: string }>(this.functions, 'getGithubOAuthConfig');
    const config = await fn();
    const state = crypto.randomUUID();

    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(GithubService.STATE_KEY, state);
      window.sessionStorage.setItem(GithubService.RETURN_KEY, returnUrl);
    }

    const params = new URLSearchParams({
      client_id: config.data.clientId,
      redirect_uri: this.redirectUri(),
      state,
    });
    window.location.href = `${GithubService.AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Complete the OAuth redirect: validate state, exchange the code server-side. */
  async completeConnect(code: string, state: string | null): Promise<void> {
    const expected =
      typeof window !== 'undefined'
        ? window.sessionStorage.getItem(GithubService.STATE_KEY)
        : null;
    if (!expected || !state || expected !== state) {
      throw new Error('OAuth state mismatch. Please try connecting again.');
    }

    const fn = httpsCallable<
      { code: string; redirectUri: string },
      Omit<GithubConnectionStatus, 'connected'>
    >(this.functions, 'completeGithubAuth');
    const result = await fn({ code, redirectUri: this.redirectUri() });
    this.connection.set({ ...result.data, connected: true });

    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(GithubService.STATE_KEY);
    }
  }

  consumeReturnUrl(): string {
    if (typeof window === 'undefined' || !window.sessionStorage) return '/settings';
    const url = window.sessionStorage.getItem(GithubService.RETURN_KEY) ?? '/settings';
    window.sessionStorage.removeItem(GithubService.RETURN_KEY);
    return url;
  }

  async disconnect(): Promise<void> {
    const fn = httpsCallable<void, { success: boolean }>(this.functions, 'disconnectGithub');
    await fn();
    this.connection.set({ connected: false });
  }

  /** Create a new GitHub issue and link it to the task. */
  async linkCreate(input: {
    taskId: string;
    repoOwner: string;
    repoName: string;
    title: string;
    body?: string;
    backlinkUrl?: string;
    type?: string | null;
    priority?: string | null;
  }): Promise<GithubLinkResult> {
    const fn = httpsCallable<Record<string, unknown>, GithubLinkResult>(
      this.functions,
      'linkTaskToGithub',
    );
    const result = await fn({ mode: 'create', ...input });
    return result.data;
  }

  /** Link an existing GitHub issue (by URL or `owner/repo#number`). */
  async linkExisting(taskId: string, issueRef: string): Promise<GithubLinkResult> {
    const fn = httpsCallable<Record<string, unknown>, GithubLinkResult>(
      this.functions,
      'linkTaskToGithub',
    );
    const result = await fn({ mode: 'existing', taskId, issueRef });
    return result.data;
  }

  async unlink(taskId: string): Promise<void> {
    const fn = httpsCallable<{ taskId: string }, { success: boolean }>(
      this.functions,
      'unlinkTaskFromGithub',
    );
    await fn({ taskId });
  }

  async retrySync(taskId: string): Promise<void> {
    const fn = httpsCallable<{ taskId: string }, { success: boolean }>(
      this.functions,
      'retryGithubSync',
    );
    await fn({ taskId });
  }

  /** Refresh org issue types + project fields from GitHub (Phase 2). */
  async refreshFieldConfig(): Promise<GithubConnectionStatus> {
    const fn = httpsCallable<void, { refreshed?: boolean; fieldDefinitionCache?: GithubConnectionStatus['fieldDefinitionCache'] }>(
      this.functions,
      'refreshGithubFieldConfig',
    );
    const result = await fn();
    const current = this.connection();
    const next: GithubConnectionStatus = {
      connected: current?.connected ?? true,
      state: current?.state,
      accountLogin: current?.accountLogin,
      accountType: current?.accountType,
      capabilities: current?.capabilities,
      fieldDefinitionCache: result.data.fieldDefinitionCache ?? current?.fieldDefinitionCache ?? null,
      defaultProjectNodeId: current?.defaultProjectNodeId ?? null,
      createLinkedBranchOnLink: current?.createLinkedBranchOnLink ?? false,
    };
    this.connection.set(next);
    return next;
  }

  async updateConnectionSettings(settings: {
    defaultProjectNodeId?: string | null;
    createLinkedBranchOnLink?: boolean;
  }): Promise<void> {
    const fn = httpsCallable<
      { defaultProjectNodeId?: string | null; createLinkedBranchOnLink?: boolean },
      { success: boolean; defaultProjectNodeId?: string | null; createLinkedBranchOnLink?: boolean }
    >(this.functions, 'updateGithubConnectionSettings');
    const result = await fn(settings);
    const current = this.connection();
    if (current) {
      this.connection.set({
        ...current,
        defaultProjectNodeId:
          result.data.defaultProjectNodeId ?? settings.defaultProjectNodeId ?? current.defaultProjectNodeId,
        createLinkedBranchOnLink:
          result.data.createLinkedBranchOnLink ?? settings.createLinkedBranchOnLink ?? current.createLinkedBranchOnLink,
      });
    }
  }

  async resolveConflict(
    taskId: string,
    resolution: 'prefer_local' | 'prefer_github',
  ): Promise<void> {
    const fn = httpsCallable<
      { taskId: string; resolution: 'prefer_local' | 'prefer_github' },
      { success: boolean }
    >(this.functions, 'resolveGithubConflict');
    await fn({ taskId, resolution });
  }

  watchTaskLink(taskId: string): Observable<TaskGithubLink | null> {
    return docData(doc(this.firestore, 'task_github_links', taskId)).pipe(
      map((data) => (data ? ({ taskId, ...data } as TaskGithubLink) : null)),
    );
  }

  watchTaskFieldValues(taskId: string): Observable<TaskGithubFieldValue[]> {
    const q = query(
      collection(this.firestore, 'task_github_field_values'),
      where('taskId', '==', taskId),
    );
    return collectionData(q, { idField: 'id' }) as Observable<TaskGithubFieldValue[]>;
  }

  watchTaskActors(taskId: string): Observable<TaskGithubActor[]> {
    const q = query(
      collection(this.firestore, 'task_github_actors'),
      where('taskId', '==', taskId),
    );
    return collectionData(q, { idField: 'id' }) as Observable<TaskGithubActor[]>;
  }

  watchTaskRelationships(taskId: string): Observable<TaskGithubRelationship[]> {
    const q = query(
      collection(this.firestore, 'task_github_relationships'),
      where('taskId', '==', taskId),
    );
    return collectionData(q, { idField: 'id' }) as Observable<TaskGithubRelationship[]>;
  }
}
