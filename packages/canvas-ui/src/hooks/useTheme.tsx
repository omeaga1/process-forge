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
  OsakaJadeDarkCanvasTokens,
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
        metaThemeColor.setAttribute('content', theme === 'light' ? '#f8f7f0' : '#0c1214');
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

