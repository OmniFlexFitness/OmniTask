import {
  aggregateValues,
  computePertEstimate,
  computePertStdDev,
  formatPointValue,
  getCreditHoursAllowedValues,
  getNumericAllowedValues,
  migrateValue,
  nearestNumericValue,
  pointValueScalar,
} from './point-scale.utils';
import {
  NumericScaleConfig,
  PointScaleConfig,
  TimeScaleConfig,
} from '../models/domain.model';

describe('point-scale.utils', () => {
  describe('getNumericAllowedValues', () => {
    it('generates linear values from step', () => {
      const cfg: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 1,
        max_value: 5,
        increment_type: 'linear',
        increment_step: 1,
      };
      expect(getNumericAllowedValues(cfg)).toEqual([1, 2, 3, 4, 5]);
    });

    it('respects fractional linear step', () => {
      const cfg: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 0,
        max_value: 1,
        increment_type: 'linear',
        increment_step: 0.25,
        allow_zero: true,
      };
      expect(getNumericAllowedValues(cfg)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it('generates fibonacci within min/max', () => {
      const cfg: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 1,
        max_value: 100,
        increment_type: 'fibonacci',
      };
      expect(getNumericAllowedValues(cfg)).toEqual([1, 2, 3, 5, 8, 13, 21, 34, 55, 89]);
    });

    it('generates powers of two', () => {
      const cfg: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 1,
        max_value: 64,
        increment_type: 'powers_of_two',
      };
      expect(getNumericAllowedValues(cfg)).toEqual([1, 2, 4, 8, 16, 32, 64]);
    });

    it('filters custom values by min/max and zero', () => {
      const cfg: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 0,
        max_value: 20,
        increment_type: 'custom',
        custom_values: [0, 0.5, 1, 5, 13, 40],
        allow_zero: false,
      };
      // 40 > max, 0 stripped by allow_zero:false
      expect(getNumericAllowedValues(cfg)).toEqual([0.5, 1, 5, 13]);
    });
  });

  describe('getCreditHoursAllowedValues', () => {
    it('returns the full bucket list when no bounds are set', () => {
      expect(
        getCreditHoursAllowedValues({
          scale: 'credit_hours',
          total_credit_hours: 3,
          total_work_hours: 135,
          input_mode: 'bucket',
        }),
      ).toEqual([0.25, 0.5, 1, 2, 4, 8]);
    });

    it('filters bucket list by min_value and max_value', () => {
      expect(
        getCreditHoursAllowedValues({
          scale: 'credit_hours',
          total_credit_hours: 3,
          total_work_hours: 135,
          input_mode: 'bucket',
          min_value: 0.5,
          max_value: 4,
        }),
      ).toEqual([0.5, 1, 2, 4]);
    });

    it('generates new buckets past the default 8h cap when max is raised', () => {
      // max_value=24 should add 16h (doubling) but stop before 32h.
      expect(
        getCreditHoursAllowedValues({
          scale: 'credit_hours',
          total_credit_hours: 3,
          total_work_hours: 135,
          input_mode: 'bucket',
          min_value: 1,
          max_value: 24,
        }),
      ).toEqual([1, 2, 4, 8, 16]);
    });

    it('generates new Fibonacci hours past the default 13h cap when max is raised', () => {
      // max_value=30 should add 21h but stop before 34h.
      expect(
        getCreditHoursAllowedValues({
          scale: 'credit_hours',
          total_credit_hours: 3,
          total_work_hours: 135,
          input_mode: 'fibonacci',
          min_value: 2,
          max_value: 30,
        }),
      ).toEqual([2, 3, 5, 8, 13, 21]);
    });

    it('filters fibonacci hours similarly', () => {
      expect(
        getCreditHoursAllowedValues({
          scale: 'credit_hours',
          total_credit_hours: 3,
          total_work_hours: 135,
          input_mode: 'fibonacci',
          min_value: 2,
          max_value: 8,
        }),
      ).toEqual([2, 3, 5, 8]);
    });

    it('returns empty for direct entry mode', () => {
      expect(
        getCreditHoursAllowedValues({
          scale: 'credit_hours',
          total_credit_hours: 3,
          total_work_hours: 135,
          input_mode: 'direct',
        }),
      ).toEqual([]);
    });
  });

  describe('PERT math', () => {
    it('weighted estimate is (O + 4M + P)/6', () => {
      expect(computePertEstimate(2, 5, 10)).toBeCloseTo((2 + 20 + 10) / 6, 5);
    });

    it('standard deviation is (P - O)/6', () => {
      expect(computePertStdDev(2, 5, 10)).toBeCloseTo(8 / 6, 5);
    });
  });

  describe('pointValueScalar', () => {
    const numericCfg: NumericScaleConfig = {
      scale: 'numeric_configurable',
      min_value: 1,
      max_value: 10,
      increment_type: 'linear',
      increment_step: 1,
    };

    it('returns value for simple numeric', () => {
      expect(pointValueScalar({ type: 'numeric', value: 5 }, numericCfg)).toBe(5);
    });

    it('returns PERT estimate for triple', () => {
      const result = pointValueScalar(
        { type: 'numeric_pert', optimistic: 1, mostLikely: 3, pessimistic: 8 },
        numericCfg,
      );
      expect(result).toBeCloseTo((1 + 12 + 8) / 6, 5);
    });

    it('maps T-shirt sizes via default mapping', () => {
      expect(pointValueScalar({ type: 'tshirt', value: 'L' }, { scale: 'tshirt' })).toBe(5);
    });

    it('multi-factor sum formula', () => {
      const cfg: PointScaleConfig = {
        scale: 'custom_multi_factor',
        formula: 'sum',
        factors: [
          { id: 'a', name: 'A', scale: [1, 2, 3], weight: 1 },
          { id: 'b', name: 'B', scale: [1, 2, 3], weight: 1 },
        ],
      };
      const result = pointValueScalar({ type: 'multi_factor', values: { a: 2, b: 3 } }, cfg);
      expect(result).toBe(5);
    });

    it('multi-factor weighted sum formula', () => {
      const cfg: PointScaleConfig = {
        scale: 'custom_multi_factor',
        formula: 'weighted_sum',
        factors: [
          { id: 'a', name: 'A', scale: [1, 2, 3], weight: 2 },
          { id: 'b', name: 'B', scale: [1, 2, 3], weight: 0.5 },
        ],
      };
      const result = pointValueScalar({ type: 'multi_factor', values: { a: 2, b: 4 } }, cfg);
      expect(result).toBe(2 * 2 + 4 * 0.5);
    });
  });

  describe('aggregateValues', () => {
    const numericCfg: NumericScaleConfig = {
      scale: 'numeric_configurable',
      min_value: 0,
      max_value: 100,
      increment_type: 'linear',
      increment_step: 1,
      allow_zero: true,
      pert_mode_enabled: true,
    };

    it('sums simple values', () => {
      const result = aggregateValues(
        [
          { type: 'numeric', value: 3 },
          { type: 'numeric', value: 5 },
        ],
        numericCfg,
      );
      expect(result.total).toBe(8);
      expect(result.totalStdDev).toBe(0);
      expect(result.contributingCount).toBe(2);
    });

    it('computes total SD via sum of variances', () => {
      const result = aggregateValues(
        [
          { type: 'numeric_pert', optimistic: 0, mostLikely: 0, pessimistic: 6 }, // sd = 1
          { type: 'numeric_pert', optimistic: 0, mostLikely: 0, pessimistic: 12 }, // sd = 2
        ],
        numericCfg,
      );
      // variance = 1 + 4 = 5, sd = sqrt(5)
      expect(result.totalStdDev).toBeCloseTo(Math.sqrt(5), 5);
    });

    it('applies load_factor for time scale', () => {
      const timeCfg: TimeScaleConfig = {
        scale: 'time_unit',
        unit: 'hours',
        input_mode: 'freeform',
        load_factor: 1.5,
      };
      const result = aggregateValues([{ type: 'numeric', value: 10 }], timeCfg);
      expect(result.total).toBe(10);
      expect(result.forecastTotal).toBe(15);
    });
  });

  describe('formatPointValue', () => {
    it('formats simple numeric with no trailing zeros', () => {
      expect(
        formatPointValue(
          { type: 'numeric', value: 3 },
          {
            scale: 'numeric_configurable',
            min_value: 1,
            max_value: 10,
            increment_type: 'linear',
            increment_step: 1,
          },
        ),
      ).toBe('3');
    });

    it('formats PERT with confidence range and unit', () => {
      const cfg: TimeScaleConfig = {
        scale: 'time_unit',
        unit: 'hours',
        input_mode: 'freeform',
        pert_mode_enabled: true,
      };
      const out = formatPointValue(
        { type: 'numeric_pert', optimistic: 2, mostLikely: 5, pessimistic: 10 },
        cfg,
      );
      // estimate = (2 + 20 + 10)/6 = 5.33, sd = 8/6 = 1.33
      expect(out).toMatch(/^5\.33 ± 1\.33h$/);
    });

    it('formats tshirt as label', () => {
      expect(formatPointValue({ type: 'tshirt', value: 'M' }, { scale: 'tshirt' })).toBe('M');
    });
  });

  describe('nearestNumericValue', () => {
    it('snaps to closest allowed value', () => {
      const cfg: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 1,
        max_value: 100,
        increment_type: 'fibonacci',
      };
      expect(nearestNumericValue(6, cfg)).toBe(5);
      expect(nearestNumericValue(7, cfg)).toBe(8);
      expect(nearestNumericValue(50, cfg)).toBe(55);
    });
  });

  describe('migrateValue', () => {
    it('snaps numeric → Fibonacci', () => {
      const from: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 1,
        max_value: 10,
        increment_type: 'linear',
        increment_step: 1,
      };
      const to: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 1,
        max_value: 100,
        increment_type: 'fibonacci',
      };
      expect(migrateValue({ type: 'numeric', value: 6 }, from, to)).toEqual({
        type: 'numeric',
        value: 5,
      });
    });

    it('expands single value to PERT triple when PERT enabled', () => {
      const from: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 1,
        max_value: 10,
        increment_type: 'linear',
        increment_step: 1,
      };
      const to: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 1,
        max_value: 10,
        increment_type: 'linear',
        increment_step: 1,
        pert_mode_enabled: true,
      };
      expect(migrateValue({ type: 'numeric', value: 3 }, from, to)).toEqual({
        type: 'numeric_pert',
        optimistic: 3,
        mostLikely: 3,
        pessimistic: 3,
      });
    });

    it('collapses PERT to weighted estimate when PERT disabled', () => {
      const from: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 1,
        max_value: 100,
        increment_type: 'fibonacci',
        pert_mode_enabled: true,
      };
      const to: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 1,
        max_value: 100,
        increment_type: 'fibonacci',
      };
      const result = migrateValue(
        { type: 'numeric_pert', optimistic: 1, mostLikely: 3, pessimistic: 8 },
        from,
        to,
      );
      // estimate = (1+12+8)/6 = 3.5 → nearest fib = 3
      expect(result).toEqual({ type: 'numeric', value: 3 });
    });

    it('numeric → tshirt maps via mapping', () => {
      const from: NumericScaleConfig = {
        scale: 'numeric_configurable',
        min_value: 1,
        max_value: 100,
        increment_type: 'fibonacci',
      };
      const result = migrateValue({ type: 'numeric', value: 5 }, from, { scale: 'tshirt' });
      expect(result).toEqual({ type: 'tshirt', value: 'L' });
    });

    it('preserves PERT triples when migrating time_unit with PERT still on', () => {
      const from = {
        scale: 'time_unit' as const,
        unit: 'hours' as const,
        input_mode: 'freeform' as const,
        pert_mode_enabled: true,
      };
      const to = {
        scale: 'time_unit' as const,
        unit: 'hours' as const,
        input_mode: 'freeform' as const,
        pert_mode_enabled: true,
      };
      const result = migrateValue(
        { type: 'numeric_pert', optimistic: 2, mostLikely: 5, pessimistic: 12 },
        from,
        to,
      );
      // None of the bounds should collapse to the weighted estimate.
      expect(result).toEqual({
        type: 'numeric_pert',
        optimistic: 2,
        mostLikely: 5,
        pessimistic: 12,
      });
    });

    it('preserves PERT triples when migrating credit_hours with PERT still on', () => {
      const from = {
        scale: 'credit_hours' as const,
        total_credit_hours: 3,
        total_work_hours: 135,
        input_mode: 'fibonacci' as const,
        pert_mode_enabled: true,
      };
      const to = {
        scale: 'credit_hours' as const,
        total_credit_hours: 3,
        total_work_hours: 135,
        input_mode: 'fibonacci' as const,
        pert_mode_enabled: true,
      };
      const result = migrateValue(
        { type: 'numeric_pert', optimistic: 1, mostLikely: 3, pessimistic: 8 },
        from,
        to,
      );
      expect(result).toEqual({
        type: 'numeric_pert',
        optimistic: 1,
        mostLikely: 3,
        pessimistic: 8,
      });
    });

    it('clears multi_factor when factor IDs change entirely', () => {
      const from: PointScaleConfig = {
        scale: 'custom_multi_factor',
        formula: 'sum',
        factors: [{ id: 'old', name: 'X', scale: [1, 2], weight: 1 }],
      };
      const to: PointScaleConfig = {
        scale: 'custom_multi_factor',
        formula: 'sum',
        factors: [{ id: 'new', name: 'Y', scale: [1, 2], weight: 1 }],
      };
      expect(migrateValue({ type: 'multi_factor', values: { old: 2 } }, from, to)).toBeUndefined();
    });
  });
});
