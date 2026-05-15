import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { DialogService } from '../../../core/services/dialog.service';
import {
  CreditHoursScaleConfig,
  MultiFactor,
  MultiFactorScaleConfig,
  NUMERIC_PRESETS,
  NumericScaleConfig,
  PointScaleConfig,
  PointScaleId,
  Project,
  TimeScaleConfig,
} from '../../../core/models/domain.model';
import { SCALE_LABELS, scaleSupportsPert } from '../../../core/utils/point-scale.utils';

interface ScaleOption {
  id: PointScaleId;
  label: string;
  description: string;
}

const SCALE_OPTIONS: readonly ScaleOption[] = [
  {
    id: 'numeric_configurable',
    label: 'Numeric (Points)',
    description: 'Abstract effort points — linear, Fibonacci, powers of two, or custom.',
  },
  {
    id: 'time_unit',
    label: 'Time-Based',
    description: 'Estimate in minutes, hours, days, or weeks with optional load factor.',
  },
  {
    id: 'tshirt',
    label: 'T-Shirt Sizing',
    description: 'XS · S · M · L · XL · XXL. Optional numeric mapping for roll-ups.',
  },
  {
    id: 'animal',
    label: 'Animal Sizing',
    description: 'Mouse · Cat · Dog · Horse · Elephant · Whale.',
  },
  {
    id: 'custom_multi_factor',
    label: 'Custom Multi-Factor',
    description: 'Score each task across multiple effort dimensions.',
  },
  {
    id: 'credit_hours',
    label: 'Internship Credit Hours',
    description: 'Track work-hours against credit-hour requirements for academic programs.',
  },
];

