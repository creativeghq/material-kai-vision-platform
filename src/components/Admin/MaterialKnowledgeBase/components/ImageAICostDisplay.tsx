import React from 'react';
import { DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Component to display AI cost information for an image
export const ImageAICostDisplay: React.FC<{ imageId: string }> = ({ imageId }) => {
  const [aiCost, setAiCost] = React.useState<any>(null);

  React.useEffect(() => {
    const fetchAICost = async () => {
      if (imageId) {
        try {
          // Query ai_call_logs for this image
          const { data, error } = await supabase
            .from('ai_call_logs')
            .select('*')
            .or(
              `request_data->image_id.eq.${imageId},response_data->image_id.eq.${imageId}`,
            )
            .order('timestamp', { ascending: false });

          if (!error && data && data.length > 0) {
            const totalCost = data.reduce(
              (sum, log) => sum + (parseFloat(log.cost) || 0),
              0,
            );
            const clipCalls = data.filter(
              (log) =>
                log.task.includes('embedding') || log.model.includes('clip'),
            );
            // Vision bucket: legacy 'qwen' substring kept so historical
            // pre-2026-05-01 logs still surface here; new rows match via
            // 'claude-opus' or 'vision'.
            const visionCalls = data.filter((log) =>
              log.model.includes('vision') ||
              log.model.includes('claude-opus') ||
              log.model.includes('qwen'),
            );
            const claudeCalls = data.filter((log) =>
              log.model.includes('claude'),
            );

            setAiCost({
              total: totalCost,
              clip: clipCalls.reduce(
                (sum, log) => sum + (parseFloat(log.cost) || 0),
                0,
              ),
              vision: visionCalls.reduce(
                (sum, log) => sum + (parseFloat(log.cost) || 0),
                0,
              ),
              claude: claudeCalls.reduce(
                (sum, log) => sum + (parseFloat(log.cost) || 0),
                0,
              ),
              calls: data.length,
            });
          }
        } catch (err) {
          console.error('Failed to fetch AI cost:', err);
        }
      }
    };

    fetchAICost();
  }, [imageId]);

  if (!aiCost || aiCost.total <= 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-lg p-4 border border-green-200 dark:border-green-800">
      <h4 className="font-semibold mb-3 text-green-900 dark:text-green-100 flex items-center gap-2">
        <DollarSign className="h-4 w-4" />
        AI Processing Cost
      </h4>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-green-700 dark:text-green-300">
            Total Cost:
          </span>
          <span className="font-bold text-green-900 dark:text-green-100">
            ${aiCost.total.toFixed(4)}
          </span>
        </div>
        {aiCost.clip > 0 && (
          <div className="flex justify-between">
            <span className="text-green-700 dark:text-green-300">
              SLIG Embedding:
            </span>
            <span className="font-medium text-green-900 dark:text-green-100">
              ${aiCost.clip.toFixed(4)}
            </span>
          </div>
        )}
        {aiCost.vision > 0 && (
          <div className="flex justify-between">
            <span className="text-green-700 dark:text-green-300">
              Vision Analysis:
            </span>
            <span className="font-medium text-green-900 dark:text-green-100">
              ${aiCost.vision.toFixed(4)}
            </span>
          </div>
        )}
        {aiCost.claude > 0 && (
          <div className="flex justify-between">
            <span className="text-green-700 dark:text-green-300">
              Claude Vision:
            </span>
            <span className="font-medium text-green-900 dark:text-green-100">
              ${aiCost.claude.toFixed(4)}
            </span>
          </div>
        )}
        <div className="flex justify-between pt-2 border-t border-green-200 dark:border-green-700">
          <span className="text-green-700 dark:text-green-300">AI Calls:</span>
          <span className="font-medium text-green-900 dark:text-green-100">
            {aiCost.calls}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ImageAICostDisplay;
