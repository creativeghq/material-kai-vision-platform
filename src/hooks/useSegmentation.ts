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

  // ── Load existing segments from DB ──────────────────────────────────────
  useEffect(() => {
    if (!generationId) return;

    supabase
      .from('generation_3d_segments')
      .select('*')
      .eq('generation_id', generationId)
      .order('segment_index')
      .then(({ data, error: dbErr }) => {
        if (dbErr || !data) return;
        if (data.length > 0) {
          hasRunRef.current = true; // already processed
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
      });
  }, [generationId]);

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

        let segIndex = allSegments.length;

        for (const zone of segRes.data.zones) {
          // 2. Crop via Canvas API
          const cropDataUrl = await cropZone(image_url, zone.bbox, imgW, imgH);

          // 3. Search for similar materials
          let searchResults: any[] = [];
          if (cropDataUrl) {
            const cropBase64 = cropDataUrl.split(',')[1];
            const searchRes = await mivaaApi.searchByImageCrop({
              image_base64: cropBase64,
              query: zone.search_query || `${zone.material_type} ${zone.finish} ${zone.label}`.trim(),
              workspace_id: workspaceId,
              top_k: 8,
            });
            searchResults = searchRes.data?.results ?? [];
          }

          // 4. Upload crop to Supabase Storage
          let cropStorageUrl: string | undefined;
          if (cropDataUrl) {
            cropStorageUrl = await uploadCrop(cropDataUrl, generationId, segIndex);
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

          allSegments.push(seg);
          segIndex++;
        }
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

        // Attach DB ids
        if (inserted) {
          for (const s of allSegments) {
            const match = inserted.find((r) => r.segment_index === s.segment_index);
            if (match) s.id = match.id;
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

  useEffect(() => {
    if (completedImages.length > 0 && !hasRunRef.current) {
      run();
    }
  }, [completedImages, run]);

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

async function uploadCrop(
  dataUrl: string,
  generationId: string,
  index: number,
): Promise<string | undefined> {
  try {
    const base64 = dataUrl.split(',')[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const path = `generation-segments/${generationId}/${index}.jpg`;

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
