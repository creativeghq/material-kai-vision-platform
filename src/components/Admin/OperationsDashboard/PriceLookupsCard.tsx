/**
 * Price Lookups analytics card.
 *
 * Reads from agent_tool_call_logs filtered by tool_name = 'price_lookup'.
 * Shows: total lookups, success rate, no-match rate, recent calls.
 *
 * Commit rate (how often admin clicked "Use this price" vs abandoned) is
 * inferred from quote_items.price_lookup_call_id and product_prices.price_lookup_call_id —
 * any call referenced by either table counts as committed.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, FileText, Loader2, TrendingUp, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface PriceLookupRow {
  id: string;
  created_at: string;
  user_id: string | null;
  workspace_id: string | null;
  tool_args: any;
  result_summary: any;
  result_count: number | null;
  zero_result: boolean | null;
  duration_ms: number | null;
  success: boolean | null;
}

export const PriceLookupsCard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PriceLookupRow[]>([]);
  const [committedIds, setCommittedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: callRows } = await supabase
          .from('agent_tool_call_logs')
          .select('id, created_at, user_id, workspace_id, tool_args, result_summary, result_count, zero_result, duration_ms, success')
          .eq('tool_name', 'price_lookup')
          .order('created_at', { ascending: false })
          .limit(200);

        const calls = (callRows || []) as PriceLookupRow[];
        setRows(calls);

        if (calls.length > 0) {
          const ids = calls.map((r) => r.id);
          const [qi, pp] = await Promise.all([
            supabase.from('quote_items').select('price_lookup_call_id').in('price_lookup_call_id', ids),
            supabase.from('product_prices').select('price_lookup_call_id').in('price_lookup_call_id', ids),
          ]);
          const committed = new Set<string>();
          (qi.data || []).forEach((r: any) => r.price_lookup_call_id && committed.add(r.price_lookup_call_id));
          (pp.data || []).forEach((r: any) => r.price_lookup_call_id && committed.add(r.price_lookup_call_id));
          setCommittedIds(committed);
        }
      } catch (err) {
        console.error('Failed to load price lookups analytics', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const successful = rows.filter((r) => r.success !== false).length;
    const noMatch = rows.filter((r) => r.zero_result === true).length;
    const committed = rows.filter((r) => committedIds.has(r.id)).length;
    const avgLatency = total > 0
      ? Math.round(rows.reduce((s, r) => s + (r.duration_ms || 0), 0) / total)
      : 0;
    const commitRate = successful > 0 ? Math.round((committed / successful) * 100) : 0;
    const noMatchRate = total > 0 ? Math.round((noMatch / total) * 100) : 0;
    return { total, successful, noMatch, committed, avgLatency, commitRate, noMatchRate };
  }, [rows, committedIds]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Price Lookups <span className="text-xs font-normal text-muted-foreground">(AI mode)</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tracks admin-triggered agent price lookups. Quick-pick lookups bypass the agent and are not included here.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading analytics…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No price lookups yet. The metrics populate once admins start using the "Get price" button.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <Stat label="Total lookups" value={stats.total} />
              <Stat label="Committed" value={stats.committed} hint={`${stats.commitRate}% rate`} />
              <Stat label="No match" value={stats.noMatch} hint={`${stats.noMatchRate}% rate`} tone={stats.noMatchRate > 30 ? 'warning' : 'default'} />
              <Stat label="Avg latency" value={`${stats.avgLatency}ms`} />
              <Stat label="Successful" value={stats.successful} />
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent lookups</h4>
              <div className="divide-y">
                {rows.slice(0, 15).map((r) => {
                  const args = r.tool_args || {};
                  const isCommitted = committedIds.has(r.id);
                  return (
                    <div key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate">
                          <span className="font-medium">{args.product_name || 'Unknown'}</span>
                          {args.sku ? <span className="text-muted-foreground"> · {args.sku}</span> : null}
                          {args.manufacturer ? <span className="text-muted-foreground"> · {args.manufacturer}</span> : null}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.zero_result ? (
                          <span className="inline-flex items-center text-xs text-amber-600 dark:text-amber-400">
                            <XCircle className="h-3 w-3 mr-1" />
                            no match
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            {r.result_count ?? 0} match{(r.result_count ?? 0) === 1 ? '' : 'es'}
                          </Badge>
                        )}
                        {isCommitted && (
                          <span className="inline-flex items-center text-xs text-emerald-600 dark:text-emerald-400">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            used
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const Stat: React.FC<{ label: string; value: string | number; hint?: string; tone?: 'default' | 'warning' }> = ({
  label,
  value,
  hint,
  tone = 'default',
}) => (
  <div className="rounded-lg border p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`text-xl font-semibold ${tone === 'warning' ? 'text-amber-400' : 'text-foreground'}`}>
      {value}
    </div>
    {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
  </div>
);

export default PriceLookupsCard;
