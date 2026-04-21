import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Project, CYBERPUNK_COLORS } from '../../../core/models/domain.model';
import { getColorWithOpacity } from '../../../core/utils/color.utils';

/**
 * Reusable project avatar: renders the uploaded icon if present, otherwise a
 * monogram inside a neon-styled tile tinted by the project color.
 */
@Component({
  selector: 'app-project-icon',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="project-icon relative rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.background]="background()"
      [style.border]="'1px solid ' + borderColor()"
      [style.box-shadow]="glow()"
    >
      @if (project()?.icon) {
        <img
          [src]="project()!.icon"
          [alt]="project()!.name + ' icon'"
          class="w-full h-full object-cover"
          loading="lazy"
        />
      } @else {
        <span
          class="font-black tracking-wide select-none"
          [style.color]="textColor()"
          [style.font-size.px]="fontSize()"
          [style.text-shadow]="'0 0 8px ' + textColor()"
        >
          {{ monogram() }}
        </span>
      }
      <span class="project-icon__scan pointer-events-none"></span>
    </div>
  `,
  styles: [
    `
      .project-icon__scan {
        position: absolute;
        inset: 0;
        background: repeating-linear-gradient(
          0deg,
          rgba(0, 0, 0, 0.0) 0px,
          rgba(0, 0, 0, 0.0) 2px,
          rgba(0, 210, 255, 0.06) 3px,
          rgba(0, 0, 0, 0) 4px
        );
        mix-blend-mode: screen;
      }
    `,
  ],
})
export class ProjectIconComponent {
  project = input<Project | null>(null);
  size = input<number>(40);

  private readonly defaultColor = CYBERPUNK_COLORS.TODO;

  monogram = computed(() => {
    const name = this.project()?.name ?? '?';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '?';
  });

  fontSize = computed(() => Math.max(12, Math.round(this.size() * 0.42)));

  background = computed(() => {
    const c = this.project()?.color || this.defaultColor;
    return `linear-gradient(135deg, ${getColorWithOpacity(
      c,
      0.25,
    )}, ${getColorWithOpacity(c, 0.08)})`;
  });

  textColor = computed(() => this.project()?.color || this.defaultColor);

  borderColor = computed(() =>
    getColorWithOpacity(this.project()?.color || this.defaultColor, 0.45),
  );

  glow = computed(() => {
    const c = this.project()?.color || this.defaultColor;
    return `0 0 10px ${getColorWithOpacity(c, 0.35)}, inset 0 0 12px ${getColorWithOpacity(
      c,
      0.18,
    )}`;
  });
}
