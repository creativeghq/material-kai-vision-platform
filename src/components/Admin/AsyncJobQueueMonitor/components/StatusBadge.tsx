import React from 'react';
import { Badge } from '@/components/core/ui/badge';
import { BackgroundJob } from '../types';

export const hasRecentHeartbeat = (job: BackgroundJob): boolean => {
  if (!job.last_heartbeat) return false;
  const heartbeatTime = new Date(job.last_heartbeat).getTime();
  const now = Date.now();
  const thirtySecondsAgo = now - 30000;
  return heartbeatTime > thirtySecondsAgo;
};

export const getStatusBadge = (status: string, job?: BackgroundJob) => {
  const statusConfig: Record<string, { color: string; icon: string }> = {
    pending: { color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
    processing: { color: 'bg-blue-100 text-blue-800', icon: '⚙️' },
    completed: { color: 'bg-green-100 text-green-800', icon: '✅' },
    failed: { color: 'bg-red-100 text-red-800', icon: '❌' },
    cancelled: { color: 'bg-gray-100 text-gray-800', icon: '🚫' },
    interrupted: { color: 'bg-orange-100 text-orange-800', icon: '⚠️' },
    retrying: { color: 'bg-purple-100 text-purple-800', icon: '🔄' },
  };
  const config = statusConfig[status] || statusConfig.pending;

  const isActivelyProcessing = job && (status === 'processing' || status === 'retrying') && hasRecentHeartbeat(job);

  return (
    <Badge className={`${config.color} ${isActivelyProcessing ? 'animate-pulse' : ''}`}>
      {config.icon} {status}
      {isActivelyProcessing && <span className="ml-1 inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>}
    </Badge>
  );
};

export default getStatusBadge;
