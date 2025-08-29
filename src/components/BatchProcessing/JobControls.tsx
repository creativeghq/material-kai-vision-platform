import React, { useState } from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

import { useToast } from '../../hooks/useToast';

// Types for job management
export interface JobItem {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  progress: number;
  filesProcessed: number;
  totalFiles: number;
  startTime?: Date;
  endTime?: Date;
  estimatedCompletion?: Date;
  errorMessage?: string;
  canPause: boolean;
  canCancel: boolean;
  canRetry: boolean;
  canDelete: boolean;
}

export interface JobControlsProps {
  job: JobItem;
  onPause?: (jobId: string) => Promise<void>;
  onResume?: (jobId: string) => Promise<void>;
  onCancel?: (jobId: string) => Promise<void>;
  onRetry?: (jobId: string) => Promise<void>;
  onDelete?: (jobId: string) => Promise<void>;
  disabled?: boolean;
  compact?: boolean;
}

export interface BatchJobControlsProps {
  selectedJobs: JobItem[];
  onBatchPause?: (jobIds: string[]) => Promise<void>;
  onBatchResume?: (jobIds: string[]) => Promise<void>;
  onBatchCancel?: (jobIds: string[]) => Promise<void>;
  onBatchRetry?: (jobIds: string[]) => Promise<void>;
  onBatchDelete?: (jobIds: string[]) => Promise<void>;
  disabled?: boolean;
}

