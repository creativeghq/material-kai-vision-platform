import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Upload,
  Shield,
  Sparkles,
  Database,
  BarChart3,
  X,
  RefreshCw,
  Eye,

} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
  onRetry?: () => void;
  onViewResults?: () => void;
  enablePolling?: boolean; // New prop to enable real-time polling
}

const stepIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  auth: Shield,
  upload: Upload,
  validation: FileText,
  'mivaa-processing': Sparkles,
  'layout-analysis': BarChart3,
  'embedding-generation': Database,
  'knowledge-storage': Database,
  'quality-assessment': CheckCircle,
};

const getStepIcon = (stepId: string) => {
  return stepIcons[stepId] || Clock;
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-600" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
    default:
      return <Clock className="h-4 w-4 text-gray-500" />;
  }
};

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

const calculateOverallProgress = (steps: WorkflowStep[]) => {
  if (steps.length === 0) return 0;
  
  const completedSteps = steps.filter(step => step.status === 'completed').length;
  const runningSteps = steps.filter(step => step.status === 'running');
  
  let progress = (completedSteps / steps.length) * 100;
  
  // Add partial progress for running steps
  if (runningSteps.length > 0) {
    const runningProgress = runningSteps.reduce((acc, step) => acc + (step.progress || 50), 0) / runningSteps.length;
    progress += (runningProgress / 100) * (1 / steps.length) * 100;
  }
  
  return Math.min(progress, 100);
};

