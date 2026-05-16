import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  input,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Snap slider — a horizontal slider whose thumb snaps to a fixed list of
 * discrete values. Used for the per-task point-value picker (single mode)
 * and the min/max range picker on configurable hour-bucket scales (range
 * mode with two thumbs).
 *
 * Drag interactions use pointer events so it works on mouse, touch, and pen
 * without separate code paths. Keyboard support uses ArrowLeft / ArrowRight
 * so the slider is reachable by users who can't drag — in range mode, the
 * keyboard moves whichever thumb was last touched.
 */
@Component({
  selector: 'app-snap-slider',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './snap-slider.component.html',
  styleUrls: ['./snap-slider.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnapSliderComponent {
  /** Allowed discrete values, in ascending order. */
  values = input.required<number[]>();
  /** Optional display labels parallel to `values` (e.g. ["XS","S",…]). */
  labels = input<string[] | undefined>(undefined);
  /** Single-mode: currently-selected value, or null when nothing is set. */
  value = input<number | null>(null);
  /** Range-mode: lower bound (inclusive). Defaults to first value. */
  minValue = input<number | null>(null);
  /** Range-mode: upper bound (inclusive). Defaults to last value. */
  maxValue = input<number | null>(null);
  /** Whether the slider has two thumbs (min/max selection). */
  range = input<boolean>(false);
  /** Accent color used for the active track + thumb glow. */
  accent = input<string>('#06b6d4');
  /** ARIA label for assistive tech. */
  ariaLabel = input<string>('Value');

  valueChange = output<number>();
  rangeChange = output<{ min: number; max: number }>();

  @ViewChild('track', { static: true }) trackEl!: ElementRef<HTMLDivElement>;

  private dragging = signal<'single' | 'min' | 'max' | null>(null);
  /** Which thumb was last touched — drives keyboard navigation in range mode. */
  private lastActiveThumb = signal<'min' | 'max'>('min');

  /** Single-mode active index. */
  activeIndex = computed<number | null>(() => {
    if (this.range()) return null;
    const v = this.value();
    if (v === null) return null;
    const idx = this.values().indexOf(v);
    return idx === -1 ? this.nearestIndex(v) : idx;
  });

  minIndex = computed<number | null>(() => {
    if (!this.range()) return null;
    const v = this.minValue();
    if (v === null) return 0;
    return Math.max(0, this.nearestIndex(v));
  });

  maxIndex = computed<number | null>(() => {
    if (!this.range()) return null;
    const v = this.maxValue();
    if (v === null) return this.values().length - 1;
    return Math.min(this.values().length - 1, this.nearestIndex(v));
  });

  /** Thumb position (single mode) as a percentage of track width. */
  thumbPercent = computed<number>(() => {
    const idx = this.activeIndex();
    if (idx === null) return 0;
    return this.indexToPercent(idx);
  });

  minPercent = computed<number>(() => {
    const idx = this.minIndex();
    return idx === null ? 0 : this.indexToPercent(idx);
  });

  maxPercent = computed<number>(() => {
    const idx = this.maxIndex();
    return idx === null ? 100 : this.indexToPercent(idx);
  });

  activeLabel = computed<string>(() => {
    const idx = this.activeIndex();
    if (idx === null) return '';
    return this.labelAt(idx);
  });

  onPointerDown(event: PointerEvent): void {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    const target = this.range() ? this.pickClosestThumb(event) : 'single';
    this.dragging.set(target);
    if (target === 'min' || target === 'max') this.lastActiveThumb.set(target);
    this.updateFromEvent(event);
  }

  onPointerMove(event: PointerEvent): void {
    if (this.dragging() === null) return;
    this.updateFromEvent(event);
  }

  onPointerUp(event: PointerEvent): void {
    if (this.dragging() === null) return;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    this.dragging.set(null);
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.range()) {
      this.handleRangeKey(event);
      return;
    }
    const idx = this.activeIndex();
    if (idx === null) return;
    if (event.key === 'ArrowLeft' && idx > 0) {
      this.emitIndex(idx - 1);
      event.preventDefault();
    } else if (event.key === 'ArrowRight' && idx < this.values().length - 1) {
      this.emitIndex(idx + 1);
      event.preventDefault();
    } else if (event.key === 'Home') {
      this.emitIndex(0);
      event.preventDefault();
    } else if (event.key === 'End') {
      this.emitIndex(this.values().length - 1);
      event.preventDefault();
    }
  }

  private handleRangeKey(event: KeyboardEvent): void {
    const which = this.lastActiveThumb();
    const minIdx = this.minIndex();
    const maxIdx = this.maxIndex();
    if (minIdx === null || maxIdx === null) return;
    let nextMin = minIdx;
    let nextMax = maxIdx;
    if (event.key === 'ArrowLeft') {
      if (which === 'min' && minIdx > 0) nextMin = minIdx - 1;
      else if (which === 'max' && maxIdx > minIdx) nextMax = maxIdx - 1;
      else return;
    } else if (event.key === 'ArrowRight') {
      const last = this.values().length - 1;
      if (which === 'min' && minIdx < maxIdx) nextMin = minIdx + 1;
      else if (which === 'max' && maxIdx < last) nextMax = maxIdx + 1;
      else return;
    } else return;
    event.preventDefault();
    this.emitRange(nextMin, nextMax);
  }

  /** Translate the pointer's x-coordinate into a discrete value and emit. */
  private updateFromEvent(event: PointerEvent): void {
    const track = this.trackEl?.nativeElement;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const lastIdx = this.values().length - 1;
    const idx = Math.round(ratio * lastIdx);
    const which = this.dragging();
    if (which === 'single') {
      this.emitIndex(idx);
      return;
    }
    const minIdx = this.minIndex() ?? 0;
    const maxIdx = this.maxIndex() ?? lastIdx;
    if (which === 'min') {
      this.emitRange(Math.min(idx, maxIdx), maxIdx);
    } else if (which === 'max') {
      this.emitRange(minIdx, Math.max(idx, minIdx));
    }
  }

  private emitIndex(idx: number): void {
    const values = this.values();
    if (idx < 0 || idx >= values.length) return;
    if (values[idx] === this.value()) return;
    this.valueChange.emit(values[idx]);
  }

  private emitRange(minIdx: number, maxIdx: number): void {
    const values = this.values();
    const min = values[minIdx];
    const max = values[maxIdx];
    if (min === this.minValue() && max === this.maxValue()) return;
    this.rangeChange.emit({ min, max });
  }

  /**
   * In range mode, decide which thumb the pointer is closest to so dragging
   * naturally picks up the nearer handle. When the thumbs are stacked
   * (e.g. the user just collapsed the range to a single value), the side of
   * the pointer relative to the shared position picks the side that lets
   * the user spread the range — otherwise the min thumb would always win
   * and trap the user on a degenerate range.
   */
  private pickClosestThumb(event: PointerEvent): 'min' | 'max' {
    const track = this.trackEl?.nativeElement;
    if (!track) return 'min';
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const pointerPct = ratio * 100;
    const minDist = Math.abs(pointerPct - this.minPercent());
    const maxDist = Math.abs(pointerPct - this.maxPercent());
    let choice: 'min' | 'max';
    if (maxDist < minDist) {
      choice = 'max';
    } else if (maxDist === minDist && pointerPct > this.maxPercent()) {
      // Thumbs are stacked and the user clicked on the right side — let them
      // drag the max thumb outward.
      choice = 'max';
    } else {
      choice = 'min';
    }
    this.lastActiveThumb.set(choice);
    return choice;
  }

  /** Closest index for a value not directly present in `values`. */
  private nearestIndex(target: number): number {
    const values = this.values();
    let best = 0;
    let bestDist = Math.abs(values[0] - target);
    for (let i = 1; i < values.length; i++) {
      const dist = Math.abs(values[i] - target);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    return best;
  }

  private indexToPercent(idx: number): number {
    const max = Math.max(this.values().length - 1, 1);
    return (idx / max) * 100;
  }

  private labelAt(idx: number): string {
    const labels = this.labels();
    return labels ? labels[idx] ?? String(this.values()[idx]) : String(this.values()[idx]);
  }
}
