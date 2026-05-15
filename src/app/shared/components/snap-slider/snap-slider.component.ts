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
 * discrete values. Built for the task point-value input so users can drag a
 * thumb instead of clicking individual chips. Works for any monotonic value
 * set (Fibonacci, T-shirt sizes mapped to numbers, etc).
 *
 * The component intentionally exposes the raw selected number (the caller
 * decides how to render it as a label). When `labels` is provided, that
 * string is shown above the thumb; otherwise the raw value is used.
 *
 * Drag interactions use pointer events so it works on mouse, touch, and pen
 * without separate code paths. Keyboard support uses ArrowLeft / ArrowRight
 * so the slider is reachable by users who can't drag.
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
  /** Currently-selected value, or null when nothing is set. */
  value = input<number | null>(null);
  /** Accent color used for the active track + thumb glow. */
  accent = input<string>('#06b6d4');
  /** ARIA label for assistive tech. */
  ariaLabel = input<string>('Value');

  valueChange = output<number>();

  @ViewChild('track', { static: true }) trackEl!: ElementRef<HTMLDivElement>;

  private dragging = signal(false);

  /** Index of the active value (0..values.length-1), or null. */
  activeIndex = computed<number | null>(() => {
    const v = this.value();
    if (v === null) return null;
    const idx = this.values().indexOf(v);
    return idx === -1 ? this.nearestIndex(v) : idx;
  });

  /** Thumb position as a percentage of track width. */
  thumbPercent = computed<number>(() => {
    const idx = this.activeIndex();
    if (idx === null) return 0;
    const max = Math.max(this.values().length - 1, 1);
    return (idx / max) * 100;
  });

  activeLabel = computed<string>(() => {
    const idx = this.activeIndex();
    if (idx === null) return '';
    const labels = this.labels();
    return labels ? labels[idx] ?? String(this.values()[idx]) : String(this.values()[idx]);
  });

  onPointerDown(event: PointerEvent): void {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.dragging.set(true);
    this.updateFromEvent(event);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging()) return;
    this.updateFromEvent(event);
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.dragging()) return;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    this.dragging.set(false);
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
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

  /**
   * Translate a pointer event's x-coordinate into the closest discrete value
   * and emit the change. Re-emitting the same value is a no-op for the
   * parent's signal because the input identity stays the same.
   */
  private updateFromEvent(event: PointerEvent): void {
    const track = this.trackEl?.nativeElement;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const lastIdx = this.values().length - 1;
    const idx = Math.round(ratio * lastIdx);
    this.emitIndex(idx);
  }

  private emitIndex(idx: number): void {
    const values = this.values();
    if (idx < 0 || idx >= values.length) return;
    if (values[idx] === this.value()) return;
    this.valueChange.emit(values[idx]);
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
}
