import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import ProcessingSteps from '@/components/ProcessingSteps';
import { pollingService, ProcessingStatus } from '@/services/pollingService';
import { X, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessingModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId?: string;
  title?: string;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

const ProcessingModal: React.FC<ProcessingModalProps> = ({
  isOpen,
  onClose,
  jobId,
  title = "Processing Document",
  onComplete,
  onError
}) => {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen && jobId) {
      // Start polling when modal opens with a job ID
      pollingService.startPolling(jobId, handleStatusUpdate);
    }

    return () => {
      // Cleanup polling when component unmounts or modal closes
      if (jobId) {
        pollingService.stopPolling(jobId);
      }
    };
  }, [isOpen, jobId]);

  const handleStatusUpdate = (newStatus: ProcessingStatus) => {
    setStatus(newStatus);

    // Handle completion
    if (newStatus.status === 'completed') {
      if (onComplete) {
        onComplete(newStatus.result);
      }
    }

    // Handle errors
    if (newStatus.status === 'error') {
      if (onError) {
        onError(newStatus.error || 'Processing failed');
      }
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    
    // Stop polling
    if (jobId) {
      pollingService.stopPolling(jobId);
    }
    
    // Close modal
    onClose();
    
    // Reset state
    setTimeout(() => {
      setStatus(null);
      setIsClosing(false);
    }, 300);
  };

  const getStatusIcon = () => {
    if (!status) return null;

    switch (status.status) {
      case 'completed':
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-6 h-6 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusMessage = () => {
    if (!status) return 'Initializing...';

    switch (status.status) {
      case 'pending':
        return 'Preparing to process document...';
      case 'processing':
        return `Processing: ${status.currentStep}`;
      case 'completed':
        return 'Processing completed successfully!';
      case 'error':
        return `Error: ${status.error || 'Processing failed'}`;
      default:
        return 'Processing...';
    }
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000);
    
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const canClose = !status || status.status === 'completed' || status.status === 'error';

  return (
    <Dialog open={isOpen} onOpenChange={canClose ? handleClose : undefined}>
      <DialogContent 
        className="max-w-2xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700"
        onPointerDownOutside={(e) => {
          if (!canClose) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold text-white flex items-center space-x-2">
              {getStatusIcon()}
              <span>{title}</span>
            </DialogTitle>
            
            {canClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-300">
                {getStatusMessage()}
              </span>
              <span className="text-sm text-gray-400">
                {status?.progress || 0}%
              </span>
            </div>
            
            <Progress 
              value={status?.progress || 0} 
              className="h-2"
            />
            
            {status?.startTime && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>
                  Duration: {formatDuration(status.startTime, status.endTime)}
                </span>
                {status.status === 'processing' && (
                  <span>
                    Current: {status.currentStep}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Processing Steps */}
          {status?.steps && (
            <ProcessingSteps 
              steps={status.steps}
              currentStep={status.currentStep}
            />
          )}

          {/* Error Details */}
          {status?.status === 'error' && status.error && (
            <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-red-400">
                  Processing Error
                </span>
              </div>
              <p className="text-sm text-red-300">
                {status.error}
              </p>
            </div>
          )}

          {/* Success Actions */}
          {status?.status === 'completed' && (
            <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium text-green-400">
                    Processing Complete
                  </span>
                </div>
                
                {status.result && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-500 text-green-400 hover:bg-green-500/10"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    View Results
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4 border-t border-gray-700">
            {status?.status === 'processing' && (
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={!canClose}
                className="border-gray-600 text-gray-400"
              >
                Run in Background
              </Button>
            )}
            
            <Button
              onClick={handleClose}
              disabled={!canClose}
              className={cn(
                "min-w-[100px]",
                status?.status === 'completed' && "bg-green-600 hover:bg-green-700",
                status?.status === 'error' && "bg-red-600 hover:bg-red-700"
              )}
            >
              {status?.status === 'completed' ? 'Done' : 
               status?.status === 'error' ? 'Close' : 
               canClose ? 'Cancel' : 'Processing...'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProcessingModal;
