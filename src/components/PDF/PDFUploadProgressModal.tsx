import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  FileText,
  RefreshCw,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getErrorFeedback } from '@/utils/errorMessages';

import { EnhancedProgressMonitor } from './EnhancedProgressMonitor';
import { PDFImageGallery } from './PDFImageGallery';

// Import types from the workflow service
interface WorkflowStepDetail {
  message: string;
  status?: 'success' | 'error' | 'info';
  error?: string;
}

interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress?: number;
  details?: (string | WorkflowStepDetail)[];
  metadata?: Record<string, unknown>;
  result?: unknown;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
  logs?: string[];
  icon?: React.ComponentType<{ className?: string }>;
}

interface WorkflowJob {
  id: string;
  name?: string;
  filename?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: WorkflowStep[];
  currentStepIndex: number;
  startTime: Date;
  endTime?: Date;
  metadata: Record<string, unknown>;
}

interface PDFUploadProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: WorkflowJob | null;
  enablePolling?: boolean;
  useEnhancedMonitor?: boolean;
  showImageGallery?: boolean;
  onRetry?: () => void;

}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'completed':
      return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Completed</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'running':
      return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">Running</Badge>;
    case 'pending':
      return <Badge variant="secondary">Pending</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
};

const formatDuration = (startTime?: Date, endTime?: Date) => {
  if (!startTime) return '';
  const end = endTime || new Date();
  const duration = Math.round((end.getTime() - startTime.getTime()) / 1000);

  if (duration < 60) return `${duration}s`;
  if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
  return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
};

