import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Project,
  DashboardPreferences,
  DashboardWidgetKey,
  ALL_DASHBOARD_WIDGETS,
} from '../../../core/models/domain.model';
import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/auth/auth.service';

interface MetricColorRow {
  key: string;
  label: string;
  value: string;
  defaultValue: string;
}

/**
 * Admin-facing manager that lets a project owner / admin tailor the dashboard:
 *   • Show or hide individual overview widgets.
 *   • Pick a visual style for the Status Breakdown (donut vs. bars).
 *   • Override the per-status and per-priority metric colors.
 *   • Customize the gradient stops used by the Completion progress bar.
 *
 * Edits are buffered locally; nothing is persisted until the user hits "Save".
 * The "Reset to defaults" button clears the project's dashboardPreferences,
 * returning every consumer to the cyber palette and the full widget set.
 */
@Component({
  selector: 'app-dashboard-preferences-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-preferences-manager.component.html',
  styleUrls: ['./dashboard-preferences-manager.component.css'],
})
export class DashboardPreferencesManagerComponent {
  private readonly projectService = inject(ProjectService);
  private readonly auth = inject(AuthService);

  project = input.required<Project>();

  readonly allWidgets = ALL_DASHBOARD_WIDGETS;

  // Local drafts. They are seeded from the input project and updated as the
  // admin edits; nothing leaves the component until `save()` is invoked.
  visible = signal<Set<DashboardWidgetKey>>(new Set());
  statusDisplay = signal<'donut' | 'bars'>('donut');
  completionGradient = signal<string[]>(['#00d2ff', '#e040fb', '#ff1493']);
  statusTodo = signal('#e040fb');
  statusInProgress = signal('#00d2ff');
  statusDone = signal('#6b7280');
  priorityHigh = signal('#ff1493');
  priorityMedium = signal('#e040fb');
  priorityLow = signal('#00d2ff');

  saving = signal(false);
  saveSuccess = signal<boolean | null>(null);
  saveError = signal<string | null>(null);

  // Restricted to owners and admins — non-privileged members get a read-only
  // view. The toolbar reuses this for disabled-state styling.
  canEdit = computed(() => {
    const uid = this.auth.currentUserSig()?.uid;
    const userRole = this.auth.currentUserSig()?.role;
    if (!uid) return false;
    return this.project().ownerId === uid || userRole === 'admin';
  });

  metricRowsStatus = computed<MetricColorRow[]>(() => [
    { key: 'todo', label: 'To Do', value: this.statusTodo(), defaultValue: '#e040fb' },
    { key: 'inProgress', label: 'In Progress', value: this.statusInProgress(), defaultValue: '#00d2ff' },
    { key: 'done', label: 'Done', value: this.statusDone(), defaultValue: '#6b7280' },
  ]);

  metricRowsPriority = computed<MetricColorRow[]>(() => [
    { key: 'high', label: 'High', value: this.priorityHigh(), defaultValue: '#ff1493' },
    { key: 'medium', label: 'Medium', value: this.priorityMedium(), defaultValue: '#e040fb' },
    { key: 'low', label: 'Low', value: this.priorityLow(), defaultValue: '#00d2ff' },
  ]);

  /** Live preview gradient for the Completion bar. */
  gradientPreview = computed(
    () => `linear-gradient(90deg, ${this.completionGradient().join(', ')})`,
  );

  constructor() {
    // Re-seed local drafts whenever the underlying project's preferences
    // change (e.g. an admin saved on another tab and Firestore pushed the
    // new doc to us). We only resync when the project id changes or when
    // we're not currently saving, so an in-flight edit isn't clobbered.
    effect(() => {
      if (this.saving()) return;
      const p = this.project();
      const prefs = p.dashboardPreferences ?? {};
      this.seedFromPrefs(prefs);
    });
  }

  private seedFromPrefs(prefs: DashboardPreferences) {
    const visible = prefs.visibleWidgets?.length
      ? new Set<DashboardWidgetKey>(prefs.visibleWidgets)
      : new Set<DashboardWidgetKey>(this.allWidgets.map((w) => w.key));
    this.visible.set(visible);
    this.statusDisplay.set(prefs.statusDisplay ?? 'donut');
    this.completionGradient.set(
      prefs.completionGradient?.length ? [...prefs.completionGradient] : ['#00d2ff', '#e040fb', '#ff1493'],
    );
    this.statusTodo.set(prefs.statusColors?.todo ?? '#e040fb');
    this.statusInProgress.set(prefs.statusColors?.inProgress ?? '#00d2ff');
    this.statusDone.set(prefs.statusColors?.done ?? '#6b7280');
    this.priorityHigh.set(prefs.priorityColors?.high ?? '#ff1493');
    this.priorityMedium.set(prefs.priorityColors?.medium ?? '#e040fb');
    this.priorityLow.set(prefs.priorityColors?.low ?? '#00d2ff');
  }

