/**
 * Document Health Panel — shown inside the AsyncJobQueueMonitor job detail
 * modal as a third tab once a job has finished.
 *
 * Calls the MIVAA observability endpoint:
 *   GET /api/internal/document-extraction-status/{document_id}
 *
 * Displays:
 *   - Layer 1 (catalog layout) + Layer 2 (catalog legends) run state
 *   - Legend types detected on the document
 *   - Global certifications propagated catalog-wide
 *   - Per-product coverage buckets (how many products in each % bucket)
 *   - Average coverage across the whole document
 *   - A sample of products with missing critical fields + source breakdown
 *     (which tier populated each field: chunk_regex / vision_rollup /
 *     pymupdf_text_dict / claude_opus_vision / catalog_legend / ...)
 *   - A list of detected issues with suggested remediation
 *
 * This is a reusable admin tool — it works for any document processed by
 * the reusable Layer 1/2/3 pipeline, not just the one catalog under review.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import { Button } from '@/components/core/ui/button';
import { RefreshCw, CheckCircle2, AlertTriangle, Package, Award, FileText, Eye } from 'lucide-react';
import { mivaaApi } from '@/services/mivaaApiClient';

interface ProductCoverage {
  id: string;
  name: string;
  populated_fields: number;
  missing_critical: string[];
  source_breakdown: Record<string, number>;
}

interface DocumentHealthData {
  success: boolean;
  document_id: string;
  filename: string | null;
  catalog_layout_analyzed: boolean;
  legends_extracted: boolean;
  layout_stats: {
    legend_pages?: number;
    product_spec_pages?: number;
    product_photo_pages?: number;
    named_products_detected?: number;
  } | null;
  legend_types_found: string[];
  global_certifications: string[];
  total_products: number;
  average_coverage_pct: number;
  products_by_coverage: Record<string, number>;
  issues: string[];
  products_sample: ProductCoverage[];
}

interface Props {
  documentId: string;
}

// Pretty name + color per extraction source
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  ai_text_extraction:    { label: 'AI Text (Stage 0)',     color: 'bg-purple-100 text-purple-800 border-purple-200' },
  chunk_regex:           { label: 'Chunk Regex',           color: 'bg-blue-100 text-blue-800 border-blue-200' },
  vision_rollup:         { label: 'Image Vision Rollup',   color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  pymupdf_text_dict:     { label: 'PyMuPDF Tier A',        color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  claude_spec_vision:    { label: 'Claude Spec Vision',    color: 'bg-amber-100 text-amber-800 border-amber-200' },
  claude_opus_vision:    { label: 'Claude Opus Tier B',    color: 'bg-amber-100 text-amber-800 border-amber-200' },
  catalog_legend:        { label: 'Catalog Legend Tier C', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  unknown:               { label: 'Unknown',               color: 'bg-slate-100 text-slate-800 border-slate-200' },
};

export const DocumentHealthPanel: React.FC<Props> = ({ documentId }) => {
  const [data, setData] = useState<DocumentHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await mivaaApi.getDocumentExtractionStatus(documentId);
      if (resp.success) {
        setData(resp.data as DocumentHealthData);
      } else {
        setError(resp.error || resp.message || 'Failed to load health data');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const rerunCatalogKnowledge = async () => {
    setRerunning(true);
    try {
      await mivaaApi.runCatalogKnowledge(documentId, true);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Re-run failed');
    } finally {
      setRerunning(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Loading extraction status…</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={load}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const avgPct = Math.round(data.average_coverage_pct);
  const healthColor =
    avgPct >= 75 ? 'text-emerald-600' :
    avgPct >= 50 ? 'text-amber-600' :
    'text-red-600';

  return (
    <div className="space-y-6">
      {/* Header summary — big number + action buttons */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Average Product Coverage
          </p>
          <p className={`text-4xl font-bold ${healthColor} mt-1`}>
            {avgPct}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            across {data.total_products} product{data.total_products === 1 ? '' : 's'} in this document
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={rerunCatalogKnowledge}
            disabled={rerunning}
            title="Re-run Layer 1 (layout) + Layer 2 (legends) against this document"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${rerunning ? 'animate-spin' : ''}`} />
            Re-run Catalog Knowledge
          </Button>
        </div>
      </div>

      {/* Issues — when present, surfaced at the top */}
      {data.issues.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription>
            <p className="font-semibold text-amber-800 mb-1">
              {data.issues.length} issue{data.issues.length === 1 ? '' : 's'} detected
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-900">
              {data.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Pipeline stage cards: Layer 1 / Layer 2 run state */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Layer 1 — Catalog Layout
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              {data.catalog_layout_analyzed ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs text-emerald-700 font-semibold">Analyzed</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-xs text-red-700 font-semibold">Not run</span>
                </>
              )}
            </div>
            {data.layout_stats && (
              <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                <div className="bg-muted/30 rounded p-2">
                  <p className="text-muted-foreground">Product spec pages</p>
                  <p className="font-semibold text-sm">{data.layout_stats.product_spec_pages ?? 0}</p>
                </div>
                <div className="bg-muted/30 rounded p-2">
                  <p className="text-muted-foreground">Product photo pages</p>
                  <p className="font-semibold text-sm">{data.layout_stats.product_photo_pages ?? 0}</p>
                </div>
                <div className="bg-muted/30 rounded p-2">
                  <p className="text-muted-foreground">Legend pages</p>
                  <p className="font-semibold text-sm">{data.layout_stats.legend_pages ?? 0}</p>
                </div>
                <div className="bg-muted/30 rounded p-2">
                  <p className="text-muted-foreground">Products detected</p>
                  <p className="font-semibold text-sm">{data.layout_stats.named_products_detected ?? 0}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Award className="h-4 w-4 text-purple-600" />
              Layer 2 — Catalog Legends
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              {data.legends_extracted ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs text-emerald-700 font-semibold">Extracted</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-xs text-red-700 font-semibold">Not run</span>
                </>
              )}
            </div>
            {data.legend_types_found.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Legend types found</p>
                <div className="flex flex-wrap gap-1">
                  {data.legend_types_found.map(t => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="text-[10px] capitalize bg-purple-50 border-purple-200 text-purple-800"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {data.global_certifications.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">
                  Global certifications ({data.global_certifications.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {data.global_certifications.slice(0, 6).map(c => (
                    <Badge
                      key={c}
                      variant="outline"
                      className="text-[10px] bg-emerald-50 border-emerald-200 text-emerald-800"
                    >
                      {c}
                    </Badge>
                  ))}
                  {data.global_certifications.length > 6 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{data.global_certifications.length - 6}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coverage bucket chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-600" />
            Products by coverage bucket
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(['75-100%', '50-75%', '25-50%', '0-25%'] as const).map(bucket => {
              const count = data.products_by_coverage[bucket] ?? 0;
              const total = data.total_products || 1;
              const pct = Math.round((count / total) * 100);
              const barColor =
                bucket === '75-100%' ? 'bg-emerald-500' :
                bucket === '50-75%' ? 'bg-blue-500' :
                bucket === '25-50%' ? 'bg-amber-500' :
                'bg-red-500';
              return (
                <div key={bucket} className="flex items-center gap-3">
                  <span className="text-xs font-semibold w-16 text-muted-foreground">{bucket}</span>
                  <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden">
                    <div
                      className={`h-full ${barColor} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold w-20 text-right">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Per-product drilldown */}
      {data.products_sample.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-600" />
              Per-product extraction detail
              <Badge variant="outline" className="ml-2 text-[10px]">
                showing {data.products_sample.length} of {data.total_products}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.products_sample.map(p => (
                <div key={p.id} className="border rounded-lg p-3 bg-muted/10">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.populated_fields} fields populated
                      </p>
                    </div>
                    {p.missing_critical.length === 0 ? (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        All critical fields present
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">
                        {p.missing_critical.length} missing
                      </span>
                    )}
                  </div>

                  {/* Source breakdown chips */}
                  {Object.keys(p.source_breakdown).length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {Object.entries(p.source_breakdown).map(([src, count]) => {
                        const meta = SOURCE_LABELS[src] ?? SOURCE_LABELS.unknown;
                        return (
                          <Badge
                            key={src}
                            variant="outline"
                            className={`text-[10px] ${meta.color}`}
                          >
                            {meta.label}: {count}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {/* Missing critical fields */}
                  {p.missing_critical.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                        Missing critical fields
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {p.missing_critical.map(f => (
                          <code
                            key={f}
                            className="text-[10px] bg-red-50 text-red-700 border border-red-200 rounded px-1.5 py-0.5"
                          >
                            {f}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
