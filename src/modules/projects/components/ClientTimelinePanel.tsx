import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { formatDate } from '@/utils/datetime';
import { humanizeLabel } from '@/utils/humanize';
import { projectsService, type ClientTimelineItem } from '../services/projectsService';

const KIND_LABEL: Record<ClientTimelineItem['kind'], string> = {
  request: 'Request',
  inspection: 'Inspection',
  snag: 'Snag',
};

export const ClientTimelinePanel: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [items, setItems] = useState<ClientTimelineItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setFailed(false);
    projectsService.getClientTimeline(projectId)
      .then((r) => { if (!cancelled) setItems(r); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (failed) {
    return (
      <p className="text-sm text-amber-800 dark:text-amber-300">
        Recent activity could not be loaded. It is unknown, not empty.
      </p>
    );
  }
  if (!items || items.length === 0) return null;

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-medium"><Activity className="h-4 w-4 text-primary" />Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-hairline">
          {items.slice(0, 15).map((i) => (
            <li key={`${i.kind}-${i.id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Badge variant="neutral">{KIND_LABEL[i.kind]}</Badge>
                <span className="truncate">{i.title}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{humanizeLabel(i.status)} · {formatDate(i.at)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
