import { useEffect, useState } from 'react';

export function usePageAspects(urls: string[], fallback: number): number[] {
  const [aspects, setAspects] = useState<number[]>(() => urls.map(() => fallback));
  useEffect(() => {
    let live = true;
    setAspects(urls.map(() => fallback));
    urls.forEach((url, i) => {
      if (!url) return;
      const img = new Image();
      img.onload = () => {
        if (!live || !img.naturalWidth) return;
        const a = img.naturalHeight / img.naturalWidth;
        setAspects((prev) => (prev[i] === a ? prev : prev.map((v, k) => (k === i ? a : v))));
      };
      img.src = url;
    });
    return () => { live = false; };
  }, [urls, fallback]);
  return aspects;
}

export function containedRect(slotW: number, slotH: number, aspect: number): { x: number; y: number; w: number; h: number } {
  if (aspect * slotW > slotH) {
    const w = slotH / aspect;
    return { x: (slotW - w) / 2, y: 0, w, h: slotH };
  }
  const h = slotW * aspect;
  return { x: 0, y: (slotH - h) / 2, w: slotW, h };
}
