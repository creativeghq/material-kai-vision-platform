/**
 * MentionMonitoringDashboard — admin cross-catalog view of all tracked subjects.
 *
 * Lists every internal-flow tracked_mentions row (api_key_id IS NULL) with
 * per-subject KPIs (7d count, 30d count, sentiment avg, last refreshed,
 * volatility cadence). Admin can click a row to open the per-product tab.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Sparkles, RefreshCw, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FilterBar, useFilters } from '@/components/core/filters';
import { TrackedMention } from '@/services/mentionMonitoringApi';
import { statusTone } from '@/utils/statusTone';
import { buildTrackedMentionFilters } from './mentionFilters';
import { SectionHeader } from '@/components/shared/SectionHeader';

const MentionMonitoringDashboard: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<TrackedMention[]>([]);
  const [loading, setLoading] = useState(true);
  const [productNames, setProductNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tracked_mentions')
        .select('*')
        .is('api_key_id', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const all = (data || []) as TrackedMention[];
      setRows(all);
      const productIds = Array.from(new Set(all.map((r) => r.product_id).filter(Boolean))) as string[];
      if (productIds.length) {
      // A discarded error made every row silently fall back to rendering the raw
      // search_query instead of the product name — an outage that looks like a naming
      // quirk, so nobody reports it.
        const { data: prods, error: prodErr } = await supabase
          .from('products')
          .select('id, name')
          .in('id', productIds);
        if (prodErr) console.error('[MentionMonitoringDashboard] product-name lookup failed:', prodErr.message);
        const map: Record<string, string> = {};
        (prods || []).forEach((p: any) => { map[p.id] = p.name; });
        setProductNames(map);
      }
    } catch (e: any) {
      toast({ title: 'Load failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const filterGroups = useMemo(
    () => buildTrackedMentionFilters(rows, (id) => productNames[id]),
    [rows, productNames],
  );
  const { values: filterValues, setValues: setFilterValues, filtered, previewCount } =
    useFilters<TrackedMention>(rows, filterGroups);

  const totalActive = rows.filter((r) => r.is_active).length;
  const totalMentions7d = rows.reduce((sum, r) => sum + (r.current_mention_count_7d || 0), 0);
  const negativeAlerts = rows.filter((r) => (r.current_sentiment_avg ?? 0) < -0.3).length;

  return (
    <div className="p-6 space-y-6">
      <SectionHeader
        icon={Sparkles}
        title="Mention Monitoring"
        subtitle="All tracked subjects across the catalog: news, blogs, RSS, YouTube, and LLM visibility."
        actions={(
          <Button onClick={load} disabled={loading} variant="outline">
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Reload
          </Button>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="dashboard-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Active subjects</div>
          <div className="text-3xl font-medium">{totalActive}</div>
        </CardContent></Card>
        <Card className="dashboard-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Mentions (7d)</div>
          <div className="text-3xl font-medium">{totalMentions7d}</div>
        </CardContent></Card>
        <Card className="dashboard-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Subjects with negative sentiment trend</div>
          <div className="text-3xl font-medium">{negativeAlerts}</div>
        </CardContent></Card>
      </div>

      <Card className="dashboard-card">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Subjects</CardTitle>
          <FilterBar
            groups={filterGroups}
            values={filterValues}
            onChange={setFilterValues}
            previewCount={previewCount}
            title="Filter tracked subjects"
            searchPlaceholder="Search subjects, brands, products…"
          />
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {loading ? 'Loading...' : 'No tracked subjects yet.'}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((r) => (
                <div key={r.id} className="p-4 hover:bg-white/5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-muted-foreground capitalize">{r.subject_type}</span>
                        {r.is_active ? (
                          <span className={`text-[10px] capitalize ${statusTone('active')}`}>Active</span>
                        ) : (
                          <span className={`text-[10px] capitalize ${statusTone('inactive')}`}>Inactive</span>
                        )}
                        <span className="font-medium text-sm truncate">
                          {r.subject_label}
                          {r.product_id && productNames[r.product_id] && r.product_id !== r.subject_label && (
                            <span className="text-muted-foreground"> · {productNames[r.product_id]}</span>
                          )}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground space-x-4">
                        <span>7d: <strong>{r.current_mention_count_7d ?? 0}</strong></span>
                        <span>30d: <strong>{r.current_mention_count_30d ?? 0}</strong></span>
                        <span>sentiment: <strong>{r.current_sentiment_avg !== null && r.current_sentiment_avg !== undefined ? r.current_sentiment_avg.toFixed(2) : '—'}</strong></span>
                        <span>cadence: every {r.refresh_interval_hours || 24}h</span>
                        <span>credits: {r.total_credits_used || 0}</span>
                      </div>
                    </div>
                    {r.product_id && (
                      <a
                        href={`/admin/materials-data?productId=${r.product_id}`}
                        className="text-xs text-primary hover:underline flex items-center gap-1 whitespace-nowrap"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MentionMonitoringDashboard;
