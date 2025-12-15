import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ZoomIn, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
  const [modelResults, setModelResults] = useState<ModelResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'processing' | 'completed' | 'failed'>('processing');
  const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
  const [imageTransform, setImageTransform] = useState({ scale: 1, rotate: 0, brightness: 100 });

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

  // Poll for updates every 3 seconds (faster for better UX)
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const pollJob = async () => {
      const { data, error } = await supabase
        .from('generation_3d')
        .select('metadata, progress_percentage, generation_status')
        .eq('id', jobId)
        .single();

      if (error) {
        console.error('Error polling job:', error);
        return;
      }

      if (data) {
        // Extract models_results from metadata JSONB field
        const metadata = data.metadata as any;
        const newResults = metadata?.models_results || [];

        // Only update if there are actual changes
        setModelResults(prev => {
          const hasChanges = JSON.stringify(prev) !== JSON.stringify(newResults);
          return hasChanges ? newResults : prev;
        });

        setProgress(data.progress_percentage || 0);
        setStatus(data.generation_status as any);

        // Stop polling if completed or failed
        if (data.generation_status === 'completed' || data.generation_status === 'failed') {
          clearInterval(pollInterval);
        }
      }
    };

    // Initial fetch
    pollJob();

    // Start polling
    pollInterval = setInterval(pollJob, 3000);

    return () => clearInterval(pollInterval);
  }, [jobId]);

  const handleImageClick = (result: ModelResult) => {
    if (result.status === 'completed' && result.image_urls[0]) {
      setSelectedImage({ url: result.image_urls[0], name: result.model_name });
      setImageTransform({ scale: 1, rotate: 0, brightness: 100 });
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

      {/* Image Modal with Transform Controls */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedImage?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
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
              <Button
                onClick={handleRelatedSearch}
                className="gap-2"
              >
                <Search className="w-4 h-4" />
                Find Related Materials
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

