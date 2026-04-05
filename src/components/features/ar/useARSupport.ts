/**
 * useARSupport Hook
 * Detects AR capabilities of the current device/browser.
 * Returns the best available AR mode and whether the device is mobile.
 */

import { useState, useEffect } from 'react';

export type ARMode = 'webxr' | 'quicklook' | 'desktop' | 'none';

export interface ARSupportResult {
  mode: ARMode;
  loading: boolean;
  isMobile: boolean;
}

function detectMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua);
}

export function useARSupport(): ARSupportResult {
  const [mode, setMode] = useState<ARMode>('none');
  const [loading, setLoading] = useState(true);

  const isMobile = detectMobile();

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      try {
        // Check WebXR immersive-ar support (Android Chrome, Quest, etc.)
        if (navigator.xr) {
          const supported = await navigator.xr.isSessionSupported('immersive-ar');
          if (!cancelled && supported) {
            setMode('webxr');
            setLoading(false);
            return;
          }
        }
      } catch {
        // WebXR check failed, continue to fallbacks
      }

      if (cancelled) return;

      // iOS devices support AR Quick Look via USDZ files
      if (detectIOS()) {
        setMode('quicklook');
        setLoading(false);
        return;
      }

      // Desktop browsers get 3D preview + QR handoff
      if (!isMobile) {
        setMode('desktop');
        setLoading(false);
        return;
      }

      // Mobile device without AR support
      setMode('none');
      setLoading(false);
    }

    detect();

    return () => {
      cancelled = true;
    };
  }, [isMobile]);

  return { mode, loading, isMobile };
}
