import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ZoomIn, Search, Globe, Scan, Package, RefreshCw, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
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
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);

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
    setSelectedSegmentIndex(0);
    setModalActiveTab('image');
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
        setModalSegments(
          existing.map((row) => ({
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
            search_results: (row.search_results as any[]) ?? [],
          })),
        );
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

      // 3. Persist to DB
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedImage?.name}</DialogTitle>
          </DialogHeader>

          <Tabs
            value={modalActiveTab}
            onValueChange={(v) => setModalActiveTab(v as typeof modalActiveTab)}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="image" className="gap-2">
                <ZoomIn className="w-4 h-4" />
                Image
              </TabsTrigger>
              <TabsTrigger value="products" className="gap-2">
                {modalSegmenting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Scan className="w-4 h-4" />}
                Products
              </TabsTrigger>
            </TabsList>

            {/* Image Tab */}
            <TabsContent value="image" className="space-y-4">
              <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ minHeight: '400px' }}>
                {selectedImage && (
                  <>
                    <img
                      src={selectedImage.url}
                      alt={selectedImage.name}
                      className="w-full h-full object-contain"
                    />
                    {onGenerateVR && (
                      <div className="absolute top-4 right-4 z-10">
                        <button
                          onClick={() => {
                            if (!vrGenerating) {
                              onGenerateVR(selectedImage.url, { prompt: selectedImage.name });
                            }
                          }}
                          disabled={vrGenerating}
                          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-600/50 text-white rounded-lg transition-colors shadow-lg"
                          title={vrGenerating ? 'VR world is being generated...' : 'Generate explorable VR world (50 credits)'}
                        >
                          {vrGenerating ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Globe className="w-5 h-5" />
                          )}
                          <span className="font-medium">{vrGenerating ? 'Generating VR...' : 'Generate VR'}</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </TabsContent>

            {/* Products Tab — on-demand segmentation */}
            <TabsContent value="products" className="space-y-4">
              {modalSegmenting ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="font-medium">Detecting material zones…</p>
                  <p className="text-sm text-gray-400">Qwen3-VL is analysing your render</p>
                </div>
              ) : modalSegmentError ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-red-500">
                  <AlertCircle className="w-8 h-8" />
                  <p className="font-medium">Segmentation failed</p>
                  <p className="text-sm text-center text-red-400 max-w-sm">{modalSegmentError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 mt-2"
                    onClick={() => { setModalSegmentsLoaded(false); setModalSegmentError(null); }}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </Button>
                </div>
              ) : modalSegmentsLoaded && modalSegments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
                  <Scan className="w-8 h-8" />
                  <p className="font-medium">No material zones detected</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 mt-2"
                    onClick={() => { setModalSegmentsLoaded(false); }}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </Button>
                </div>
              ) : modalSegments.length > 0 ? (
                <>
                  {/* Zone selector strip */}
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {modalSegments.map((seg, idx) => (
                      <button
                        key={seg.id ?? idx}
                        onClick={() => setSelectedSegmentIndex(idx)}
                        className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                          selectedSegmentIndex === idx
                            ? 'border-blue-600 bg-blue-50 shadow-md'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                        style={{ minWidth: 88 }}
                      >
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 relative">
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
                          <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded-tl">
                            {Math.round(seg.confidence * 100)}%
                          </div>
                        </div>
                        <p className="text-[11px] font-medium text-gray-800 text-center line-clamp-1 w-16">{seg.label}</p>
                        <p className="text-[10px] text-gray-500 text-center line-clamp-1 w-16">{seg.material_type}</p>
                      </button>
                    ))}
                  </div>

                  {/* Selected zone detail + matched products */}
                  {modalSegments[selectedSegmentIndex] && (() => {
                    const seg = modalSegments[selectedSegmentIndex];
                    const results: any[] = seg.search_results ?? [];
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                          <div
                            className="w-6 h-6 rounded-full border border-gray-300 flex-shrink-0"
                            style={{ backgroundColor: seg.dominant_color ?? '#888' }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm capitalize">{seg.label}</p>
                            <p className="text-xs text-gray-500">{seg.material_type} · {seg.finish}</p>
                          </div>
                          {onAskKAI && (
                            <button
                              onClick={() => onAskKAI(seg)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
                            >
                              <Search className="w-3.5 h-3.5" />
                              Ask KAI
                            </button>
                          )}
                        </div>

                        {results.length > 0 ? (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {results.map((product: any, pidx: number) => (
                              <div
                                key={product.id ?? pidx}
                                className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden hover:border-blue-600 hover:shadow-md transition-all"
                              >
                                <div className="aspect-square bg-gray-100">
                                  {product.image_url ? (
                                    <img
                                      src={product.image_url}
                                      alt={product.name ?? product.product_name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                                      <Package className="w-8 h-8" />
                                    </div>
                                  )}
                                </div>
                                <div className="p-2">
                                  <p className="font-medium text-xs text-gray-900 line-clamp-2">
                                    {product.name ?? product.product_name ?? 'Product'}
                                  </p>
                                  {product.final_score != null && (
                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                      {Math.round(product.final_score * 100)}% match
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center py-8 gap-2 text-gray-400">
                            <Package className="w-6 h-6" />
                            <p className="text-sm">No matching products for this zone</p>
                            {onAskKAI && (
                              <button onClick={() => onAskKAI(seg)} className="text-xs text-blue-600 hover:underline">
                                Ask KAI to search
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : (
                // Not yet loaded — shows briefly before useEffect triggers loading
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
                  <Scan className="w-8 h-8" />
                  <p className="font-medium">Preparing material analysis…</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
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
