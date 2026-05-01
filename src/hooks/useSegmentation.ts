/**
 * useSegmentation
 *
 * Automatically segments a 3D render when generation completes.
 * For each image it:
 *   1. Calls POST /api/images/segment  → zones with bbox
 *   2. Crops each zone using Canvas API → data URL
 *   3. Calls POST /api/rag/search per crop → matched materials
 *   4. Uploads each crop to Supabase Storage
 *   5. Persists everything to generation_3d_segments
 *
 * Results are loaded from DB on subsequent renders (no re-run needed).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { mivaaApi, MaterialZone } from '@/services/mivaaApiClient';

export interface SegmentWithResults extends MaterialZone {
  id?: string;
  segment_index: number;
  model_id: string;
  source_image_url: string;
}

interface UseSegmentationOptions {
  generationId: string | null;
  workspaceId: string;
  /** Image URLs keyed by model_id — provided once generation_status = 'completed' */
  completedImages: Array<{ model_id: string; image_url: string }>;
  enabled?: boolean;
}

interface UseSegmentationResult {
  segments: SegmentWithResults[];
  loading: boolean;
  error: string | null;
}

export function useSegmentation({
  generationId,
  workspaceId,
  completedImages,
  enabled = true,
}: UseSegmentationOptions): UseSegmentationResult {
  const [segments, setSegments] = useState<SegmentWithResults[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasRunRef = useRef(false);
  // Stable ref to the latest `run` callback so the trigger effect below does
  // not need `run` in its dependency array (which would cause a re-trigger
  // every time completedImages changes, potentially double-processing).
  const runRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // ── Load existing segments from DB ──────────────────────────────────────
  // Cache key is the set of source_image_urls — survives across regenerated
  // jobs and direct uploads. Falls back to generation_id only when no
  // completedImages are passed (legacy callers).
  useEffect(() => {
    if (!generationId && completedImages.length === 0) return;

    const urls = completedImages.map((c) => c.image_url);
    const query = urls.length > 0
      ? supabase.from('generation_3d_segments').select('*').in('source_image_url', urls).order('segment_index')
      : supabase.from('generation_3d_segments').select('*').eq('generation_id', generationId!).order('segment_index');

    query
      .then(({ data, error: dbErr }) => {
        if (dbErr) {
          console.error('[useSegmentation] Failed to load existing segments:', dbErr.message);
          return;
        }
        if (!data) return;
        if (data.length > 0) {
          hasRunRef.current = true; // already processed — skip re-run
          setSegments(
            data.map((row) => ({
              id: row.id,
              segment_index: row.segment_index,
              model_id: row.model_id,
              source_image_url: row.source_image_url,
              label: row.label ?? '',
              material_type: row.material_type ?? '',
              finish: row.finish ?? '',
              dominant_color: row.dominant_color ?? '#888888',
              bbox: row.bbox as MaterialZone['bbox'],
              confidence: row.confidence ?? 0,
              crop_storage_url: row.crop_storage_url ?? undefined,
              search_results: (row.search_results as any[]) ?? [],
              search_query: (row as any).search_query ?? undefined,
              zone_intent: (row as any).zone_intent ?? 'surface',
            })),
          );
        }
      })
      .catch((err) => {
        console.error('[useSegmentation] Unexpected error loading segments:', err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
    // re-run on completedImages length change so cache lookup widens as
    // images stream in, but stable enough not to thrash on URL identity.
  }, [generationId, completedImages.length]);

  // ── Run segmentation once when images are ready ──────────────────────────
  const run = useCallback(async () => {
    if (!generationId || !enabled || completedImages.length === 0) return;
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    setLoading(true);
    setError(null);

    const allSegments: SegmentWithResults[] = [];

    try {
      for (const { model_id, image_url } of completedImages) {
        // Fetch image and convert to base64
        const imageBase64 = await fetchImageAsBase64(image_url);
        if (!imageBase64) continue;

        // 1. Detect zones
        const segRes = await mivaaApi.segmentImage({
          image_base64: imageBase64,
          workspace_id: workspaceId,
        });
        if (!segRes.success || !segRes.data?.zones) continue;

        const { width: imgW, height: imgH } = await getImageDimensions(image_url);

        // Cap at 12 most confident zones — see ProgressiveImageGrid for rationale
        const rankedZones = [...segRes.data.zones]
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
          .slice(0, 12);

        const baseIndex = allSegments.length;
        const processed = await Promise.all(
          rankedZones.map(async (zone, i) => {
            const segIndex = baseIndex + i;
            const cropDataUrl = await cropZone(image_url, zone.bbox, imgW, imgH);

            let searchResults: any[] = [];
            let cropStorageUrl: string | undefined;

            if (cropDataUrl) {
              const cropBase64 = cropDataUrl.split(',')[1];
              const [searchRes, uploadedUrl] = await Promise.all([
                mivaaApi.searchByImageCrop({
                  image_base64: cropBase64,
                  query: zone.search_query || `${zone.material_type} ${zone.finish} ${zone.label}`.trim(),
                  workspace_id: workspaceId,
                  top_k: 8,
                }).catch((err) => {
                  console.warn(`[useSegmentation] zone ${segIndex} search failed:`, err);
                  return { success: false, data: { results: [] } } as any;
                }),
                uploadCrop(cropDataUrl, generationId, image_url, segIndex),
              ]);
              searchResults = searchRes?.data?.results ?? [];
              cropStorageUrl = uploadedUrl;
            }

            const seg: SegmentWithResults = {
              ...zone,
              segment_index: segIndex,
              model_id,
              source_image_url: image_url,
              crop_data_url: cropDataUrl ?? undefined,
              crop_storage_url: cropStorageUrl,
              search_results: searchResults,
            };
            return seg;
          }),
        );

        allSegments.push(...processed);
      }

      // 5. Persist to DB
      if (allSegments.length > 0) {
        const rows = allSegments.map((s) => ({
          generation_id: generationId,
          model_id: s.model_id,
          source_image_url: s.source_image_url,
          segment_index: s.segment_index,
          label: s.label,
          material_type: s.material_type,
          finish: s.finish,
          dominant_color: s.dominant_color,
          bbox: s.bbox,
          crop_storage_url: s.crop_storage_url ?? null,
          search_results: s.search_results ?? null,
          confidence: s.confidence,
          search_query: s.search_query ?? null,
          zone_intent: s.zone_intent ?? 'surface',
        }));

        const { data: inserted } = await supabase
          .from('generation_3d_segments')
          .insert(rows)
          .select('id, segment_index');

        // Attach DB ids — build a lookup map to avoid O(n²) nested scan
        if (inserted) {
          const idByIndex = new Map<number, string>(inserted.map((r) => [r.segment_index as number, r.id as string]));
          for (const s of allSegments) {
            const dbId = idByIndex.get(s.segment_index);
            if (dbId) s.id = dbId;
          }
        }
      }

      setSegments(allSegments);
    } catch (err: any) {
      console.error('[useSegmentation] Error:', err);
      setError(err?.message ?? 'Segmentation failed');
      hasRunRef.current = false; // allow retry
    } finally {
      setLoading(false);
    }
  }, [generationId, workspaceId, completedImages, enabled]);

  // Keep runRef in sync with the latest `run` so the trigger effect below is stable
  runRef.current = run;

  useEffect(() => {
    // Only use runRef.current here — not `run` directly — to avoid this effect
    // firing again whenever `run` is recreated (which happens on every completedImages change).
    if (completedImages.length > 0 && !hasRunRef.current) {
      runRef.current();
    }
  }, [completedImages]); // eslint-disable-line react-hooks/exhaustive-deps

  return { segments, loading, error };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // strip data URI prefix
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1024, height: 768 }); // fallback
    img.src = url;
  });
}

async function cropZone(
  imageUrl: string,
  bbox: { x: number; y: number; w: number; h: number },
  imgW: number,
  imgH: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const sx = Math.round(bbox.x * imgW);
      const sy = Math.round(bbox.y * imgH);
      const sw = Math.max(1, Math.round(bbox.w * imgW));
      const sh = Math.max(1, Math.round(bbox.h * imgH));

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

function hashUrlKey(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

async function uploadCrop(
  dataUrl: string,
  bucketKey: string | null | undefined,
  fallbackUrl: string,
  index: number,
): Promise<string | undefined> {
  try {
    // See ProgressiveImageGrid.uploadCrop — null generationId would otherwise
    // produce `generation-segments//N.jpg` and break agent image references.
    const safeKey = (bucketKey && bucketKey.length > 0)
      ? bucketKey
      : `direct-${hashUrlKey(fallbackUrl)}`;
    const base64 = dataUrl.split(',')[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const path = `generation-segments/${safeKey}/${index}.jpg`;

    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

    if (error) return undefined;

    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return undefined;
  }
}
