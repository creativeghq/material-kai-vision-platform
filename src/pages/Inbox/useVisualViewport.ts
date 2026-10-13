import { useEffect, useState } from 'react';

/**
 * The part of the screen the on-screen keyboard leaves visible. A `fixed inset-0` layer is sized
 * to the LAYOUT viewport, which the keyboard does not shrink, so without this the composer sits
 * underneath the keyboard on iOS and on Chrome Android.
 */
export function useVisualViewport(enabled: boolean): { height: number; top: number } | null {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!enabled || !vv) { setBox(null); return; }
    const update = () => setBox({ height: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, [enabled]);
  return box;
}
