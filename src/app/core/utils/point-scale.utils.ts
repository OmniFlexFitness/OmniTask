import {
  AnimalScaleConfig,
  AnimalSize,
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
  TShirtScaleConfig,
  TShirtSize,
  TSHIRT_SIZES,
} from '../models/domain.model';

/**
 * Generate the allowed numeric values from a numeric scale config.
 * For `custom`, returns the user-defined list (clipped to allow_zero).
 */
export function getNumericAllowedValues(config: NumericScaleConfig): number[] {
  const values = generateNumericValues(config);
  if (!config.allow_zero) {
    return values.filter((v) => v !== 0);
  }
  return values;
}

function generateNumericValues(config: NumericScaleConfig): number[] {
  const { min_value, max_value, increment_type } = config;

  switch (increment_type) {
    case 'linear': {
      const step = config.increment_step && config.increment_step > 0 ? config.increment_step : 1;
      const out: number[] = [];
      // Use rounding to avoid floating point drift on non-integer steps.
      const decimals = decimalPlaces(step);
      for (let v = min_value; v <= max_value + 1e-9; v += step) {
        out.push(round(v, decimals));
      }
      return out;
    }
    case 'fibonacci': {
      const out: number[] = [];
      let a = 1;
      let b = 1;
      // Include 0 only if min_value is 0; otherwise start at 1.
      if (min_value <= 0) out.push(0);
      while (a <= max_value) {
        if (a >= min_value) out.push(a);
        [a, b] = [b, a + b];
      }
      return out;
    }
    case 'powers_of_two': {
      const out: number[] = [];
      let v = 1;
      // Reach min_value first.
      while (v < min_value) v *= 2;
      while (v <= max_value) {
        out.push(v);
        v *= 2;
      }
      return out;
    }
    case 'custom': {
      const values = (config.custom_values || []).slice().sort((a, b) => a - b);
      return values.filter((v) => v >= min_value && v <= max_value);
    }
  }
}

function decimalPlaces(n: number): number {
  if (!isFinite(n)) return 0;
  const s = n.toString();
  if (s.indexOf('.') === -1) return 0;
  return s.split('.')[1].length;
}

