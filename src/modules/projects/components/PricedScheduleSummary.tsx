/** Finance's read-only view of the bill; the bill itself is edited in Specification → Bill (#532). */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListOrdered, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { humanizeLabel } from '@/utils/humanize';
import { schedulesService, type ProjectSchedule } from '../services/schedulesService';
import { projectSectionPath, goToSectionLabel } from '../projectSections';

export const PricedScheduleSummary: React.FC<{ projectId: string }> = ({ projectId }) => {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState<ProjectSchedule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    schedulesService.list(projectId)
      .then((s) => { if (!cancelled) setSchedules(s); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-hairline px-5 py-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2"><ListOrdered className="h-4 w-4 text-primary" /> Priced schedule</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            The bill of quantities the cost report reconciles against. It is edited under Specification.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate(projectSectionPath(projectId, 'bill'))}>
          {goToSectionLabel('bill')} <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="px-5 py-3 text-sm">
        {error ? (
          <p className="text-destructive">{error}</p>
        ) : schedules === null ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : schedules.length === 0 ? (
          <p className="text-muted-foreground">No priced schedule yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {schedules.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5">
                {s.name}
                {s.is_contract && <Badge variant="info">contract</Badge>}
                <Badge variant={s.status === 'accepted' ? 'success' : 'neutral'}>{humanizeLabel(s.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
