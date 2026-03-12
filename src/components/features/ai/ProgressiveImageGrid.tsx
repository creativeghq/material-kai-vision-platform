import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ZoomIn, Globe, Scan, Package, AlertCircle, RotateCcw, ExternalLink, X, Search, Paintbrush, Download, ShoppingCart, Video, BookmarkPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { mivaaApi } from '@/services/mivaaApiClient';
import { SegmentWithResults } from '@/hooks/useSegmentation';
import { MaterialPickerModal, PickedMaterial, EditedImageResult, AppliedMaterial } from './MaterialPickerModal';
import { AddToQuoteModal } from '@/components/business/quotes/AddToQuoteModal';
import { MoodboardSavePopover } from '@/components/business/moodboard/MoodboardSavePopover';

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
  onAskKAI?: (segment: SegmentWithResults) => void;
  onFindMaterial?: (segment: SegmentWithResults) => void;
  pendingReplacement?: { id: string; name: string; imageUrl?: string } | null;
  onZoneSelectedForReplacement?: (segment: SegmentWithResults) => void;
  onGenerateVideo?: (imageUrl: string) => void;
}

export const ProgressiveImageGrid: React.FC<ProgressiveImageGridProps> = ({
  jobId,
  modelCount,
  models,
  onImageClick,
  onGenerateVR,
  vrGenerating,
  workspaceId = '',
  onAskKAI,
  onFindMaterial,
  pendingReplacement,
  onZoneSelectedForReplacement,
  onGenerateVideo,
}) => {
  const [modelResults, setModelResults] = useState<ModelResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'processing' | 'completed' | 'failed'>('processing');

  // Modal state
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string; model_id: string } | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<'image' | 'products'>('image');

  // Per-image segmentation state (modal-scoped)
  const [modalSegments, setModalSegments] = useState<SegmentWithResults[]>([]);
  const [modalSegmenting, setModalSegmenting] = useState(false);
  const [modalSegmentsLoaded, setModalSegmentsLoaded] = useState(false);
  const [modalSegmentError, setModalSegmentError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // ── Phase 5: Edit mode ───────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState<'none' | 'zone-select' | 'freehand'>('none');
  const [generatingMask, setGeneratingMask] = useState(false);
  const [activeMask, setActiveMask] = useState<string | null>(null);
  const [activeZone, setActiveZone] = useState<SegmentWithResults | null>(null);
  const [showMaskReview, setShowMaskReview] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [pickerPreselectedMaterial, setPickerPreselectedMaterial] = useState<PickedMaterial | null>(null);

  // Freehand drawing canvas
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [brushSize, setBrushSize] = useState(30);
  const [eraseMode, setEraseMode] = useState(false);

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

  // Reset modal segment state and edit state whenever the selected image changes
  useEffect(() => {
    setModalSegments([]);
    setModalSegmenting(false);
    setModalSegmentsLoaded(false);
    setModalSegmentError(null);
    setModalActiveTab('image');
    setEditMode('none');
    setActiveMask(null);
    setActiveZone(null);
    setShowMaskReview(false);
    setShowMaterialPicker(false);
    setPickerPreselectedMaterial(null);
  }, [selectedImage]);

  // Load segments on demand — called when user opens the Products tab
  const loadModalSegments = useCallback(async () => {
    if (!selectedImage || !jobId || modalSegmentsLoaded || modalSegmenting) return;

    setModalSegmenting(true);
    setModalSegmentError(null);

    try {
      // 1. Check DB for cached segments for this image
      const { data: existing } = await supabase
        .from('generation_3d_segments')
        .select('*')
        .eq('generation_id', jobId)
        .eq('model_id', selectedImage.model_id)
        .order('segment_index');

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

      // 2. Fetch image bytes and convert to base64 (avoids canvas CORS taint issues)
      let imageBase64: string;
      try {
        const res = await fetch(selectedImage.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        imageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
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
      const allSegments: SegmentWithResults[] = [];

      for (let i = 0; i < segRes.data.zones.length; i++) {
        const zone = segRes.data.zones[i];

        // Crop via Canvas API
        const cropDataUrl = await cropZone(selectedImage.url, zone.bbox, imgW, imgH);

        // Search for similar materials
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

        // Upload crop to Supabase Storage
        let cropStorageUrl: string | undefined;
        if (cropDataUrl) {
          cropStorageUrl = await uploadCrop(cropDataUrl, jobId, i);
        }

        allSegments.push({
          ...zone,
          segment_index: i,
          model_id: selectedImage.model_id,
          source_image_url: selectedImage.url,
          crop_data_url: cropDataUrl ?? undefined,
          crop_storage_url: cropStorageUrl,
          search_results: searchResults,
        });
      }

      // 3. Enrich search results with product image URLs (from image_product_associations → document_images)
      const allProductIds = [...new Set(
        allSegments.flatMap(s => (s.search_results ?? []).map((r: any) => r.id))
      )].filter(Boolean);

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

          for (const seg of allSegments) {
            seg.search_results = (seg.search_results ?? []).map((r: any) => ({
              ...r,
              image_url: productImageMap[r.id] || null,
            }));
          }
        } catch (imgErr) {
          console.warn('[ProgressiveImageGrid] Could not fetch product images:', imgErr);
        }
      }

      // 4. Persist to DB
      if (allSegments.length > 0) {
        const rows = allSegments.map((s) => ({
          generation_id: jobId,
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

        const { data: inserted } = await supabase
          .from('generation_3d_segments')
          .insert(rows)
          .select('id, segment_index');

        if (inserted) {
          for (const s of allSegments) {
            const match = inserted.find((r: any) => r.segment_index === s.segment_index);
            if (match) s.id = match.id;
          }
        }
      }

      setModalSegments(allSegments);
      setModalSegmentsLoaded(true);
    } catch (err: any) {
      console.error('[ProgressiveImageGrid] Segmentation error:', err);
      setModalSegmentError(err?.message ?? 'Unexpected error during segmentation');
      setModalSegmentsLoaded(true);
    } finally {
      setModalSegmenting(false);
    }
  }, [selectedImage, jobId, workspaceId, modalSegmentsLoaded, modalSegmenting]);

  // Delete cached DB rows then trigger a fresh segmentation run
  const handleRegenerate = useCallback(async () => {
    if (!selectedImage || !jobId) return;
    await supabase
      .from('generation_3d_segments')
      .delete()
      .eq('generation_id', jobId)
      .eq('model_id', selectedImage.model_id);
    setModalSegments([]);
    setModalSegmentError(null);
    setModalSegmentsLoaded(false);
  }, [selectedImage, jobId]);

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
      <div className="space-y-4">
        {/* Progress bar — only while generating */}
        {status !== 'completed' && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Generating images...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
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
                className="relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 cursor-pointer hover:border-blue-400 transition-all"
                onClick={() => handleImageClick(result)}
              >
                {result.status === 'pending' || result.status === 'processing' ? (
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 animate-pulse">
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
                      src={result.image_urls[0]}
                      alt={result.model_name}
                      className="w-full h-full object-cover animate-fade-in"
                    />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-all flex items-center justify-center opacity-0 hover:opacity-100">
                      <ZoomIn className="w-8 h-8 text-white" />
                    </div>
                  </>
                ) : result.status === 'failed' ? (
                  <div className="absolute inset-0 bg-red-50 flex items-center justify-center">
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
                key={edited.id}
                className="relative rounded-xl overflow-hidden border-2 border-violet-200 bg-white group cursor-pointer"
                onClick={() => setSelectedImage({ url: edited.url, name: `Edited: ${edited.label}`, model_id: 'edited' })}
              >
                <img
                  src={edited.url}
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
                      setSelectedImage({ url: edited.url, name: `Edited: ${edited.label}`, model_id: 'edited' });
                      setModalActiveTab('products');
                    }}
                    className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium rounded transition-colors"
                  >
                    <Scan className="w-3 h-3" />
                    Re-Segment
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedImage({ url: edited.url, name: `Edited: ${edited.label}`, model_id: 'edited' });
                      setEditMode('zone-select');
                      setModalActiveTab('products');
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
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold text-gray-900 truncate">
                  Interior Design Render
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Generated by <span className="font-medium text-foreground">{selectedImage?.name}</span> · Click Products to detect material zones
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {selectedImage && (
                  <button
                    onClick={() => {
                      if (editMode !== 'none') {
                        setEditMode('none');
                      } else {
                        setEditMode('zone-select');
                        // Don't auto-switch tab — avoid triggering AI segmentation automatically.
                        // Zone Select button appears in the Materials tab; Draw Mask works on Image tab.
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      editMode !== 'none'
                        ? 'bg-violet-600 text-white'
                        : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200'
                    }`}
                  >
                    <Paintbrush className="w-3.5 h-3.5" />
                    {editMode !== 'none' ? 'Editing' : 'Edit Mode'}
                  </button>
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
              <TabsList className="grid w-full grid-cols-2 bg-gray-100 p-1 rounded-lg h-9">
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
                <div className="flex gap-1 mt-2 p-1 bg-violet-50 rounded-lg border border-violet-200">
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
                  <div className="relative bg-gray-50 rounded-xl overflow-hidden border-2 border-violet-400" style={{ minHeight: '380px' }}>
                    {selectedImage && (
                      <>
                        <img
                          src={selectedImage.url}
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
                    className={`relative bg-gray-50 rounded-xl overflow-hidden border-2 transition-colors ${
                      editMode === 'zone-select' ? 'border-violet-400' : 'border-gray-200'
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
                                  <span className="text-sm font-medium">Detecting zones…</span>
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
                    {onGenerateVideo && (
                      <button
                        onClick={() => onGenerateVideo(selectedImage!.url)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-full text-xs font-medium text-rose-700 transition-colors shadow-sm"
                        title="Generate video walkthrough with Veo (30 credits)"
                      >
                        <Video className="w-3.5 h-3.5" />
                        Generate Video
                      </button>
                    )}
                    {onGenerateVR && (
                      <button
                        onClick={() => { if (!vrGenerating) onGenerateVR(selectedImage!.url, { prompt: selectedImage!.name }); }}
                        disabled={vrGenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-full text-xs font-medium text-violet-700 disabled:opacity-50 transition-colors shadow-sm"
                        title={vrGenerating ? 'VR world is being generated...' : 'Generate explorable VR world (50 credits)'}
                      >
                        {vrGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                        {vrGenerating ? 'Generating VR World…' : 'Generate VR World'}
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
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-lg">
                    <Paintbrush className="w-4 h-4 text-violet-600 flex-shrink-0" />
                    <p className="text-xs text-violet-800 flex-1 font-medium">
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
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                    <div className="relative">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                    <p className="font-medium text-sm">Detecting material zones…</p>
                    <p className="text-xs text-muted-foreground">AI is analysing surfaces in the render</p>
                  </div>
                ) : modalSegmentError ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="p-3 bg-red-50 rounded-full">
                      <AlertCircle className="w-6 h-6 text-red-500" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-sm text-gray-900">Detection failed</p>
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
                    <div className="p-3 bg-gray-100 rounded-full">
                      <Scan className="w-6 h-6 text-gray-400" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-sm text-gray-700">No material zones detected</p>
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
                        <div key={seg.id ?? idx} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                          {/* Zone header — material info */}
                          <div className="flex gap-3 p-3 border-b border-gray-100 bg-gray-50/40">
                            {/* Crop thumbnail */}
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 relative">
                              {(seg.crop_storage_url || seg.crop_data_url) && (
                                <img
                                  src={seg.crop_storage_url ?? seg.crop_data_url}
                                  alt={seg.label}
                                  className="w-full h-full object-cover cursor-zoom-in"
                                  onClick={() => setLightboxUrl(seg.crop_storage_url ?? seg.crop_data_url!)}
                                />
                              )}
                              <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded-tl leading-tight">
                                {Math.round(seg.confidence * 100)}%
                              </div>
                            </div>

                            {/* Material metadata */}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 capitalize text-sm leading-tight">{seg.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{seg.material_type} · {seg.finish}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <div
                                  className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0"
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
                          {matches.length > 0 ? (
                            <div className="divide-y divide-gray-50">
                              {matches.map((match: any, mIdx: number) => {
                                const score = match.score ?? match.final_score ?? 0;
                                const name = match.product_name ?? match.name ?? 'Product';
                                return (
                                  <div key={mIdx} className="flex gap-2.5 px-3 py-2.5 items-start">
                                    {/* Product image */}
                                    <div className="w-10 h-10 rounded-md overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200">
                                      {match.image_url ? (
                                        <img
                                          src={match.image_url}
                                          alt={name}
                                          className="w-full h-full object-cover cursor-zoom-in"
                                          onClick={() => setLightboxUrl(match.image_url)}
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                                          <Package className="w-3.5 h-3.5" />
                                        </div>
                                      )}
                                    </div>

                                    {/* Name + scores */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="text-xs font-medium text-gray-900 truncate flex-1">{name}</p>
                                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] bg-green-50 text-green-700 border-green-200 flex-shrink-0">
                                          {Math.round(score * 100)}%
                                        </Badge>
                                      </div>

                                      {/* 7 embedding scores */}
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {EMB_TYPES.map(({ key, abbr, label }) => {
                                          const val: number = match[key] ?? 0;
                                          if (val === 0) return null;
                                          const cls = val >= 0.7
                                            ? 'bg-green-100 text-green-700'
                                            : val >= 0.4
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-gray-100 text-gray-500';
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

                              {(onAskKAI || onFindMaterial || onZoneSelectedForReplacement || editMode === 'zone-select') && (
                                <div className="px-3 py-2 bg-gray-50/60 flex flex-col gap-1.5">
                                  {/* Edit mode: Replace Material button */}
                                  {editMode === 'zone-select' && (
                                    <button
                                      onClick={() => generateMaskFromZone(seg)}
                                      disabled={generatingMask}
                                      className="flex items-center gap-1 px-2 py-1 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-[11px] font-semibold rounded-md transition-colors w-full justify-center"
                                    >
                                      {generatingMask
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <Paintbrush className="w-3 h-3" />}
                                      {generatingMask ? 'Generating mask…' : 'Replace Material'}
                                    </button>
                                  )}
                                  {onAskKAI && (
                                    <button
                                      onClick={() => onAskKAI(seg)}
                                      className="flex items-center gap-1 px-2 py-1 bg-primary/5 hover:bg-primary/10 text-primary text-[11px] font-medium rounded-md transition-colors w-full justify-center"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      Search Relevant
                                    </button>
                                  )}
                                  {onFindMaterial && (
                                    <button
                                      onClick={() => onFindMaterial(seg)}
                                      className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-medium rounded-md transition-colors w-full justify-center"
                                    >
                                      <Search className="w-3 h-3" />
                                      Find This Material
                                    </button>
                                  )}
                                  {onZoneSelectedForReplacement && pendingReplacement && editMode === 'none' && (
                                    <button
                                      onClick={() => generateMaskFromZone(seg)}
                                      disabled={generatingMask}
                                      className="flex items-center gap-1 px-2 py-1 bg-violet-50 hover:bg-violet-100 text-violet-700 text-[11px] font-medium rounded-md transition-colors w-full justify-center"
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
                                    className="flex items-center gap-1 px-2 py-1 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-[11px] font-semibold rounded-md transition-colors w-full justify-center"
                                  >
                                    {generatingMask ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paintbrush className="w-3 h-3" />}
                                    {generatingMask ? 'Generating mask…' : 'Replace Material'}
                                  </button>
                                )}
                                <div className="flex flex-wrap gap-1.5">
                                  {onAskKAI && (
                                    <button
                                      onClick={() => onAskKAI(seg)}
                                      className="flex items-center gap-1 px-2 py-1 bg-primary/5 hover:bg-primary/10 text-primary text-[11px] font-medium rounded-md transition-colors"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      Search Relevant
                                    </button>
                                  )}
                                  {onFindMaterial && (
                                    <button
                                      onClick={() => onFindMaterial(seg)}
                                      className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-medium rounded-md transition-colors"
                                    >
                                      <Search className="w-3 h-3" />
                                      Find This Material
                                    </button>
                                  )}
                                  {onZoneSelectedForReplacement && pendingReplacement && editMode === 'none' && (
                                    <button
                                      onClick={() => generateMaskFromZone(seg)}
                                      disabled={generatingMask}
                                      className="flex items-center gap-1 px-2 py-1 bg-violet-50 hover:bg-violet-100 text-violet-700 text-[11px] font-medium rounded-md transition-colors"
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
                    <div className="p-3 bg-gray-100 rounded-full">
                      <Scan className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700">Preparing material analysis…</p>
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
            <DialogTitle className="text-sm font-semibold">
              {activeZone ? `Replacing: ${activeZone.label}` : 'Drawn mask'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Purple area = zone to replace with new material
            </DialogDescription>
          </DialogHeader>
          {/* Image + mask overlay */}
          {selectedImage && activeMask && (
            <div className="relative rounded-lg overflow-hidden border border-border">
              <img src={selectedImage.url} alt="" className="w-full object-contain" />
              <div
                className="absolute inset-0"
                style={{
                  WebkitMaskImage: `url(data:image/png;base64,${activeMask})`,
                  WebkitMaskSize: '100% 100%',
                  maskImage: `url(data:image/png;base64,${activeMask})`,
                  maskSize: '100% 100%',
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
              Pick Material →
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

      {/* Lightbox — full-screen image viewer */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[200] bg-black/92 flex items-center justify-center"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
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

/** Convert a public image URL to base64 via Canvas2D (requires CORS headers on the image). */
async function imageUrlToBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }
      ctx.drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for base64 conversion'));
    img.src = url;
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
