import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, AlertTriangle } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/decimal';

interface ChannelRow {
  platform: string;
  orders: number;
  revenue: number;
  cogs: number;
  margin: number;
  fees: number;
  documents_issued: number;
  unmatched_lines: number;
  unmatched_value: number;
  margin_status: 'ok' | 'partial' | 'unknown' | string;
  margin_note: string | null;
}

export const ChannelOverviewCard: React.FC<{ workspaceId: string; days?: number }> = ({
  workspaceId, days = 30,
}) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_channel_overview', {
      p_workspace_id: workspaceId, p_days: days,
    });
    if (error) {
      toast({ title: 'Could not load the channel comparison', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((data ?? []) as ChannelRow[]);
    setLoaded(true);
  }, [workspaceId, days, toast]);

  useEffect(() => { void load(); }, [load]);

  if (loaded && rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" aria-hidden="true" /> Channel comparison</CardTitle>
        <CardDescription>
          The last {days} days per channel. Margin is revenue less the cost on the lines and the commission
          on the payouts — so it is only a fact when the lines actually carry a cost.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <HubEmptyState icon={BarChart3} title="No channel orders yet" description="Once a channel delivers orders, this compares them side by side." />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken">
                <tr className="text-left">
                  <th className="px-3 py-2 text-[11px] font-semibold">Channel</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold">Orders</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold">Revenue</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold">Cost</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold">Fees</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold">Margin</th>
                  <th className="px-3 py-2 text-[11px] font-semibold">Documents</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <React.Fragment key={r.platform}>
                    <tr className="border-t border-hairline">
                      <td className="px-3 py-2 font-medium">{r.platform}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.orders}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.revenue, 'EUR')}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.margin_status === 'unknown' ? '—' : formatMoney(r.cogs, 'EUR')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.fees, 'EUR')}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.margin_status === 'unknown'
                          ? <Badge variant="warning" className="text-[10px]">unknown</Badge>
                          : (
                            <span className="inline-flex items-center gap-1">
                              {formatMoney(r.margin, 'EUR')}
                              {r.margin_status === 'partial' && <Badge variant="warning" className="text-[10px]">partial</Badge>}
                            </span>
                          )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.documents_issued} of {r.orders}</td>
                    </tr>
                    {r.margin_note && (
                      <tr>
                        <td colSpan={7} className="px-3 pb-2">
                          <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{r.margin_note}</span>
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
