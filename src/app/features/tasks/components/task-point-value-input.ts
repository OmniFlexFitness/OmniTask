import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AnimalSize,
  ANIMAL_ICONS,
  ANIMAL_SIZES,
  CreditHoursScaleConfig,
  CREDIT_HOURS_BUCKETS,
  CREDIT_HOURS_FIB,
  DEFAULT_ANIMAL_MAPPING,
  DEFAULT_TSHIRT_MAPPING,
  MultiFactorScaleConfig,
  NumericScaleConfig,
  PointScaleConfig,
  PointValue,
  TimeScaleConfig,
  TShirtSize,
  TSHIRT_SIZES,
} from '../../../core/models/domain.model';
import {
  computePertEstimate,
  computePertStdDev,
  formatPointValue,
  getNumericAllowedValues,
  timeUnitSuffix,
} from '../../../core/utils/point-scale.utils';
import { SnapSliderComponent } from '../../../shared/components/snap-slider/snap-slider.component';

@Component({
  selector: 'app-task-point-value-input',
  standalone: true,
  imports: [CommonModule, FormsModule, SnapSliderComponent],
  templateUrl: './task-point-value-input.html',
  styleUrls: ['./task-point-value-input.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskPointValueInputComponent {
  config = input.required<PointScaleConfig | undefined>();
  value = input<PointValue | undefined>(undefined);

  valueChange = output<PointValue | undefined>();

  // Constants exposed to template
  readonly tshirtSizes = TSHIRT_SIZES;
  readonly animalSizes = ANIMAL_SIZES;
  readonly animalIcons = ANIMAL_ICONS;
  readonly creditBuckets = CREDIT_HOURS_BUCKETS;
  readonly creditFib = CREDIT_HOURS_FIB;
  readonly formatPointValue = formatPointValue;

  // --- Type-narrowed config accessors ----------------------------------------
  numericConfig = computed<NumericScaleConfig | null>(() => {
    const c = this.config();
    return c?.scale === 'numeric_configurable' ? c : null;
  });
  timeConfig = computed<TimeScaleConfig | null>(() => {
    const c = this.config();
    return c?.scale === 'time_unit' ? c : null;
  });
  multiFactorConfig = computed<MultiFactorScaleConfig | null>(() => {
    const c = this.config();
    return c?.scale === 'custom_multi_factor' ? c : null;
  });
  creditHoursConfig = computed<CreditHoursScaleConfig | null>(() => {
    const c = this.config();
    return c?.scale === 'credit_hours' ? c : null;
  });

  // --- Type-narrowed value accessors -----------------------------------------
  numericValue = computed<number | null>(() => {
    const v = this.value();
    return v?.type === 'numeric' ? v.value : null;
  });
  pertValue = computed<{ o: number; m: number; p: number } | null>(() => {
    const v = this.value();
    return v?.type === 'numeric_pert'
      ? { o: v.optimistic, m: v.mostLikely, p: v.pessimistic }
      : null;
  });
  tshirtValue = computed<TShirtSize | null>(() => {
    const v = this.value();
    return v?.type === 'tshirt' ? v.value : null;
  });
  animalValue = computed<AnimalSize | null>(() => {
    const v = this.value();
    return v?.type === 'animal' ? v.value : null;
  });
  multiFactorValue = computed<Record<string, number>>(() => {
    const v = this.value();
    return v?.type === 'multi_factor' ? v.values : {};
  });

  // --- Derived display -------------------------------------------------------
  numericAllowed = computed<number[]>(() => {
    const c = this.numericConfig();
    return c ? getNumericAllowedValues(c) : [];
  });

  pertSupported = computed<boolean>(() => {
    const c = this.config();
    return (
      (c?.scale === 'numeric_configurable' ||
        c?.scale === 'time_unit' ||
        c?.scale === 'credit_hours') &&
      !!c.pert_mode_enabled
    );
  });

  pertSummary = computed<string>(() => {
    const v = this.pertValue();
    const c = this.config();
    if (!v || !c) return '';
    const est = computePertEstimate(v.o, v.m, v.p);
    const sd = computePertStdDev(v.o, v.m, v.p);
    const suffix =
      c.scale === 'time_unit'
        ? timeUnitSuffix(c.unit)
        : c.scale === 'credit_hours'
          ? 'h'
          : '';
    return `Weighted ${this.round(est)} ± ${this.round(sd)}${suffix}`;
  });

  unitSuffix = computed<string>(() => {
    const c = this.config();
    if (!c) return '';
    if (c.scale === 'time_unit') return timeUnitSuffix(c.unit);
    if (c.scale === 'credit_hours') return 'h';
    return '';
  });

  // --- Slider source data ----------------------------------------------------
  // Each scale projects to (values[], labels?[]) so the same slider component
  // can drive every discrete picker.

  /** Allowed numeric values, used by the numeric and time-preset sliders. */
  sliderValues = computed<number[]>(() => {
    const c = this.config();
    if (!c) return [];
    if (c.scale === 'numeric_configurable') return getNumericAllowedValues(c);
    if (c.scale === 'time_unit') {
      return c.input_mode === 'preset' ? c.preset_values || [] : [];
    }
    if (c.scale === 'credit_hours') {
      if (c.input_mode === 'bucket') return [...CREDIT_HOURS_BUCKETS];
      if (c.input_mode === 'fibonacci') return [...CREDIT_HOURS_FIB];
      return [];
    }
    return [];
  });

  /** Optional labels for the slider — only the time-unit slider adds a suffix. */
  sliderLabels = computed<string[] | undefined>(() => {
    const c = this.config();
    if (!c) return undefined;
    if (c.scale === 'time_unit' && c.input_mode === 'preset') {
      return (c.preset_values || []).map((v) => `${v}${timeUnitSuffix(c.unit)}`);
    }
    if (c.scale === 'credit_hours' && c.input_mode !== 'direct') {
      return this.sliderValues().map((v) => `${v}h`);
    }
    return undefined;
  });

  /**
   * Whether the active numeric-like scale picks values from a discrete set
   * (so a snap-slider makes sense). Free-form time and direct-entry credit
   * hours fall back to a continuous range input.
   */
  hasDiscreteValues = computed<boolean>(() => this.sliderValues().length > 0);

  /** Min/max for the continuous range input (free-form time / direct credit hours). */
  continuousRange = computed<{ min: number; max: number; step: number } | null>(() => {
    const c = this.config();
    if (!c) return null;
    if (c.scale === 'time_unit' && c.input_mode === 'freeform') {
      const precision = c.decimal_precision ?? 2;
      const step = Math.pow(10, -precision);
      // Time scales don't carry an explicit range; pick sensible defaults
      // per unit so the slider has stops to drag between.
      const maxByUnit = { minutes: 480, hours: 40, days: 30, weeks: 12 };
      return { min: 0, max: maxByUnit[c.unit], step };
    }
    if (c.scale === 'credit_hours' && c.input_mode === 'direct') {
      return { min: 0, max: c.total_work_hours || 100, step: 0.25 };
    }
    return null;
  });

  /** T-shirt slider values map to the configured numeric mapping. */
  tshirtSliderValues = computed<number[]>(() => {
    const c = this.config();
    if (c?.scale !== 'tshirt') return [];
    const mapping = c.mapping || DEFAULT_TSHIRT_MAPPING;
    return TSHIRT_SIZES.map((s) => mapping[s]);
  });

  tshirtSliderActive = computed<number | null>(() => {
    const c = this.config();
    const v = this.tshirtValue();
    if (c?.scale !== 'tshirt' || !v) return null;
    return (c.mapping || DEFAULT_TSHIRT_MAPPING)[v];
  });

  animalSliderValues = computed<number[]>(() => {
    const c = this.config();
    if (c?.scale !== 'animal') return [];
    const mapping = c.mapping || DEFAULT_ANIMAL_MAPPING;
    return ANIMAL_SIZES.map((s) => mapping[s]);
  });

  animalSliderActive = computed<number | null>(() => {
    const c = this.config();
    const v = this.animalValue();
    if (c?.scale !== 'animal' || !v) return null;
    return (c.mapping || DEFAULT_ANIMAL_MAPPING)[v];
  });

  animalSliderLabels = computed<string[]>(() => ANIMAL_SIZES.map((s) => `${ANIMAL_ICONS[s]} ${s}`));

  setTShirtFromSlider(mapped: number): void {
    const c = this.config();
    if (c?.scale !== 'tshirt') return;
    const mapping = c.mapping || DEFAULT_TSHIRT_MAPPING;
    const match = TSHIRT_SIZES.find((s) => mapping[s] === mapped);
    if (match) this.valueChange.emit({ type: 'tshirt', value: match });
  }

  setAnimalFromSlider(mapped: number): void {
    const c = this.config();
    if (c?.scale !== 'animal') return;
    const mapping = c.mapping || DEFAULT_ANIMAL_MAPPING;
    const match = ANIMAL_SIZES.find((s) => mapping[s] === mapped);
    if (match) this.valueChange.emit({ type: 'animal', value: match });
  }

  // --- Mutation handlers -----------------------------------------------------
  setNumeric(raw: string | number): void {
    if (raw === '' || raw === null || raw === undefined) {
      this.valueChange.emit(undefined);
      return;
    }
    const n = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!isFinite(n)) {
      this.valueChange.emit(undefined);
      return;
    }
    this.valueChange.emit({ type: 'numeric', value: n });
  }

  setPert(field: 'o' | 'm' | 'p', raw: string | number): void {
    const v = this.pertValue() ?? { o: 0, m: 0, p: 0 };
    const n = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!isFinite(n)) return;
    const next = { ...v, [field]: n };
    this.valueChange.emit({
      type: 'numeric_pert',
      optimistic: next.o,
      mostLikely: next.m,
      pessimistic: next.p,
    });
  }

  setTShirt(size: TShirtSize): void {
    if (this.tshirtValue() === size) {
      this.valueChange.emit(undefined);
    } else {
      this.valueChange.emit({ type: 'tshirt', value: size });
    }
  }

  setAnimal(size: AnimalSize): void {
    if (this.animalValue() === size) {
      this.valueChange.emit(undefined);
    } else {
      this.valueChange.emit({ type: 'animal', value: size });
    }
  }

  setFactor(factorId: string, raw: string | number): void {
    const n = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!isFinite(n)) return;
    const current = { ...this.multiFactorValue(), [factorId]: n };
    this.valueChange.emit({ type: 'multi_factor', values: current });
  }

  clear(): void {
    this.valueChange.emit(undefined);
  }

  private round(n: number): string {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/\.?0+$/, '');
  }
}
