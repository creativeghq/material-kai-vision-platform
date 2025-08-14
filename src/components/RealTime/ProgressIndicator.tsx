import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWebSocket } from '@/hooks/useWebSocket';
import { 
  Play, 
  Pause, 
  Square, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export interface ProgressStep {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  progress?: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ProgressData {
  id: string;
  title: string;
  description?: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  overallProgress: number;
  currentStep?: string;
  steps: ProgressStep[];
  startTime?: Date;
  endTime?: Date;
  estimatedDuration?: number;
  actualDuration?: number;
  metadata?: Record<string, any>;
}

export interface ProgressIndicatorProps {
  progressId: string;
  websocketUrl: string;
  title?: string;
  showSteps?: boolean;
  showControls?: boolean;
  showEstimates?: boolean;
  compact?: boolean;
  className?: string;
  onStatusChange?: (status: ProgressData['status']) => void;
  onComplete?: (data: ProgressData) => void;
  onError?: (error: string) => void;
}

const getStatusConfig = (status: ProgressData['status']) => {
  switch (status) {
    case 'running':
      return {
        icon: Loader2,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        label: 'Running',
        variant: 'default' as const,
        animate: true
      };
    case 'paused':
      return {
        icon: Pause,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        label: 'Paused',
        variant: 'secondary' as const
      };
    case 'completed':
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        label: 'Completed',
        variant: 'default' as const
      };
    case 'failed':
      return {
        icon: AlertCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        label: 'Failed',
        variant: 'destructive' as const
      };
    case 'cancelled':
      return {
        icon: Square,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        label: 'Cancelled',
        variant: 'outline' as const
      };
    case 'idle':
    default:
      return {
        icon: Clock,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        label: 'Idle',
        variant: 'outline' as const
      };
  }
};

const getStepStatusConfig = (status: ProgressStep['status']) => {
  switch (status) {
    case 'in_progress':
      return {
        icon: Loader2,
        color: 'text-blue-600',
        animate: true
      };
    case 'completed':
      return {
        icon: CheckCircle,
        color: 'text-green-600'
      };
    case 'failed':
      return {
        icon: AlertCircle,
        color: 'text-red-600'
      };
    case 'skipped':
      return {
        icon: Square,
        color: 'text-gray-400'
      };
    case 'pending':
    default:
      return {
        icon: Clock,
        color: 'text-gray-400'
      };
  }
};

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  progressId,
  websocketUrl,
  title,
  showSteps = true,
  showControls = false,
  showEstimates = true,
  compact = false,
  className,
  onStatusChange,
  onComplete,
  onError
}) => {
  const [progressData, setProgressData] = useState<ProgressData>({
    id: progressId,
    title: title || 'Progress',
    status: 'idle',
    overallProgress: 0,
    steps: []
  });

  const { send, isConnected } = useWebSocket(websocketUrl, {
    onMessage: (message) => {
      if (message.type === 'progress_update' && message.payload.id === progressId) {
        const newData = message.payload as ProgressData;
        setProgressData(newData);
        
        if (onStatusChange && newData.status !== progressData.status) {
          onStatusChange(newData.status);
        }
        
        if (newData.status === 'completed' && onComplete) {
          onComplete(newData);
        }
        
        if (newData.status === 'failed' && onError) {
          onError(newData.metadata?.error || 'Process failed');
        }
      }
    }
  });

  // Subscribe to progress updates
  useEffect(() => {
    if (isConnected) {
      send({
        type: 'subscribe_progress',
        payload: { progressId }
      });
    }
  }, [isConnected, progressId, send]);

  const handleControl = (action: 'start' | 'pause' | 'resume' | 'cancel') => {
    if (isConnected) {
      send({
        type: 'progress_control',
        payload: { progressId, action }
      });
    }
  };

  const formatDuration = (ms: number) => {
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
  };

  const getEstimatedTimeRemaining = () => {
    if (!progressData.startTime || !progressData.estimatedDuration) return null;
    
    const elapsed = Date.now() - progressData.startTime.getTime();
    const remaining = progressData.estimatedDuration - elapsed;
    
    return remaining > 0 ? remaining : 0;
  };

  const statusConfig = getStatusConfig(progressData.status);
  const StatusIcon = statusConfig.icon;
  const estimatedRemaining = getEstimatedTimeRemaining();

  if (compact) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className="flex items-center gap-2">
          <StatusIcon 
            className={cn(
              'h-4 w-4',
              statusConfig.color,
              statusConfig.animate && 'animate-spin'
            )}
          />
          <Badge variant={statusConfig.variant} className="text-xs">
            {statusConfig.label}
          </Badge>
        </div>
        <div className="flex-1 min-w-0">
          <Progress value={progressData.overallProgress} className="h-2" />
        </div>
        <span className="text-sm text-muted-foreground">
          {Math.round(progressData.overallProgress)}%
        </span>
      </div>
    );
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-full',
              statusConfig.bgColor
            )}>
              <StatusIcon 
                className={cn(
                  'h-5 w-5',
                  statusConfig.color,
                  statusConfig.animate && 'animate-spin'
                )}
              />
            </div>
            <div>
              <CardTitle className="text-lg">{progressData.title}</CardTitle>
              {progressData.description && (
                <p className="text-sm text-muted-foreground">
                  {progressData.description}
                </p>
              )}
            </div>
          </div>
          
          {showControls && (
            <div className="flex items-center gap-2">
              {progressData.status === 'idle' && (
                <Button
                  size="sm"
                  onClick={() => handleControl('start')}
                  disabled={!isConnected}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Start
                </Button>
              )}
              {progressData.status === 'running' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleControl('pause')}
                  disabled={!isConnected}
                >
                  <Pause className="h-4 w-4 mr-1" />
                  Pause
                </Button>
              )}
              {progressData.status === 'paused' && (
                <Button
                  size="sm"
                  onClick={() => handleControl('resume')}
                  disabled={!isConnected}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Resume
                </Button>
              )}
              {(progressData.status === 'running' || progressData.status === 'paused') && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleControl('cancel')}
                  disabled={!isConnected}
                >
                  <Square className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span>{Math.round(progressData.overallProgress)}%</span>
          </div>
          <Progress value={progressData.overallProgress} className="h-3" />
        </div>

        {/* Current Step */}
        {progressData.currentStep && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">
                Current: {progressData.currentStep}
              </span>
            </div>
          </div>
        )}

        {/* Time Information */}
        {showEstimates && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            {progressData.startTime && (
              <div>
                <span className="text-muted-foreground">Started:</span>
                <span className="ml-2 font-medium">
                  {formatDistanceToNow(progressData.startTime, { addSuffix: true })}
                </span>
              </div>
            )}
            {estimatedRemaining !== null && progressData.status === 'running' && (
              <div>
                <span className="text-muted-foreground">Remaining:</span>
                <span className="ml-2 font-medium">
                  ~{formatDuration(estimatedRemaining)}
                </span>
              </div>
            )}
            {progressData.endTime && (
              <div>
                <span className="text-muted-foreground">Completed:</span>
                <span className="ml-2 font-medium">
                  {formatDistanceToNow(progressData.endTime, { addSuffix: true })}
                </span>
              </div>
            )}
            {progressData.actualDuration && (
              <div>
                <span className="text-muted-foreground">Duration:</span>
                <span className="ml-2 font-medium">
                  {formatDuration(progressData.actualDuration)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Steps */}
        {showSteps && progressData.steps.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Steps</h4>
            <div className="space-y-2">
              {progressData.steps.map((step) => {
                const stepConfig = getStepStatusConfig(step.status);
                const StepIcon = stepConfig.icon;
                
                return (
                  <div
                    key={step.id}
                    className={cn(
                      'flex items-center gap-3 p-2 rounded-md border',
                      step.status === 'in_progress' && 'bg-blue-50 border-blue-200',
                      step.status === 'completed' && 'bg-green-50 border-green-200',
                      step.status === 'failed' && 'bg-red-50 border-red-200'
                    )}
                  >
                    <StepIcon 
                      className={cn(
                        'h-4 w-4',
                        stepConfig.color,
                        stepConfig.animate && 'animate-spin'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{step.name}</span>
                        {step.progress !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            {Math.round(step.progress)}%
                          </span>
                        )}
                      </div>
                      {step.description && (
                        <p className="text-xs text-muted-foreground">
                          {step.description}
                        </p>
                      )}
                      {step.progress !== undefined && (
                        <Progress value={step.progress} className="h-1 mt-1" />
                      )}
                      {step.error && (
                        <p className="text-xs text-red-600 mt-1">{step.error}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Simple progress bar component for minimal UI footprint
 */
export const SimpleProgressBar: React.FC<{
  progressId: string;
  websocketUrl: string;
  className?: string;
  showPercentage?: boolean;
}> = ({ progressId, websocketUrl, className, showPercentage = true }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<ProgressData['status']>('idle');

  useWebSocket(websocketUrl, {
    onMessage: (message) => {
      if (message.type === 'progress_update' && message.payload.id === progressId) {
        const data = message.payload as ProgressData;
        setProgress(data.overallProgress);
        setStatus(data.status);
      }
    }
  });

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Progress 
        value={progress} 
        className={cn(
          'flex-1',
          status === 'failed' && 'bg-red-100',
          status === 'completed' && 'bg-green-100'
        )}
      />
      {showPercentage && (
        <span className="text-sm text-muted-foreground min-w-[3rem] text-right">
          {Math.round(progress)}%
        </span>
      )}
    </div>
  );
};