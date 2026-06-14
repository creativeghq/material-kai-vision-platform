/**
 * Pipeline Strategy Metrics panel.
 *
 * Reads from `pipeline_strategy_metrics` — the per-stage distribution log
 * the 2026-05-01 audit added. Surfaces:
 *   - chunking strategy distribution (which path actually fired per product:
 *     product_layout_regions_cache vs document_layout_cache vs text_fallback)
 *   - Stage 1.5 failed-page count aggregated from `notes.stage_1_5_failed_pages`
 *
 * Operators need this to spot regressions where Stage 1.5 starts silently
 * failing and the chunker falls back to text-only — quality drops in search
 * results before anyone notices, because the pipeline keeps "succeeding".
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';

interface PipelineStrategyRow {
  id: string;
  job_id: string | null;
  document_id: string | null;
  product_id: string | null;
  page_number: number | null;
  metric_kind: string;
  metric_value: string;
  notes: Record<string, any> | null;
  created_at: string;
}

const STRATEGY_COLORS: Record<string, string> = {
  product_layout_regions_cache: 'bg-green-500/15 text-green-400 border-green-500/30',
  document_layout_cache: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  text_fallback: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

export const PipelineStrategyMetricsPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PipelineStrategyRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Last 30 days, capped at 1000 rows.
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);

        const { data, error: queryError } = await supabase
          .from('pipeline_strategy_metrics')
          .select('id, job_id, document_id, product_id, page_number, metric_kind, metric_value, notes, created_at')
          .gte('created_at', cutoff.toISOString())
          .order('created_at', { ascending: false })
          .limit(1000);

        if (queryError) {
          setError(queryError.message);
          return;
        }

        setRows((data as PipelineStrategyRow[]) || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load pipeline strategy metrics');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Aggregate chunking-strategy distribution.
  const chunkingDistribution = useMemo(() => {
    const buckets: Record<string, number> = {};
    rows
      .filter((r) => r.metric_kind === 'chunking_strategy')
      .forEach((r) => {
        const k = r.metric_value || 'unknown';
        buckets[k] = (buckets[k] || 0) + 1;
      });
    return Object.entries(buckets)
      .map(([strategy, count]) => ({ strategy, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  // Stage 1.5 failed-page count, summed from notes.stage_1_5_failed_pages.
  // Each chunking_strategy row stamps how many Stage 1.5 failures were
  // observed for that product. Summing across products is the closest we can
  // get to "how many page-level failures happened in this window" without
  // double-counting (Stage 1.5 runs once per document, so the same failure
  // count is reported by every product on that document).
  // To approximate uniqueness, group by document_id and take max per doc.
  const stage15FailureByDoc = useMemo(() => {
    const byDoc: Record<string, { failures: number; total: number; products: number }> = {};
    rows
      .filter((r) => r.metric_kind === 'chunking_strategy' && r.document_id)
      .forEach((r) => {
        const docId = r.document_id as string;
        const failures = Number(r.notes?.stage_1_5_failed_pages || 0);
        const total = Number(r.notes?.total_pages || 0);
        if (!byDoc[docId]) {
          byDoc[docId] = { failures: 0, total: 0, products: 0 };
        }
        // Use max() across products of the same doc — same Stage 1.5 run.
        byDoc[docId].failures = Math.max(byDoc[docId].failures, failures);
        byDoc[docId].total = Math.max(byDoc[docId].total, total);
        byDoc[docId].products += 1;
      });
    return byDoc;
  }, [rows]);

  const stage15Totals = useMemo(() => {
    const docs = Object.values(stage15FailureByDoc);
    const totalDocs = docs.length;
    const docsWithFailures = docs.filter((d) => d.failures > 0).length;
    const totalFailedPages = docs.reduce((sum, d) => sum + d.failures, 0);
    const totalPages = docs.reduce((sum, d) => sum + d.total, 0);
    return {
      totalDocs,
      docsWithFailures,
      totalFailedPages,
      totalPages,
      failureRate: totalPages > 0 ? (totalFailedPages / totalPages) * 100 : 0,
    };
  }, [stage15FailureByDoc]);

  const docsWithFailures = useMemo(() => {
    return Object.entries(stage15FailureByDoc)
      .filter(([, d]) => d.failures > 0)
      .map(([docId, d]) => ({ docId, ...d }))
      .sort((a, b) => b.failures - a.failures)
      .slice(0, 20);
  }, [stage15FailureByDoc]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-3 text-sm text-muted-foreground">Loading pipeline strategy metrics…</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-sm text-red-400">Failed to load pipeline strategy metrics: {error}</div>
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Pipeline Strategy Metrics
          </CardTitle>
          <CardDescription>Chunking strategy distribution and Stage 1.5 failure rate over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground text-sm">
            No pipeline strategy metrics recorded in the last 30 days. Run a PDF processing job to populate.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chunking strategy distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Chunking Strategy Distribution
          </CardTitle>
          <CardDescription>
            Which chunking path fired per product over the last 30 days.{' '}
            <span className="text-amber-400">text_fallback</span> means Stage 1.5 layout
            wasn&apos;t usable for that product — track this trending up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chunkingDistribution.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No chunking_strategy metrics yet.
            </div>
          ) : (
            <>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chunkingDistribution} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="strategy"
                      stroke="rgba(255,255,255,0.5)"
                      style={{ fontSize: 11 }}
                      angle={-15}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis stroke="rgba(255,255,255,0.5)" style={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="count" fill="#386BB7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {chunkingDistribution.map((d) => (
                  <Badge
                    key={d.strategy}
                    variant="outline"
                    className={STRATEGY_COLORS[d.strategy] || 'bg-white/5 text-foreground border-white/10'}
                  >
                    {d.strategy}: {d.count}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stage 1.5 failure surface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Stage 1.5 Failure Surface
          </CardTitle>
          <CardDescription>
            Pages where Stage 1.5 (doc-level layout precompute) failed and the chunker
            fell back to text-only. Aggregated per document; same failure count from
            multiple products on one doc is collapsed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Documents (30d)</div>
              <div className="text-2xl font-bold text-foreground">{stage15Totals.totalDocs}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Docs w/ Failures</div>
              <div className="text-2xl font-bold text-amber-400">{stage15Totals.docsWithFailures}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Failed Pages</div>
              <div className="text-2xl font-bold text-red-400">{stage15Totals.totalFailedPages}</div>
              <div className="text-[9px] text-muted-foreground mt-0.5">of {stage15Totals.totalPages} total</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Failure Rate</div>
              <div className="text-2xl font-bold text-foreground">{stage15Totals.failureRate.toFixed(2)}%</div>
            </div>
          </div>

          {docsWithFailures.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead className="text-right">Failed Pages</TableHead>
                  <TableHead className="text-right">Total Pages</TableHead>
                  <TableHead className="text-right">Failure %</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docsWithFailures.map((d) => {
                  const pct = d.total > 0 ? (d.failures / d.total) * 100 : 0;
                  return (
                    <TableRow key={d.docId}>
                      <TableCell className="font-mono text-xs">{d.docId.slice(0, 8)}…</TableCell>
                      <TableCell className="text-right tabular-nums text-red-400 font-medium">
                        {d.failures}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.total}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge
                          variant="outline"
                          className={
                            pct >= 25
                              ? 'bg-red-500/15 text-red-400 border-red-500/30'
                              : pct >= 10
                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                : 'bg-white/5 text-foreground border-white/10'
                          }
                        >
                          {pct.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.products}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-6 text-sm text-green-400 flex items-center justify-center gap-2">
              <Activity className="h-4 w-4" />
              No Stage 1.5 failures in the last 30 days.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