function round(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

/**
 * Allowed hour-bucket values for a credit-hours scale, after applying any
 * configured min/max bounds. Falls back to the full default list when
 * bounds are not set. `direct` mode has no fixed list, so this returns an
 * empty array for it (callers should treat that as "use continuous input").
 */
export function getCreditHoursAllowedValues(config: CreditHoursScaleConfig): number[] {
  let base: readonly number[];
  if (config.input_mode === 'bucket') {
    base = CREDIT_HOURS_BUCKETS;
  } else if (config.input_mode === 'fibonacci') {
    base = CREDIT_HOURS_FIB;
  } else {
    return [];
  }
  const min = config.min_value;
  const max = config.max_value;
  if (min === undefined && max === undefined) return [...base];
  return base.filter((v) => (min === undefined || v >= min) && (max === undefined || v <= max));
}

/** Time-unit suffix used for display. */
export function timeUnitSuffix(unit: TimeScaleConfig['unit']): string {
  switch (unit) {
    case 'minutes':
      return 'm';
    case 'hours':
      return 'h';
    case 'days':
      return 'd';
    case 'weeks':
      return 'w';
  }
}

/** PERT weighted estimate: (O + 4M + P) / 6. */
export function computePertEstimate(o: number, m: number, p: number): number {
  return (o + 4 * m + p) / 6;
}

/** PERT standard deviation: (P - O) / 6. */
export function computePertStdDev(o: number, m: number, p: number): number {
  return (p - o) / 6;
}

/**
 * Project any PointValue down to a single number so it can be summed or
 * compared. For PERT values, returns the weighted estimate. Used for
 * roll-ups and credit-fraction calculations.
 */
export function pointValueScalar(
  value: PointValue | undefined,
  config: PointScaleConfig,
): number {
  if (!value) return 0;
  switch (value.type) {
    case 'numeric':
      return value.value;
    case 'numeric_pert':
      return computePertEstimate(value.optimistic, value.mostLikely, value.pessimistic);
    case 'tshirt': {
      const mapping = (config as TShirtScaleConfig).mapping || DEFAULT_TSHIRT_MAPPING;
      return mapping[value.value] ?? 0;
    }
    case 'animal': {
      const mapping = (config as AnimalScaleConfig).mapping || DEFAULT_ANIMAL_MAPPING;
      return mapping[value.value] ?? 0;
    }
    case 'multi_factor':
      return multiFactorScore(value.values, config as MultiFactorScaleConfig);
  }
}

function multiFactorScore(
  values: Record<string, number>,
  config: MultiFactorScaleConfig,
): number {
  const factors = config.factors || [];
  if (factors.length === 0) return 0;

  switch (config.formula) {
    case 'product': {
      let acc = 1;
      for (const f of factors) {
        const v = Number(values[f.id]);
        if (!isFinite(v)) return 0;
        acc *= v;
      }
      return acc;
    }
    case 'weighted_sum': {
      let acc = 0;
      for (const f of factors) {
        const v = Number(values[f.id]) || 0;
        acc += v * (f.weight || 0);
      }
      return acc;
    }
    case 'sum':
    default: {
      let acc = 0;
      for (const f of factors) {
        acc += Number(values[f.id]) || 0;
      }
      return acc;
    }
  }
}

export interface AggregateResult {
  total: number;
  /** Total standard deviation for PERT roll-ups; 0 when not applicable. */
  totalStdDev: number;
  /** Forecasted total after applying load factor (time scale only). */
  forecastTotal?: number;
  /** Number of tasks contributing a non-zero value. */
  contributingCount: number;
}

export function aggregateValues(
  values: (PointValue | undefined)[],
  config: PointScaleConfig,
): AggregateResult {
  let total = 0;
  let variance = 0;
  let contributing = 0;
  for (const v of values) {
    if (!v) continue;
    const scalar = pointValueScalar(v, config);
    if (scalar !== 0) contributing += 1;
    total += scalar;
    if (v.type === 'numeric_pert') {
      const sd = computePertStdDev(v.optimistic, v.mostLikely, v.pessimistic);
      variance += sd * sd;
    }
  }
  const result: AggregateResult = {
    total,
    totalStdDev: Math.sqrt(variance),
    contributingCount: contributing,
  };
  if (config.scale === 'time_unit' && config.load_factor && config.load_factor !== 1) {
    result.forecastTotal = total * config.load_factor;
  }
  return result;
}

/** Format a single PointValue for compact display (badge / sidebar). */
export function formatPointValue(
  value: PointValue | undefined,
  config: PointScaleConfig | undefined,
): string {
  if (!value || !config) return '';
  switch (value.type) {
    case 'numeric': {
      if (config.scale === 'time_unit') {
        return `${formatNumber(value.value)}${timeUnitSuffix(config.unit)}`;
      }
      if (config.scale === 'credit_hours') {
        return `${formatNumber(value.value)}h`;
      }
      return formatNumber(value.value);
    }
    case 'numeric_pert': {
      const est = computePertEstimate(value.optimistic, value.mostLikely, value.pessimistic);
      const sd = computePertStdDev(value.optimistic, value.mostLikely, value.pessimistic);
      const suffix =
        config.scale === 'time_unit'
          ? timeUnitSuffix(config.unit)
          : config.scale === 'credit_hours'
            ? 'h'
            : '';
      return `${formatNumber(est)} ± ${formatNumber(sd)}${suffix}`;
    }
    case 'tshirt':
      return value.value;
    case 'animal':
      return value.value;
    case 'multi_factor': {
      const total = multiFactorScore(value.values, config as MultiFactorScaleConfig);
      return formatNumber(total);
    }
  }
}

function formatNumber(n: number): string {
  if (!isFinite(n)) return '0';
  // Trim trailing zeros while keeping useful precision.
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Snap an arbitrary numeric input to the nearest allowed value in a numeric
 * config. Used when switching scale shapes (e.g. linear → Fibonacci).
 */
export function nearestNumericValue(target: number, config: NumericScaleConfig): number {
  const allowed = getNumericAllowedValues(config);
  if (allowed.length === 0) return target;
  return allowed.reduce((best, v) =>
    Math.abs(v - target) < Math.abs(best - target) ? v : best,
  );
}

/**
 * Map an existing PointValue to the new scale using a best-effort
 * nearest-equivalent strategy. Returns `undefined` when no sensible mapping
 * exists so the task's value is cleared.
 *
 * Behavior:
 *  - Switching numeric → numeric snaps to nearest allowed value (per O/M/P).
 *  - Toggling PERT on for an existing single value sets O=M=P=value (zero SD).
 *  - Toggling PERT off collapses to the weighted estimate.
 *  - Numeric → T-shirt / animal maps via the default numeric mapping.
 *  - T-shirt ↔ animal maps via mapped scalar then back to nearest label.
 *  - Multi-factor and credit-hours: clear unless the target is the same scale.
 */
export function migrateValue(
  value: PointValue | undefined,
  fromConfig: PointScaleConfig | undefined,
  toConfig: PointScaleConfig,
): PointValue | undefined {
  if (!value) return undefined;

  // Numeric-like target scales (numeric_configurable, time_unit, credit_hours)
  if (isNumericLikeScale(toConfig)) {
    const pertOn = isPertEnabled(toConfig);

    // When the source is a PERT triple and the target also supports PERT,
    // preserve the optimistic / most-likely / pessimistic bounds independently
    // so uncertainty data is never silently collapsed to a scalar. Snapping
    // is done per-bound against the target's allowed values.
    if (value.type === 'numeric_pert' && pertOn) {
      return {
        type: 'numeric_pert',
        optimistic: snapNumericLike(value.optimistic, toConfig),
        mostLikely: snapNumericLike(value.mostLikely, toConfig),
        pessimistic: snapNumericLike(value.pessimistic, toConfig),
      };
    }

    const scalar =
      fromConfig !== undefined ? pointValueScalar(value, fromConfig) : numericFromValue(value);
    if (!isFinite(scalar)) return undefined;

    const snap = snapNumericLike(scalar, toConfig);
    if (pertOn) {
      return { type: 'numeric_pert', optimistic: snap, mostLikely: snap, pessimistic: snap };
    }
    return { type: 'numeric', value: snap };
  }

  if (toConfig.scale === 'tshirt') {
    const mapping = toConfig.mapping || DEFAULT_TSHIRT_MAPPING;
    const scalar =
      fromConfig !== undefined ? pointValueScalar(value, fromConfig) : numericFromValue(value);
    const size = nearestLabel<TShirtSize>(scalar, TSHIRT_SIZES, mapping);
    return size ? { type: 'tshirt', value: size } : undefined;
  }

  if (toConfig.scale === 'animal') {
    const mapping = toConfig.mapping || DEFAULT_ANIMAL_MAPPING;
    const scalar =
      fromConfig !== undefined ? pointValueScalar(value, fromConfig) : numericFromValue(value);
    const size = nearestLabel<AnimalSize>(scalar, ANIMAL_SIZES, mapping);
    return size ? { type: 'animal', value: size } : undefined;
  }

  // Multi-factor: only keep the existing map if the new config matches by ID.
  if (toConfig.scale === 'custom_multi_factor') {
    if (value.type === 'multi_factor') {
      const allowedIds = new Set(toConfig.factors.map((f) => f.id));
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(value.values)) {
        if (allowedIds.has(k)) next[k] = v;
      }
      return Object.keys(next).length > 0 ? { type: 'multi_factor', values: next } : undefined;
    }
    return undefined;
  }

  return undefined;
}

function isNumericLikeScale(
  config: PointScaleConfig,
): config is NumericScaleConfig | TimeScaleConfig | CreditHoursScaleConfig {
  return (
    config.scale === 'numeric_configurable' ||
    config.scale === 'time_unit' ||
    config.scale === 'credit_hours'
  );
}

/**
 * Snap a single number to the closest value allowed by a numeric-like scale.
 * Used for both single values and per-bound PERT migration so the rules are
 * identical regardless of how the source value was encoded.
 */
function snapNumericLike(
  raw: number,
  toConfig: NumericScaleConfig | TimeScaleConfig | CreditHoursScaleConfig,
): number {
  if (toConfig.scale === 'numeric_configurable') {
    return nearestNumericValue(raw, toConfig);
  }
  if (toConfig.scale === 'time_unit') {
    if (toConfig.input_mode === 'preset') {
      return nearestFromList(raw, toConfig.preset_values || []);
    }
    return raw;
  }
  // credit_hours
  if (toConfig.input_mode === 'bucket' || toConfig.input_mode === 'fibonacci') {
    const allowed = getCreditHoursAllowedValues(toConfig);
    if (allowed.length === 0) return raw;
    return nearestFromList(raw, allowed);
  }
  return raw;
}

function isPertEnabled(config: PointScaleConfig): boolean {
  return (
    (config.scale === 'numeric_configurable' ||
      config.scale === 'time_unit' ||
      config.scale === 'credit_hours') &&
    !!config.pert_mode_enabled
  );
}

function numericFromValue(value: PointValue): number {
  switch (value.type) {
    case 'numeric':
      return value.value;
    case 'numeric_pert':
      return computePertEstimate(value.optimistic, value.mostLikely, value.pessimistic);
    case 'tshirt':
      return DEFAULT_TSHIRT_MAPPING[value.value] ?? 0;
    case 'animal':
      return DEFAULT_ANIMAL_MAPPING[value.value] ?? 0;
    case 'multi_factor':
      return Object.values(value.values).reduce((a, b) => a + (Number(b) || 0), 0);
  }
}

function nearestFromList(target: number, list: number[]): number {
  if (!list.length) return target;
  return list.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best));
}

function nearestLabel<T extends string>(
  target: number,
  labels: readonly T[],
  mapping: Record<T, number>,
): T | undefined {
  if (!labels.length) return undefined;
  let best = labels[0];
  let bestDist = Math.abs(mapping[best] - target);
  for (const l of labels) {
    const d = Math.abs(mapping[l] - target);
    if (d < bestDist) {
      best = l;
      bestDist = d;
    }
  }
  return best;
}

/** Human label for the scale, used in pickers. */
export const SCALE_LABELS: Readonly<Record<PointScaleConfig['scale'], string>> = {
  numeric_configurable: 'Numeric (Points)',
  time_unit: 'Time-Based',
  tshirt: 'T-Shirt Sizing',
  animal: 'Animal Sizing',
  custom_multi_factor: 'Custom Multi-Factor',
  credit_hours: 'Internship Credit Hours',
};

/** Returns true when this scale type supports a PERT toggle. */
export function scaleSupportsPert(scale: PointScaleConfig['scale']): boolean {
  return scale === 'numeric_configurable' || scale === 'time_unit' || scale === 'credit_hours';
}
