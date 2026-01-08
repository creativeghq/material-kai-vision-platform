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
  Sparkles,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Progress } from '@/components/core/ui/progress';
import { Separator } from '@/components/core/ui/separator';
import { Badge } from '@/components/core/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/core/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  usePDFProcessingMonitor,
  mapCheckpointToStages,
  getCurrentActiveStage,
  extractStageMetrics,
} from '@/services/pdf/pdfProcessingMonitor';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { mivaaApiClient } from '@/services/mivaaApiClient';

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

/**
 * 14-Step PDF Processing Pipeline
 * Matches backend checkpoint stages from checkpoint_recovery_service.py
 */
const PROCESSING_STEPS: Array<{ id: number; name: string; description: string }> = [
  {
    id: 1,
    name: 'Job Initialization',
    description: 'Creating job record and preparing workspace',
  },
  {
    id: 2,
    name: 'Product Discovery',
    description: 'AI-powered product, certificate, logo, and specification detection',
  },
  {
    id: 3,
    name: 'Focused Extraction',
    description: 'Extracting text from product pages only (smart filtering)',
  },
  {
    id: 4,
    name: 'Text Chunking',
    description: 'Semantic chunking for RAG retrieval',
  },
  {
    id: 5,
    name: 'Text Embeddings',
    description: 'Generating OpenAI embeddings (1536D vectors)',
  },
  {
    id: 6,
    name: 'Image Extraction',
    description: '4-layer extraction: embedded images, full page renders, vision AI crops, deduplication',
  },
  {
    id: 7,
    name: 'Image Classification',
    description: 'AI classification (material vs non-material)',
  },
  {
    id: 8,
    name: 'Image Analysis',
    description: 'Vision model analysis for image understanding',
  },
  {
    id: 9,
    name: 'CLIP Embeddings',
    description: 'Multi-vector image embeddings (5 per image)',
  },
  {
    id: 10,
    name: 'Product Creation',
    description: 'Creating product entities in database',
  },
  {
    id: 11,
    name: 'Relationship Mapping',
    description: 'Linking chunks, images, and products',
  },
  {
    id: 12,
    name: 'Document Entities',
    description: 'Creating certificates, logos, and specifications',
  },
  {
    id: 13,
    name: 'Metadata Extraction',
    description: 'Extracting and storing document metadata',
  },
  {
    id: 14,
    name: 'Quality Enhancement',
    description: 'Final validation and quality checks',
  },
];

