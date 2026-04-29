import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Project,
  DashboardPreferences,
  DashboardWidgetKey,
  ALL_DASHBOARD_WIDGETS,
  DEFAULT_COMPLETION_GRADIENT,
  DEFAULT_DASHBOARD_STATUS_COLORS,
  DEFAULT_DASHBOARD_PRIORITY_COLORS,
  DEFAULT_DASHBOARD_STATUS_DISPLAY,
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
 * Local drafts are seeded once from the input project on init — we deliberately
 * avoid an effect that watches the input so a Firestore push (e.g. another tab
 * updates the same project) doesn't silently clobber an in-flight edit. Users
 * can re-pull state via `discardChanges()` or wipe to defaults via `resetToDefaults()`.
 */
@Component({
  selector: 'app-dashboard-preferences-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-preferences-manager.component.html',
  styleUrls: ['./dashboard-preferences-manager.component.css'],
})
export class DashboardPreferencesManagerComponent implements OnInit {
  private readonly projectService = inject(ProjectService);
  private readonly auth = inject(AuthService);

  project = input.required<Project>();

  readonly allWidgets = ALL_DASHBOARD_WIDGETS;

  // Local drafts. They are seeded from the input project on init and updated
  // as the admin edits; nothing leaves the component until `save()` is invoked.
  visible = signal<Set<DashboardWidgetKey>>(
    new Set<DashboardWidgetKey>(ALL_DASHBOARD_WIDGETS.map((w) => w.key)),
  );
  statusDisplay = signal<'donut' | 'bars'>(DEFAULT_DASHBOARD_STATUS_DISPLAY);
  completionGradient = signal<string[]>([...DEFAULT_COMPLETION_GRADIENT]);
  statusTodo = signal<string>(DEFAULT_DASHBOARD_STATUS_COLORS.todo);
  statusInProgress = signal<string>(DEFAULT_DASHBOARD_STATUS_COLORS.inProgress);
  statusDone = signal<string>(DEFAULT_DASHBOARD_STATUS_COLORS.done);
  priorityHigh = signal<string>(DEFAULT_DASHBOARD_PRIORITY_COLORS.high);
  priorityMedium = signal<string>(DEFAULT_DASHBOARD_PRIORITY_COLORS.medium);
  priorityLow = signal<string>(DEFAULT_DASHBOARD_PRIORITY_COLORS.low);

  saving = signal(false);
  saveSuccess = signal<boolean | null>(null);
  saveError = signal<string | null>(null);

  // Restricted to owners and admins — non-privileged members get a read-only
  // view. The toolbar reuses this for disabled-state styling.
  canEdit = computed(() => {
    const user = this.auth.currentUserSig();
    if (!user) return false;
    return this.project().ownerId === user.uid || user.role === 'admin';
  });

  metricRowsStatus = computed<MetricColorRow[]>(() => [
    {
      key: 'todo',
      label: 'To Do',
      value: this.statusTodo(),
      defaultValue: DEFAULT_DASHBOARD_STATUS_COLORS.todo,
    },
    {
      key: 'inProgress',
      label: 'In Progress',
      value: this.statusInProgress(),
      defaultValue: DEFAULT_DASHBOARD_STATUS_COLORS.inProgress,
    },
    {
      key: 'done',
      label: 'Done',
      value: this.statusDone(),
      defaultValue: DEFAULT_DASHBOARD_STATUS_COLORS.done,
    },
  ]);

  metricRowsPriority = computed<MetricColorRow[]>(() => [
    {
      key: 'high',
      label: 'High',
      value: this.priorityHigh(),
      defaultValue: DEFAULT_DASHBOARD_PRIORITY_COLORS.high,
    },
    {
      key: 'medium',
      label: 'Medium',
      value: this.priorityMedium(),
      defaultValue: DEFAULT_DASHBOARD_PRIORITY_COLORS.medium,
    },
    {
      key: 'low',
      label: 'Low',
      value: this.priorityLow(),
      defaultValue: DEFAULT_DASHBOARD_PRIORITY_COLORS.low,
    },
  ]);

  /** Live preview gradient for the Completion bar. */
  gradientPreview = computed(
    () => `linear-gradient(90deg, ${this.completionGradient().join(', ')})`,
  );

  ngOnInit(): void {
    this.seedFromPrefs(this.project().dashboardPreferences ?? {});
  }

  /** Re-pull state from the latest server-side project doc. */
  discardChanges(): void {
    this.seedFromPrefs(this.project().dashboardPreferences ?? {});
    this.saveSuccess.set(null);
    this.saveError.set(null);
  }

