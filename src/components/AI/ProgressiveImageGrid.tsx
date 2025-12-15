import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

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
}

export const ProgressiveImageGrid: React.FC<ProgressiveImageGridProps> = ({
  jobId,
  modelCount,
  models,
}) => {
  const [modelResults, setModelResults] = useState<ModelResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'processing' | 'completed' | 'failed'>('processing');

  // Poll for updates every 5 seconds
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const { data, error } = await supabase
        .from('material_agent_3d_generations')
        .select('output_data, progress_percentage, generation_status')
        .eq('id', jobId)
        .single();

      if (error) {
        console.error('Error polling job:', error);
        return;
      }

      if (data) {
        const outputData = data.output_data as any;
        setModelResults(outputData.model_results || []);
        setProgress(data.progress_percentage || 0);
        setStatus(data.generation_status as any);

        // Stop polling if completed or failed
        if (data.generation_status === 'completed' || data.generation_status === 'failed') {
          clearInterval(pollInterval);
        }
      }
    }, 5000);

    // Initial fetch
    (async () => {
      const { data } = await supabase
        .from('material_agent_3d_generations')
        .select('output_data, progress_percentage, generation_status')
        .eq('id', jobId)
        .single();

      if (data) {
        const outputData = data.output_data as any;
        setModelResults(outputData.model_results || []);
        setProgress(data.progress_percentage || 0);
        setStatus(data.generation_status as any);
      }
    })();

    return () => clearInterval(pollInterval);
  }, [jobId]);

  return (
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
            className="relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200"
          >
            {/* Placeholder with blur */}
            {result.status === 'pending' || result.status === 'processing' ? (
              <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 animate-pulse">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                </div>
              </div>
            ) : result.status === 'completed' && result.image_urls[0] ? (
              <img
                src={result.image_urls[0]}
                alt={result.model_name}
                className="w-full h-full object-cover animate-fade-in"
              />
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
  );
};

