/**
 * The order book as a work queue, not a filter.
 *
 * Quotes had one; orders had status and payment filters and nothing that derived "confirmed,
 * uninvoiced and eleven days old". The state, the action and the severity all come from
 * `get_order_worklist` — this file formats them and never decides one.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, EyeOff, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { FINANCE_BASE } from '@/modules/finance/routes';
import { formatDate } from '@/utils/datetime';
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

interface DismissedRow {
  order_id: string;
  order_number: string | null;
  customer_name: string | null;
  total: number | null;
  currency: string | null;
  dismissed_at: string;
  reason: string | null;
}

/** An unrecognised severity falls through to neutral — never to "fine". */
const TONE: Record<string, 'error' | 'warning' | 'neutral'> = {
  attention: 'error', watch: 'warning', none: 'neutral',
};

export const OrderWorklistPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  // The RPCs gate on is_workspace_finance_manager (owner/admin). isAccountant was the wrong
  // twin: it offered Hide to sales and warehouse, who get refused, and hid it from nobody else.
  const { isWorkspaceManager } = usePermissions();
  const readOnly = !isWorkspaceManager;
  const [rows, setRows] = useState<WorklistRow[] | null>(null);
  const [hidden, setHidden] = useState<DismissedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setError(null);
    const [list, gone] = await Promise.all([
      supabase.rpc('get_order_worklist', { p_workspace_id: workspaceId, p_limit: 100 }),
      (supabase as any).rpc('get_order_worklist_dismissed', { p_workspace_id: workspaceId }),
    ]);
    if (list.error) { setError(list.error.message); setRows([]); return; }
    setRows((list.data ?? []) as WorklistRow[]);
    // get_order_worklist already filters these out, so a failed read here makes them vanish from
    // BOTH lists. Say so rather than showing a shorter queue.
    if (gone?.error) { setError(gone.error.message); setHidden([]); return; }
    setHidden((gone?.data ?? []) as DismissedRow[]);
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const dismiss = async (row: WorklistRow) => {
    setBusy(row.order_id);
    try {
      const { error: err } = await (supabase as any).rpc('dismiss_order_from_worklist', {
        p_order_id: row.order_id, p_reason: null,
      });
      if (err) throw err;
      toast({
        title: `${row.order_number ?? 'Order'} hidden from this list`,
        description: 'The order itself is untouched. Restore it from "hidden" below.',
      });
      await load();
    } catch (e) {
      toast({ title: 'Could not hide it', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const restore = async (row: DismissedRow) => {
    setBusy(row.order_id);
    try {
      const { error: err } = await (supabase as any).rpc('restore_order_to_worklist', { p_order_id: row.order_id });
      if (err) throw err;
      await load();
    } catch (e) {
      toast({ title: 'Could not restore it', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(null); }
  };

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

  // "No work" and "work you told me to stop showing" must not render identically.
  if (rows.length === 0 && hidden.length === 0) return null;

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
          {hidden.length > 0 && (
            <>
              {' '}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setShowHidden((v) => !v)}
              >
                {hidden.length} hidden
              </button>
              {' '}by you.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {shown.map((r) => (
          <div key={r.order_id} className="flex items-stretch gap-1">
            <Link
              to={`${FINANCE_BASE}/orders/${r.order_id}`}
              className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-sm border border-hairline px-3 py-2 hover:bg-surface-hover"
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
            {!readOnly && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto shrink-0 px-2 text-muted-foreground hover:text-foreground"
                disabled={busy === r.order_id}
                title="Hide from this list — you are not going to invoice this one"
                aria-label={`Hide ${r.order_number ?? 'this order'} from Needs action`}
                onClick={() => void dismiss(r)}
              >
                <EyeOff className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {rows.length > 5 && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setOpen((v) => !v)}>
            {open ? 'Show less' : `Show all ${rows.length}`}
          </Button>
        )}

        {showHidden && hidden.length > 0 && (
          <div className="mt-2 space-y-1.5 border-t border-hairline pt-2">
            <p className="text-[11px] text-muted-foreground">
              Hidden from this list. The orders themselves are untouched and still in the order book.
            </p>
            {hidden.map((h) => (
              <div key={h.order_id} className="flex items-center justify-between gap-3 rounded-sm border border-hairline px-3 py-1.5">
                <div className="min-w-0">
                  <Link to={`${FINANCE_BASE}/orders/${h.order_id}`} className="font-mono text-xs text-primary hover:underline">
                    {h.order_number ?? '—'}
                  </Link>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {h.customer_name} · hidden {formatDate(h.dismissed_at)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs tabular-nums">{formatMoney(h.total, h.currency || 'EUR')}</span>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={busy === h.order_id}
                      onClick={() => void restore(h)}
                    >
                      <Undo2 className="mr-1 h-3.5 w-3.5" /> Restore
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderWorklistPanel;
