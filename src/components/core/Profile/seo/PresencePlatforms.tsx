import React from 'react';

import { Badge } from '@/components/core/ui/badge';
import { safeHref } from '@/utils/safeUrl';

export interface PresenceVerdict {
  platform: 'youtube' | 'reddit' | 'pinterest' | 'trustpilot';
  status: 'present' | 'absent' | 'collector_failed';
  note: string;
  matches: number;
  actions: { text: string; url?: string; keyword?: string }[];
  errors: string[];
}

const LABEL: Record<PresenceVerdict['platform'], string> = { youtube: 'YouTube', reddit: 'Reddit', pinterest: 'Pinterest', trustpilot: 'Trustpilot' };
const STATUS: Record<PresenceVerdict['status'], { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  present: { label: 'Present', tone: 'success' },
  absent: { label: 'Absent', tone: 'warning' },
  collector_failed: { label: 'Unknown', tone: 'neutral' },
};

/** One row per platform: the verdict, why, and what to do. A failed lookup reads Unknown, never Absent. */
export const PresencePlatforms: React.FC<{ platforms: PresenceVerdict[] }> = ({ platforms }) => (
  <div className="divide-y divide-hairline rounded-sm border border-hairline">
    {platforms.map((p) => {
      const s = STATUS[p.status] ?? STATUS.collector_failed;
      return (
        <div key={p.platform} className="space-y-1.5 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{LABEL[p.platform] ?? p.platform}</span>
            <Badge variant={s.tone}>{s.label}</Badge>
            <span className="text-xs text-muted-foreground">{p.note}</span>
          </div>
          {p.actions.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs">
              {p.actions.map((a, i) => (
                <li key={i}>
                  {a.url && safeHref(a.url) ? <a className="text-primary underline" href={safeHref(a.url)} target="_blank" rel="noreferrer">{a.text}</a> : a.text}
                </li>
              ))}
            </ul>
          )}
          {p.status !== 'collector_failed' && p.errors.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Not searched: {p.errors.join('; ')}</p>
          )}
        </div>
      );
    })}
  </div>
);
