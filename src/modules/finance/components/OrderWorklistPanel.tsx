/**
 * The order book as a work queue, not a filter.
 *
 * Quotes had one; orders had status and payment filters and nothing that derived "confirmed,
 * uninvoiced and eleven days old". The state, the action and the severity all come from
 * `get_order_worklist` — this file formats them and never decides one.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { FINANCE_BASE } from '@/modules/finance/routes';
import { formatMoney } from '@/utils/decimal';

interface WorklistRow {
  order_id: string;
  order_number: string | null;
  customer_name: string | null;
  total: number | null;
  currency: string | null;
  age_days: number;
  state: string;
  next_action: string | null;
  detail: string | null;
  severity: string;
  invoice_id: string | null;
}

/** An unrecognised severity falls through to neutral — never to "fine". */
const TONE: Record<string, 'error' | 'warning' | 'neutral'> = {
  attention: 'error', watch: 'warning', none: 'neutral',
};

export const OrderWorklistPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const [rows, setRows] = useState<WorklistRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setError(null);
    const { data, error: err } = await supabase.rpc('get_order_worklist', {
      p_workspace_id: workspaceId, p_limit: 100,
    });
    if (err) { setError(err.message); setRows([]); return; }
    setRows((data ?? []) as WorklistRow[]);
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  if (rows === null) return null;

  // A read that failed is UNKNOWN, not an empty work list. Saying nothing here would read as
  // "nothing to do", which is the one thing this panel exists to stop.
  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-800 dark:text-amber-300" />
          Could not read the order work list: {error}
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) return null;

  const attention = rows.filter((r) => r.severity === 'attention');
  const shown = open ? rows : rows.slice(0, 5);

  return (
    <Card className="dashboard-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Needs action
          {attention.length > 0 && (
            <Badge variant="error" className="text-[10px]">{attention.length} urgent</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {rows.length} order{rows.length === 1 ? '' : 's'} waiting on something. Orders with nothing
          outstanding are not listed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {shown.map((r) => (
          <Link
            key={r.order_id}
            to={`${FINANCE_BASE}/orders/${r.order_id}`}
            className="flex items-start justify-between gap-3 rounded-sm border border-hairline px-3 py-2 hover:bg-surface-hover"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{r.order_number ?? '—'}</span>
                <Badge variant={TONE[r.severity] ?? 'neutral'} className="text-[10px]">
                  {r.next_action}
                </Badge>
                <span className="text-xs text-muted-foreground">{r.age_days}d</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {r.customer_name} — {r.detail}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-xs tabular-nums">
              {formatMoney(r.total, r.currency || 'EUR')}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </Link>
        ))}
        {rows.length > 5 && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setOpen((v) => !v)}>
            {open ? 'Show less' : `Show all ${rows.length}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderWorklistPanel;
