import { OsakaJadeDarkPalette, OsakaJadeLightPalette, type ThemePalette } from '@process-forge/theme';

/**
 * The public site's palette: the studio's own Osaka Jade, light. Bamboo ivory
 * paper, pine ink and an imperial jade accent, so the site and the app read
 * as one thing.
 *
 * The one exception is `background.canvas`, the backdrop for the engine's
 * kit drawings: they keep the dark canvas they are drawn for in the app.
 */
export const SITE: ThemePalette = {
  ...OsakaJadeLightPalette,
  background: {
    ...OsakaJadeLightPalette.background,
    canvas: OsakaJadeDarkPalette.background.canvas
  }
};

/** The kit drawings' backdrop on hover: one step up from the dark canvas. */
export const CANVAS_HOVER = OsakaJadeDarkPalette.background.surfaceElevated;

/** The title's face: a variable serif with weight and softness to animate. */
export const DISPLAY_FONT = "'Fraunces', 'Iowan Old Style', Georgia, serif";
export const DISPLAY_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,200..900,0..100;1,9..144,200..900,0..100&display=swap';
