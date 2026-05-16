import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PointScaleConfig, PointValue } from '../../../core/models/domain.model';
import {
  computePertEstimate,
  formatPointValue,
  pointValueColor,
} from '../../../core/utils/point-scale.utils';

/**
 * Circular neon-glow badge that renders a task's point value. The color is
 * sampled along a cyan → magenta → hot-pink gradient based on the value's
 * normalized position in the scale's configured range, so heavier tasks
 * read as hotter than lighter ones at a glance.
 *
 * Long labels (PERT triples) fall back to a pill shape; the full label is
 * available via the native title tooltip.
 */
@Component({
  selector: 'app-point-value-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (config(); as cfg) {
      @if (value(); as v) {
        <span
          class="pv-badge"
          [class.pv-badge--pill]="isLong()"
          [class.pv-badge--sm]="size() === 'sm'"
          [style.--pv-color]="color()"
          [title]="fullLabel()"
        >
          <span class="pv-badge__text">{{ displayLabel() }}</span>
        </span>
      }
    }
  `,
  styleUrls: ['./point-value-badge.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PointValueBadgeComponent {
  config = input.required<PointScaleConfig | undefined>();
  value = input.required<PointValue | undefined>();
  /** Visual size — `sm` (20px) for cramped surfaces like calendar cells. */
  size = input<'sm' | 'md'>('md');

  /** Hex/rgb colour resolved from the gradient. Computed once per value. */
  color = computed<string>(() => {
    const v = this.value();
    const c = this.config();
    if (!v || !c) return '#00d2ff';
    return pointValueColor(v, c);
  });

  /** Full label for the title tooltip. */
  fullLabel = computed<string>(() => {
    const v = this.value();
    const c = this.config();
    if (!v || !c) return '';
    return formatPointValue(v, c);
  });

  /**
   * Compact label shown inside the circle. PERT triples collapse to the
   * weighted estimate so the badge stays readable; the full "5 ± 1.3h"
   * remains available in the tooltip and on the detail modal.
   */
  displayLabel = computed<string>(() => {
    const v = this.value();
    const c = this.config();
    if (!v || !c) return '';
    if (v.type === 'numeric_pert') {
      const est = computePertEstimate(v.optimistic, v.mostLikely, v.pessimistic);
      const suffix =
        c.scale === 'time_unit' || c.scale === 'credit_hours' ? this.unitChar(c) : '';
      return `${this.round(est)}${suffix}`;
    }
    return this.fullLabel();
  });

  /** Falls back to a pill shape when the display label can't fit in a circle. */
  isLong = computed<boolean>(() => this.displayLabel().length > 4);

  private unitChar(c: PointScaleConfig): string {
    if (c.scale === 'time_unit') {
      switch (c.unit) {
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
    if (c.scale === 'credit_hours') return 'h';
    return '';
  }

  private round(n: number): string {
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1).replace(/\.0$/, '');
  }
}
