import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getOptimizedImageUrl } from '@/utils/imageUrl';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ZoomIn, Globe, Scan, Package, AlertCircle, RotateCcw, ExternalLink, X, Search, Paintbrush, Download, ShoppingCart, Video, BookmarkPlus, Layers, LayoutTemplate, Camera, ChevronDown, Check, Sparkles, Pencil, Sun } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { mivaaApi } from '@/services/mivaaApiClient';
import { SegmentWithResults } from '@/hooks/useSegmentation';
import { MaterialPickerModal, PickedMaterial, EditedImageResult, AppliedMaterial } from './MaterialPickerModal';
import { AddToQuoteModal } from '@/modules/quotes/components/AddToQuoteModal';
import { MoodboardSavePopover } from '@/components/business/moodboard/MoodboardSavePopover';
import { VirtualStagingModal, VirtualStagingParams } from './VirtualStagingModal';

import { onEnterOrSpace } from '@/utils/a11y';


import { useEscapeKey } from '@/hooks/useEscapeKey';
import { imageUrlToBase64 } from '@/utils/imageToBase64';
/**
 * Video models and what they cost, in one place.
 *
 * These MUST match `CREDIT_COSTS` in `generate-interior-video-v2` — that map is what the
 * generator actually debits; this is only what the picker advertises. They are checked against
 * each other by tests/unit/videoCreditFloor.test.ts, because a picker showing one price while
 * the generator charges another is a support ticket, not a compile error.
 *
 * `auto` has no credits: the model is chosen server-side from the video type, so the price is
 * not known until then.
 */
const VIDEO_MODEL_OPTIONS: ReadonlyArray<{
  value: string; label: string; description: string; credits?: number;
}> = [
  { value: 'auto', label: 'Auto', description: 'Best model selected automatically' },
  // `value` MUST match generate-interior-video-v2's VideoModel keys exactly. It used to emit
  // 'kling-3.0' and 'wan2.1-i2v', neither of which the generator knows: CREDIT_COSTS[model]
  // came back undefined, debit_credits was called with p_amount undefined, a generation_videos
  // row was written with credits_used undefined, and the run then threw "Unknown model" and
  // refunded undefined credits. Wan's price was also advertised at 10 while the generator
  // charged 12.
  { value: 'veo-2', label: 'Veo 2', description: 'Google Veo 2 — high quality', credits: 50 },
  { value: 'kling-v3.0', label: 'Kling 3.0', description: 'Kling 3.0 — cinematic + audio', credits: 20 },
  { value: 'runway-gen4-turbo', label: 'Runway Gen-4', description: 'Runway Gen-4 — premium output', credits: 40 },
];

interface ModelResult {
  model_id: string;
  model_name: string;
  provider: string;
  capability: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  image_urls: string[];
  error?: string;
  completed_at?: string;
}

interface EditedImageEntry {
  id: string;
  url: string;
  label: string;
  jobId: string;
  sourceImageUrl: string;
  appliedMaterials: AppliedMaterial[];
  createdAt: string;
}

interface ProgressiveImageGridProps {
  jobId: string;
  modelCount: number;
  models: Array<{ id: string; name: string; provider: string }>;
  onImageClick?: (imageUrl: string, modelName: string) => void;
  onGenerateVR?: (imageUrl: string, context: { prompt?: string; roomType?: string; style?: string }) => void;
  vrGenerating?: boolean;
  workspaceId?: string;
  onAskJARVIS?: (segment: SegmentWithResults) => void;
  onFindMaterial?: (segment: SegmentWithResults) => void;
  pendingReplacement?: { id: string; name: string; imageUrl?: string } | null;
  onZoneSelectedForReplacement?: (segment: SegmentWithResults) => void;
  onGenerateVideo?: (imageUrl: string, videoType: string, videoModel?: string) => void;
  onGenerateMaterialsBoard?: (imageUrl: string, boardMode: 'presentation-board' | 'selection-board' | 'photorealistic-render') => void;
  onGenerateVirtualStaging?: (imageUrl: string, params: VirtualStagingParams) => void;
  /** Opens the structured Gemini edit modal for targeted AI edits (colors, lighting, flooring…) */
  onEditImage?: (imageUrl: string) => void;
  /** When set, immediately opens the full modal for this image (no grid needed — used for Gemini single images) */
  directImage?: { url: string; title?: string };
  /** Called when the direct-image modal is closed */
  onDirectImageClose?: () => void;
  /** Room type from generation context — auto-skips step 1 in Virtual Staging modal */
  roomType?: string;
}

