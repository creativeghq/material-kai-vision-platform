import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ZoomIn, Globe, Scan, Package, AlertCircle, RotateCcw, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { mivaaApi } from '@/services/mivaaApiClient';
import { SegmentWithResults } from '@/hooks/useSegmentation';

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

interface ProgressiveImageGridProps {
  jobId: string;
  modelCount: number;
  models: Array<{ id: string; name: string; provider: string }>;
  onImageClick?: (imageUrl: string, modelName: string) => void;
  onGenerateVR?: (imageUrl: string, context: { prompt?: string; roomType?: string; style?: string }) => void;
  vrGenerating?: boolean;
  workspaceId?: string;
  onAskKAI?: (segment: SegmentWithResults) => void;
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
  const [imageZoom, setImageZoom] = useState(1);

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
        const newResults = Object.values(modelsResultsDict) as ModelResult[];

        setModelResults(prev => {
          const hasChanges = JSON.stringify(prev) !== JSON.stringify(newResults);
          return hasChanges ? newResults : prev;
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

  // Reset modal segment state whenever the selected image changes
  useEffect(() => {
    setModalSegments([]);
    setModalSegmenting(false);
    setModalSegmentsLoaded(false);
    setModalSegmentError(null);
    setModalActiveTab('image');
    setImageZoom(1);
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
            };
          }),
        );
        setModalSegments(segments);
        setModalSegmentsLoaded(true);
        return;
      }

      // 2. Run segmentation API — pass URL so Python fetches it server-side (avoids CORS)
      const segRes = await mivaaApi.segmentImage({
        image_url: selectedImage.url,
        workspace_id: workspaceId,
      });

      if (!segRes.success) {
        setModalSegmentError(segRes.error ?? 'Segmentation API returned an error');
        setModalSegmentsLoaded(true);
        return;
      }

      if (!segRes.data?.zones?.length) {
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
            query: `${zone.material_type} ${zone.finish}`.trim(),
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
            <div
              key={result.model_id}
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

              {/* Model badge */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2">
                <p className="text-xs font-medium truncate">{result.model_name}</p>
                <p className="text-xs text-gray-300">{result.provider}</p>
              </div>

              {result.status === 'completed' && (
                <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {status === 'completed' && (
          <p className="text-green-600 text-sm font-medium text-center">
            ✅ All images generated successfully!
          </p>
        )}
      </div>

      {/* Image Modal */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold text-gray-900 truncate">
                  {selectedImage?.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  AI-generated render — click Products to detect material zones
                </DialogDescription>
              </div>
              {selectedImage && (
                <Badge variant="outline" className="text-xs flex-shrink-0 text-gray-500 border-gray-200">
                  3D Render
                </Badge>
              )}
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

              {/* Image Tab */}
              <TabsContent value="image" className="mt-4">
                <div
                  className="relative bg-gray-50 rounded-xl border border-gray-200 overflow-auto"
                  style={{ minHeight: '380px', maxHeight: '62vh' }}
                >
                  {selectedImage && (
                    <>
                      <img
                        src={selectedImage.url}
                        alt={selectedImage.name}
                        onClick={() => setImageZoom(z => z >= 3 ? 1 : parseFloat((z + 0.5).toFixed(1)))}
                        style={{
                          width: `${imageZoom * 100}%`,
                          display: 'block',
                          cursor: imageZoom >= 3 ? 'zoom-out' : 'zoom-in',
                        }}
                      />
                      {/* Zoom controls */}
                      <div className="absolute bottom-3 left-3 z-10 flex items-center bg-black/60 rounded-lg overflow-hidden select-none">
                        <button
                          onClick={(e) => { e.stopPropagation(); setImageZoom(z => Math.max(1, parseFloat((z - 0.5).toFixed(1)))); }}
                          className="px-2.5 py-1 text-white text-sm hover:bg-white/20 transition-colors disabled:opacity-40"
                          disabled={imageZoom <= 1}
                        >−</button>
                        <span className="text-white text-xs px-1.5 min-w-[30px] text-center tabular-nums">{imageZoom}×</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setImageZoom(z => Math.min(3, parseFloat((z + 0.5).toFixed(1)))); }}
                          className="px-2.5 py-1 text-white text-sm hover:bg-white/20 transition-colors disabled:opacity-40"
                          disabled={imageZoom >= 3}
                        >+</button>
                      </div>
                      {onGenerateVR && (
                        <div className="absolute top-3 right-3 z-10">
                          <button
                            onClick={() => {
                              if (!vrGenerating) {
                                onGenerateVR(selectedImage.url, { prompt: selectedImage.name });
                              }
                            }}
                            disabled={vrGenerating}
                            className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-600/50 text-white text-xs font-medium rounded-lg transition-colors shadow-md"
                            title={vrGenerating ? 'VR world is being generated...' : 'Generate explorable VR world (50 credits)'}
                          >
                            {vrGenerating ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Globe className="w-3.5 h-3.5" />
                            )}
                            {vrGenerating ? 'Generating VR…' : 'Generate VR'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </TabsContent>

              {/* Materials Tab — on-demand segmentation */}
              <TabsContent value="products" className="mt-4 space-y-3">
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
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-left">
                          <th className="px-3 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide w-[72px]">Zone</th>
                          <th className="px-3 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Material</th>
                          <th className="px-3 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">Platform Match</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {modalSegments.map((seg, idx) => {
                          const topMatch = (seg.search_results ?? [])
                            .find(r => (r.score ?? r.final_score ?? 0) >= 0.7);
                          const matchScore = topMatch?.score ?? topMatch?.final_score;
                          const matchName = topMatch?.product_name ?? topMatch?.name ?? 'Product';
                          return (
                            <tr key={seg.id ?? idx} className="hover:bg-gray-50/70 transition-colors">
                              {/* Zone thumbnail */}
                              <td className="px-3 py-3 align-top">
                                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 relative flex-shrink-0">
                                  {seg.crop_storage_url || seg.crop_data_url ? (
                                    <img
                                      src={seg.crop_storage_url ?? seg.crop_data_url}
                                      alt={seg.label}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div
                                      className="w-full h-full"
                                      style={{ backgroundColor: seg.dominant_color ?? '#e5e7eb' }}
                                    />
                                  )}
                                  <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded-tl leading-tight">
                                    {Math.round(seg.confidence * 100)}%
                                  </div>
                                </div>
                              </td>

                              {/* Material description */}
                              <td className="px-3 py-3 align-top">
                                <p className="font-semibold text-gray-900 capitalize leading-tight text-sm">{seg.label}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{seg.material_type} · {seg.finish}</p>
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <div
                                    className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0"
                                    style={{ backgroundColor: seg.dominant_color ?? '#888' }}
                                  />
                                  <span className="text-[10px] text-muted-foreground font-mono">{seg.dominant_color}</span>
                                </div>
                              </td>

                              {/* Platform match */}
                              <td className="px-3 py-3 align-top">
                                {topMatch ? (
                                  <div className="space-y-2">
                                    <div className="flex items-start gap-2">
                                      <div className="w-11 h-11 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200">
                                        {topMatch.image_url ? (
                                          <img
                                            src={topMatch.image_url}
                                            alt={matchName}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                                            <Package className="w-4 h-4" />
                                          </div>
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-gray-900 line-clamp-2 leading-tight">
                                          {matchName}
                                        </p>
                                        {matchScore != null && (
                                          <Badge variant="outline" className="mt-1 h-4 px-1.5 text-[10px] bg-green-50 text-green-700 border-green-200">
                                            {Math.round(matchScore * 100)}% match
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                    {onAskKAI && (
                                      <button
                                        onClick={() => onAskKAI(seg)}
                                        className="flex items-center gap-1 px-2 py-1 bg-primary/5 hover:bg-primary/10 text-primary text-[11px] font-medium rounded-md transition-colors w-full justify-center"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        Search Relevant
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <span className="text-xs text-muted-foreground italic">N/A</span>
                                    {onAskKAI && (
                                      <button
                                        onClick={() => onAskKAI(seg)}
                                        className="flex items-center gap-1 px-2 py-1 bg-primary/5 hover:bg-primary/10 text-primary text-[11px] font-medium rounded-md transition-colors w-full justify-center"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        Search Relevant
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
