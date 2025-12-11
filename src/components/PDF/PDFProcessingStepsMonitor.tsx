/**
 * PDF Processing Steps Monitor
 * Expandable step-by-step UI similar to Vercel deployment logs
 * Shows all 14 processing stages with real-time updates
 */

import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  usePDFProcessingMonitor,
  mapCheckpointToStages,
  getCurrentActiveStage,
  extractStageMetrics,
} from '@/services/pdf/pdfProcessingMonitor';
import { formatDistanceToNow } from 'date-fns';

interface ProcessingStep {
  id: number;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  metrics?: Record<string, any>;
  error?: string;
}

interface PDFProcessingStepsMonitorProps {
  jobId: string;
  fileName: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
  className?: string;
}

const PROCESSING_STEPS: Array<{ id: number; name: string; description: string }> = [
  { id: 1, name: 'Product Discovery', description: 'AI-powered product identification' },
  { id: 2, name: 'Entity Discovery', description: 'Certificates, logos, specifications' },
  { id: 3, name: 'Focused Extraction', description: 'Extract product pages only' },
  { id: 4, name: 'Chunking', description: 'Semantic text chunking' },
  { id: 5, name: 'Text Embeddings', description: 'Generate text embeddings (OpenAI 1536D)' },
  { id: 6, name: 'Image Extraction', description: 'Extract images from PDF' },
  { id: 7, name: 'Image Classification', description: 'Classify image types' },
  { id: 8, name: 'Image Analysis', description: 'AI image analysis (Llama Vision)' },
  { id: 9, name: 'CLIP Embeddings', description: 'Multi-vector image embeddings' },
  { id: 10, name: 'Product Creation', description: 'Create product entities' },
  { id: 11, name: 'Document Entities', description: 'Link entities and metadata' },
  { id: 12, name: 'Relationship Mapping', description: 'Map entity relationships' },
  { id: 13, name: 'Metadata Extraction', description: 'Extract document metadata' },
  { id: 14, name: 'Quality Enhancement', description: 'Final quality checks' },
];

export const PDFProcessingStepsMonitor: React.FC<PDFProcessingStepsMonitorProps> = ({
  jobId,
  fileName,
  onComplete,
  onError,
  className,
}) => {
  const { jobStatus, isPolling, error: monitorError } = usePDFProcessingMonitor(jobId);
  const [steps, setSteps] = useState<ProcessingStep[]>(
    PROCESSING_STEPS.map(step => ({
      ...step,
      status: 'pending' as const,
      progress: 0,
    }))
  );
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [startTime] = useState(new Date());

  // Update steps based on job status
  useEffect(() => {
    if (!jobStatus) return;

    const checkpoint = jobStatus.last_checkpoint?.stage;
    if (!checkpoint) return;

    const completedStageIds = mapCheckpointToStages(checkpoint);
    const activeStageId = getCurrentActiveStage(checkpoint);

    setSteps(prevSteps =>
      prevSteps.map(step => {
        if (completedStageIds.includes(step.id)) {
          return {
            ...step,
            status: 'completed' as const,
            progress: 100,
            endTime: new Date(),
            metrics: extractStageMetrics(step.id, jobStatus.last_checkpoint?.metadata),
          };
        } else if (step.id === activeStageId) {
          return {
            ...step,
            status: 'running' as const,
            progress: jobStatus.progress || 0,
            startTime: new Date(),
            metrics: extractStageMetrics(step.id, jobStatus.last_checkpoint?.metadata),
          };
        }
        return step;
      })
    );

    // Handle completion
    if (jobStatus.status === 'completed') {
      onComplete?.();
    } else if (jobStatus.status === 'failed') {
      onError?.(jobStatus.error || 'Processing failed');
    }
  }, [jobStatus, onComplete, onError]);

  // Handle monitor errors
  useEffect(() => {
    if (monitorError) {
      onError?.(monitorError);
    }
  }, [monitorError, onError]);

  const toggleStepExpansion = (stepId: number) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };

  const getStepIcon = (status: ProcessingStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getJobStatus = () => {
    if (!jobStatus) return 'pending';
    return jobStatus.status;
  };

  const getJobStatusBadge = () => {
    const status = getJobStatus();
    switch (status) {
      case 'completed':
        return <Badge variant="default">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const totalSteps = steps.length;
  const overallProgress = (completedSteps / totalSteps) * 100;

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{fileName}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Started {formatDistanceToNow(startTime)} ago • {completedSteps} of {totalSteps} steps
            </p>
          </div>
          {getJobStatusBadge()}
        </div>
        <Progress value={overallProgress} className="mt-4" />
      </CardHeader>

      <CardContent>
        <div className="space-y-2">
          {steps.map((step, index) => {
            const isExpanded = expandedSteps.has(step.id);
            const hasDetails = step.metrics && Object.keys(step.metrics).length > 0;

            return (
              <div key={step.id} className="relative">
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="absolute left-6 top-10 bottom-0 w-px bg-border" />
                )}

                <div
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                    step.status === 'running' && 'bg-blue-50 border-blue-200',
                    step.status === 'completed' && 'bg-green-50 border-green-200',
                    step.status === 'failed' && 'bg-red-50 border-red-200'
                  )}
                >
                  <div className="flex-shrink-0 mt-0.5">{getStepIcon(step.status)}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{step.name}</span>
                        {step.status === 'running' && (
                          <span className="text-xs text-blue-600">{Math.round(step.progress)}%</span>
                        )}
                      </div>

                      {hasDetails && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleStepExpansion(step.id)}
                          className="h-6 w-6 p-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1">{step.description}</p>

                    {step.status === 'running' && (
                      <Progress value={step.progress} className="h-1 mt-2" />
                    )}

                    {step.error && (
                      <p className="text-xs text-red-600 mt-2">{step.error}</p>
                    )}

                    {/* Expanded details */}
                    {isExpanded && hasDetails && (
                      <div className="mt-3 p-3 bg-white rounded border">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {Object.entries(step.metrics!).map(([key, value]) => (
                            <div key={key}>
                              <span className="text-muted-foreground">{key}:</span>{' '}
                              <span className="font-medium">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {monitorError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{monitorError}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

