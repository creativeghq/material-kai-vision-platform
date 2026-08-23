/**
 * MentionMonitoringDashboard — admin cross-catalog view of all tracked subjects.
 *
 * Lists every internal-flow tracked_mentions row (api_key_id IS NULL) with per-subject
 * KPIs, and OPENS one.
 *
 * The docstring used to say "admin can click a row to open the per-product tab", and the
 * only affordance was an `Open` link rendered `if (r.product_id)` — pointing at a
 * different page entirely. Every tracked row on this platform has `product_id IS NULL`
 * (they are brand and keyword subjects, which is what the subject flow is for), so the
 * link rendered for none of them: 17 subjects listed, 0 openable, and 636 probe rows
 * behind them with no screen at all.
 *
 * A row now opens `MentionMonitorTab` in a sheet, addressed by `tracked_mention_id`.
 * The product link stays for the rows that have one, because the product page carries
 * everything else about a product.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/core/ui/sheet';
import { Sparkles, RefreshCw, ExternalLink, Bot, Ghost, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FilterBar, useFilters } from '@/components/core/filters';
import {
  TrackedMention, LlmVisibilitySnapshot, getSubjectLlmVisibility,
} from '@/services/mentionMonitoringApi';
import MentionMonitorTab from './MentionMonitorTab';
import { TrackSubjectDialog } from './TrackSubjectDialog';
import { statusTone } from '@/utils/statusTone';
import { buildTrackedMentionFilters } from './mentionFilters';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';

const MentionMonitoringDashboard: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<TrackedMention[]>([]);
  const [loading, setLoading] = useState(true);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<TrackedMention | null>(null);
  const [creating, setCreating] = useState(false);
  /**
   * Latest LLM snapshot per subject, for the list itself.
   *
   * Share of voice and ghost citations are the two numbers this product exists to
   * produce, and they were visible only after drilling into a screen that could not be
   * reached. Fetched per row on load — cheap (a single indexed read of the newest run,
   * no model call) and the list is capped at 500.
   */
  const [visibility, setVisibility] = useState<Record<string, LlmVisibilitySnapshot>>({});

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
      // Best-effort, and per-row: one subject whose snapshot fails must not blank the
      // column for every other subject, so each settles on its own.
      const snapshots = await Promise.all(
        all.map(async (r) => {
          try {
            return [r.id, await getSubjectLlmVisibility({ kind: 'subject', trackedMentionId: r.id })] as const;
          } catch {
            return null;
          }
        }),
      );
      setVisibility(Object.fromEntries(snapshots.filter(Boolean) as [string, LlmVisibilitySnapshot][]));
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
          <div className="flex items-center gap-2">
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-3 w-3 mr-1" /> Track a subject
            </Button>
            <Button onClick={load} disabled={loading} variant="outline">
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Reload
            </Button>
          </div>
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
            loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
            ) : (
              // Two different nothings. `No tracked subjects yet.` was shown for both, so a
              // filter that excluded all 17 rows read as an empty platform — and inviting
              // somebody with 17 subjects to add an eighteenth is how duplicates get made.
              <HubEmptyState
                icon={Sparkles}
                variant={rows.length ? 'filtered' : 'empty'}
                title={rows.length ? 'No subjects match these filters' : 'Nothing is being tracked yet'}
                description={rows.length
                  ? `${rows.length} subject${rows.length === 1 ? ' is' : 's are'} tracked — the current filters exclude ${rows.length === 1 ? 'it' : 'them all'}.`
                  : 'Track a brand or a keyword to see where it turns up in news, blogs and AI answers.'}
                action={rows.length ? (
                  <Button variant="outline" onClick={() => setFilterValues({})}>Clear filters</Button>
                ) : (
                  <Button onClick={() => setCreating(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Track a subject
                  </Button>
                )}
              />
            )
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((r) => (
                <div key={r.id} className="p-4 hover:bg-surface-sunken">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-muted-foreground capitalize">{r.subject_type}</span>
                        {r.is_active ? (
                          <span className={`text-[10px] capitalize ${statusTone('active')}`}>Active</span>
                        ) : (
                          <span className={`text-[10px] capitalize ${statusTone('inactive')}`}>Inactive</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpen(r)}
                          className="font-medium text-sm truncate text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {r.subject_label}
                          {r.product_id && productNames[r.product_id] && r.product_id !== r.subject_label && (
                            <span className="text-muted-foreground"> · {productNames[r.product_id]}</span>
                          )}
                        </button>
                      </div>
                      <div className="text-xs text-muted-foreground space-x-4">
                        <span>7d: <strong>{r.current_mention_count_7d ?? 0}</strong></span>
                        <span>30d: <strong>{r.current_mention_count_30d ?? 0}</strong></span>
                        <span>sentiment: <strong>{r.current_sentiment_avg !== null && r.current_sentiment_avg !== undefined ? r.current_sentiment_avg.toFixed(2) : '—'}</strong></span>
                        <span>cadence: every {r.refresh_interval_hours || 24}h</span>
                        <span>credits: {r.total_credits_used || 0}</span>
                      </div>
                      {visibility[r.id]?.present && (
                        <div className="text-xs text-muted-foreground space-x-4 mt-1 flex flex-wrap items-center gap-y-1">
                          <span className="inline-flex items-center gap-1">
                            <Bot className="h-3 w-3" />
                            AI answers: <strong className="tabular-nums">
                              {Math.round((visibility[r.id].share_of_voice || 0) * 100)}%
                            </strong>
                            {visibility[r.id].avg_position
                              ? <span> · avg #{visibility[r.id].avg_position!.toFixed(1)}</span>
                              : null}
                          </span>
                          {!!visibility[r.id].citations?.ghost_citations && (
                            <span className="inline-flex items-center gap-1">
                              <Ghost className="h-3 w-3" />
                              {visibility[r.id].citations!.ghost_citations} cited without naming you
                            </span>
                          )}
                          {!r.homepage_domain && (
                            // Ghost citations are UNDECIDABLE without it, and the honest
                            // reading of that is "we cannot tell", not "never cited".
                            <span className="text-warning">no homepage domain set</span>
                          )}
                        </div>
                      )}
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

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{open?.subject_label}</SheetTitle>
          </SheetHeader>
          {open && (
            <div className="mt-4">
              {/*
                Addressed by tracked id, not product id. That is the whole point: every
                row here is a brand or keyword subject with no product behind it.
              */}
              <MentionMonitorTab
                subject={{ kind: 'subject', trackedMentionId: open.id }}
                subjectName={open.subject_label}
                manufacturer={open.brand_name}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <TrackSubjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(row) => { setCreating(false); void load(); setOpen(row); }}
      />
    </div>
  );
};

export default MentionMonitoringDashboard;
