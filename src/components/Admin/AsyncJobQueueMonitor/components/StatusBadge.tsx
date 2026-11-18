import React from 'react';
import { AlertTriangle, Ban, CheckCircle2, Hourglass, Loader2, RotateCw, XCircle, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { BackgroundJob } from '../types';

type BadgeVariant = 'warning' | 'info' | 'success' | 'error' | 'neutral';

export const hasRecentHeartbeat = (job: BackgroundJob): boolean => {
  if (!job.last_heartbeat) return false;
  const heartbeatTime = new Date(job.last_heartbeat).getTime();
  const now = Date.now();
  const thirtySecondsAgo = now - 30000;
  return heartbeatTime > thirtySecondsAgo;
};

export const getStatusBadge = (status: string, job?: BackgroundJob) => {
  const statusConfig: Record<string, { variant: BadgeVariant; Icon: LucideIcon }> = {
    pending: { variant: 'warning', Icon: Hourglass },
    processing: { variant: 'info', Icon: Loader2 },
    completed: { variant: 'success', Icon: CheckCircle2 },
    failed: { variant: 'error', Icon: XCircle },
    cancelled: { variant: 'neutral', Icon: Ban },
    interrupted: { variant: 'warning', Icon: AlertTriangle },
    retrying: { variant: 'info', Icon: RotateCw },
  };
  const { variant, Icon } = statusConfig[status] || statusConfig.pending;

  const isActivelyProcessing = job && (status === 'processing' || status === 'retrying') && hasRecentHeartbeat(job);

  return (
    <Badge variant={variant} className="capitalize">
      <Icon className={`h-3 w-3 ${isActivelyProcessing ? 'animate-spin' : ''}`} aria-hidden="true" />
      {status}
    </Badge>
  );
};

export default getStatusBadge;
