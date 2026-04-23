import { CYBERPUNK_COLORS } from '../models/domain.model';

const INVALID_HEX_FALLBACK = 'rgba(100, 116, 139,';

/**
 * Convert a hex color string to rgba. Supports #rgb and #rrggbb forms.
 * Falls back to slate-500 if the hex is malformed.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace(/^#/, '');

  let fullHex = cleanHex;
  if (cleanHex.length === 3) {
    fullHex = cleanHex
      .split('')
      .map((char) => char + char)
      .join('');
  } else if (cleanHex.length !== 6) {
    return `${INVALID_HEX_FALLBACK} ${alpha})`;
  }

  const r = parseInt(fullHex.substring(0, 2), 16);
  const g = parseInt(fullHex.substring(2, 4), 16);
  const b = parseInt(fullHex.substring(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `${INVALID_HEX_FALLBACK} ${alpha})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Returns a CSS rgba() string for the given color at the requested opacity.
 * If the color is undefined, falls back to the provided default
 * (CYBERPUNK_COLORS.TODO when not specified).
 */
export function getColorWithOpacity(
  color: string | undefined,
  opacity: number,
  defaultColor: string = CYBERPUNK_COLORS.TODO,
): string {
  return hexToRgba(color || defaultColor, opacity);
}
