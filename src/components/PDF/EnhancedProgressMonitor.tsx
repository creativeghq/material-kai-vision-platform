/**
 * Enhanced Progress Monitor for PDF Processing
 *
 * Provides real-time progress monitoring with detailed statistics,
 * step-by-step tracking, and live updates via WebSocket
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  FileText,
  Image,
  Database,
  Tag,
  Activity,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  pdfProcessingWebSocketService,
  PDFProcessingProgress,
  PDFProcessingStep,
} from '@/services/realtime/PDFProcessingWebSocketService';

interface EnhancedProgressMonitorProps {
  jobId: string;
  onComplete?: (progress: PDFProcessingProgress) => void;
  onError?: (error: string) => void;
  showStatistics?: boolean;
  showStepDetails?: boolean;
  compact?: boolean;
  className?: string;
}

export const EnhancedProgressMonitor: React.FC<
  EnhancedProgressMonitorProps
> = ({
  jobId,
  onComplete,
  onError,
  showStatistics = true,
  showStepDetails = true,
  compact = false,
  className,
}) => {
  const [progress, setProgress] = useState<PDFProcessingProgress | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Subscribe to progress updates
  useEffect(() => {
    if (!jobId || isSubscribed) return;

    const unsubscribe = pdfProcessingWebSocketService.subscribeToJob(
      jobId,
      (newProgress) => {
        setProgress(newProgress);

        // Handle completion
        if (newProgress.status === 'completed' && onComplete) {
          onComplete(newProgress);
        }

        // Handle errors
        if (newProgress.status === 'failed' && onError) {
          const lastError = newProgress.errors[newProgress.errors.length - 1];
          onError(lastError?.message || 'Processing failed');
        }
      },
    );

    setIsSubscribed(true);

    return () => {
      unsubscribe();
      setIsSubscribed(false);
    };
  }, [jobId, isSubscribed, onComplete, onError]);

  const getStatusIcon = (status: PDFProcessingProgress['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStepStatusIcon = (status: PDFProcessingStep['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      case 'skipped':
        return <div className="h-3 w-3 rounded-full bg-gray-300" />;
      default:
        return <div className="h-3 w-3 rounded-full bg-gray-200" />;
    }
  };

  const formatDuration = useCallback((ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }, []);

  if (!progress) {
    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-gray-600">
              Connecting to progress monitor...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            {getStatusIcon(progress.status)}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{progress.fileName}</span>
                <span className="text-xs text-gray-500">
                  {Math.round(progress.overallProgress)}%
                </span>
              </div>
              <Progress value={progress.overallProgress} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getStatusIcon(progress.status)}
            <div>
              <CardTitle className="text-lg">{progress.fileName}</CardTitle>
              <CardDescription>
                {progress.currentStep} • Started{' '}
                {formatDistanceToNow(progress.startTime)} ago
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge
              variant={
                progress.status === 'completed' ? 'default' : 'secondary'
              }
            >
              {progress.status.charAt(0).toUpperCase() +
                progress.status.slice(1)}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm text-gray-600">
              {Math.round(progress.overallProgress)}%
            </span>
          </div>
          <Progress value={progress.overallProgress} className="h-3" />
        </div>

        {/* Statistics */}
        {showStatistics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
              <FileText className="h-4 w-4 text-blue-500" />
              <div>
                <div className="text-sm font-medium">
                  {progress.statistics.chunksCreated}
                </div>
                <div className="text-xs text-gray-600">Chunks</div>
              </div>
            </div>
            <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
              <Image className="h-4 w-4 text-green-500" />
              <div>
                <div className="text-sm font-medium">
                  {progress.statistics.imagesExtracted}
                </div>
                <div className="text-xs text-gray-600">Images</div>
              </div>
            </div>
            <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
              <Database className="h-4 w-4 text-purple-500" />
              <div>
                <div className="text-sm font-medium">
                  {progress.statistics.kbEntriesSaved}
                </div>
                <div className="text-xs text-gray-600">KB Entries</div>
              </div>
            </div>
            <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
              <Tag className="h-4 w-4 text-orange-500" />
              <div>
                <div className="text-sm font-medium">
                  {progress.statistics.categoriesExtracted}
                </div>
                <div className="text-xs text-gray-600">Categories</div>
              </div>
            </div>
          </div>
        )}

        {/* Step Details */}
        {showStepDetails && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Processing Steps</h4>
            {progress.steps.map((step, index) => (
              <div key={step.id} className="space-y-2">
                <div className="flex items-center space-x-3">
                  {getStepStatusIcon(step.status)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{step.name}</span>
                      <span className="text-xs text-gray-500">
                        {step.status === 'completed'
                          ? '100%'
                          : step.status === 'running'
                            ? `${Math.round(step.progress || 0)}%`
                            : step.status === 'failed'
                              ? '0%'
                              : '0%'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600">
                      {step.description}
                    </div>

                    {/* Real-time counts for MIVAA processing */}
                    {step.id === 'mivaa-processing' &&
                      step.status === 'running' &&
                      step.details && (
                        <div className="text-xs text-gray-500 mt-1 space-y-1">
                          {(() => {
                            // Extract counts from step details
                            const details = Array.isArray(step.details)
                              ? step.details
                              : [];
                            const chunksMatch = details.find(
                              (d) =>
                                typeof d === 'string' &&
                                d.includes('Chunks Generated:'),
                            );
                            const imagesMatch = details.find(
                              (d) =>
                                typeof d === 'string' &&
                                d.includes('Images Extracted:'),
                            );
                            const pagesMatch = details.find(
                              (d) =>
                                typeof d === 'string' && d.includes('Pages:'),
                            );

                            const chunks = chunksMatch
                              ? chunksMatch.match(/(\d+)/)?.[1] || '0'
                              : '0';
                            const images = imagesMatch
                              ? imagesMatch.match(/(\d+)/)?.[1] || '0'
                              : '0';
                            const pages = pagesMatch
                              ? pagesMatch.match(/(\d+)\/(\d+)/)?.[0] || '0/0'
                              : '0/0';

                            return (
                              <div className="flex gap-4 text-xs">
                                <span>📄 Pages: {pages}</span>
                                <span>📝 Chunks: {chunks}</span>
                                <span>🖼️ Images: {images}</span>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                  </div>
                </div>

                {(step.status === 'running' || step.status === 'completed') && (
                  <Progress
                    value={
                      step.status === 'completed' ? 100 : step.progress || 0
                    }
                    className="h-1 ml-6"
                  />
                )}

                {/* Substeps */}
                {step.substeps &&
                  step.substeps.length > 0 &&
                  step.status === 'running' && (
                    <div className="ml-6 space-y-1">
                      {step.substeps.map((substep, subIndex) => (
                        <div
                          key={subIndex}
                          className="flex items-center space-x-2 text-xs"
                        >
                          {getStepStatusIcon(substep.status)}
                          <span
                            className={cn(
                              substep.status === 'completed'
                                ? 'text-green-600'
                                : substep.status === 'running'
                                  ? 'text-blue-600'
                                  : 'text-gray-500',
                            )}
                          >
                            {substep.name}
                          </span>
                          {substep.progress > 0 && (
                            <span className="text-gray-400">
                              ({Math.round(substep.progress)}%)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                {/* Step Details */}
                {step.details.length > 0 && (
                  <div className="ml-6 space-y-1">
                    {step.details.slice(-3).map((detail, detailIndex) => (
                      <div key={detailIndex} className="text-xs text-gray-600">
                        {detail}
                      </div>
                    ))}
                  </div>
                )}

                {index < progress.steps.length - 1 && (
                  <Separator className="ml-6" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Errors */}
        {progress.errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-red-600">Errors</h4>
            {progress.errors.map((error, index) => (
              <div
                key={index}
                className="p-3 bg-red-50 border border-red-200 rounded-lg"
              >
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-red-800">
                      {error.step}
                    </div>
                    <div className="text-xs text-red-600">{error.message}</div>
                    <div className="text-xs text-red-500 mt-1">
                      {formatDistanceToNow(error.timestamp)} ago
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timing Information */}
        {(progress.actualDuration || progress.estimatedDuration) && (
          <div className="flex items-center justify-between text-xs text-gray-600">
            <div className="flex items-center space-x-4">
              {progress.actualDuration && (
                <span>Duration: {formatDuration(progress.actualDuration)}</span>
              )}
              {progress.estimatedDuration && !progress.actualDuration && (
                <span>
                  Estimated: {formatDuration(progress.estimatedDuration)}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1">
              <Activity className="h-3 w-3" />
              <span>Live Updates</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EnhancedProgressMonitor;