const ProgressiveImageGridInner: React.FC<ProgressiveImageGridProps> = ({
  jobId,
  modelCount,
  models,
  onGenerateVR,
  vrGenerating,
  workspaceId = '',
  onAskJARVIS,
  onFindMaterial,
  pendingReplacement,
  onZoneSelectedForReplacement,
  onGenerateVideo,
  onGenerateMaterialsBoard,
  onGenerateVirtualStaging,
  onEditImage,
  directImage,
  onDirectImageClose,
  roomType,
}) => {
  const [modelResults, setModelResults] = useState<ModelResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'processing' | 'completed' | 'failed'>('processing');

  // Modal state
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string; model_id: string } | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<'image' | 'products'>('image');
  // Pending overrides: when setSelectedImage and setEditMode/setModalActiveTab are called in the same
  // event handler, the reset effect (below) fires after and would wipe them. Store them here first.
  const pendingEditModeRef = useRef<'none' | 'zone-select' | 'freehand' | null>(null);
  const pendingTabRef = useRef<'image' | 'products' | null>(null);

  // Per-image segmentation state (modal-scoped)
  const [modalSegments, setModalSegments] = useState<SegmentWithResults[]>([]);
  const [modalSegmenting, setModalSegmenting] = useState(false);
  const [modalSegmentsLoaded, setModalSegmentsLoaded] = useState(false);
  const [modalSegmentError, setModalSegmentError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // The lightbox is a bare fixed-inset div, not a Radix Dialog: without this it closed on a
  // backdrop click and on nothing else.
  useEscapeKey(lightboxUrl !== null, () => setLightboxUrl(null));
  // Synchronous race guard — `setModalSegmenting(true)` is async (queued for
  // next render), so two effects can both see modalSegmenting=false in the
  // same tick and both fire loadModalSegments. The ref flips synchronously
  // and dedupes them.
  const segmentationInFlightRef = useRef(false);

  // ── Phase 5: Edit mode ───────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState<'none' | 'zone-select' | 'freehand'>('none');
  const [generatingMask, setGeneratingMask] = useState(false);
  const [activeMask, setActiveMask] = useState<string | null>(null);
  const [activeZone, setActiveZone] = useState<SegmentWithResults | null>(null);
  const [showMaskReview, setShowMaskReview] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [pickerPreselectedMaterial, setPickerPreselectedMaterial] = useState<PickedMaterial | null>(null);
  const [showVirtualStagingModal, setShowVirtualStagingModal] = useState(false);
  const [virtualStagingGenerating, setVirtualStagingGenerating] = useState(false);

  // Freehand drawing canvas
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [brushSize, setBrushSize] = useState(30);
  const [eraseMode, setEraseMode] = useState(false);

  // Video model selection (persists within the open modal)
  const [videoModel, setVideoModel] = useState<string>('auto');

  // ── Phase 6: Edited images ───────────────────────────────────────────────────
  const [editedImages, setEditedImages] = useState<EditedImageEntry[]>([]);
  // Add to Quote queue: array of real (non-sentinel) AppliedMaterial items pending quote addition
  const [quoteQueue, setQuoteQueue] = useState<AppliedMaterial[]>([]);

  // Initialize with placeholder data immediately
  useEffect(() => {
    if (models && models.length > 0) {
      const placeholders: ModelResult[] = models.map(model => ({
        model_id: model.id,
        model_name: model.name,
        provider: model.provider,
        capability: 'text-to-image',
        status: 'pending',
        image_urls: [],
      }));
      setModelResults(placeholders);
    }
  }, [models]);

  // Adaptive polling: 1s → 3s → 5s → 10s (66% reduction in DB queries)
  useEffect(() => {
    if (!jobId) return;

    let pollCount = 0;
    let timeoutId: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const getAdaptiveInterval = (count: number): number => {
      if (count < 5) return 1000;
      if (count < 15) return 3000;
      if (count < 30) return 5000;
      return 10000;
    };

    const pollJob = async () => {
      if (isCancelled) return;

      const { data, error } = await supabase
        .from('generation_3d')
        .select('models_results, progress_percentage, generation_status')
        .eq('id', jobId)
        .single();

      if (error) {
        console.error('Error polling job:', error);
        return;
      }

      if (data) {
        const modelsResultsDict = (data.models_results as any) || {};

        setModelResults(prev => {
          // Merge DB results into existing placeholders to preserve model_name/provider
          const merged = prev.map(existing => {
            const dbResult = modelsResultsDict[existing.model_id] as any;
            if (!dbResult) return existing;
            return {
              ...existing,
              status: dbResult.status || (dbResult.success ? 'completed' : existing.status),
              image_urls: dbResult.image_urls ?? (dbResult.image_url ? [dbResult.image_url] : existing.image_urls),
              error: dbResult.error ?? existing.error,
              completed_at: dbResult.completed_at ?? existing.completed_at,
            };
          });
          const hasChanges = JSON.stringify(prev) !== JSON.stringify(merged);
          return hasChanges ? merged : prev;
        });

        setProgress(data.progress_percentage || 0);
        setStatus(data.generation_status as any);

        if (data.generation_status === 'completed' || data.generation_status === 'failed') {
          return;
        }

        if (!isCancelled) {
          pollCount++;
          const interval = getAdaptiveInterval(pollCount);
          timeoutId = setTimeout(pollJob, interval);
        }
      }
    };

    pollJob();

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [jobId]);

  // Reset modal segment state and edit state whenever the selected image changes.
  // Consume pendingEditModeRef / pendingTabRef when the caller wants a specific mode/tab
  // right after switching images (avoids the ref being overwritten by this reset).
  useEffect(() => {
    setModalSegments([]);
    setModalSegmenting(false);
    setModalSegmentsLoaded(false);
    setModalSegmentError(null);
    segmentationInFlightRef.current = false;
    setModalActiveTab(pendingTabRef.current ?? 'image');
    setEditMode(pendingEditModeRef.current ?? 'none');
    pendingTabRef.current = null;
    pendingEditModeRef.current = null;
    setActiveMask(null);
    setActiveZone(null);
    setShowMaskReview(false);
    setShowMaterialPicker(false);
    setPickerPreselectedMaterial(null);
  }, [selectedImage]);

  // Auto-open modal when directImage is provided (single Gemini image — no grid)
  useEffect(() => {
    if (directImage?.url) {
      setSelectedImage({ url: directImage.url, name: directImage.title ?? 'Generated Design', model_id: 'direct' });
    }
  }, [directImage?.url]);

  // Load segments on demand — called when user opens the Products tab
  const loadModalSegments = useCallback(async () => {
    if (!selectedImage || modalSegmentsLoaded || modalSegmenting) return;
    // Synchronous race guard — see comment on segmentationInFlightRef above.
    if (segmentationInFlightRef.current) return;
    segmentationInFlightRef.current = true;

    setModalSegmenting(true);
    setModalSegmentError(null);

    try {
      // 1. Check DB for cached segments. Primary cache key is source_image_url
      // — the URL uniquely identifies an image regardless of how the user
      // arrived at it (job-bound generation, direct upload, edited variant).
      // This way the second time the modal opens for the same image we skip
      // the entire ~40s segmentation + ~40s search pipeline.
      const existing = await supabase
        .from('generation_3d_segments')
        .select('*')
        .eq('source_image_url', selectedImage.url)
        .order('segment_index')
        .then(r => r.data);

      if (existing && existing.length > 0) {
        // Re-crop zones that have no stored URL — crop_data_url is transient and not persisted
        const { width: imgW, height: imgH } = await getImageDimensions(selectedImage.url);
        const segments = await Promise.all(
          existing.map(async (row) => {
            let cropDataUrl: string | undefined;
            if (!row.crop_storage_url) {
              cropDataUrl =
                (await cropZone(
                  selectedImage.url,
                  row.bbox as SegmentWithResults['bbox'],
                  imgW,
                  imgH,
                )) ?? undefined;
            }
            return {
              id: row.id,
              segment_index: row.segment_index,
              model_id: row.model_id,
              source_image_url: row.source_image_url,
              label: row.label ?? '',
              material_type: row.material_type ?? '',
              finish: row.finish ?? '',
              dominant_color: row.dominant_color ?? '#888888',
              bbox: row.bbox as SegmentWithResults['bbox'],
              confidence: row.confidence ?? 0,
              crop_storage_url: row.crop_storage_url ?? undefined,
              crop_data_url: cropDataUrl,
              search_results: (row.search_results as any[]) ?? [],
              search_query: (row as any).search_query ?? undefined,
            };
          }),
        );
        setModalSegments(segments);
        setModalSegmentsLoaded(true);
        return;
      }

      // 2. Read image bytes as base64 (avoids canvas CORS taint issues).
      // A generated image arrives as a data: URI, which the shared helper
      // decodes in place rather than fetching - see imageToBase64.ts.
      let imageBase64: string;
      try {
        const decoded = await imageUrlToBase64(selectedImage.url);
        if (!decoded) throw new Error('could not read image bytes');
        imageBase64 = decoded;
      } catch {
        setModalSegmentError('Failed to load image for segmentation');
        setModalSegmentsLoaded(true);
        return;
      }

      console.log('[ProgressiveImageGrid] Calling segmentImage, base64 length:', imageBase64.length);
      const segRes = await mivaaApi.segmentImage({
        image_base64: imageBase64,
        workspace_id: workspaceId,
      });
      console.log('[ProgressiveImageGrid] segmentImage response:', segRes);

      if (!segRes.success) {
        setModalSegmentError(segRes.error ?? 'Segmentation API returned an error');
        setModalSegmentsLoaded(true);
        return;
      }

      if (!segRes.data?.zones?.length) {
        setModalSegmentError('No material zones detected in this image');
        setModalSegmentsLoaded(true);
        return;
      }

      const { width: imgW, height: imgH } = await getImageDimensions(selectedImage.url);

      // Render EVERY zone the model returned — sorted by confidence so the
      // most-likely ones are first, but no cap. Earlier we capped at 8 which
      // dropped legitimate zones (glass separators, wall tiles, faucets,
      // etc.) the user needs for the editor's zone-replace flow. Search is
      // bounded separately below so server load stays sane.
      const rankedZones = [...segRes.data.zones]
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

      // Phase A: render zones IMMEDIATELY (no matches yet) so the user sees
      // something at the 40s segmentation mark instead of waiting another
      // 40s+ for all RAG searches to fan in. Each zone gets its crop + label
      // + dominant color; matches stream in as Phase B completes.
      const initialSegments: SegmentWithResults[] = await Promise.all(
        rankedZones.map(async (zone, i) => {
          const cropDataUrl = await cropZone(selectedImage.url, zone.bbox, imgW, imgH);
          return {
            ...zone,
            segment_index: i,
            model_id: selectedImage.model_id,
            source_image_url: selectedImage.url,
            crop_data_url: cropDataUrl ?? undefined,
            crop_storage_url: undefined,
            search_results: [], // filled in progressively
            // _searching is a transient render flag so the row shows
            // "Searching catalog…" until Phase B completes for this zone
            // (instead of misleading "No matches above 70%").
            _searching: true,
          } as SegmentWithResults & { _searching: boolean };
        }),
      );
      setModalSegments(initialSegments);
      setModalSegmentsLoaded(true);
      setModalSegmenting(false);

      // Phase B: per-zone search + storage upload, bounded concurrency.
      // Many simultaneous calls to /api/rag/search swamps the SLIG endpoint
      // and Supabase REST pool — limit to 3 in-flight so each one gets fresh
      // capacity instead of all of them fighting for it for 40s.
      const CONCURRENCY = 3;
      const queue = initialSegments.map((seg, i) => ({ seg, i }));
      let cursor = 0;

      const runOne = async (): Promise<void> => {
        while (cursor < queue.length) {
          const slot = cursor++;
          const { seg, i } = queue[slot];
          const cropDataUrl = seg.crop_data_url;
          if (!cropDataUrl) continue;
          const cropBase64 = cropDataUrl.split(',')[1];

          const [searchRes, uploadedUrl] = await Promise.all([
            mivaaApi.searchByImageCrop({
              image_base64: cropBase64,
              query: seg.search_query || `${seg.material_type} ${seg.finish} ${seg.label}`.trim(),
              workspace_id: workspaceId,
              top_k: 8,
            }).catch((err) => {
              console.warn(`[ProgressiveImageGrid] zone ${i} search failed:`, err);
              return { success: false, data: { results: [] } } as any;
            }),
            uploadCrop(cropDataUrl, jobId, selectedImage.url, i),
          ]);

          const results = searchRes?.data?.results ?? [];
          // Update this zone in place so the row populates as soon as its
          // own search finishes. Other zones keep their existing state.
          setModalSegments((prev) =>
            prev.map((s) =>
              s.segment_index === i
                ? { ...s, search_results: results, crop_storage_url: uploadedUrl, _searching: false } as SegmentWithResults & { _searching: boolean }
                : s,
            ),
          );
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, runOne));

      // Phase C: enrich (image_product_associations → product image URLs)
      // THEN persist. Enrichment must run before the cache write so cache
      // hits next time include image_url on every result — otherwise the
      // user sees blank product thumbnails after a reload.
      let snapshot: SegmentWithResults[] = [];
      setModalSegments((latest) => { snapshot = latest; return latest; });

      const allProductIds = [...new Set(
        snapshot.flatMap(s => (s.search_results ?? []).map((r: any) => r.id)),
      )].filter(Boolean);

      let enriched = snapshot;
      if (allProductIds.length > 0) {
        try {
          const { data: imageAssocs } = await supabase
            .from('image_product_associations')
            .select('product_id, overall_score, document_images!inner(image_url)')
            .in('product_id', allProductIds)
            .order('overall_score', { ascending: false });

          const productImageMap: Record<string, string> = {};
          (imageAssocs ?? []).forEach((assoc: any) => {
            if (!productImageMap[assoc.product_id]) {
              productImageMap[assoc.product_id] = assoc.document_images?.image_url ?? '';
            }
          });

          enriched = snapshot.map((seg) => ({
            ...seg,
            search_results: (seg.search_results ?? []).map((r: any) => ({
              ...r,
              image_url: productImageMap[r.id] || r.image_url || null,
            })),
          }));
          setModalSegments(enriched);
        } catch (imgErr) {
          console.warn('[ProgressiveImageGrid] Could not fetch product images:', imgErr);
        }
      }

      // Persist for cache. generation_id may be null for direct/edited
      // images — the source_image_url is the real cache key on lookup, so a
      // NULL generation_id row still serves cache hits cleanly. If the
      // column is NOT NULL the insert fails gracefully and we simply
      // re-segment next time (no error surfaced to the user).
      if (enriched.length > 0) {
        const rows = enriched.map((s) => ({
          // `|| null`, not `?? null`. AgentHub renders this component with jobId="" for the
          // Gemini single-image modal, and `??` only catches null/undefined — so an empty
          // string reached a uuid column and PostgREST rejected the WHOLE multi-row insert
          // (22P02). The failure was only console.warn'd, so the cache never persisted and
          // every open of the Products tab re-ran the full MIVAA segment call plus one
          // /api/rag/search per zone: real backend spend and ~80s of wait, forever, with no
          // cache hit possible.
          generation_id: jobId || null,
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
          search_query: (s as any).search_query ?? null,
        }));

        try {
          const { error: insErr } = await supabase
            .from('generation_3d_segments')
            .insert(rows);
          if (insErr) {
            console.warn('[ProgressiveImageGrid] Cache persist failed:', insErr.message);
          }
        } catch (dbErr) {
          console.warn('[ProgressiveImageGrid] Cache persist error:', dbErr);
        }
      }
    } catch (err: any) {
      console.error('[ProgressiveImageGrid] Segmentation error:', err);
      setModalSegmentError(err?.message ?? 'Unexpected error during segmentation');
      setModalSegmentsLoaded(true);
    } finally {
      setModalSegmenting(false);
      segmentationInFlightRef.current = false;
    }
  }, [selectedImage, jobId, workspaceId, modalSegmentsLoaded, modalSegmenting]);

  // Delete cached DB rows then trigger a fresh segmentation run.
  // Match the same key the lookup uses (source_image_url) so regenerate
  // also clears cache rows that have null generation_id (direct/edited).
  const handleRegenerate = useCallback(async () => {
    if (!selectedImage) return;
    await supabase
      .from('generation_3d_segments')
      .delete()
      .eq('source_image_url', selectedImage.url);
    setModalSegments([]);
    setModalSegmentError(null);
    setModalSegmentsLoaded(false);
  }, [selectedImage]);

  // Trigger loading when the Products tab is selected
  useEffect(() => {
    if (modalActiveTab === 'products' && selectedImage && !modalSegmentsLoaded && !modalSegmenting) {
      loadModalSegments();
    }
  }, [modalActiveTab, selectedImage, modalSegmentsLoaded, modalSegmenting, loadModalSegments]);

  // ── Zone-select: auto-load segments when mode is activated ──────────────────
  useEffect(() => {
    if (editMode !== 'zone-select' || !selectedImage) return;
    if (!modalSegmentsLoaded && !modalSegmenting) {
      loadModalSegments();
    }
  }, [editMode, selectedImage, modalSegmentsLoaded, modalSegmenting, loadModalSegments]);

  // ── Edit mode: initialise freehand canvas at natural image size ──────────────
  useEffect(() => {
    if (editMode !== 'freehand' || !drawingCanvasRef.current || !selectedImage) return;
    getImageDimensions(selectedImage.url).then(({ width, height }) => {
      const canvas = drawingCanvasRef.current;
      if (!canvas) return;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
    });
  }, [editMode, selectedImage]);

  // ── Edit mode: generate SAM mask from a detected zone bbox ───────────────────
  const generateMaskFromZone = useCallback(async (seg: SegmentWithResults) => {
    if (!selectedImage) return;
    setGeneratingMask(true);
    try {
      // Prefer image_url → backend passes it directly to SAM 2 Replicate (no base64 round-trip)
      const res = await mivaaApi.generateSAMMask({
        image_url: selectedImage.url,
        hint_type: 'bbox',
        bbox: seg.bbox,
        workspace_id: workspaceId,
      });
      if (res.success && res.data?.mask_base64) {
        setActiveMask(res.data.mask_base64);
      } else {
        // Fallback: client-side bbox mask
        const { width, height } = await getImageDimensions(selectedImage.url);
        setActiveMask(await createBboxMask(seg.bbox, width, height));
      }
    } catch {
      // Fallback on any error
      try {
        const { width, height } = await getImageDimensions(selectedImage.url);
        setActiveMask(await createBboxMask(seg.bbox, width, height));
      } catch { /* ignore */ }
    } finally {
      setGeneratingMask(false);
    }
    setActiveZone(seg);
    // If pendingReplacement is set, pre-populate the picker material
    if (pendingReplacement) {
      setPickerPreselectedMaterial({
        id: pendingReplacement.id,
        name: pendingReplacement.name,
        imageUrl: pendingReplacement.imageUrl,
        category: '',
        raw: {},
      });
      // Signal parent to clear pendingReplacement banner
      onZoneSelectedForReplacement?.(seg);
    }
    setShowMaskReview(true);
  }, [selectedImage, workspaceId, pendingReplacement, onZoneSelectedForReplacement]);

  // ── Freehand canvas helpers ───────────────────────────────────────────────────
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const paintOnCanvas = (x: number, y: number, from?: { x: number; y: number }) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const color = eraseMode ? '#000000' : '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (from) {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingCanvasRef.current) return;
    isDrawingRef.current = true;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const pt = getCanvasCoords(e, drawingCanvasRef.current);
    lastPointRef.current = pt;
    paintOnCanvas(pt.x, pt.y);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !drawingCanvasRef.current) return;
    const pt = getCanvasCoords(e, drawingCanvasRef.current);
    paintOnCanvas(pt.x, pt.y, lastPointRef.current ?? undefined);
    lastPointRef.current = pt;
  };

  const handleCanvasPointerUp = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearFreehandCanvas = () => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const exportFreehandMask = (): string | null => {
    if (!drawingCanvasRef.current) return null;
    return drawingCanvasRef.current.toDataURL('image/png').split(',')[1];
  };

  const handleImageClick = (result: ModelResult) => {
    if (result.status === 'completed' && result.image_urls[0]) {
      setSelectedImage({ url: result.image_urls[0], name: result.model_name, model_id: result.model_id });
    }
  };

  return (
    <>
      {/* When used as a direct-image modal (no grid), render nothing except the modal below */}
      <div className={directImage ? 'hidden' : 'space-y-4'}>
        {/* Progress bar — only while generating */}
        {status !== 'completed' && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Generating images...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Image grid */}
        <div className={`grid gap-4 ${
          modelCount === 1 ? 'grid-cols-1' :
          modelCount === 2 ? 'grid-cols-2' :
          modelCount === 3 ? 'grid-cols-1 md:grid-cols-3' :
          modelCount === 4 ? 'grid-cols-2 md:grid-cols-2' :
          modelCount === 6 ? 'grid-cols-2 md:grid-cols-3' :
          modelCount === 7 ? 'grid-cols-2 md:grid-cols-4' :
          'grid-cols-2 md:grid-cols-4'
        }`}>
          {modelResults.map((result) => (
            <div key={result.model_id} className="flex flex-col gap-1.5">
              <div
                role="button"
                tabIndex={0}
                onKeyDown={onEnterOrSpace(() => handleImageClick(result))}
                className="relative aspect-square rounded-lg overflow-hidden border-2 border-border cursor-pointer hover:border-primary/50 transition-all"
                onClick={() => handleImageClick(result)}
              >
                {result.status === 'pending' || result.status === 'processing' ? (
                  <div className="absolute inset-0 bg-muted animate-pulse">
                    <div className="absolute inset-0 opacity-30">
                      <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 bg-blue-200 rounded-full blur-3xl" />
                      <div className="absolute bottom-1/4 right-1/4 w-1/3 h-1/3 bg-purple-200 rounded-full blur-2xl" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                  </div>
                ) : result.status === 'completed' && result.image_urls[0] ? (
                  <>
                    <img
                      src={getOptimizedImageUrl(result.image_urls[0], 'preview')}
                      alt={result.model_name}
                      className="w-full h-full object-cover animate-fade-in"
                    />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-all flex items-center justify-center opacity-0 hover:opacity-100">
                      <ZoomIn className="w-8 h-8 text-white" />
                    </div>
                  </>
                ) : result.status === 'failed' ? (
                  <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
                    <div className="text-center p-4">
                      <p className="text-red-600 text-sm font-medium">Failed</p>
                      <p className="text-red-500 text-xs mt-1">{result.error}</p>
                    </div>
                  </div>
                ) : null}

                {result.status === 'completed' && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                {/* "Edited" indicator — shown when a material replacement was applied to this image */}
                {result.image_urls[0] && editedImages.some(e => e.sourceImageUrl === result.image_urls[0]) && (
                  <div className="absolute top-2 left-2 z-10">
                    <Badge className="bg-violet-600 text-white text-[9px] px-1.5 py-0 shadow flex items-center gap-0.5">
                      <Paintbrush className="w-2.5 h-2.5" />
                      Edited
                    </Badge>
                  </div>
                )}
              </div>
              {/* Model label below the image */}
              <p className="text-xs font-medium text-center text-foreground truncate px-1 leading-tight">{result.model_name}</p>
            </div>
          ))}
        </div>

        {status === 'completed' && (
          <p className="text-green-600 text-sm font-medium text-center">
            ✅ All images generated successfully!
          </p>
        )}
      </div>

      {/* ── Edited Versions (Phase 6) ────────────────────────────────────────── */}
      {editedImages.length > 0 && (
        <div className="space-y-3 mt-4">
          <div className="flex items-center gap-2">
            <Paintbrush className="w-4 h-4 text-violet-600" />
            <h4 className="text-sm font-semibold text-foreground">Edited Versions</h4>
            <Badge variant="secondary" className="text-xs">{editedImages.length}</Badge>
          </div>
          <div className={`grid gap-3 ${editedImages.length === 1 ? 'grid-cols-1 max-w-sm' : 'grid-cols-2'}`}>
            {editedImages.map(edited => (
              <div
                role="button"
                tabIndex={0}
                onKeyDown={onEnterOrSpace(() => setSelectedImage({ url: edited.url, name: `Edited: ${edited.label}`, model_id: 'edited' }))}
                key={edited.id}
                className="relative rounded-xl overflow-hidden border-2 border-violet-500/30 bg-card group cursor-pointer"
                onClick={() => setSelectedImage({ url: edited.url, name: `Edited: ${edited.label}`, model_id: 'edited' })}
              >
                <img
                  src={getOptimizedImageUrl(edited.url, 'preview')}
                  alt={edited.label}
                  className="w-full aspect-square object-cover"
                />
                {/* Edited badge */}
                <div className="absolute top-2 left-2 z-10">
                  <Badge className="bg-violet-600 text-white text-[10px] px-1.5 py-0.5 shadow">
                    ✏ {edited.label || 'Edited'}
                  </Badge>
                </div>
                {/* Hover action buttons */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all" />
                <div className="absolute bottom-0 left-0 right-0 flex flex-wrap gap-1 p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  {onGenerateVR && (
                    <button
                      onClick={e => { e.stopPropagation(); onGenerateVR(edited.url, { prompt: edited.label }); }}
                      className="flex items-center gap-1 px-2 py-1 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-medium rounded transition-colors"
                    >
                      <Globe className="w-3 h-3" />
                      VR
                    </button>
                  )}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      pendingTabRef.current = 'products';
                      setSelectedImage({ url: edited.url, name: `Edited: ${edited.label}`, model_id: 'edited' });
                    }}
                    className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium rounded transition-colors"
                  >
                    <Scan className="w-3 h-3" />
                    Re-Segment
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      pendingEditModeRef.current = 'zone-select';
                      pendingTabRef.current = 'products';
                      setSelectedImage({ url: edited.url, name: `Edited: ${edited.label}`, model_id: 'edited' });
                    }}
                    className="flex items-center gap-1 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-medium rounded transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Edit More
                  </button>
                  {edited.appliedMaterials.filter(m => !m.product_id.startsWith('__')).length > 0 && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setQuoteQueue(edited.appliedMaterials.filter(m => !m.product_id.startsWith('__')));
                      }}
                      className="flex items-center gap-1 px-2 py-1 bg-slate-600 hover:bg-slate-700 text-white text-[10px] font-medium rounded transition-colors"
                    >
                      <ShoppingCart className="w-3 h-3" />
                      Add to Quote
                    </button>
                  )}
                  <a
                    href={edited.url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 px-2 py-1 bg-white/20 hover:bg-white/30 text-white text-[10px] font-medium rounded transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image Modal */}
      <Dialog open={!!selectedImage} onOpenChange={() => { if (selectedImage?.model_id === 'direct') onDirectImageClose?.(); setSelectedImage(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="font-semibold text-foreground truncate">
                  Interior Design Render
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Generated by <span className="font-medium text-foreground">{selectedImage?.name}</span> · Click Products to detect material zones
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {selectedImage && (
                  <>
                    <button
                      onClick={() => {
                        if (editMode !== 'none') {
                          setEditMode('none');
                        } else {
                          setEditMode('zone-select');
                        }
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        editMode !== 'none'
                          ? 'bg-violet-600 text-white'
                          : 'bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 border border-violet-500/20'
                      }`}
                    >
                      <Paintbrush className="w-3.5 h-3.5" />
                      {editMode !== 'none' ? 'Editing' : 'Edit Mode'}
                    </button>
                    {/* Image Editor — visible only while Edit Mode is active */}
                    {editMode !== 'none' && onEditImage && (
                      <button
                        onClick={() => onEditImage(selectedImage.url)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 border border-violet-500/20 transition-colors"
                        title="Change colors, lighting, flooring, style and more with AI"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Image Editor
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
            <Tabs
              value={modalActiveTab}
              onValueChange={(v) => setModalActiveTab(v as typeof modalActiveTab)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 bg-muted p-1 rounded-lg h-9">
                <TabsTrigger value="image" className="gap-1.5 text-xs rounded-md">
                  <ZoomIn className="w-3.5 h-3.5" />
                  Image
                </TabsTrigger>
                <TabsTrigger value="products" className="gap-1.5 text-xs rounded-md">
                  {modalSegmenting
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Scan className="w-3.5 h-3.5" />}
                  Materials
                  {modalSegments.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                      {modalSegments.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Edit mode tabs */}
              {editMode !== 'none' && (
                <div className="flex gap-1 mt-2 p-1 bg-violet-500/10 rounded-lg border border-violet-500/20">
                  <button
                    onClick={() => { setEditMode('zone-select'); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      editMode === 'zone-select' ? 'bg-violet-600 text-white' : 'text-violet-600 hover:bg-violet-100'
                    }`}
                  >
                    <Scan className="w-3.5 h-3.5" />
                    Zone Select
                  </button>
                  <button
                    onClick={() => { setEditMode('freehand'); setModalActiveTab('image'); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      editMode === 'freehand' ? 'bg-violet-600 text-white' : 'text-violet-600 hover:bg-violet-100'
                    }`}
                  >
                    <Paintbrush className="w-3.5 h-3.5" />
                    Draw Mask
                  </button>
                </div>
              )}

              {/* Image Tab */}
              <TabsContent value="image" className="mt-4">
                {editMode === 'freehand' ? (
                  /* Freehand draw mode */
                  <div className="relative bg-muted/40 rounded-xl overflow-hidden border-2 border-violet-400" style={{ minHeight: '380px' }}>
                    {selectedImage && (
                      <>
                        <img
                          src={getOptimizedImageUrl(selectedImage.url, 'display')}
                          alt={selectedImage.name}
                          className="w-full h-full object-contain pointer-events-none select-none"
                        />
                        <canvas
                          ref={drawingCanvasRef}
                          className="absolute inset-0 w-full h-full cursor-crosshair"
                          style={{ opacity: 0.55, mixBlendMode: 'screen' }}
                          onPointerDown={handleCanvasPointerDown}
                          onPointerMove={handleCanvasPointerMove}
                          onPointerUp={handleCanvasPointerUp}
                          onPointerLeave={handleCanvasPointerUp}
                        />
                        {/* Freehand toolbar */}
                        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-black/75 px-3 py-2 backdrop-blur-sm">
                          <span className="text-white/70 text-[10px]">Size</span>
                          <input
                            type="range" min="5" max="80" value={brushSize}
                            onChange={e => setBrushSize(Number(e.target.value))}
                            className="w-16 accent-violet-400"
                          />
                          <span className="text-white/70 text-[10px] w-6">{brushSize}</span>
                          <button
                            onClick={() => setEraseMode(!eraseMode)}
                            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                              eraseMode ? 'bg-white text-black' : 'bg-white/20 text-white hover:bg-white/30'
                            }`}
                          >
                            {eraseMode ? 'Erase' : 'Draw'}
                          </button>
                          <button
                            onClick={clearFreehandCanvas}
                            className="text-white/60 hover:text-white text-[10px] transition-colors"
                          >
                            Clear
                          </button>
                          <div className="flex-1" />
                          <button
                            onClick={() => {
                              const mask = exportFreehandMask();
                              if (mask) {
                                setActiveMask(mask);
                                setActiveZone(null);
                                setShowMaskReview(true);
                              }
                            }}
                            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <Paintbrush className="w-3 h-3" />
                            Apply Mask →
                          </button>
                        </div>
                        <div className="absolute top-2 left-2 bg-violet-600 text-white text-[10px] px-2 py-1 rounded-md font-medium">
                          Draw the area to replace
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  /* Normal image view + zone-select overlays */
                  <div
                    className={`relative bg-muted/40 rounded-xl overflow-hidden border-2 transition-colors ${
                      editMode === 'zone-select' ? 'border-violet-400' : 'border-border'
                    }`}
                  >
                    {selectedImage && (
                      <>
                        {/* Use w-full h-auto so bbox % coords map correctly — no letterbox offset */}
                        <img
                          src={selectedImage.url}
                          alt={selectedImage.name}
                          className="w-full h-auto block"
                        />
                        {/* Model name badge on image */}
                        <div className="absolute bottom-3 left-3 z-10">
                          <span className="bg-black/70 text-white text-[11px] font-medium px-2.5 py-1 rounded-full backdrop-blur-sm">
                            {selectedImage.name}
                          </span>
                        </div>

                        {/* Zone-select mode: clickable overlay rectangles */}
                        {editMode === 'zone-select' && (
                          <div className="absolute inset-0">
                            {/* Loading state */}
                            {(modalSegmenting || (!modalSegmentsLoaded && !modalSegmentError)) && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                                <div className="bg-white rounded-xl px-5 py-3 flex items-center gap-3 shadow-lg">
                                  <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
                                  <div>
                                    <span className="text-sm font-medium block">Detecting zones…</span>
                                    <span className="text-xs text-muted-foreground">AI vision analysis — may take up to 90s</span>
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Instruction when no zones yet */}
                            {modalSegmentsLoaded && modalSegments.length === 0 && !modalSegmentError && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <p className="text-white text-sm bg-black/60 px-4 py-2 rounded-lg">No zones detected — try Draw Mask instead</p>
                              </div>
                            )}
                            {/* Error */}
                            {modalSegmentError && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <div className="bg-white rounded-xl px-5 py-3 text-center shadow-lg space-y-2">
                                  <p className="text-sm text-destructive font-medium">Detection failed</p>
                                  <Button size="sm" variant="outline" onClick={handleRegenerate}>Retry</Button>
                                </div>
                              </div>
                            )}
                            {/* Zone rectangles */}
                            {modalSegments.map((seg, i) => (
                              <button
                                key={seg.id ?? i}
                                onClick={() => !generatingMask && generateMaskFromZone(seg)}
                                disabled={generatingMask}
                                style={{
                                  left: `${seg.bbox.x * 100}%`,
                                  top: `${seg.bbox.y * 100}%`,
                                  width: `${seg.bbox.w * 100}%`,
                                  height: `${seg.bbox.h * 100}%`,
                                }}
                                className="absolute border-2 border-transparent bg-transparent hover:bg-violet-500/30 hover:border-white/80 disabled:cursor-wait transition-all group cursor-pointer rounded-sm"
                                title={`${seg.label} — click to replace`}
                              >
                                {/* Zone label tooltip */}
                                <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap leading-tight">
                                  {seg.label}
                                  {generatingMask && ' (generating…)'}
                                  {seg.zone_intent === 'sub_element' && !generatingMask && (
                                    <span className="ml-1 text-yellow-300">· Use Freehand for precision</span>
                                  )}
                                </span>
                                {/* Center "+" icon on hover */}
                                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <span className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center shadow">
                                    <Paintbrush className="w-3.5 h-3.5 text-white" />
                                  </span>
                                </span>
                              </button>
                            ))}
                            {/* Header hint */}
                            <div className="absolute top-2 left-2 bg-violet-600 text-white text-[10px] px-2 py-1 rounded-md font-medium pointer-events-none">
                              Click a zone to replace
                            </div>
                          </div>
                        )}

                      </>
                    )}
                  </div>
                )}

                {/* Action bar — below image, always visible */}
                {editMode === 'none' && (
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {onGenerateVideo && selectedImage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-full text-xs font-medium text-rose-700 dark:text-rose-300 transition-colors shadow-sm">
                            <Video className="w-3.5 h-3.5" />
                            Generate Video
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                          <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground pb-1">Used Model</DropdownMenuLabel>
                          {VIDEO_MODEL_OPTIONS.map(vm => (
                            <DropdownMenuItem key={vm.value} onClick={(e) => { e.preventDefault(); setVideoModel(vm.value); }} className="gap-1.5">
                              <Check className={cn('w-3 h-3 flex-shrink-0', videoModel === vm.value ? 'opacity-100' : 'opacity-0')} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-xs">{vm.label}</div>
                                <div className="text-[11px] text-muted-foreground">{vm.description}</div>
                              </div>
                              {'credits' in vm && <span className="ml-2 text-[11px] text-muted-foreground flex-shrink-0">{vm.credits} cr</span>}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground pb-1">Video Style</DropdownMenuLabel>
                          {[
                            { value: 'walkthrough',          label: 'Walkthrough',          description: 'Cinematic camera walk through the space' },
                            { value: 'product_spotlight',    label: 'Product Spotlight',    description: 'Zoom focus on a featured element' },
                            { value: 'before_after',         label: 'Before / After',       description: 'Transition between original and new design' },
                            { value: 'floorplan_flythrough', label: 'Floorplan Flythrough', description: 'Aerial perspective from floor plan' },
                            { value: 'social_reel',          label: 'Social Reel 9:16',     description: 'Vertical clip for social media' },
                          ].map(vt => (
                            <DropdownMenuItem key={vt.value} onClick={() => onGenerateVideo(selectedImage.url, vt.value, videoModel)}>
                              <Video className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-xs">{vt.label}</div>
                                <div className="text-[11px] text-muted-foreground">{vt.description}</div>
                              </div>
                              {/* Priced by the selected MODEL, not by the style — every style row
                                  read a hardcoded "30 cr", so choosing Kling showed 30 and charged
                                  20, and choosing Runway showed 30 and charged 40. */}
                              {VIDEO_MODEL_OPTIONS.find(m => m.value === videoModel)?.credits != null && (
                                <span className="ml-2 text-[11px] text-muted-foreground flex-shrink-0">
                                  {VIDEO_MODEL_OPTIONS.find(m => m.value === videoModel)?.credits} cr
                                </span>
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {onGenerateVR && (
                      <button
                        onClick={() => { if (!vrGenerating) onGenerateVR(selectedImage!.url, { prompt: selectedImage!.name }); }}
                        disabled={vrGenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 rounded-full text-xs font-medium text-violet-700 dark:text-violet-300 disabled:opacity-50 transition-colors shadow-sm"
                        title={vrGenerating ? 'VR world is being generated...' : 'Generate explorable VR world (18 credits)'}
                      >
                        {vrGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                        {vrGenerating ? 'Generating VR World…' : 'Generate VR World'}
                      </button>
                    )}
                    {onGenerateVirtualStaging && selectedImage && (
                      <button
                        onClick={() => setShowVirtualStagingModal(true)}
                        disabled={virtualStagingGenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-full text-xs font-medium text-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
                        title="Virtually stage this room with AI-generated furniture (20 credits)"
                      >
                        {virtualStagingGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {virtualStagingGenerating ? 'Staging…' : 'Virtual Staging'}
                      </button>
                    )}
                    {/* Lighting Variants — generates same room under different lighting */}
                    {onEditImage && selectedImage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-full text-xs font-medium text-sky-700 transition-colors shadow-sm">
                            <Sun className="w-3.5 h-3.5" />
                            Lighting Variants
                            <ChevronDown className="w-3 h-3 ml-0.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                          <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground pb-1">Generate this room under different lighting</DropdownMenuLabel>
                          {[
                            { value: 'golden hour — warm amber sunlight at a low angle, long soft shadows, cosy', label: 'Golden Hour', desc: 'Warm amber sunlight, long shadows', credits: 6 },
                            { value: 'bright midday daylight — crisp, even natural light, no harsh shadows', label: 'Bright Midday', desc: 'Crisp, even natural light', credits: 6 },
                            { value: 'soft overcast daylight — diffused natural light, calm serene mood', label: 'Soft Overcast', desc: 'Diffused, calm, serene mood', credits: 6 },
                            { value: 'warm evening ambiance — soft warm artificial lighting, cosy glow, no daylight', label: 'Warm Evening', desc: 'Soft warm artificial glow', credits: 6 },
                            { value: 'night time interior — dark outside, warm interior lights on, atmospheric', label: 'Night', desc: 'Dark outside, warm interior', credits: 6 },
                            { value: 'dramatic spotlight / accent lighting — targeted beams on key surfaces', label: 'Dramatic Spots', desc: 'Targeted accent beams', credits: 6 },
                          ].map(l => (
                            <DropdownMenuItem key={l.label} onClick={() => {
                              const prompt = `Change the lighting to: ${l.value}. Keep all furniture positions, fixtures, walls, windows, doors, and architecture exactly where they are. Only modify the lighting and shadows. Photorealistic result. 24mm architectural lens, corrected verticals, no fisheye.`;
                              onEditImage(selectedImage.url + '|LIGHTING|' + prompt);
                            }}>
                              <Sun className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-sky-600" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-xs">{l.label}</div>
                                <div className="text-[11px] text-muted-foreground">{l.desc}</div>
                              </div>
                              <span className="ml-2 text-[11px] text-muted-foreground flex-shrink-0">{l.credits} cr</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {onGenerateMaterialsBoard && selectedImage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-full text-xs font-medium text-amber-700 dark:text-amber-300 transition-colors shadow-sm">
                            <Layers className="w-3.5 h-3.5" />
                            Materials Board
                            <ChevronDown className="w-3 h-3 ml-0.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => onGenerateMaterialsBoard(selectedImage.url, 'presentation-board')}>
                            <LayoutTemplate className="h-4 w-4 mr-2" />
                            <div>
                              <div className="font-medium">Presentation Board</div>
                              <div className="text-xs text-muted-foreground">Fitment selection + isometric drawing + material column</div>
                            </div>
                            <span className="ml-auto text-xs text-muted-foreground pl-4">15 cr</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onGenerateMaterialsBoard(selectedImage.url, 'selection-board')}>
                            <Layers className="h-4 w-4 mr-2" />
                            <div>
                              <div className="font-medium">Selection Board</div>
                              <div className="text-xs text-muted-foreground">Cutaway view with material swatch callouts</div>
                            </div>
                            <span className="ml-auto text-xs text-muted-foreground pl-4">15 cr</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {/* Photorealistic Render — standalone button */}
                    {onGenerateMaterialsBoard && selectedImage && (
                      <button
                        onClick={() => onGenerateMaterialsBoard(selectedImage.url, 'photorealistic-render')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-full text-xs font-medium text-rose-700 dark:text-rose-300 transition-colors shadow-sm"
                        title="Generate ultra-detailed magazine-quality photorealistic render (15 credits)"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Photorealistic Render
                      </button>
                    )}
                    {selectedImage && (
                      <MoodboardSavePopover
                        mediaUrl={selectedImage.url}
                        mediaType="image"
                        mediaTitle={selectedImage.name || 'Generated Design'}
                      >
                        <button
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-full text-xs font-medium text-pink-700 transition-colors shadow-sm"
                          title="Save this design to a moodboard"
                        >
                          <BookmarkPlus className="w-3.5 h-3.5" />
                          Save to Moodboard
                        </button>
                      </MoodboardSavePopover>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* Materials Tab — on-demand segmentation */}
              <TabsContent value="products" className="mt-4 space-y-3">
                {/* Pending replacement banner */}
                {pendingReplacement && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-primary/10 border border-primary/30 rounded-lg">
                    <Paintbrush className="w-4 h-4 text-primary flex-shrink-0" />
                    <p className="text-xs text-foreground flex-1 font-medium">
                      Select a zone below to replace with <span className="font-semibold">"{pendingReplacement.name}"</span>
                    </p>
                  </div>
                )}
                {/* Action bar */}
                {modalSegmentsLoaded && !modalSegmenting && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {modalSegments.length > 0
                        ? `${modalSegments.length} material zone${modalSegments.length !== 1 ? 's' : ''} detected`
                        : 'No zones detected'}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={handleRegenerate}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Regenerate
                    </Button>
                  </div>
                )}

                {modalSegmenting ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                    <div className="relative">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                    <p className="font-medium text-sm text-foreground">Detecting material zones…</p>
                    <p className="text-xs text-muted-foreground">AI vision analysis — may take up to 90 seconds on first run</p>
                  </div>
                ) : modalSegmentError ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="p-3 bg-destructive/10 rounded-full">
                      <AlertCircle className="w-6 h-6 text-destructive" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-sm text-foreground">Detection failed</p>
                      <p className="text-xs text-center text-muted-foreground max-w-xs mt-1">{modalSegmentError}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8"
                      onClick={handleRegenerate}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Try again
                    </Button>
                  </div>
                ) : modalSegmentsLoaded && modalSegments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="p-3 bg-muted rounded-full">
                      <Scan className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-sm text-foreground">No material zones detected</p>
                      <p className="text-xs text-muted-foreground mt-1">Try regenerating or use a clearer render</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8"
                      onClick={handleRegenerate}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Regenerate
                    </Button>
                  </div>
                ) : modalSegments.length > 0 ? (
                  <div className="space-y-3">
                    {modalSegments.map((seg, idx) => {
                      const matches = (seg.search_results ?? [])
                        .filter((r: any) => (r.score ?? r.final_score ?? 0) >= 0.7)
                        .slice(0, 3);

                      const EMB_TYPES = [
                        { key: 'visual_score',        abbr: 'V',   label: 'Visual' },
                        { key: 'understanding_score', abbr: 'U',   label: 'Understanding' },
                        { key: 'color_score',         abbr: 'C',   label: 'Color' },
                        { key: 'texture_score',       abbr: 'T',   label: 'Texture' },
                        { key: 'style_score',         abbr: 'S',   label: 'Style' },
                        { key: 'material_score',      abbr: 'M',   label: 'Material' },
                        { key: 'chunk_score',         abbr: 'Txt', label: 'Text' },
                      ] as const;

                      return (
                        <div key={seg.id ?? idx} className="rounded-xl border border-border bg-card overflow-hidden">
                          {/* Zone header — material info */}
                          <div className="flex gap-3 p-3 border-b border-border bg-muted/30">
                            {/* Crop thumbnail */}
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                              {(seg.crop_storage_url || seg.crop_data_url) && (
                                <button
                                  type="button"
                                  className="block w-full h-full"
                                  aria-label={`Enlarge ${seg.label}`}
                                  onClick={() => setLightboxUrl(seg.crop_storage_url ?? seg.crop_data_url!)}
                                >
                                  <img
                                    src={getOptimizedImageUrl(seg.crop_storage_url ?? seg.crop_data_url, 'thumbnail')}
                                    alt={seg.label}
                                    className="w-full h-full object-cover cursor-zoom-in"
                                  />
                                </button>
                              )}
                              <div className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] px-1 rounded-tl leading-tight">
                                {Math.round(seg.confidence * 100)}%
                              </div>
                            </div>

                            {/* Material metadata */}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground capitalize text-sm leading-tight">{seg.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{seg.material_type} · {seg.finish}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <div
                                  className="w-3 h-3 rounded-full border border-border flex-shrink-0"
                                  style={{ backgroundColor: seg.dominant_color ?? '#888' }}
                                />
                                <span className="text-[10px] text-muted-foreground font-mono">{seg.dominant_color}</span>
                              </div>
                              {(seg as any).search_query && (
                                <p className="text-[11px] text-muted-foreground/80 italic mt-1.5 line-clamp-2 leading-snug">
                                  {(seg as any).search_query}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Platform matches */}
                          {(seg as any)._searching ? (
                            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                              <span>Searching catalog for matches…</span>
                            </div>
                          ) : matches.length > 0 ? (
                            <div className="divide-y divide-border">
                              {matches.map((match: any, mIdx: number) => {
                                const score = match.score ?? match.final_score ?? 0;
                                const name = match.product_name ?? match.name ?? 'Product';
                                return (
                                  <div key={mIdx} className="flex gap-2.5 px-3 py-2.5 items-start">
                                    {/* Product image */}
                                    <div className="w-10 h-10 rounded-md overflow-hidden bg-muted flex-shrink-0 border border-border">
                                      {match.image_url ? (
                                        <button
                                          type="button"
                                          className="block w-full h-full"
                                          aria-label={`Enlarge ${name}`}
                                          onClick={() => setLightboxUrl(match.image_url)}
                                        >
                                          <img
                                            src={getOptimizedImageUrl(match.image_url, 'thumbnail')}
                                            alt={name}
                                            className="w-full h-full object-cover cursor-zoom-in"
                                          />
                                        </button>
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/60">
                                          <Package className="w-3.5 h-3.5" />
                                        </div>
                                      )}
                                    </div>

                                    {/* Name + scores */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="text-xs font-medium text-foreground truncate flex-1">{name}</p>
                                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/30 flex-shrink-0">
                                          {Math.round(score * 100)}%
                                        </Badge>
                                      </div>

                                      {/* 7 embedding scores */}
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {EMB_TYPES.map(({ key, abbr, label }) => {
                                          const val: number = match[key] ?? 0;
                                          if (val === 0) return null;
                                          const cls = val >= 0.7
                                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                            : val >= 0.4
                                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                            : 'bg-muted text-muted-foreground border border-border';
                                          return (
                                            <span
                                              key={key}
                                              title={label}
                                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono leading-none ${cls}`}
                                            >
                                              {abbr} {Math.round(val * 100)}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}

                              {(onAskJARVIS || onFindMaterial || onZoneSelectedForReplacement || editMode === 'zone-select') && (
                                <div className="px-3 py-2 bg-muted/30 flex flex-col gap-1.5">
                                  {/* Edit mode: Replace Material button */}
                                  {editMode === 'zone-select' && (
                                    <button
                                      onClick={() => generateMaskFromZone(seg)}
                                      disabled={generatingMask}
                                      className="flex items-center gap-1 px-2 py-1 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-primary-foreground text-[11px] font-semibold rounded-full transition-colors w-full justify-center"
                                    >
                                      {generatingMask
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <Paintbrush className="w-3 h-3" />}
                                      {generatingMask ? 'Generating mask…' : 'Replace Material'}
                                    </button>
                                  )}
                                  {onAskJARVIS && (
                                    <button
                                      onClick={() => onAskJARVIS(seg)}
                                      className="flex items-center gap-1 px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-medium rounded-full transition-colors w-full justify-center"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      Search Relevant
                                    </button>
                                  )}
                                  {onFindMaterial && (
                                    <button
                                      onClick={() => onFindMaterial(seg)}
                                      className="flex items-center gap-1 px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium rounded-full transition-colors w-full justify-center"
                                    >
                                      <Search className="w-3 h-3" />
                                      Find This Material
                                    </button>
                                  )}
                                  {onZoneSelectedForReplacement && pendingReplacement && editMode === 'none' && (
                                    <button
                                      onClick={() => generateMaskFromZone(seg)}
                                      disabled={generatingMask}
                                      className="flex items-center gap-1 px-2 py-1 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 text-[11px] font-medium rounded-full transition-colors w-full justify-center"
                                    >
                                      {generatingMask ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paintbrush className="w-3 h-3" />}
                                      Replace with "{pendingReplacement.name}"
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="px-3 py-2.5 space-y-1.5">
                              <span className="text-xs text-muted-foreground italic block">No platform matches above 70%</span>
                              <div className="flex flex-col gap-1.5">
                                {editMode === 'zone-select' && (
                                  <button
                                    onClick={() => generateMaskFromZone(seg)}
                                    disabled={generatingMask}
                                    className="flex items-center gap-1 px-2 py-1 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-primary-foreground text-[11px] font-semibold rounded-full transition-colors w-full justify-center"
                                  >
                                    {generatingMask ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paintbrush className="w-3 h-3" />}
                                    {generatingMask ? 'Generating mask…' : 'Replace Material'}
                                  </button>
                                )}
                                <div className="flex flex-wrap gap-1.5">
                                  {onAskJARVIS && (
                                    <button
                                      onClick={() => onAskJARVIS(seg)}
                                      className="flex items-center gap-1 px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-medium rounded-full transition-colors"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      Search Relevant
                                    </button>
                                  )}
                                  {onFindMaterial && (
                                    <button
                                      onClick={() => onFindMaterial(seg)}
                                      className="flex items-center gap-1 px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium rounded-full transition-colors"
                                    >
                                      <Search className="w-3 h-3" />
                                      Find This Material
                                    </button>
                                  )}
                                  {onZoneSelectedForReplacement && pendingReplacement && editMode === 'none' && (
                                    <button
                                      onClick={() => generateMaskFromZone(seg)}
                                      disabled={generatingMask}
                                      className="flex items-center gap-1 px-2 py-1 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 text-[11px] font-medium rounded-full transition-colors"
                                    >
                                      {generatingMask ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paintbrush className="w-3 h-3" />}
                                      Replace here
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // Not yet loaded — shows briefly before useEffect triggers loading
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="p-3 bg-muted rounded-full">
                      <Scan className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Preparing material analysis…</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mask Review — uses Dialog (Portal) so it renders above everything */}
      <Dialog open={showMaskReview && !!activeMask && !!selectedImage} onOpenChange={(open) => { if (!open) setShowMaskReview(false); }}>
        <DialogContent className="max-w-2xl w-full p-5 gap-4">
          <DialogHeader className="p-0">
            <DialogTitle className="font-semibold">
              {activeZone ? `Replacing: ${activeZone.label}` : 'Drawn mask'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Purple area = zone to replace with new material
            </DialogDescription>
          </DialogHeader>
          {/* Image + mask overlay */}
          {selectedImage && activeMask && (
            <div className="relative rounded-lg overflow-hidden border border-border">
              <img src={getOptimizedImageUrl(selectedImage.url, 'display')} alt="" className="w-full object-contain" />
              <div
                className="absolute inset-0"
                style={{
                  WebkitMaskImage: `url(data:image/png;base64,${activeMask})`,
                  WebkitMaskSize: '100% 100%',
                  maskImage: `url(data:image/png;base64,${activeMask})`,
                  maskSize: '100% 100%',
                  // SAM masks are fully-opaque PNGs (alpha=255 everywhere) that
                  // encode the selected zone in LUMINANCE (white=zone, black=rest).
                  // Without luminance mode, CSS masking defaults to the alpha
                  // channel → the whole image tints violet instead of just the zone.
                  maskMode: 'luminance',
                  // Older WebKit uses a differently-named property (not in csstype).
                  ['WebkitMaskSourceType' as string]: 'luminance',
                  backgroundColor: 'rgba(124, 58, 237, 0.55)',
                }}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowMaskReview(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => {
                setShowMaskReview(false);
                setShowMaterialPicker(true);
              }}
            >
              <Paintbrush className="w-3.5 h-3.5 mr-1.5" />
              Pick material →
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MaterialPickerModal */}
      {showMaterialPicker && activeMask && selectedImage && (
        <MaterialPickerModal
          isOpen={showMaterialPicker}
          onClose={() => {
            setShowMaterialPicker(false);
            setPickerPreselectedMaterial(null);
          }}
          zone={activeZone}
          maskBase64={activeMask}
          sourceImageUrl={selectedImage.url}
          jobId={jobId}
          workspaceId={workspaceId}
          preSelectedMaterial={pickerPreselectedMaterial}
          onEditedImage={(result: EditedImageResult) => {
            const newEntry: EditedImageEntry = {
              id: `edited-${Date.now()}`,
              url: result.storageUrl,
              label: result.appliedMaterials.map(m => m.zone_label).join(' + '),
              jobId,
              sourceImageUrl: selectedImage.url,
              appliedMaterials: result.appliedMaterials,
              createdAt: new Date().toISOString(),
            };
            setEditedImages(prev => [newEntry, ...prev]);
            setShowMaterialPicker(false);
            setEditMode('none');
            setActiveMask(null);
            setActiveZone(null);
            setPickerPreselectedMaterial(null);
          }}
          onAddAnotherZone={() => {
            setShowMaterialPicker(false);
            setEditMode('zone-select');
            setModalActiveTab('products');
          }}
        />
      )}

      {/* Add to Quote — sequential modal per real product */}
      {quoteQueue.length > 0 && quoteQueue[0] && (
        <AddToQuoteModal
          productId={quoteQueue[0].product_id}
          productName={quoteQueue[0].product_name}
          onClose={() => setQuoteQueue([])}
          onSuccess={() => setQuoteQueue(prev => prev.slice(1))}
        />
      )}

      {/* Virtual Staging Modal */}
      {onGenerateVirtualStaging && selectedImage && (
        <VirtualStagingModal
          isOpen={showVirtualStagingModal}
          onClose={() => setShowVirtualStagingModal(false)}
          defaultRoom={roomType}
          generating={virtualStagingGenerating}
          onGenerate={async (params) => {
            setVirtualStagingGenerating(true);
            try {
              await onGenerateVirtualStaging(selectedImage.url, params);
            } finally {
              setVirtualStagingGenerating(false);
              setShowVirtualStagingModal(false);
            }
          }}
        />
      )}

      {/* Lightbox — full-screen image viewer */}
      {lightboxUrl && (
        <div
          role="presentation"
          className="fixed inset-0 z-[200] bg-black/92 flex items-center justify-center"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            role="presentation"
            src={getOptimizedImageUrl(lightboxUrl, 'full')}
            alt=""
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  );
};
export const ProgressiveImageGrid = React.memo(ProgressiveImageGridInner);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1024, height: 768 });
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


/** Create a simple white-on-black bbox mask PNG as a base64 string (client-side fallback). */
async function createBboxMask(
  bbox: { x: number; y: number; w: number; h: number },
  width: number,
  height: number,
): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(
      Math.round(bbox.x * width),
      Math.round(bbox.y * height),
      Math.max(1, Math.round(bbox.w * width)),
      Math.max(1, Math.round(bbox.h * height)),
    );
    resolve(canvas.toDataURL('image/png').split(',')[1]);
  });
}

// FNV-1a 32-bit hash → 8-char hex. Stable across sessions for the same URL,
// so cached crops keep the same path even when generationId is unknown.
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
    // Direct/edited images have no jobId — fall back to a stable hash of the
    // source URL so the path never collapses to `generation-segments//1.jpg`
    // (the double-slash makes Supabase storage return a 404-styled URL that
    // downstream code then ships into agent prompts as a broken image link).
    const safeKey = (bucketKey && bucketKey.length > 0)
      ? bucketKey
      : `direct-${hashUrlKey(fallbackUrl)}`;
    const base64 = dataUrl.split(',')[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const path = `product-crops/segments/${safeKey}/${index}.jpg`;

    const { error } = await supabase.storage
      .from('generation-images')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

    if (error) return undefined;

    const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return undefined;
  }
}