export const PDFUploadProgressModal: React.FC<PDFUploadProgressModalProps> = ({
  isOpen,
  onClose,
  job,
  onRetry,
  onViewResults,
  enablePolling = false,
}) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  // const [autoScroll, setAutoScroll] = useState(true);

  const toggleStepExpansion = (stepId: string) => {
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

  // Auto-expand failed steps and handle completion
  useEffect(() => {
    if (job) {
      const failedSteps = job.steps.filter(step => step.status === 'failed');
      if (failedSteps.length > 0) {
        setExpandedSteps(prev => {
          const newSet = new Set(prev);
          failedSteps.forEach(step => newSet.add(step.id));
          return newSet;
        });
      }

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
                payload: { job_id: job.id }
              }
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

  const overallProgress = calculateOverallProgress(job.steps);
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isRunning = job.status === 'running';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span>{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>

          {/* Async Processing Indicator */}
          {job.steps.some(step =>
            step.id === 'mivaa-processing' &&
            step.details?.some(detail =>
              typeof detail === 'string' && detail.includes('async')
            )
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

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="p-6 space-y-4 max-h-none">
            {job.steps.map((step, _index) => {
              const StepIcon = getStepIcon(step.id);
              const isExpanded = expandedSteps.has(step.id);
              const hasDetails = (step.details && step.details.length > 0) || step.error || (step.logs && step.logs.length > 0);

              return (
                <Card key={step.id} className={cn(
                  "transition-all duration-300 border-2",
                  "bg-[#1f2937]", // Background color as requested
                  // Border colors based on status as requested
                  step.status === 'failed' && "border-red-500",
                  step.status === 'completed' && "border-green-500",
                  step.status === 'pending' && "border-gray-500",
                  // Active/running step gets white border as requested
                  step.status === 'running' && "border-white animate-pulse"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <StepIcon className={cn(
                          "h-5 w-5",
                          step.status === 'completed' && "text-green-400",
                          step.status === 'failed' && "text-red-400",
                          step.status === 'running' && "text-white",
                          step.status === 'pending' && "text-gray-400"
                        )} />
                        
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-white">{step.name}</h4>
                            <div className="flex items-center gap-2">
                              {step.status === 'running' && step.progress !== undefined && (
                                <span className="text-xs text-gray-400">
                                  {Math.round(step.progress)}%
                                </span>
                              )}
                              {getStatusIcon(step.status)}
                            </div>
                          </div>

                          {step.description && (
                            <p className="text-sm text-gray-400 mt-1">
                              {step.description}
                            </p>
                          )}
                          
                          {step.status === 'running' && step.progress !== undefined && (
                            <Progress value={step.progress} className="h-1 mt-2" />
                          )}
                          
                          {step.duration !== undefined && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Duration: {step.duration}ms
                            </p>
                          )}
                        </div>
                        
                        {hasDetails && (
                          <Collapsible>
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleStepExpansion(step.id)}
                                className="p-1"
                              >
                                {isExpanded ? 
                                  <ChevronDown className="h-4 w-4" /> : 
                                  <ChevronRight className="h-4 w-4" />
                                }
                              </Button>
                            </CollapsibleTrigger>
                          </Collapsible>
                        )}
                      </div>
                    </div>
                    
                    {hasDetails && (
                      <Collapsible open={isExpanded}>
                        <CollapsibleContent className="mt-3 pt-3 border-t border-gray-600">
                          <div className="space-y-2">
                            {step.error && (
                              <div className="bg-red-900/20 border border-red-500/30 rounded p-3">
                                <div className="flex items-center gap-2 text-red-400 font-medium mb-1">
                                  <AlertCircle className="h-4 w-4" />
                                  Error
                                </div>
                                <p className="text-sm text-red-300">{step.error}</p>
                              </div>
                            )}

                            {step.details && step.details.length > 0 && (
                              <div className="space-y-1">
                                <h5 className="text-sm font-medium text-gray-300">Details:</h5>
                                <ul className="text-sm space-y-1">
                                  {step.details.map((detail, idx) => {
                                    // Handle both string and WorkflowStepDetail types
                                    const isDetailObject = typeof detail === 'object' && detail !== null;
                                    const message = isDetailObject ? (detail as WorkflowStepDetail).message : detail as string;
                                    const status = isDetailObject ? (detail as WorkflowStepDetail).status : 'info';
                                    const error = isDetailObject ? (detail as WorkflowStepDetail).error : undefined;

                                    // Determine icon and color based on status
                                    const getStatusIcon = () => {
                                      switch (status) {
                                        case 'success':
                                          return <CheckCircle className="h-4 w-4 text-green-500" />;
                                        case 'error':
                                          return error ? (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <XCircle className="h-4 w-4 text-red-500 cursor-help" />
                                                </TooltipTrigger>
                                                <TooltipContent side="right" className="max-w-xs">
                                                  <p className="text-sm">{error}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          ) : <XCircle className="h-4 w-4 text-red-500" />;
                                        default:
                                          return <span className="text-gray-400">•</span>;
                                      }
                                    };

                                    const getTextColor = () => {
                                      switch (status) {
                                        case 'success':
                                          return 'text-green-300';
                                        case 'error':
                                          return 'text-red-300';
                                        default:
                                          return 'text-gray-300';
                                      }
                                    };

                                    return (
                                      <li key={idx} className="flex items-start gap-2">
                                        {getStatusIcon()}
                                        <span className={getTextColor()}>{message}</span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                            
                            {step.logs && step.logs.length > 0 && (
                              <div className="space-y-1">
                                <h5 className="text-sm font-medium text-gray-300">Logs:</h5>
                                <div className="bg-gray-800 border border-gray-600 rounded p-2 text-xs font-mono max-h-32 overflow-y-auto">
                                  {step.logs.map((log, idx) => (
                                    <div key={idx} className="text-gray-300">{log}</div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {step.metadata && Object.keys(step.metadata).length > 0 && (
                              <div className="space-y-1">
                                <h5 className="text-sm font-medium text-gray-300">Metadata:</h5>
                                <div className="bg-gray-800 border border-gray-600 rounded p-2 text-xs">
                                  <pre className="text-gray-300">{JSON.stringify(step.metadata, null, 2)}</pre>
                                </div>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            </div>
          </ScrollArea>
        </div>

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
              
              {isCompleted && onViewResults && (
                <Button variant="outline" size="sm" onClick={onViewResults}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Results
                </Button>
              )}
              
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
