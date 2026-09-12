import { useState, useEffect } from 'react';

/**
 * Hook to detect mobile screen width (< 768px) and manage responsive view modes.
 */
export function useMobileViewport(breakpoint = 768): {
  isMobile: boolean;
  viewMode: 'field' | 'canvas';
  setViewMode: (mode: 'field' | 'canvas') => void;
  toggleViewMode: () => void;
} {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  const [viewMode, setViewMode] = useState<'field' | 'canvas'>(() => {
    if (typeof window === 'undefined') return 'canvas';
    return window.innerWidth < breakpoint ? 'field' : 'canvas';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const mobile = window.innerWidth < breakpoint;
      setIsMobile(mobile);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  const toggleViewMode = () => {
    setViewMode((prev) => (prev === 'field' ? 'canvas' : 'field'));
  };

  return {
    isMobile,
    viewMode,
    setViewMode,
    toggleViewMode
  };
}
