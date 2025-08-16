import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWebSocket, UseWebSocketOptions } from '@/hooks/useWebSocket';
import { WebSocketState } from '@/services/websocket/WebSocketManager';
import {
  WifiOff,
  Loader2,
  AlertTriangle,
  CheckCircle,
  RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RealTimeStatusIndicatorProps {
  url: string;
  className?: string;
  showDetails?: boolean;
  compact?: boolean;
  wsOptions?: UseWebSocketOptions;
}

const getStatusConfig = (state: WebSocketState, error: string | null) => {
  switch (state) {
    case WebSocketState.CONNECTED:
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        borderColor: 'border-green-200',
        label: 'Connected',
        description: 'Real-time connection active',
        variant: 'default' as const
      };
    case WebSocketState.CONNECTING:
      return {
        icon: Loader2,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        borderColor: 'border-blue-200',
        label: 'Connecting',
        description: 'Establishing connection...',
        variant: 'secondary' as const,
        animate: true
      };
    case WebSocketState.RECONNECTING:
      return {
        icon: RotateCcw,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        borderColor: 'border-yellow-200',
        label: 'Reconnecting',
        description: 'Attempting to reconnect...',
        variant: 'outline' as const,
        animate: true
      };
    case WebSocketState.FAILED:
      return {
        icon: AlertTriangle,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        borderColor: 'border-red-200',
        label: 'Failed',
        description: error || 'Connection failed after maximum attempts',
        variant: 'destructive' as const
      };
    case WebSocketState.DISCONNECTED:
    default:
      return {
        icon: WifiOff,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        borderColor: 'border-gray-200',
        label: 'Disconnected',
        description: 'Real-time connection inactive',
        variant: 'outline' as const
      };
  }
};

export const RealTimeStatusIndicator: React.FC<RealTimeStatusIndicatorProps> = ({
  url,
  className,
  showDetails = false,
  compact = false,
  wsOptions = {}
}) => {
  const { state, error, stats, connect } = useWebSocket(url, {
    autoConnect: true,
    ...wsOptions
  });

  const config = getStatusConfig(state, error);
  const Icon = config.icon;

  const handleRetry = () => {
    if (state === WebSocketState.FAILED || state === WebSocketState.DISCONNECTED) {
      connect().catch(console.error);
    }
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center gap-1', className)}>
              <Icon 
                className={cn(
                  'h-4 w-4',
                  config.color,
                  config.animate && 'animate-spin'
                )}
              />
              <span className="inline-flex items-center rounded-md border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-900 bg-gray-50">
                {config.label}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <div className="font-medium">{config.label}</div>
              <div className="text-muted-foreground">{config.description}</div>
              {showDetails && (
                <div className="mt-1 text-xs">
                  <div>Reconnect attempts: {stats.reconnectAttempts}</div>
                  <div>Queued messages: {stats.queuedMessages}</div>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-full',
              config.bgColor,
              config.borderColor,
              'border'
            )}>
              <Icon 
                className={cn(
                  'h-5 w-5',
                  config.color,
                  config.animate && 'animate-spin'
                )}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{config.label}</span>
                <Badge className={cn("text-xs",
                  config.variant === "default" && "bg-primary text-primary-foreground",
                  config.variant === "secondary" && "bg-secondary text-secondary-foreground",
                  config.variant === "destructive" && "bg-destructive text-destructive-foreground",
                  config.variant === "outline" && "border border-input bg-background"
                )}>
                  Real-time
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {config.description}
              </p>
            </div>
          </div>

          {(state === WebSocketState.FAILED || state === WebSocketState.DISCONNECTED) && (
            <button
              onClick={handleRetry}
              className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          )}
        </div>

        {showDetails && (
          <div className="mt-4 pt-4 border-t">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Status:</span>
                <span className="ml-2 font-medium">{state}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Connected:</span>
                <span className="ml-2 font-medium">
                  {stats.isConnected ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Reconnect attempts:</span>
                <span className="ml-2 font-medium">{stats.reconnectAttempts}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Queued messages:</span>
                <span className="ml-2 font-medium">{stats.queuedMessages}</span>
              </div>
            </div>
            
            {error && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-800">{error}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Simple status dot component for minimal UI footprint
 */
export const RealTimeStatusDot: React.FC<{
  url: string;
  className?: string;
  wsOptions?: UseWebSocketOptions;
}> = ({ url, className, wsOptions = {} }) => {
  const { state, error } = useWebSocket(url, {
    autoConnect: true,
    ...wsOptions
  });

  const config = getStatusConfig(state, error);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('relative', className)}>
            <div 
              className={cn(
                'h-3 w-3 rounded-full border-2 border-white shadow-sm',
                config.bgColor.replace('bg-', 'bg-').replace('-100', '-500')
              )}
            />
            {config.animate && (
              <div 
                className={cn(
                  'absolute inset-0 h-3 w-3 rounded-full animate-ping',
                  config.bgColor.replace('bg-', 'bg-').replace('-100', '-400')
                )}
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <div className="font-medium">{config.label}</div>
            <div className="text-muted-foreground">{config.description}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};