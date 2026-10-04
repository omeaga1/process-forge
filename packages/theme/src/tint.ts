/**
 * A palette colour at an opacity: tint(palette.jade[500], 0.15). The one way
 * to make a wash, a hover or a badge background, so washes follow the theme
 * instead of being hard-coded for one of them.
 */
export function tint(color: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  const hex = color.trim();
  if (hex.startsWith('#')) {
    const h = hex.slice(1);
    const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
    return `#${full}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
  }
  const m = hex.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const [r, g, b] = m[1]!.split(',').map((x) => x.trim());
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return color;
}
