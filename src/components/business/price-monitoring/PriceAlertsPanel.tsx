/**
 * Price alert history — what the notification dispatcher actually fired, for whom, and whether
 * every channel got through.
 *
 * This was a hardcoded empty state with a "New Alert" button that did nothing: it always read
 * "No price alerts configured yet" even when alerts had fired. It now reads `price_alert_log`
 * (RLS: your own rows, or everything for an admin). There is deliberately no create action —
 * an alert is not a standalone object. Which alerts fire is a per-tracked-product setting
 * (`tracked_queries.alert_on_price_drop` / `_new_retailer` / `_promo` + `alert_channels`),
 * edited on that product's Monitoring tab.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { FilterBar, useFilters } from '@/components/core/filters';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { listPriceAlerts, type PriceAlertLogRow } from './priceAlertsService';
import { buildPriceAlertFilters, alertTypeLabel } from './priceAlertFilters';

const TYPE_TONE: Record<string, string> = {
  price_drop: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  new_retailer: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  promo_started: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  anomaly_detected: 'bg-destructive/10 text-destructive border-destructive/30',
};

interface PriceAlertsPanelProps {
  onRefresh: () => void;
}

export const PriceAlertsPanel: React.FC<PriceAlertsPanelProps> = ({ onRefresh }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PriceAlertLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listPriceAlerts());
    } catch (err: any) {
      toast({ title: 'Failed to load price alerts', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => buildPriceAlertFilters(rows), [rows]);
  const { values, setValues, filtered, previewCount } = useFilters<PriceAlertLogRow>(rows, groups);

  // A narrowed set is a different list — don't strand the reader on a page that no longer exists.
  useEffect(() => { setPage(1); }, [values]);
  useEffect(() => { setPage((p) => clampPage(p, filtered.length)); }, [filtered.length]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Price Alerts</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Alerts already sent. Choose which ones fire on each product&apos;s Monitoring tab.
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={loading} onClick={() => { void load(); onRefresh(); }}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length > 0 && (
          <FilterBar
            groups={groups}
            values={values}
            onChange={setValues}
            previewCount={previewCount}
            title="Filter price alerts"
            searchPlaceholder="Search retailer…"
          />
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-muted-foreground">No price alerts have fired yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Enable alerts on a monitored product and they show up here once a price moves.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No alerts match the filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Fired</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Retailer</th>
                  <th className="px-3 py-2 text-left">Channels</th>
                  <th className="px-3 py-2 text-right">Credits</th>
                </tr>
              </thead>
              <tbody>
                {paginate(filtered, page).map((a) => (
                  <tr key={a.id} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={`text-[10px] ${TYPE_TONE[a.alert_type] ?? ''}`}>
                        {alertTypeLabel(a.alert_type)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div>{a.retailer_name ?? '—'}</div>
                      {a.retailer_domain && <div className="text-xs text-muted-foreground">{a.retailer_domain}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(a.channels_fired ?? []).map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                        ))}
                        {/* Skipped channels are the actionable signal — usually out of credits. */}
                        {(a.channels_skipped ?? []).map((c) => (
                          <Badge key={c} variant="outline" className="border-destructive/40 text-[10px] text-destructive" title="Channel skipped">
                            {c} skipped
                          </Badge>
                        ))}
                        {(a.channels_fired ?? []).length === 0 && (a.channels_skipped ?? []).length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.credits_charged ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination page={page} total={filtered.length} onPageChange={setPage} label="alerts" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PriceAlertsPanel;
