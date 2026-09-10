/** What work is happening at this building. */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HardHat, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
// The canonical formatter, not the finance re-export — see PropertyCommercialCard.
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { supabase } from '@/integrations/supabase/client';

interface PropertyProject {
  id: string;
  name: string;
  status: string | null;
  deadline: string | null;
  budget_amount: number | null;
  budget_currency: string | null;
  accepted_quote_count: number | null;
  moodboard_count: number | null;
  last_activity_at: string | null;
}

/** A project status maps onto the shared badge vocabulary rather than a private colour map. */
function statusVariant(status: string | null): 'success' | 'warning' | 'info' | 'neutral' {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
    case 'complete':
      return 'success';
    case 'on_hold':
    case 'blocked':
      return 'warning';
    case 'in_progress':
    case 'active':
      return 'info';
    default:
      return 'neutral';
  }
}

export const PropertyProjectsCard: React.FC<{ propertyId: string }> = ({ propertyId }) => {
  const [projects, setProjects] = useState<PropertyProject[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!propertyId) { setProjects([]); return; }
      // Best-effort, like the commercial card beside it: a summary next to the listing must not
      // take the workbench down when it fails to load.
      const { data } = await (supabase as any).rpc('get_property_projects', { p_property_id: propertyId });
      if (cancelled) return;
      setProjects(Array.isArray(data) ? (data as PropertyProject[]) : []);
    })().catch(() => { if (!cancelled) setProjects([]); });
    return () => { cancelled = true; };
  }, [propertyId]);

  if (projects.length === 0) return null;

  return (
    <Card>
      <CardHeader className="border-b border-hairline px-5 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HardHat className="h-4 w-4 text-muted-foreground" /> Work at this property
        </CardTitle>
        <p className="pt-1 text-[11px] text-muted-foreground">
          Budget is the figure entered on the job. Actual revenue and cost are derived on the
          project itself.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {projects.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-2 text-sm last:border-b-0"
          >
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <Link to={`/projects/${p.id}`} className="truncate font-medium hover:underline">
                {p.name}
              </Link>
              <Badge variant={statusVariant(p.status)}>{p.status ?? 'unknown'}</Badge>
              {p.deadline && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3 w-3" /> {formatDate(p.deadline)}
                </span>
              )}
              {(p.accepted_quote_count ?? 0) > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {p.accepted_quote_count} accepted quote{p.accepted_quote_count === 1 ? '' : 's'}
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {p.budget_amount === null
                ? '—'
                : formatMoney(Number(p.budget_amount), p.budget_currency || 'EUR')}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
