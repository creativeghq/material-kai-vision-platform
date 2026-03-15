import React, { useEffect, useState } from 'react';
import { BackgroundJob } from '../types';
import { formatDistanceToNow } from 'date-fns';

const formatTime = (seconds: number) => {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
};

const getElapsedTime = (job: BackgroundJob): string => {
  if (job.status === 'completed' && job.started_at && job.completed_at) {
    const start = new Date(job.started_at).getTime();
    const end = new Date(job.completed_at).getTime();
    return formatTime(Math.floor((end - start) / 1000));
  }
  if (job.status === 'failed' && job.started_at && job.failed_at) {
    const start = new Date(job.started_at).getTime();
    const end = new Date(job.failed_at).getTime();
    return formatTime(Math.floor((end - start) / 1000));
  }
  if (job.status === 'interrupted' && job.started_at && job.interrupted_at) {
    const start = new Date(job.started_at).getTime();
    const end = new Date(job.interrupted_at).getTime();
    return formatTime(Math.floor((end - start) / 1000));
  }
  if ((job.status === 'processing' || job.status === 'retrying') && job.started_at) {
    const start = new Date(job.started_at).getTime();
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