@Component({
  selector: 'app-point-scale-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './point-scale-manager.component.html',
  styleUrls: ['./point-scale-manager.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PointScaleManagerComponent {
  private readonly projectService = inject(ProjectService);
  private readonly dialogService = inject(DialogService);

  project = input.required<Project>();
  projectChanged = output<void>();

  readonly scaleOptions = SCALE_OPTIONS;
  readonly numericPresets = NUMERIC_PRESETS;
  readonly scaleLabels = SCALE_LABELS;
  readonly scaleSupportsPert = scaleSupportsPert;

  /**
   * Draft of the project's point-scale configuration. Null = the feature is
   * off for this project. Edits don't persist until the user clicks "Save".
   */
  draft = signal<PointScaleConfig | null>(null);
  saving = signal(false);
  error = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  private successTimer: ReturnType<typeof setTimeout> | null = null;

  /** ID of the previously-loaded project, used to detect switches. */
  private lastProjectId: string | null = null;

  constructor() {
    effect(() => {
      const p = this.project();
      if (p.id !== this.lastProjectId) {
        this.lastProjectId = p.id;
        this.draft.set(this.cloneConfig(p.pointScaleConfig) ?? null);
        this.error.set(null);
      }
    });
  }

  /** Snapshot the persisted config for diffing. */
  private persisted = computed<PointScaleConfig | undefined>(() => this.project().pointScaleConfig);

  /** Whether the draft differs from the persisted config. */
  hasChanges = computed<boolean>(() => {
    return JSON.stringify(this.draft()) !== JSON.stringify(this.persisted() ?? null);
  });

  /** Currently-selected scale id ("none" sentinel when feature is off). */
  selectedScaleId = computed<PointScaleId | 'none'>(() => {
    const d = this.draft();
    return d ? d.scale : 'none';
  });

  /** Cast helpers used by the template (Angular templates can't narrow unions). */
  asNumeric = computed<NumericScaleConfig | null>(() => {
    const d = this.draft();
    return d && d.scale === 'numeric_configurable' ? d : null;
  });
  asTime = computed<TimeScaleConfig | null>(() => {
    const d = this.draft();
    return d && d.scale === 'time_unit' ? d : null;
  });
  asMultiFactor = computed<MultiFactorScaleConfig | null>(() => {
    const d = this.draft();
    return d && d.scale === 'custom_multi_factor' ? d : null;
  });
  asCreditHours = computed<CreditHoursScaleConfig | null>(() => {
    const d = this.draft();
    return d && d.scale === 'credit_hours' ? d : null;
  });

  selectScale(id: PointScaleId | 'none'): void {
    if (id === 'none') {
      this.draft.set(null);
      return;
    }
    if (this.draft()?.scale === id) return;
    this.draft.set(this.defaultsFor(id));
  }

  /** Build a sensible default for each scale so the form is usable on first click. */
  private defaultsFor(id: PointScaleId): PointScaleConfig {
    switch (id) {
      case 'numeric_configurable':
        return { ...NUMERIC_PRESETS[0].config };
      case 'time_unit':
        return {
          scale: 'time_unit',
          unit: 'hours',
          decimal_precision: 2,
          input_mode: 'freeform',
          load_factor: 1,
        };
      case 'tshirt':
        return { scale: 'tshirt' };
      case 'animal':
        return { scale: 'animal' };
      case 'custom_multi_factor':
        return {
          scale: 'custom_multi_factor',
          formula: 'sum',
          factors: [
            { id: crypto.randomUUID(), name: 'Complexity', scale: [1, 2, 3, 5, 8], weight: 1 },
          ],
        };
      case 'credit_hours':
        return {
          scale: 'credit_hours',
          total_credit_hours: 3,
          total_work_hours: 135,
          input_mode: 'direct',
        };
    }
  }

  applyNumericPreset(presetId: string): void {
    const preset = NUMERIC_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const pertOn = !!(this.asNumeric()?.pert_mode_enabled);
    this.draft.set({ ...preset.config, pert_mode_enabled: pertOn });
  }

  togglePert(checked: boolean): void {
    const d = this.draft();
    if (!d || !scaleSupportsPert(d.scale)) return;
    this.draft.set({ ...d, pert_mode_enabled: checked } as PointScaleConfig);
  }

  // Numeric scale field edits ------------------------------------------------
  updateNumeric<K extends keyof NumericScaleConfig>(key: K, value: NumericScaleConfig[K]): void {
    const d = this.asNumeric();
    if (!d) return;
    this.draft.set({ ...d, [key]: value });
  }

  updateNumericCustomValues(raw: string): void {
    const values = raw
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => isFinite(n));
    this.updateNumeric('custom_values', values);
  }

  // Time scale field edits ---------------------------------------------------
  updateTime<K extends keyof TimeScaleConfig>(key: K, value: TimeScaleConfig[K]): void {
    const d = this.asTime();
    if (!d) return;
    this.draft.set({ ...d, [key]: value });
  }

  updateTimePresets(raw: string): void {
    const values = raw
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => isFinite(n));
    this.updateTime('preset_values', values);
  }

  // Multi-factor edits -------------------------------------------------------
  updateMultiFactorFormula(formula: MultiFactorScaleConfig['formula']): void {
    const d = this.asMultiFactor();
    if (!d) return;
    this.draft.set({ ...d, formula });
  }

  addFactor(): void {
    const d = this.asMultiFactor();
    if (!d) return;
    const next: MultiFactor = {
      id: crypto.randomUUID(),
      name: `Factor ${d.factors.length + 1}`,
      scale: [1, 2, 3],
      weight: 1,
    };
    this.draft.set({ ...d, factors: [...d.factors, next] });
  }

  removeFactor(id: string): void {
    const d = this.asMultiFactor();
    if (!d) return;
    this.draft.set({ ...d, factors: d.factors.filter((f) => f.id !== id) });
  }

  updateFactor(id: string, patch: Partial<MultiFactor>): void {
    const d = this.asMultiFactor();
    if (!d) return;
    this.draft.set({
      ...d,
      factors: d.factors.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  }

  updateFactorScale(id: string, raw: string): void {
    const scale = raw
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => isFinite(n));
    this.updateFactor(id, { scale });
  }

  // Credit-hours edits -------------------------------------------------------
  updateCreditHours<K extends keyof CreditHoursScaleConfig>(
    key: K,
    value: CreditHoursScaleConfig[K],
  ): void {
    const d = this.asCreditHours();
    if (!d) return;
    this.draft.set({ ...d, [key]: value });
  }

  // Persist ------------------------------------------------------------------
  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    this.successMessage.set(null);
    try {
      const draft = this.draft();
      const previous = this.project().pointScaleConfig;

      // Warn before changing scale type when tasks may have values.
      if (previous && (!draft || draft.scale !== previous.scale)) {
        const confirmed = await this.dialogService.confirm(
          'Changing the scale type will remap existing task point values to the nearest equivalent. Continue?',
          'Confirm scale change',
        );
        if (!confirmed) return;
      }

      await this.projectService.updatePointScaleConfig(this.project().id, draft);
      this.projectChanged.emit();
      this.flashSuccess(draft ? 'Point-scale settings saved' : 'Point-scale disabled for project');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save point-scale configuration';
      this.error.set(message);
    } finally {
      this.saving.set(false);
    }
  }

  private flashSuccess(message: string): void {
    this.successMessage.set(message);
    if (this.successTimer) clearTimeout(this.successTimer);
    this.successTimer = setTimeout(() => this.successMessage.set(null), 4000);
  }

  reset(): void {
    this.draft.set(this.cloneConfig(this.project().pointScaleConfig) ?? null);
    this.error.set(null);
  }

  private cloneConfig(c: PointScaleConfig | undefined): PointScaleConfig | undefined {
    return c ? (JSON.parse(JSON.stringify(c)) as PointScaleConfig) : undefined;
  }
}
