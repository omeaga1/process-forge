/**
 * Space grey with a sparkle: a starfield of tiny points over the canvas, drawn
 * in CSS alone. Three layers tile at different sizes (prime-ish, so the
 * pattern never visibly repeats), each star a 1px radial gradient, with two
 * faint nebula glows, one jade and one silver. Use it wherever a big dark
 * field shows: the flowsheet canvas, the landing page.
 */

type Star = [x: number, y: number, size: number, alpha: number];

// Hand-placed so the field reads as scattered rather than gridded.
const NEAR: Star[] = [[23, 37, 1.2, 0.55], [151, 12, 0.9, 0.4], [97, 181, 1.4, 0.6], [212, 133, 1, 0.45], [61, 226, 0.8, 0.35], [180, 70, 1.1, 0.5]];
const MID: Star[] = [[41, 299, 0.8, 0.3], [233, 41, 1, 0.35], [318, 199, 0.7, 0.25], [140, 357, 0.9, 0.3], [289, 330, 0.8, 0.28], [12, 140, 0.7, 0.22], [190, 250, 0.6, 0.2]];
const FAR: Star[] = [[71, 389, 1.6, 0.5], [455, 97, 1.3, 0.45], [367, 451, 1.1, 0.4]];

const layer = (stars: Star[], rgb: string) =>
  stars.map(([x, y, s, a]) => `radial-gradient(${s}px ${s}px at ${x}px ${y}px, rgba(${rgb}, ${a}), transparent)`);

export interface SparkleBackground {
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize: string;
}

/** The canvas backdrop for a mode: stars and nebula over the base colour. */
export function canvasSparkle(base: string, mode: 'dark' | 'light' = 'dark'): SparkleBackground {
  const star = mode === 'dark' ? '236, 240, 248' : '70, 76, 88';
  const k = mode === 'dark' ? 1 : 0.35;
  const scale = (stars: Star[]): Star[] => stars.map(([x, y, s, a]) => [x, y, s, a * k]);
  const nebula =
    mode === 'dark'
      ? ['radial-gradient(ellipse 60% 45% at 18% 12%, rgba(113, 206, 173, 0.045), transparent 70%)', 'radial-gradient(ellipse 55% 50% at 88% 92%, rgba(170, 180, 205, 0.06), transparent 70%)']
      : [];
  const near = layer(scale(NEAR), star);
  const mid = layer(scale(MID), star);
  const far = layer(scale(FAR), star);
  return {
    backgroundColor: base,
    backgroundImage: [...nebula, ...near, ...mid, ...far].join(', '),
    backgroundSize: [...nebula.map(() => '100% 100%'), ...near.map(() => '241px 241px'), ...mid.map(() => '367px 367px'), ...far.map(() => '503px 503px')].join(', ')
  };
}
