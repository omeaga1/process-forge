import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  type ThemeMode,
  type ThemePalette,
  type CanvasVisualTheme,
  type MachineStateVisualConfig,
  type ElevationTokens,
  getOsakaJadePalette,
  getCanvasTokens,
  getMachineStateVisuals,
  getElevation,
  OsakaJadeDarkPalette,
  OsakaJadeLightPalette,
  OsakaJadeDarkCanvasTokens,
  generateOsakaJadeCssVariables,
  MachineStateVisualsDark,
  elevationDark,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  spacing,
  radius,
  motion,
  zIndex,
} from '@process-forge/theme';

export interface ThemeContextValue {
  theme: ThemeMode;
  palette: ThemePalette;
  canvasTokens: CanvasVisualTheme;
  machineVisuals: Record<string, MachineStateVisualConfig>;
  elevation: ElevationTokens;
  font: typeof fontFamily;
  size: typeof fontSize;
  weight: typeof fontWeight;
  leading: typeof lineHeight;
  tracking: typeof letterSpacing;
  space: typeof spacing;
  radius: typeof radius;
  motion: typeof motion;
  z: typeof zIndex;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const defaultContext: ThemeContextValue = {
  theme: 'dark',
  palette: OsakaJadeDarkPalette,
  canvasTokens: OsakaJadeDarkCanvasTokens,
  machineVisuals: MachineStateVisualsDark,
  elevation: elevationDark,
  font: fontFamily,
  size: fontSize,
  weight: fontWeight,
  leading: lineHeight,
  tracking: letterSpacing,
  space: spacing,
  radius,
  motion,
  z: zIndex,
  setTheme: () => {},
  toggleTheme: () => {}
};

const ThemeContext = createContext<ThemeContextValue>(defaultContext);

/**
 * The theme as CSS variables (--pf-*), generated from the palette, plus the
 * third-party chrome that only CSS can reach (React Flow's controls,
 * attribution and minimap). Injected once, at load, so a stylesheet never
 * keeps a copy of the palette that can drift from it.
 */
const THEME_CSS = `${generateOsakaJadeCssVariables('both')}

.react-flow {
  --xy-controls-button-background-color: var(--pf-bg-surface-elevated);
  --xy-controls-button-background-color-hover: var(--pf-bg-surface-hover);
  --xy-controls-button-color: var(--pf-text-secondary);
  --xy-controls-button-color-hover: var(--pf-text-primary);
  --xy-controls-button-border-color: var(--pf-border-default);
  --xy-controls-box-shadow: none;
  --xy-attribution-background-color: transparent;
  --xy-minimap-background-color: var(--pf-bg-surface);
  --xy-minimap-mask-background-color: color-mix(in srgb, var(--pf-bg-base) 60%, transparent);
  --xy-minimap-node-background-color: var(--pf-bg-surface-hover);
  --xy-edge-label-background-color: var(--pf-bg-surface-elevated);
  --xy-edge-label-color: var(--pf-text-secondary);
  --xy-selection-background-color: color-mix(in srgb, var(--pf-jade-500) 12%, transparent);
  --xy-selection-border: 1px solid var(--pf-jade-500);
}
.react-flow__controls { border: 1px solid var(--pf-border-default); border-radius: 2px; overflow: hidden; }
.react-flow .react-flow__attribution a { color: var(--pf-text-muted); }
`;

function injectThemeCss(): void {
  if (typeof document === 'undefined' || document.getElementById('pf-theme-vars')) return;
  const el = document.createElement('style');
  el.id = 'pf-theme-vars';
  el.textContent = THEME_CSS;
  // First in <head>, so app stylesheets can still build on the variables.
  document.head.insertBefore(el, document.head.firstChild);
}
injectThemeCss();

export interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: ThemeMode;
}

export function getInitialTheme(explicitTheme?: ThemeMode): ThemeMode {
  if (explicitTheme) return explicitTheme;
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('pf-theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      // Ignore storage/security errors
    }
  }
  return 'dark';
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children, initialTheme }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => getInitialTheme(initialTheme));

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.style.colorScheme = theme;
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', (theme === 'light' ? OsakaJadeLightPalette : OsakaJadeDarkPalette).background.base);
      }
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (e: MediaQueryListEvent) => {
      const stored = localStorage.getItem('pf-theme');
      if (!stored) {
        setThemeState(e.matches ? 'light' : 'dark');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pf-theme', newTheme);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined') {
        localStorage.setItem('pf-theme', next);
      }
      return next;
    });
  }, []);

  const palette = getOsakaJadePalette(theme);
  const canvasTokens = getCanvasTokens(theme);
  const machineVisuals = getMachineStateVisuals(theme);
  const elevation = getElevation(theme);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        palette,
        canvasTokens,
        machineVisuals,
        elevation,
        font: fontFamily,
        size: fontSize,
        weight: fontWeight,
        leading: lineHeight,
        tracking: letterSpacing,
        space: spacing,
        radius,
        motion,
        z: zIndex,
        setTheme,
        toggleTheme
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);

/**
 * Renders children in one theme regardless of the app's, without touching the
 * document (a dark demo panel on a light page). Switching theme inside it
 * does nothing.
 */
export const ThemeScope: React.FC<{ mode: ThemeMode; children: ReactNode }> = ({ mode, children }) => {
  const outer = useContext(ThemeContext);
  return (
    <ThemeContext.Provider
      value={{
        ...outer,
        theme: mode,
        palette: getOsakaJadePalette(mode),
        canvasTokens: getCanvasTokens(mode),
        machineVisuals: getMachineStateVisuals(mode),
        elevation: getElevation(mode),
        setTheme: () => {},
        toggleTheme: () => {}
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