export const PDFUploadProgressModal: React.FC<PDFUploadProgressModalProps> = ({
  isOpen,
  onClose,
  job,
  enablePolling = false,
  useEnhancedMonitor = false,
  showImageGallery = false,
  onRetry,
}: PDFUploadProgressModalProps) => {
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  // const [autoScroll, setAutoScroll] = useState(true);

  // Auto-close modal after successful completion (optional)
  useEffect(() => {
    if (job) {
      // Auto-close modal after successful completion (optional)
      // if (job.status === 'completed') {
      //   setTimeout(() => {
      //     onClose();
      //   }, 3000); // Close after 3 seconds
      // }
    }
  }, [job]);

  // Real-time polling for job status updates
  useEffect(() => {
    if (enablePolling && job && isOpen && (job.status === 'running' || job.status === 'pending')) {
      const startPolling = () => {
        const interval = setInterval(async () => {
          try {
            // Poll MIVAA gateway for job status
            const response = await supabase.functions.invoke('mivaa-gateway', {
              body: {
                action: 'get_job_status',
                payload: { job_id: job.id },
              },
            });

            if (response.data?.success && response.data.data) {
              const statusData = response.data.data;

              // Update job status based on polling response
              // This would typically trigger a callback to update the parent component
              console.log('📊 Job status update:', statusData);

              // Stop polling if job is completed or failed
              if (statusData.status === 'completed' || statusData.status === 'failed') {
                if (pollingInterval) {
                  clearInterval(pollingInterval);
                  setPollingInterval(null);
                }
              }
            }
          } catch (error) {
            console.error('Polling error:', error);
          }
        }, 2000); // Poll every 2 seconds

        setPollingInterval(interval);
      };

      startPolling();
    }

    // Cleanup polling on unmount or when conditions change
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    };
  }, [enablePolling, job, isOpen, pollingInterval]);

  if (!job) return null;

  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isRunning = job.status === 'running';
  const showEnhancedMonitor = Boolean(useEnhancedMonitor && job.id);

  // Get error feedback if job failed
  const failedStep = job.steps.find(step => step.status === 'failed');
  const errorFeedback = isFailed && failedStep?.error
    ? getErrorFeedback(failedStep.error)
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      // Prevent auto-closing - only allow manual close via button
      if (!open) return;
    }}>
      <DialogContent className="max-w-4xl h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-primary" />
              <div>
                <DialogTitle className="text-xl">
                  {job.name || 'PDF Processing Workflow'}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1">
                  {job.filename} • Started {formatDuration(job.startTime)}
                  {job.endTime && ` • Completed in ${formatDuration(job.startTime, job.endTime)}`}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(job.status)}
            </div>
          </div>

          {/* Async Processing Indicator */}
          {job.steps.some(step =>
            step.id === 'mivaa-processing' &&
            step.details?.some(detail =>
              typeof detail === 'string' && detail.includes('async'),
            ),
          ) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <div className="text-sm">
                  <span className="font-medium text-blue-900">Async Processing Mode</span>
                  <p className="text-blue-700 mt-1">
                    Large PDF detected - using background processing to avoid timeouts.
                    This may take several minutes for complex documents.
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogHeader>

        <Separator className="flex-shrink-0" />

        {/* Error Alert Section */}
        {isFailed && errorFeedback && (
          <div className="px-6 pt-4 flex-shrink-0">
            <Alert variant="destructive" className="border-red-300 bg-red-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-red-900">{errorFeedback.title}</AlertTitle>
              <AlertDescription className="text-red-800 mt-2 space-y-2">
                <p>{errorFeedback.message}</p>
                {errorFeedback.details && (
                  <details className="text-sm cursor-pointer">
                    <summary className="font-medium hover:underline">Technical Details</summary>
                    <p className="mt-2 p-2 bg-red-100 rounded text-xs font-mono break-words">
                      {errorFeedback.details}
                    </p>
                  </details>
                )}
                {errorFeedback.suggestion && (
                  <div className="flex gap-2 items-start mt-3 p-2 bg-red-100 rounded">
                    <HelpCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <p className="text-sm"><strong>Suggestion:</strong> {errorFeedback.suggestion}</p>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Success Alert Section */}
        {isCompleted && !isFailed && (
          <div className="px-6 pt-4 flex-shrink-0">
            <Alert className="border-green-300 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-900">Processing Complete</AlertTitle>
              <AlertDescription className="text-green-800 mt-2">
                Your PDF has been successfully processed and added to the knowledge base.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="p-6 space-y-4 max-h-none">

              {/* Enhanced Progress Monitor Option */}
              {(showEnhancedMonitor ? (
                  <div className="mb-6">
                    <EnhancedProgressMonitor
                      jobId={job.id as string}
                      onComplete={(progress: any) => {
                        console.log('Processing completed:', progress);
                      }}
                      onError={(error: unknown) => {
                        console.error('Processing error:', error);
                      }}
                      showStatistics={true}
                      showStepDetails={true}
                      compact={false}
                    />
                    <Separator className="my-6" />
                  </div>
                ) : null) as any}

              {/* Image Gallery Section */}
              {showImageGallery && job.metadata?.documentId && isCompleted && (
                <div className="mb-6">
                  <PDFImageGallery
                    documentId={job.metadata.documentId as string}
                    showHeader={true}
                    viewMode={'grid'}
                    className="w-full"
                  />
                  <Separator className="my-6" />
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <Separator className="flex-shrink-0" />

        {/* Completion Summary - Full Details */}
        {isCompleted && (
          <div className="p-6 pt-4 flex-shrink-0 border-t space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Processing Complete - Full Summary
            </h3>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(() => {
                // Extract completion data from job steps
                const mivaaStep = job.steps.find(s => s.id === 'mivaa-processing');
                const knowledgeStep = job.steps.find(s => s.id === 'knowledge-storage');
                const embeddingStep = job.steps.find(s => s.id === 'embedding-generation');

                // Parse details to extract counts
                let chunksCreated = 0;
                let imagesExtracted = 0;
                let embeddingsGenerated = 0;
                let kbEntriesStored = 0;
                let pagesProcessed = 0;
                let categoriesAdded = 0;

                if (mivaaStep?.details) {
                  mivaaStep.details.forEach((detail: unknown) => {
                    const detailStr = typeof detail === 'string' ? detail : (detail as any)?.message || '';
                    const chunkMatch = detailStr.match(/Generated (\d+) text chunks|Chunks Generated: (\d+)/);
                    const imageMatch = detailStr.match(/Extracted (\d+) images|Images Extracted: (\d+)/);
                    const pageMatch = detailStr.match(/Pages: (\d+)\/(\d+)|Processed (\d+) pages?/);
                    if (chunkMatch) chunksCreated = parseInt(chunkMatch[1] || chunkMatch[2]);
                    if (imageMatch) imagesExtracted = parseInt(imageMatch[1] || imageMatch[2]);
                    if (pageMatch) pagesProcessed = parseInt(pageMatch[1] || pageMatch[3]);
                  });
                }

                if (knowledgeStep?.details) {
                  knowledgeStep.details.forEach((detail: unknown) => {
                    const detailStr = typeof detail === 'string' ? detail : (detail as any)?.message || '';
                    const kbMatch = detailStr.match(/Stored (\d+) chunks/);
                    const catMatch = detailStr.match(/Added to (\d+) categories?/);
                    if (kbMatch) kbEntriesStored = parseInt(kbMatch[1]);
                    if (catMatch) categoriesAdded = parseInt(catMatch[1]);
                  });
                }

                if (embeddingStep?.details) {
                  embeddingStep.details.forEach((detail: unknown) => {
                    const detailStr = typeof detail === 'string' ? detail : (detail as any)?.message || '';
                    const embeddingMatch = detailStr.match(/Generated (\d+) embeddings/);
                    if (embeddingMatch) embeddingsGenerated = parseInt(embeddingMatch[1]);
                  });
                }

                return (
                  <>
                    <div className="text-center p-3 bg-card rounded-lg border">
                      <div className="text-2xl font-bold text-primary">{pagesProcessed}</div>
                      <div className="text-sm text-muted-foreground">Pages Processed</div>
                    </div>
                    <div className="text-center p-3 bg-card rounded-lg border">
                      <div className="text-2xl font-bold text-primary">{chunksCreated}</div>
                      <div className="text-sm text-muted-foreground">Chunks Created</div>
                    </div>
                    <div className="text-center p-3 bg-card rounded-lg border">
                      <div className="text-2xl font-bold text-primary">{imagesExtracted}</div>
                      <div className="text-sm text-muted-foreground">Images Extracted</div>
                    </div>
                    <div className="text-center p-3 bg-card rounded-lg border">
                      <div className="text-2xl font-bold text-primary">{embeddingsGenerated || chunksCreated}</div>
                      <div className="text-sm text-muted-foreground">Embeddings Generated</div>
                    </div>
                    <div className="text-center p-3 bg-card rounded-lg border">
                      <div className="text-2xl font-bold text-primary">{kbEntriesStored || chunksCreated}</div>
                      <div className="text-sm text-muted-foreground">KB Entries Stored</div>
                    </div>
                    <div className="text-center p-3 bg-card rounded-lg border">
                      <div className="text-2xl font-bold text-primary">{categoriesAdded}</div>
                      <div className="text-sm text-muted-foreground">Categories Added</div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Detailed Step Information */}
            <div className="space-y-3 mt-4">
              <h4 className="font-semibold text-sm">Processing Details:</h4>
              <div className="space-y-2 text-sm">
                {job.steps.map(step => (
                  <div key={step.id} className="flex items-start gap-2 p-2 bg-card rounded border">
                    <div className="flex-shrink-0 mt-0.5">
                      {step.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-600" />}
                      {step.status === 'failed' && <XCircle className="h-4 w-4 text-red-600" />}
                      {step.status === 'running' && <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />}
                      {step.status === 'pending' && <Clock className="h-4 w-4 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{step.name}</div>
                      {step.details && step.details.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1 space-y-1">
                          {step.details.slice(0, 2).map((detail, idx) => (
                            <div key={idx} className="truncate">
                              • {typeof detail === 'string' ? detail : detail.message}
                            </div>
                          ))}
                          {step.details.length > 2 && (
                            <div className="text-xs text-muted-foreground">
                              +{step.details.length - 2} more details
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Metafields Information */}
            <div className="space-y-3 mt-4">
              <h4 className="font-semibold text-sm">Metadata & Fields:</h4>
              <div className="text-xs space-y-2 p-2 bg-card rounded border">
                {(() => {
                  const knowledgeStep = job.steps.find(s => s.id === 'knowledge-storage');
                  const metafields: { name: string; status: string }[] = [];

                  // Extract metafields from knowledge storage step
                  if (knowledgeStep?.details) {
                    knowledgeStep.details.forEach((detail: unknown) => {
                      const detailStr = typeof detail === 'string' ? detail : (detail as any)?.message || '';

                      // Check for various metadata fields
                      if (detailStr.includes('Document stored')) metafields.push({ name: 'Document Storage', status: '✓ Added' });
                      if (detailStr.includes('MIVAA processing results')) metafields.push({ name: 'MIVAA Metadata', status: '✓ Integrated' });
                      if (detailStr.includes('text chunks')) metafields.push({ name: 'Chunk Metadata', status: '✓ Added' });
                      if (detailStr.includes('images')) metafields.push({ name: 'Image Metadata', status: '✓ Added' });
                      if (detailStr.includes('embeddings')) metafields.push({ name: 'Embedding Metadata', status: '✓ Added' });
                      if (detailStr.includes('categories')) metafields.push({ name: 'Category Metadata', status: '✓ Added' });
                      if (detailStr.includes('Metadata and relationships')) metafields.push({ name: 'Relationships', status: '✓ Preserved' });
                      if (detailStr.includes('Search indexing')) metafields.push({ name: 'Search Index', status: '✓ Completed' });
                    });
                  }

                  // Also check upload and validation steps for additional metadata
                  const uploadStep = job.steps.find(s => s.id === 'upload');
                  if (uploadStep?.details) {
                    uploadStep.details.forEach((detail: unknown) => {
                      const detailStr = typeof detail === 'string' ? detail : (detail as any)?.message || '';
                      if (detailStr.includes('File uploaded')) metafields.push({ name: 'File Upload', status: '✓ Completed' });
                    });
                  }

                  const validationStep = job.steps.find(s => s.id === 'validation');
                  if (validationStep?.details) {
                    validationStep.details.forEach((detail: unknown) => {
                      const detailStr = typeof detail === 'string' ? detail : (detail as any)?.message || '';
                      if (detailStr.includes('PDF structure')) metafields.push({ name: 'PDF Structure', status: '✓ Validated' });
                      if (detailStr.includes('Content accessibility')) metafields.push({ name: 'Content Access', status: '✓ Confirmed' });
                    });
                  }

                  // Remove duplicates
                  const uniqueMetafields = Array.from(new Map(metafields.map(m => [m.name, m])).values());

                  if (uniqueMetafields.length === 0) {
                    return <div className="text-muted-foreground">No metadata fields tracked</div>;
                  }

                  return (
                    <div className="space-y-1">
                      {uniqueMetafields.map((field, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <span className="text-muted-foreground">{field.name}:</span>
                          <span className="text-green-600 font-medium">{field.status}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Job Metadata */}
            <div className="text-xs p-2 bg-card rounded border space-y-1">
              <div><strong>Job ID:</strong> {job.id}</div>
              <div><strong>Document ID:</strong> {(job.metadata?.documentId as string) || 'N/A'}</div>
              <div><strong>Processing Time:</strong> {job.endTime ? formatDuration(job.startTime, job.endTime) : 'In progress'}</div>
            </div>
          </div>
        )}

        <Separator className="flex-shrink-0" />

        <div className="p-6 pt-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Job ID: {job.id}</span>
              {isRunning && (
                <Badge variant="outline" className="animate-pulse">
                  Processing...
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isFailed && onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
