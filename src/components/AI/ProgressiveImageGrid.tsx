import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ZoomIn, Search, Layers, Ruler, Home, Package, ShoppingCart } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { spaceformerAnalysisService } from '@/services/spaceformerAnalysisService';
import { materialProductMatcher, type MatchedProduct } from '@/services/materialProductMatcher';

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
}

export const ProgressiveImageGrid: React.FC<ProgressiveImageGridProps> = ({
  jobId,
  modelCount,
  models,
  onImageClick,
}) => {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [modelResults, setModelResults] = useState<ModelResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'processing' | 'completed' | 'failed'>('processing');
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const [imageTransform, setImageTransform] = useState({ scale: 1, rotate: 0, brightness: 100 });
  const [spaceformerAnalysis, setSpaceformerAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [matchedProducts, setMatchedProducts] = useState<MatchedProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Load workspace ID on mount
  useEffect(() => {
    const loadWorkspace = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspaceData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      if (workspaceData) {
        setWorkspaceId(workspaceData.workspace_id);
      }
    };

    loadWorkspace();
  }, []);

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
      if (count < 5) return 1000;      // First 5 polls: 1s (fast initial feedback)
      if (count < 15) return 3000;     // Next 10 polls: 3s (active generation)
      if (count < 30) return 5000;     // Next 15 polls: 5s (slower generation)
      return 10000;                     // After 30 polls: 10s (final models)
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
        // models_results is a DICT at top level, not in metadata
        const modelsResultsDict = (data.models_results as any) || {};
        const newResults = Object.values(modelsResultsDict) as ModelResult[];

        // Only update if there are actual changes
        setModelResults(prev => {
          const hasChanges = JSON.stringify(prev) !== JSON.stringify(newResults);
          return hasChanges ? newResults : prev;
        });

        setProgress(data.progress_percentage || 0);
        setStatus(data.generation_status as any);

        // Stop polling if completed or failed
        if (data.generation_status === 'completed' || data.generation_status === 'failed') {
          return;
        }

        // Schedule next poll with adaptive interval (using setTimeout to avoid nested intervals)
        if (!isCancelled) {
          pollCount++;
          const interval = getAdaptiveInterval(pollCount);
          timeoutId = setTimeout(pollJob, interval);
        }
      }
    };

    // Initial fetch
    pollJob();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [jobId]);

  const handleImageClick = async (result: ModelResult) => {
    if (result.status === 'completed' && result.image_urls[0]) {
      setSelectedImage({ url: result.image_urls[0], name: result.model_name });
      setImageTransform({ scale: 1, rotate: 0, brightness: 100 });
      setSpaceformerAnalysis(null);
      setAnalysisError(null);
      setMatchedProducts([]);

      // Trigger Spaceformer analysis
      setIsAnalyzing(true);
      try {
        console.log('🔍 Starting Spaceformer analysis for image:', result.image_urls[0]);
        const analysis = await spaceformerAnalysisService.analyzeSpace({
          image_url: result.image_urls[0],
          room_type: 'general', // Could be extracted from model name or user input
          analysis_type: 'full',
        });
        console.log('✅ Spaceformer analysis complete:', analysis);
        setSpaceformerAnalysis(analysis);

        // Extract materials and find matching products
        if (workspaceId) {
          setIsLoadingProducts(true);
          try {
            const detectedMaterials = materialProductMatcher.extractMaterialsFromAnalysis(analysis);
            console.log('🎨 Detected materials:', detectedMaterials);

            const products = await materialProductMatcher.findMatchingProducts(
              detectedMaterials,
              workspaceId,
              5
            );
            console.log('🛍️ Matched products:', products);
            setMatchedProducts(products);
          } catch (error) {
            console.error('❌ Product matching failed:', error);
          } finally {
            setIsLoadingProducts(false);
          }
        }
      } catch (error) {
        console.error('❌ Spaceformer analysis failed:', error);
        setAnalysisError(error instanceof Error ? error.message : 'Analysis failed');
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const handleRelatedSearch = () => {
    if (selectedImage && onImageClick) {
      onImageClick(selectedImage.url, selectedImage.name);
    }
    setSelectedImage(null);
  };

  return (
    <>
      <div className="space-y-4">
        {/* Progress bar */}
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

        {/* Image grid - Dynamic layout based on model count */}
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
              {/* Placeholder with blur effect */}
              {result.status === 'pending' || result.status === 'processing' ? (
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 animate-pulse">
                  {/* Blurred placeholder pattern */}
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
                  {/* Hover overlay */}
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

              {/* Status indicator */}
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

        {/* Status message */}
        {status === 'completed' && (
          <p className="text-green-600 text-sm font-medium text-center">
            ✅ All images generated successfully!
          </p>
        )}
      </div>

      {/* Image Modal with Transform Controls and Spaceformer Analysis */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedImage?.name}
              {isAnalyzing && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="image" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="image" className="gap-2">
                <ZoomIn className="w-4 h-4" />
                Image
              </TabsTrigger>
              <TabsTrigger value="analysis" className="gap-2">
                <Layers className="w-4 h-4" />
                Analysis
                {isAnalyzing && <Loader2 className="w-3 h-3 animate-spin" />}
              </TabsTrigger>
              <TabsTrigger value="products" className="gap-2">
                <Package className="w-4 h-4" />
                Products
                {matchedProducts.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {matchedProducts.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="materials" className="gap-2">
                <Search className="w-4 h-4" />
                Search
              </TabsTrigger>
            </TabsList>

            {/* Image Tab */}
            <TabsContent value="image" className="space-y-4">
              {/* Image with transforms */}
              <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ minHeight: '400px' }}>
                {selectedImage && (
                  <img
                    src={selectedImage.url}
                    alt={selectedImage.name}
                    className="w-full h-full object-contain transition-all duration-300"
                    style={{
                      transform: `scale(${imageTransform.scale}) rotate(${imageTransform.rotate}deg)`,
                      filter: `brightness(${imageTransform.brightness}%)`,
                    }}
                  />
                )}
              </div>

              {/* Transform Controls */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Scale</label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={imageTransform.scale}
                    onChange={(e) => setImageTransform(prev => ({ ...prev, scale: parseFloat(e.target.value) }))}
                    className="w-full"
                  />
                  <span className="text-xs text-gray-500">{imageTransform.scale}x</span>
                </div>

                <div>
                  <label className="text-sm font-medium">Rotate</label>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="15"
                    value={imageTransform.rotate}
                    onChange={(e) => setImageTransform(prev => ({ ...prev, rotate: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <span className="text-xs text-gray-500">{imageTransform.rotate}°</span>
                </div>

                <div>
                  <label className="text-sm font-medium">Brightness</label>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    step="10"
                    value={imageTransform.brightness}
                    onChange={(e) => setImageTransform(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <span className="text-xs text-gray-500">{imageTransform.brightness}%</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setImageTransform({ scale: 1, rotate: 0, brightness: 100 })}
                >
                  Reset
                </Button>
              </div>
            </TabsContent>

            {/* Spatial Analysis Tab */}
            <TabsContent value="analysis" className="space-y-4">
              {isAnalyzing ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center space-y-3">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto" />
                    <p className="text-sm text-gray-600">Analyzing spatial layout...</p>
                  </div>
                </div>
              ) : analysisError ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-600">❌ {analysisError}</p>
                </div>
              ) : spaceformerAnalysis ? (
                <div className="space-y-6">
                  {/* Room Type & Dimensions */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Home className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-blue-900">Room Information</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">Room Type:</span>
                        <p className="font-medium capitalize">{spaceformerAnalysis.room_type || 'General'}</p>
                      </div>
                      {spaceformerAnalysis.spatial_metrics && (
                        <>
                          <div>
                            <span className="text-gray-600">Estimated Area:</span>
                            <p className="font-medium">{spaceformerAnalysis.spatial_metrics.estimated_area || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Ceiling Height:</span>
                            <p className="font-medium">{spaceformerAnalysis.spatial_metrics.ceiling_height || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Natural Light:</span>
                            <p className="font-medium capitalize">{spaceformerAnalysis.spatial_metrics.natural_light || 'N/A'}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Layout Analysis */}
                  {spaceformerAnalysis.layout_analysis && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Layers className="w-5 h-5 text-green-600" />
                        <h3 className="font-semibold text-green-900">Layout Analysis</h3>
                      </div>
                      <div className="space-y-2 text-sm">
                        {spaceformerAnalysis.layout_analysis.detected_features && (
                          <div>
                            <span className="text-gray-600 font-medium">Detected Features:</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {spaceformerAnalysis.layout_analysis.detected_features.map((feature: string, idx: number) => (
                                <Badge key={idx} variant="outline" className="bg-white">
                                  {feature}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {spaceformerAnalysis.layout_analysis.suggestions && (
                          <div className="mt-3">
                            <span className="text-gray-600 font-medium">Suggestions:</span>
                            <ul className="list-disc list-inside mt-1 space-y-1">
                              {spaceformerAnalysis.layout_analysis.suggestions.map((suggestion: string, idx: number) => (
                                <li key={idx} className="text-gray-700">{suggestion}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Material Suggestions */}
                  {spaceformerAnalysis.material_suggestions && spaceformerAnalysis.material_suggestions.length > 0 && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Ruler className="w-5 h-5 text-purple-600" />
                        <h3 className="font-semibold text-purple-900">Material Recommendations</h3>
                      </div>
                      <div className="space-y-3">
                        {spaceformerAnalysis.material_suggestions.map((suggestion: any, idx: number) => (
                          <div key={idx} className="bg-white rounded p-3 border border-purple-100">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">{suggestion.area || suggestion.location}</p>
                                <p className="text-sm text-gray-600 mt-1">{suggestion.material_type}</p>
                                {suggestion.reasoning && (
                                  <p className="text-xs text-gray-500 mt-1">{suggestion.reasoning}</p>
                                )}
                              </div>
                              {suggestion.confidence && (
                                <Badge variant="secondary" className="ml-2">
                                  {Math.round(suggestion.confidence * 100)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Accessibility Report */}
                  {spaceformerAnalysis.accessibility_report && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <h3 className="font-semibold text-orange-900 mb-2">Accessibility Analysis</h3>
                      <div className="text-sm space-y-1">
                        {Object.entries(spaceformerAnalysis.accessibility_report).map(([key, value]: [string, any]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-gray-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                            <span className="font-medium">{typeof value === 'boolean' ? (value ? '✅ Yes' : '❌ No') : value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No spatial analysis available</p>
                </div>
              )}
            </TabsContent>

            {/* Suggested Products Tab */}
            <TabsContent value="products" className="space-y-4">
              {isLoadingProducts ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center space-y-3">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto" />
                    <p className="text-sm text-gray-600">Finding matching products...</p>
                  </div>
                </div>
              ) : matchedProducts.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Suggested Products for This Room</h3>
                    <Badge variant="outline">{matchedProducts.length} products</Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2">
                    {matchedProducts.map((product) => (
                      <div
                        key={product.id}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
                        onClick={() => {
                          console.log('Product clicked:', product);
                          // Could open product details modal or navigate
                        }}
                      >
                        <div className="flex gap-3">
                          {/* Product Image */}
                          {product.image_url ? (
                            <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded flex items-center justify-center">
                              <Package className="w-8 h-8 text-gray-400" />
                            </div>
                          )}

                          {/* Product Info */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate">{product.name}</h4>
                            <p className="text-xs text-gray-500 line-clamp-2 mt-1">
                              {product.description || 'No description available'}
                            </p>

                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {product.category || product.type}
                              </Badge>
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <span className="font-medium">{Math.round(product.match_score * 100)}%</span>
                                <span>match</span>
                              </div>
                            </div>

                            {product.match_reason && (
                              <p className="text-xs text-blue-600 mt-1 line-clamp-1">
                                💡 {product.match_reason}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action Button */}
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('Add to quote:', product);
                              // Could add to quote or cart
                            }}
                          >
                            <ShoppingCart className="w-3 h-3" />
                            Add to Quote
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No matching products found</p>
                  <p className="text-sm mt-1">Try analyzing the image first</p>
                </div>
              )}
            </TabsContent>

            {/* Materials Search Tab */}
            <TabsContent value="materials" className="space-y-4">
              <div className="flex gap-2 justify-center">
                <Button
                  onClick={handleRelatedSearch}
                  className="gap-2"
                >
                  <Search className="w-4 h-4" />
                  Find Related Materials
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
};