export const PDFProcessingStepsMonitor: React.FC<PDFProcessingStepsMonitorProps> = ({
  jobId,
  fileName,
  onComplete,
  onError,
  className,
}) => {
  const { jobStatus, isPolling, error: monitorError } = usePDFProcessingMonitor(jobId);
  const { toast } = useToast();
  const [steps, setSteps] = useState<ProcessingStep[]>(
    PROCESSING_STEPS.map(step => ({
      ...step,
      status: 'pending' as const,
      progress: 0,
    })),
  );
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [startTime] = useState(new Date());

  // Admin action states
  const [chunksCount, setChunksCount] = useState<number>(0);
  const [embeddingsCount, setEmbeddingsCount] = useState<number>(0);
  const [isGeneratingChunks, setIsGeneratingChunks] = useState(false);
  const [isGeneratingEmbeddings, setIsGeneratingEmbeddings] = useState(false);

  // Update steps based on job status
  useEffect(() => {
    if (!jobStatus) return;

    console.log('📊 PDFProcessingStepsMonitor: Job status update:', {
      status: jobStatus.status,
      progress: jobStatus.progress,
      checkpoint: jobStatus.last_checkpoint?.stage,
      metadata: jobStatus.last_checkpoint?.metadata,
    });

    const checkpoint = jobStatus.last_checkpoint?.stage;
    if (!checkpoint) {
      console.warn('⚠️ No checkpoint stage found in job status');
      return;
    }

    const completedStageIds = mapCheckpointToStages(checkpoint);
    const activeStageId = getCurrentActiveStage(checkpoint);

    console.log('🎯 Stage mapping:', {
      checkpoint,
      completedStageIds,
      activeStageId,
    });

    // Merge checkpoint_data and metadata for extractStageMetrics
    // Backend stores data in both places, so we need to combine them
    const mergedCheckpointData = {
      ...(jobStatus.last_checkpoint?.checkpoint_data || {}),
      ...(jobStatus.last_checkpoint?.metadata || {}),
    };

    setSteps(prevSteps =>
      prevSteps.map(step => {
        // Mark completed stages
        if (completedStageIds.includes(step.id)) {
          return {
            ...step,
            status: 'completed' as const,
            progress: 100,
            endTime: step.endTime || new Date(),
            metrics: extractStageMetrics(step.id, mergedCheckpointData),
          };
        }
        // Mark active stage
        else if (step.id === activeStageId) {
          return {
            ...step,
            status: 'running' as const,
            progress: jobStatus.progress || 0,
            startTime: step.startTime || new Date(),
            metrics: extractStageMetrics(step.id, mergedCheckpointData),
          };
        }
        // Keep pending stages as-is
        return step;
      }),
    );

    // Handle job completion
    if (jobStatus.status === 'completed') {
      console.log('✅ Job completed successfully');
      // Mark all steps as completed
      setSteps(prevSteps =>
        prevSteps.map(step => ({
          ...step,
          status: 'completed' as const,
          progress: 100,
          endTime: step.endTime || new Date(),
          metrics: extractStageMetrics(step.id, mergedCheckpointData),
        })),
      );
      onComplete?.();
    }
    // Handle job failure
    else if (jobStatus.status === 'failed') {
      console.error('❌ Job failed:', jobStatus.error);

      // Mark the active stage as failed
      if (activeStageId) {
        setSteps(prevSteps =>
          prevSteps.map(step => {
            if (step.id === activeStageId) {
              return {
                ...step,
                status: 'failed' as const,
                error: jobStatus.error || 'Processing failed',
                endTime: new Date(),
              };
            }
            return step;
          }),
        );
      }

      onError?.(jobStatus.error || 'Processing failed');
    }
  }, [jobStatus, onComplete, onError]);

  // Handle monitor errors
  useEffect(() => {
    if (monitorError) {
      onError?.(monitorError);
    }
  }, [monitorError, onError]);

  // Fetch chunks and embeddings counts
  useEffect(() => {
    const fetchCounts = async () => {
      if (!jobStatus?.document_id) return;

      try {
        // Get chunks count
        const { count: chunksCount } = await supabase
          .from('document_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('document_id', jobStatus.document_id);

        setChunksCount(chunksCount || 0);

        // Get embeddings count (chunks with text_embedding)
        const { count: embeddingsCount } = await supabase
          .from('document_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('document_id', jobStatus.document_id)
          .not('text_embedding', 'is', null);

        setEmbeddingsCount(embeddingsCount || 0);
      } catch (error) {
        console.error('Error fetching counts:', error);
      }
    };

    fetchCounts();
    // Refresh counts every 5 seconds while polling
    const interval = isPolling ? setInterval(fetchCounts, 5000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobStatus?.document_id, isPolling]);

  const handleGenerateChunks = async () => {
    if (!jobStatus?.document_id || !jobStatus?.workspace_id) {
      toast({
        title: 'Error',
        description: 'Missing document or workspace information',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingChunks(true);
    try {
      // Call the internal chunks generation endpoint
      const response = await mivaaApiClient.request(
        `/api/internal/create-chunks/${jobId}`,
        {
          method: 'POST',
          body: JSON.stringify({
            job_id: jobId,
            document_id: jobStatus.document_id,
            workspace_id: jobStatus.workspace_id,
            extracted_text: '', // Will use existing text from DB
            chunk_size: 512,
            chunk_overlap: 50,
          }),
        },
      );

      // Check if chunks were skipped (already exist)
      if (response.skipped) {
        toast({
          title: 'Already Exists',
          description: `Document already has ${response.existing_chunks} chunks with ${response.existing_embeddings} embeddings. No duplicates created.`,
        });
      } else {
        toast({
          title: 'Success',
          description: `Created ${response.chunks_created} chunks with ${response.embeddings_generated} embeddings`,
        });

        // Refresh counts
        setTimeout(() => {
          setChunksCount(prev => prev + response.chunks_created);
          setEmbeddingsCount(prev => prev + response.embeddings_generated);
        }, 1000);
      }
    } catch (error) {
      console.error('Error generating chunks:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate chunks',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingChunks(false);
    }
  };

  const handleGenerateEmbeddings = async () => {
    if (!jobStatus?.document_id || !jobStatus?.workspace_id) {
      toast({
        title: 'Error',
        description: 'Missing document or workspace information',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingEmbeddings(true);
    try {
      const response = await mivaaApiClient.request(
        '/api/internal/generate-product-embeddings',
        {
          method: 'POST',
          body: JSON.stringify({
            workspace_id: jobStatus.workspace_id,
            document_id: jobStatus.document_id,
          }),
        },
      );

      toast({
        title: 'Success',
        description: `Generated embeddings for ${response.products_processed} products (${response.embeddings_queued} queued)`,
      });

      // Refresh counts after a delay
      setTimeout(() => {
        setEmbeddingsCount(prev => prev + response.embeddings_queued);
      }, 2000);
    } catch (error) {
      console.error('Error generating embeddings:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate embeddings',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingEmbeddings(false);
    }
  };

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

  const formatDuration = (start?: Date, end?: Date) => {
    if (!start) return '';
    const endTime = end || new Date();
    const seconds = Math.round((endTime.getTime() - start.getTime()) / 1000);
    if (seconds < 1) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold">{fileName}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Started {formatDistanceToNow(startTime)} ago
            </p>
          </div>
          {getJobStatusBadge()}
        </div>

        {/* Overall Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Overall Progress</span>
            <span>{completedSteps} of {totalSteps} steps</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>

        {/* Admin Actions */}
        <div className="mt-4 flex flex-col gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={handleGenerateChunks}
                  disabled={isGeneratingChunks}
                >
                  <FileText className="h-3.5 w-3.5 mr-2" />
                  Generate Chunks ({chunksCount})
                  {isGeneratingChunks && (
                    <Loader2 className="h-3 w-3 ml-2 animate-spin" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create text chunks from document content</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={handleGenerateEmbeddings}
                  disabled={isGeneratingEmbeddings}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-2" />
                  Generate Embeddings ({embeddingsCount})
                  {isGeneratingEmbeddings && (
                    <Loader2 className="h-3 w-3 ml-2 animate-spin" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Generate AI embeddings for products without them</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-0">
          {steps.map((step, index) => {
            const isExpanded = expandedSteps.has(step.id);
            const hasDetails = step.metrics && Object.keys(step.metrics).length > 0;

            return (
              <div key={step.id}>
                {/* Step Row - Vercel Style */}
                <button
                  onClick={() => hasDetails && toggleStepExpansion(step.id)}
                  className={cn(
                    'w-full flex items-center gap-2 py-2 px-1 hover:bg-muted/50 transition-colors text-left',
                    !hasDetails && 'cursor-default',
                    step.status === 'failed' && 'bg-red-50',
                  )}
                >
                  {/* Expand/Collapse Chevron */}
                  <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    {hasDetails ? (
                      isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )
                    ) : null}
                  </div>

                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {step.status === 'completed' && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    {step.status === 'running' && (
                      <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                    )}
                    {step.status === 'failed' && (
                      <AlertCircle className="h-4 w-4 text-red-600" />
                    )}
                    {step.status === 'pending' && (
                      <Clock className="h-4 w-4 text-gray-400" />
                    )}
                  </div>

                  {/* Step Name and Description */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{step.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {step.description}
                    </div>
                  </div>

                  {/* Duration */}
                  <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                    {step.status === 'completed' && formatDuration(step.startTime, step.endTime)}
                    {step.status === 'running' && formatDuration(step.startTime)}
                  </span>
                </button>

                {/* Expanded Details */}
                {isExpanded && hasDetails && (
                  <div className="ml-6 pl-6 py-2 border-l-2 border-muted">
                    <div className="space-y-1 text-xs">
                      {Object.entries(step.metrics!).map(([key, value]) => {
                        // Special handling for product_names array
                        if (key === 'product_names' && Array.isArray(value)) {
                          const productNames = value as string[];
                          const displayNames = productNames.slice(0, 2);
                          const hasMore = productNames.length > 2;

                          return (
                            <div key={key} className="flex justify-between items-center">
                              <span className="text-muted-foreground">Products:</span>
                              <div className="font-mono text-foreground flex items-center gap-1">
                                <span>{displayNames.join(', ')}</span>
                                {hasMore && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-blue-600 cursor-help underline decoration-dotted">
                                          +{productNames.length - 2} more
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        <div className="space-y-1">
                                          <p className="font-semibold text-xs mb-2">All Products ({productNames.length}):</p>
                                          <ul className="list-disc list-inside space-y-0.5 text-xs">
                                            {productNames.map((name, idx) => (
                                              <li key={idx}>{name}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Default rendering for other metrics
                        return (
                          <div key={key} className="flex justify-between">
                            <span className="text-muted-foreground">{key}:</span>
                            <span className="font-mono text-foreground">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {step.error && (
                  <div className="ml-6 pl-6 py-2 border-l-2 border-red-200 bg-red-50">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-red-900 mb-1">Error Details:</p>
                        <p className="text-xs text-red-700">{step.error}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Global Error Display */}
        {monitorError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-red-900 mb-1">Processing Error:</p>
                <p className="text-xs text-red-700">{monitorError}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