// Individual Job Controls Component
export const JobControls: React.FC<JobControlsProps> = ({
  job,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onDelete,
  disabled = false,
  compact = false,
}) => {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAction = async (action: string, handler?: (jobId: string) => Promise<void>) => {
    if (!handler || disabled) return;

    setIsLoading(action);
    try {
      await handler(job.id);
      toast({
        title: 'Success',
        description: `Job ${action} completed successfully.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to ${action} job: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(null);
    }
  };

  const getStatusIcon = () => {
    switch (job.status) {
      case 'running':
        return <Play className="h-3 w-3 text-green-500" />;
      case 'paused':
        return <Pause className="h-3 w-3 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'failed':
        return <XCircle className="h-3 w-3 text-red-500" />;
      case 'cancelled':
        return <Square className="h-3 w-3 text-gray-500" />;
      case 'pending':
        return <Clock className="h-3 w-3 text-blue-500" />;
      default:
        return <Clock className="h-3 w-3 text-gray-500" />;
    }
  };

  const getStatusBadge = () => {
    const getStatusClasses = () => {
      switch (job.status) {
        case 'pending':
        case 'paused':
          return 'bg-secondary text-secondary-foreground';
        case 'running':
        case 'completed':
          return 'bg-primary text-primary-foreground';
        case 'failed':
          return 'bg-destructive text-destructive-foreground';
        case 'cancelled':
          return 'border border-border bg-background text-foreground';
        default:
          return 'bg-primary text-primary-foreground';
      }
    };

    return (
      <Badge className={`flex items-center gap-1 ${getStatusClasses()}`}>
        {getStatusIcon()}
        {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
      </Badge>
    );
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {getStatusBadge()}
        <div className="flex gap-1">
          {/* Resume/Pause Button */}
          {job.status === 'paused' && job.canPause && onResume && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button

                    className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                    onClick={() => handleAction('resume', onResume)}
                    disabled={disabled || isLoading === 'resume'}
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Resume job</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {job.status === 'running' && job.canPause && onPause && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button

                    className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                    onClick={() => handleAction('pause', onPause)}
                    disabled={disabled || isLoading === 'pause'}
                  >
                    <Pause className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Pause job</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Cancel Button */}
          {(job.status === 'running' || job.status === 'paused' || job.status === 'pending') && job.canCancel && onCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button

                  className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                  disabled={disabled || isLoading === 'cancel'}
                >
                  <Square className="h-3 w-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Job</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to cancel &quot;{job.name}&quot;? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleAction('cancel', onCancel)}>
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Retry Button */}
          {(job.status === 'failed' || job.status === 'cancelled') && job.canRetry && onRetry && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button

                    className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                    onClick={() => handleAction('retry', onRetry)}
                    disabled={disabled || isLoading === 'retry'}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Retry job</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Delete Button */}
          {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && job.canDelete && onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button

                  className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                  disabled={disabled || isLoading === 'delete'}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Job</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete &quot;{job.name}&quot;? This will remove all job data and cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleAction('delete', onDelete)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{job.name}</CardTitle>
          {getStatusBadge()}
        </div>
        <div className="text-sm text-muted-foreground">
          Progress: {job.filesProcessed}/{job.totalFiles} files ({job.progress}%)
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {/* Resume/Pause Button */}
          {job.status === 'paused' && job.canPause && onResume && (
            <Button
              onClick={() => handleAction('resume', onResume)}
              disabled={disabled || isLoading === 'resume'}

            >
              <Play className="h-4 w-4" />
              Resume
            </Button>
          )}

          {job.status === 'running' && job.canPause && onPause && (
            <Button
              className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
              onClick={() => handleAction('pause', onPause)}
              disabled={disabled || isLoading === 'pause'}
            >
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          )}

          {/* Cancel Button */}
          {(job.status === 'running' || job.status === 'paused' || job.status === 'pending') && job.canCancel && onCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                  disabled={disabled || isLoading === 'cancel'}
                >
                  <Square className="h-4 w-4" />
                  Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Job</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to cancel &quot;{job.name}&quot;? This action cannot be undone and any progress will be lost.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleAction('cancel', onCancel)}>
                    Confirm Cancellation
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Retry Button */}
          {(job.status === 'failed' || job.status === 'cancelled') && job.canRetry && onRetry && (
            <Button
              className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
              onClick={() => handleAction('retry', onRetry)}
              disabled={disabled || isLoading === 'retry'}
            >
              <RotateCcw className="h-4 w-4" />
              Retry
            </Button>
          )}

          {/* Delete Button */}
          {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && job.canDelete && onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={disabled || isLoading === 'delete'}

                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Job</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete &quot;{job.name}&quot;? This will permanently remove all job data, logs, and results. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleAction('delete', onDelete)}>
                    Delete Permanently
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Error Message */}
        {job.status === 'failed' && job.errorMessage && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Error Details</p>
                <p className="text-sm text-red-700 mt-1">{job.errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Job Timing Information */}
        <div className="mt-3 text-xs text-muted-foreground space-y-1">
          {job.startTime && (
            <div>Started: {job.startTime.toLocaleString()}</div>
          )}
          {job.endTime && (
            <div>Ended: {job.endTime.toLocaleString()}</div>
          )}
          {job.estimatedCompletion && job.status === 'running' && (
            <div>Estimated completion: {job.estimatedCompletion.toLocaleString()}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Batch Job Controls Component
export const BatchJobControls: React.FC<BatchJobControlsProps> = ({
  selectedJobs,
  onBatchPause,
  onBatchResume,
  onBatchCancel,
  onBatchRetry,
  onBatchDelete,
  disabled = false,
}) => {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const handleBatchAction = async (action: string, handler?: (jobIds: string[]) => Promise<void>) => {
    if (!handler || disabled || selectedJobs.length === 0) return;

    setIsLoading(action);
    try {
      const jobIds = selectedJobs.map(job => job.id);
      await handler(jobIds);
      toast({
        title: 'Success',
        description: `Batch ${action} completed for ${selectedJobs.length} jobs.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to ${action} jobs: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(null);
    }
  };

  // Filter jobs by what actions are available
  const pausableJobs = selectedJobs.filter(job =>
    job.status === 'running' && job.canPause,
  );
  const resumableJobs = selectedJobs.filter(job =>
    job.status === 'paused' && job.canPause,
  );
  const cancellableJobs = selectedJobs.filter(job =>
    (job.status === 'running' || job.status === 'paused' || job.status === 'pending') && job.canCancel,
  );
  const retryableJobs = selectedJobs.filter(job =>
    (job.status === 'failed' || job.status === 'cancelled') && job.canRetry,
  );
  const deletableJobs = selectedJobs.filter(job =>
    (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && job.canDelete,
  );

  if (selectedJobs.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Select jobs to perform batch operations
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle >
          Batch Operations
          <Badge className="bg-secondary text-secondary-foreground">{selectedJobs.length} selected</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {/* Batch Pause */}
          {pausableJobs.length > 0 && onBatchPause && (
            <Button
              className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => handleBatchAction('pause', onBatchPause)}
              disabled={disabled || isLoading === 'pause'}

            >
              <Pause className="h-4 w-4" />
              Pause ({pausableJobs.length})
            </Button>
          )}

          {/* Batch Resume */}
          {resumableJobs.length > 0 && onBatchResume && (
            <Button
              onClick={() => handleBatchAction('resume', onBatchResume)}
              disabled={disabled || isLoading === 'resume'}

            >
              <Play className="h-4 w-4" />
              Resume ({resumableJobs.length})
            </Button>
          )}

          {/* Batch Cancel */}
          {cancellableJobs.length > 0 && onBatchCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                  disabled={disabled || isLoading === 'cancel'}

                >
                  <Square className="h-4 w-4" />
                  Cancel ({cancellableJobs.length})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Multiple Jobs</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to cancel {cancellableJobs.length} jobs? This action cannot be undone and any progress will be lost.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleBatchAction('cancel', onBatchCancel)}>
                    Confirm Cancellation
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Batch Retry */}
          {retryableJobs.length > 0 && onBatchRetry && (
            <Button
              className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => handleBatchAction('retry', onBatchRetry)}
              disabled={disabled || isLoading === 'retry'}

            >
              <RotateCcw className="h-4 w-4" />
              Retry ({retryableJobs.length})
            </Button>
          )}

          {/* Batch Delete */}
          {deletableJobs.length > 0 && onBatchDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={disabled || isLoading === 'delete'}

                >
                  <Trash2 className="h-4 w-4" />
                  Delete ({deletableJobs.length})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Multiple Jobs</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete {deletableJobs.length} jobs? This will permanently remove all job data, logs, and results. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleBatchAction('delete', onBatchDelete)}>
                    Delete Permanently
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Summary of selected jobs */}
        <div className="mt-4 p-3 bg-muted rounded-md">
          <p className="text-sm font-medium mb-2">Selected Jobs Summary:</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div>Running: {selectedJobs.filter(j => j.status === 'running').length}</div>
            <div>Paused: {selectedJobs.filter(j => j.status === 'paused').length}</div>
            <div>Failed: {selectedJobs.filter(j => j.status === 'failed').length}</div>
            <div>Completed: {selectedJobs.filter(j => j.status === 'completed').length}</div>
            <div>Pending: {selectedJobs.filter(j => j.status === 'pending').length}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default JobControls;
