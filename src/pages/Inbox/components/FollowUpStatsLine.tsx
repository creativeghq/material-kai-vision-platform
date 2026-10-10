import React, { useEffect, useState } from 'react';
import { inboxApi, type FollowUpStats } from '@/services/inboxApi';

const DAYS = 90;

/** Your follow-ups over the last 90 days: sent, answered after the nudge, and answered before it was needed. */
export const FollowUpStatsLine: React.FC<{ refreshKey?: unknown }> = ({ refreshKey }) => {
  const [stats, setStats] = useState<FollowUpStats | null | 'failed'>(null);
  useEffect(() => {
    let live = true;
    inboxApi.followUpStats(DAYS).then((s) => { if (live) setStats(s); }).catch(() => { if (live) setStats('failed'); });
    return () => { live = false; };
  }, [refreshKey]);

  if (stats === null) return null;
  const line = stats === 'failed'
    ? 'Follow-up results could not be loaded.'
    : stats.sent === 0
      ? `No follow-ups sent in the last ${DAYS} days${stats.replied_before ? ` · ${stats.replied_before} answered before the nudge was needed` : ''}${stats.pending ? ` · ${stats.pending} waiting` : ''}.`
      : `Last ${DAYS} days: ${stats.sent} sent · ${stats.replied_after} got a reply (${Math.round((stats.replied_after / stats.sent) * 100)}%) · ${stats.replied_before} answered before the nudge${stats.pending ? ` · ${stats.pending} waiting` : ''}${stats.failed ? ` · ${stats.failed} failed` : ''}`;
  return <div className="text-[11px] text-muted-foreground">{line}</div>;
};
