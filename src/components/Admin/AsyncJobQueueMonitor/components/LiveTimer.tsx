import React, { useEffect, useState } from 'react';
import { BackgroundJob } from '../types';
import { formatDistanceToNow } from 'date-fns';

const formatTime = (seconds: number) => {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
};

// Backend often doesn't set started_at, so fall back to created_at
const getStartTime = (job: BackgroundJob): number =>
  job.started_at ? new Date(job.started_at).getTime() : new Date(job.created_at).getTime();

const getElapsedTime = (job: BackgroundJob): string => {
  const start = getStartTime(job);

  if (job.status === 'completed' && job.completed_at) {
    return formatTime(Math.floor((new Date(job.completed_at).getTime() - start) / 1000));
  }
  if (job.status === 'failed' && job.failed_at) {
    return formatTime(Math.floor((new Date(job.failed_at).getTime() - start) / 1000));
  }
  if (job.status === 'interrupted' && job.interrupted_at) {
    return formatTime(Math.floor((new Date(job.interrupted_at).getTime() - start) / 1000));
  }
  if (job.status === 'processing' || job.status === 'retrying') {
    return formatTime(Math.floor((Date.now() - start) / 1000));
  }
  if (job.status === 'pending') {
    return formatDistanceToNow(new Date(job.created_at), { addSuffix: true });
  }
  return 'N/A';
};

export const LiveTimer: React.FC<{ job: BackgroundJob }> = ({ job }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (job.status !== 'processing' && job.status !== 'retrying') return;
    const interval = setInterval(() => setTick(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [job.status]);

  return <span>{getElapsedTime(job)}</span>;
};

export default LiveTimer;
