import { useState, useEffect } from 'react';

/**
 * Hook to detect mobile screen width (< 768px) and manage responsive view modes.
 */
export function useMobileViewport(breakpoint = 768): {
  isMobile: boolean;
  isTablet: boolean;
  isCompact: boolean;
  windowWidth: number;
  viewMode: 'field' | 'canvas';
  setViewMode: (mode: 'field' | 'canvas') => void;
  toggleViewMode: () => void;
} {
  const [windowWidth, setWindowWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 1440;
    return window.innerWidth;
  });

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  const [isTablet, setIsTablet] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  });

  const [isCompact, setIsCompact] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1200;
  });

  const [viewMode, setViewMode] = useState<'field' | 'canvas'>(() => {
    if (typeof window === 'undefined') return 'canvas';
    return window.innerWidth < breakpoint ? 'field' : 'canvas';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      const mobile = width < breakpoint;
      setIsMobile(mobile);
      setIsTablet(width < 1024);
      setIsCompact(width < 1200);

      // Auto-restore canvas view if user scales up to desktop size
      if (!mobile) {
        setViewMode('canvas');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  const toggleViewMode = () => {
    setViewMode((prev) => (prev === 'field' ? 'canvas' : 'field'));
  };

  return {
    isMobile,
    isTablet,
    isCompact,
    windowWidth,
    viewMode,
    setViewMode,
    toggleViewMode
  };
}
