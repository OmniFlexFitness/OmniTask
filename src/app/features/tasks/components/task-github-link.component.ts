import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
  computed,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, switchMap } from 'rxjs';
import { GithubService } from '../../../core/services/github.service';
import {
  TaskGithubActor,
  TaskGithubFieldValue,
  TaskGithubLink,
  TaskGithubRelationship,
} from '../../../core/models/github.model';
import { Task } from '../../../core/models/domain.model';

@Component({
  selector: 'app-task-github-link',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-github-link.component.html',
  styleUrls: ['./task-github-link.component.css'],
})
export class TaskGithubLinkComponent {
  private readonly github = inject(GithubService);
  private readonly destroyRef = inject(DestroyRef);

  task = input.required<Task>();

  link = signal<TaskGithubLink | null>(null);
  fieldValues = signal<TaskGithubFieldValue[]>([]);
  actors = signal<TaskGithubActor[]>([]);
  relationships = signal<TaskGithubRelationship[]>([]);
  busy = signal(false);
  error = signal<string | null>(null);

  showCreateForm = signal(false);
  repoOwner = signal('');
  repoName = signal('');
  issueRef = signal('');
  issueType = signal<string | null>(null);
  linkMode = signal<'create' | 'existing'>('create');
  securityAlertUrl = signal('');

  connected = computed(() => this.github.connection()?.connected ?? false);
  issueTypes = computed(
    () => this.github.connection()?.fieldDefinitionCache?.issueTypes ?? [],
  );
  hasConflict = computed(() => this.link()?.syncState === 'conflict');
  syncError = computed(() => this.link()?.syncState === 'error');

  constructor() {
    void this.github.loadConnection();

    toObservable(this.task)
      .pipe(
        switchMap((t) =>
          combineLatest([
            this.github.watchTaskLink(t.id),
            this.github.watchTaskFieldValues(t.id),
            this.github.watchTaskActors(t.id),
            this.github.watchTaskRelationships(t.id),
          ]),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(([link, fields, actors, rels]) => {
        this.link.set(link);
        this.fieldValues.set(fields);
        this.actors.set(actors);
        this.relationships.set(rels);
      });
  }

  toggleCreate(): void {
    this.showCreateForm.update((v) => !v);
    this.error.set(null);
  }

  async linkExisting(): Promise<void> {
    const ref = this.issueRef().trim();
    if (!ref) {
      this.error.set('Enter an issue URL or owner/repo#number');
      return;
    }
    await this.run(() => this.github.linkExisting(this.task().id, ref));
  }

  async linkCreate(): Promise<void> {
    const owner = this.repoOwner().trim();
    const repo = this.repoName().trim();
    if (!owner || !repo) {
      this.error.set('Repository owner and name are required');
      return;
    }
    await this.run(() =>
      this.github.linkCreate({
        taskId: this.task().id,
        repoOwner: owner,
        repoName: repo,
        title: this.task().title,
        body: this.task().description,
        type: this.issueType(),
        priority: this.task().priority,
      }),
    );
  }

  async unlink(): Promise<void> {
    await this.run(() => this.github.unlink(this.task().id));
    this.showCreateForm.set(false);
  }

  async retrySync(): Promise<void> {
    await this.run(() => this.github.retrySync(this.task().id));
  }

  async resolveConflict(resolution: 'prefer_local' | 'prefer_github'): Promise<void> {
    await this.run(() => this.github.resolveConflict(this.task().id, resolution));
  }

  async addSecurityAlert(): Promise<void> {
    const url = this.securityAlertUrl().trim();
    if (!url) {
      this.error.set('Enter a GitHub security alert URL');
      return;
    }
    await this.run(async () => {
      await this.github.addSecurityAlertReference(this.task().id, url);
      this.securityAlertUrl.set('');
    });
  }

  actorRoleLabel(role: TaskGithubActor['role']): string {
    return role === 'participant' ? 'Participant' : 'Assignee';
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      this.showCreateForm.set(false);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'GitHub action failed');
    } finally {
      this.busy.set(false);
    }
  }

  relationshipLabel(rel: TaskGithubRelationship): string {
    const prefix =
      rel.kind === 'sub_issue'
        ? 'Sub-issue'
        : rel.kind === 'blocked_by'
          ? 'Blocked by'
          : 'Blocks';
    return `${prefix}: ${rel.relatedRepoOwner}/${rel.relatedRepoName}#${rel.relatedIssueNumber}`;
  }
}
