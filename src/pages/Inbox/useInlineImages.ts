import { useEffect, useRef, useState } from 'react';
import { INLINE_IMAGE_BYTES, INLINE_IMAGE_MAX, normalizeCid } from '@/utils/sanitizeEmailHtml';

export interface InlinePart { cid: string; mime: string; size: number; load: () => Promise<Blob> }

/** A message's `cid:` images as blob: URLs; one that fails is absent, so it stays in the attachment list. */
export function useInlineImages(key: string, parts: InlinePart[], enabled = true): Readonly<Record<string, string>> | undefined {
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const [images, setImages] = useState<Record<string, string> | undefined>(undefined);
  useEffect(() => {
    const wanted = partsRef.current
      .filter((p) => p.mime.toLowerCase().startsWith('image/') && p.size <= INLINE_IMAGE_BYTES)
      .slice(0, INLINE_IMAGE_MAX);
    if (!enabled || !wanted.length) { setImages(undefined); return; }
    let alive = true;
    const made: string[] = [];
    void Promise.all(wanted.map((p) => p.load()
      .then((blob) => { const u = URL.createObjectURL(blob); made.push(u); return [normalizeCid(p.cid), u] as const; })
      .catch(() => null)))
      .then((pairs) => { if (alive) setImages(Object.fromEntries(pairs.filter((x): x is readonly [string, string] => !!x))); });
    return () => { alive = false; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [key, enabled]);
  return images;
}