  toggleWidget(key: DashboardWidgetKey) {
    const next = new Set(this.visible());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.visible.set(next);
  }

  isWidgetVisible(key: DashboardWidgetKey): boolean {
    return this.visible().has(key);
  }

  setStatusDisplay(value: 'donut' | 'bars') {
    this.statusDisplay.set(value);
  }

  updateGradientStop(index: number, value: string) {
    const next = [...this.completionGradient()];
    next[index] = value;
    this.completionGradient.set(next);
  }

  addGradientStop() {
    const stops = this.completionGradient();
    if (stops.length >= 5) return; // Cap to 5 to keep the gradient readable.
    this.completionGradient.set([...stops, stops[stops.length - 1] ?? '#00d2ff']);
  }

  removeGradientStop(index: number) {
    const stops = this.completionGradient();
    if (stops.length <= 2) return; // A gradient needs at least 2 stops.
    this.completionGradient.set(stops.filter((_, i) => i !== index));
  }

  updateMetricColor(group: 'status' | 'priority', key: string, value: string) {
    if (group === 'status') {
      if (key === 'todo') this.statusTodo.set(value);
      else if (key === 'inProgress') this.statusInProgress.set(value);
      else if (key === 'done') this.statusDone.set(value);
    } else {
      if (key === 'high') this.priorityHigh.set(value);
      else if (key === 'medium') this.priorityMedium.set(value);
      else if (key === 'low') this.priorityLow.set(value);
    }
  }

  /**
   * Persist the buffered draft back onto the project document. We only write
   * fields the user has actually customized so the doc shape stays minimal —
   * a colour identical to the default isn't recorded, letting future palette
   * tweaks propagate without re-saving every project.
   */
  async save(): Promise<void> {
    if (!this.canEdit()) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(null);
    try {
      const prefs: DashboardPreferences = {};
      const visibleArr = Array.from(this.visible());
      if (visibleArr.length !== this.allWidgets.length) {
        prefs.visibleWidgets = visibleArr;
      }
      if (this.statusDisplay() !== 'donut') {
        prefs.statusDisplay = this.statusDisplay();
      }
      const gradient = this.completionGradient();
      const defaultGradient = ['#00d2ff', '#e040fb', '#ff1493'];
      if (
        gradient.length !== defaultGradient.length ||
        gradient.some((c, i) => c !== defaultGradient[i])
      ) {
        prefs.completionGradient = [...gradient];
      }
      const statusColors: NonNullable<DashboardPreferences['statusColors']> = {};
      if (this.statusTodo() !== '#e040fb') statusColors.todo = this.statusTodo();
      if (this.statusInProgress() !== '#00d2ff') statusColors.inProgress = this.statusInProgress();
      if (this.statusDone() !== '#6b7280') statusColors.done = this.statusDone();
      if (Object.keys(statusColors).length) prefs.statusColors = statusColors;

      const priorityColors: NonNullable<DashboardPreferences['priorityColors']> = {};
      if (this.priorityHigh() !== '#ff1493') priorityColors.high = this.priorityHigh();
      if (this.priorityMedium() !== '#e040fb') priorityColors.medium = this.priorityMedium();
      if (this.priorityLow() !== '#00d2ff') priorityColors.low = this.priorityLow();
      if (Object.keys(priorityColors).length) prefs.priorityColors = priorityColors;

      await this.projectService.updateProject(this.project().id, {
        dashboardPreferences: prefs,
      });
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(null), 2500);
    } catch (err) {
      console.error('Failed to save dashboard preferences:', err);
      const detail = err instanceof Error ? err.message : 'Unknown error';
      this.saveError.set(`Failed to save: ${detail}`);
    } finally {
      this.saving.set(false);
    }
  }

  async resetToDefaults(): Promise<void> {
    if (!this.canEdit()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      // Persisting an empty object resets every consumer to its default since
      // the rendering layer already falls back when individual fields are
      // missing. Avoids the more invasive path of a Firestore field deletion.
      await this.projectService.updateProject(this.project().id, {
        dashboardPreferences: {},
      });
      this.seedFromPrefs({});
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(null), 2500);
    } catch (err) {
      console.error('Failed to reset dashboard preferences:', err);
      const detail = err instanceof Error ? err.message : 'Unknown error';
      this.saveError.set(`Failed to reset: ${detail}`);
    } finally {
      this.saving.set(false);
    }
  }
}