  private seedFromPrefs(prefs: DashboardPreferences): void {
    // Preserve the difference between "no preference saved" (visibleWidgets
    // === undefined → show every widget) and "admin explicitly hid every
    // widget" (visibleWidgets === [] → keep them all off). Coercing [] to
    // "all" here would silently undo a fully-hidden dashboard on reopen.
    const visible =
      prefs.visibleWidgets === undefined
        ? new Set<DashboardWidgetKey>(this.allWidgets.map((w) => w.key))
        : new Set<DashboardWidgetKey>(prefs.visibleWidgets);
    this.visible.set(visible);
    this.statusDisplay.set(prefs.statusDisplay ?? DEFAULT_DASHBOARD_STATUS_DISPLAY);
    this.completionGradient.set(
      prefs.completionGradient?.length
        ? [...prefs.completionGradient]
        : [...DEFAULT_COMPLETION_GRADIENT],
    );
    this.statusTodo.set(prefs.statusColors?.todo ?? DEFAULT_DASHBOARD_STATUS_COLORS.todo);
    this.statusInProgress.set(
      prefs.statusColors?.inProgress ?? DEFAULT_DASHBOARD_STATUS_COLORS.inProgress,
    );
    this.statusDone.set(prefs.statusColors?.done ?? DEFAULT_DASHBOARD_STATUS_COLORS.done);
    this.priorityHigh.set(
      prefs.priorityColors?.high ?? DEFAULT_DASHBOARD_PRIORITY_COLORS.high,
    );
    this.priorityMedium.set(
      prefs.priorityColors?.medium ?? DEFAULT_DASHBOARD_PRIORITY_COLORS.medium,
    );
    this.priorityLow.set(
      prefs.priorityColors?.low ?? DEFAULT_DASHBOARD_PRIORITY_COLORS.low,
    );
  }

  toggleWidget(key: DashboardWidgetKey): void {
    const next = new Set(this.visible());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.visible.set(next);
  }

  isWidgetVisible(key: DashboardWidgetKey): boolean {
    return this.visible().has(key);
  }

  setStatusDisplay(value: 'donut' | 'bars'): void {
    this.statusDisplay.set(value);
  }

  updateGradientStop(index: number, value: string): void {
    const next = [...this.completionGradient()];
    next[index] = value;
    this.completionGradient.set(next);
  }

  addGradientStop(): void {
    const stops = this.completionGradient();
    if (stops.length >= 5) return; // Cap to 5 to keep the gradient readable.
    this.completionGradient.set([...stops, stops[stops.length - 1] ?? DEFAULT_COMPLETION_GRADIENT[0]]);
  }

  removeGradientStop(index: number): void {
    const stops = this.completionGradient();
    if (stops.length <= 2) return; // A gradient needs at least 2 stops.
    this.completionGradient.set(stops.filter((_, i) => i !== index));
  }

  updateMetricColor(group: 'status' | 'priority', key: string, value: string): void {
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
      if (this.statusDisplay() !== DEFAULT_DASHBOARD_STATUS_DISPLAY) {
        prefs.statusDisplay = this.statusDisplay();
      }
      const gradient = this.completionGradient();
      const isDefaultGradient =
        gradient.length === DEFAULT_COMPLETION_GRADIENT.length &&
        gradient.every((c, i) => c === DEFAULT_COMPLETION_GRADIENT[i]);
      if (!isDefaultGradient) {
        prefs.completionGradient = [...gradient];
      }
      const statusColors: NonNullable<DashboardPreferences['statusColors']> = {};
      if (this.statusTodo() !== DEFAULT_DASHBOARD_STATUS_COLORS.todo) {
        statusColors.todo = this.statusTodo();
      }
      if (this.statusInProgress() !== DEFAULT_DASHBOARD_STATUS_COLORS.inProgress) {
        statusColors.inProgress = this.statusInProgress();
      }
      if (this.statusDone() !== DEFAULT_DASHBOARD_STATUS_COLORS.done) {
        statusColors.done = this.statusDone();
      }
      if (Object.keys(statusColors).length) prefs.statusColors = statusColors;

      const priorityColors: NonNullable<DashboardPreferences['priorityColors']> = {};
      if (this.priorityHigh() !== DEFAULT_DASHBOARD_PRIORITY_COLORS.high) {
        priorityColors.high = this.priorityHigh();
      }
      if (this.priorityMedium() !== DEFAULT_DASHBOARD_PRIORITY_COLORS.medium) {
        priorityColors.medium = this.priorityMedium();
      }
      if (this.priorityLow() !== DEFAULT_DASHBOARD_PRIORITY_COLORS.low) {
        priorityColors.low = this.priorityLow();
      }
      if (Object.keys(priorityColors).length) prefs.priorityColors = priorityColors;

      await this.projectService.updateProject(this.project().id, {
        dashboardPreferences: prefs,
      });
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(null), 2500);
    } catch (err) {
      console.error('Failed to save dashboard preferences:', err);
      this.saveError.set('Failed to save preferences. Please try again.');
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
      this.saveError.set('Failed to reset preferences. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
