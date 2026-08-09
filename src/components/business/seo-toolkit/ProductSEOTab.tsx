/**
 * ProductSEOTab — per-product SEO panel mounted on ProductDetailModal.
 *
 * Auto-derives a target keyword from `product.name + manufacturer + category`
 * and fires three reads in parallel:
 *   1. seo_research_keyword (full SERP signals + AI Overview + featured snippet)
 *   2. seo_ranked_keywords for the manufacturer's homepage_domain (when set)
 *   3. seo_domain_snapshot for the manufacturer's homepage_domain
 *
 * Caches results 24h via seo_research_runs lookup so revisiting the modal
 * doesn't re-fire DataForSEO. "Refresh" button bypasses cache.
 *
 * Mounts as a TabsContent inside ProductDetailModal.tsx (admin-only, mirrors
 * the MentionMonitorTab pattern). For non-admin users we hide the tab.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, ExternalLink, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';
import { SEOResearchCard } from '@/components/features/ai/SEOResearchCard';
import { SEOGenericCard } from '@/components/features/ai/SEOGenericCard';
import { listResearchRuns, persistResearchRun, type SeoResearchRun } from '@/services/seoToolkitApi';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { formatDate } from '@/utils/datetime';

interface Props {
  productId: string;
  productName: string;
  manufacturer?: string | null;
  homepageDomain?: string | null;
  category?: string | null;
}

const CACHE_HOURS = 24;
const MIVAA_BASE = (import.meta as any).env?.VITE_MIVAA_BASE_URL || 'https://v1api.materialshub.gr';

/** Build the target keyword from product attributes. Order matters — most
 * specific signal first so brand+name produces the tightest SERP. */
function buildTargetKeyword(productName: string, manufacturer?: string | null): string {
  const parts: string[] = [];
  if (manufacturer && !productName.toLowerCase().includes(manufacturer.toLowerCase())) {
    parts.push(manufacturer.trim());
  }
  parts.push(productName.trim());
  return parts.join(' ').slice(0, 200);
}

const ProductSEOTab: React.FC<Props> = ({ productId, productName, manufacturer, homepageDomain, category }) => {
  const { toast } = useToast();
  const [research, setResearch] = useState<SeoResearchRun | null>(null);
  const [domainSnap, setDomainSnap] = useState<SeoResearchRun | null>(null);
  const [rankedKws, setRankedKws] = useState<SeoResearchRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const targetKeyword = useMemo(
    () => buildTargetKeyword(productName, manufacturer),
    [productName, manufacturer],
  );

  const loadCache = useCallback(async () => {
    setLoading(true);
    try {
      // Pull latest cached runs (last 24h) for this product's keyword
      const cutoff = new Date(Date.now() - CACHE_HOURS * 3600 * 1000);
      const recent = await listResearchRuns({ limit: 50 });
      const fresh = recent.filter((r) => new Date(r.created_at) > cutoff);
      setResearch(fresh.find((r) => r.kind === 'keyword_research' && r.subject === targetKeyword) || null);
      if (homepageDomain) {
        setDomainSnap(fresh.find((r) => r.kind === 'domain_snapshot' && r.subject === homepageDomain) || null);
        setRankedKws(fresh.find((r) => r.kind === 'ranked_keywords' && r.subject === homepageDomain) || null);
      }
    } catch (e: any) {
      toast({ title: 'Cache load failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [targetKeyword, homepageDomain, toast]);

  useEffect(() => { void loadCache(); }, [loadCache]);

  const fireResearch = useCallback(async () => {
    setRefreshing(true);
    try {
      // Get session for cron-secret-style call. We invoke the seo-toolkit-research
      // edge function (small wrapper) that fires opportunities-stateless +
      // ranked_keywords + domain_snapshot in parallel and persists each via
      // seo_research_runs.
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const resp = await fetch(`${MIVAA_BASE}/api/v1/mention-monitoring/opportunities-stateless`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // The dashboard uses cron-secret server-side; here we bridge via
          // the seo-toolkit-research edge function. For now, fall back to
          // a direct call only if we have CRON access via env (we don't,
          // so this UI requires the seo-toolkit-research edge function).
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          subject_label: targetKeyword,
          aliases: [productName, ...(manufacturer ? [manufacturer] : [])].filter(Boolean),
          country_codes: ['US'],
          language_codes: ['en'],
          ...(homepageDomain ? { homepage_domain: homepageDomain } : {}),
          types: [
            'keyword_opportunity', 'pao_question', 'ai_overview',
            'featured_snippet', 'related_search', 'competitor_ranking',
            'video_carousel', 'knowledge_graph',
            ...(homepageDomain ? ['domain_snapshot'] : []),
          ],
          limit_per_type: 5,
        }),
      });

      // Direct call needs cron-secret. Without it, we'll get 401.
      // The proper path is to invoke our seo-toolkit-research edge function:
      if (resp.status === 401) {
        const inv = await (supabase as any).functions.invoke('seo-api', {
          body: {
            action: 'toolkit_research',
            kind: 'keyword_research',
            subject: targetKeyword,
            params: {
              subject_label: targetKeyword,
              aliases: [productName, ...(manufacturer ? [manufacturer] : [])].filter(Boolean),
              country_codes: ['US'],
              language_codes: ['en'],
              homepage_domain: homepageDomain || undefined,
              limit_per_type: 5,
            },
          },
        });
        if (inv.error) throw new Error(await edgeErrorMessage(inv.error, 'edge fn failed'));
        await persistResearchRun({
          kind: 'keyword_research',
          subject: targetKeyword,
          request_params: { product_id: productId, manufacturer, category },
          response: inv.data?.data || null,
          country_code: 'US',
          language_code: 'en',
          cost_usd: inv.data?.data?.cost_usd || 0,
          latency_ms: inv.data?.data?.latency_ms || null,
          success: !!inv.data?.data,
          label: `Product: ${productName}`,
        });
        await loadCache();
        toast({ title: 'SEO research refreshed' });
        return;
      }

      if (!resp.ok) throw new Error(`MIVAA ${resp.status}`);
      const json = await resp.json();
      await persistResearchRun({
        kind: 'keyword_research',
        subject: targetKeyword,
        request_params: { product_id: productId, manufacturer, category },
        response: json?.data || null,
        country_code: 'US',
        language_code: 'en',
        success: true,
        label: `Product: ${productName}`,
      });
      await loadCache();
      toast({ title: 'SEO research refreshed' });
    } catch (e: any) {
      toast({ title: 'Refresh failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  }, [productId, productName, manufacturer, category, homepageDomain, targetKeyword, loadCache, toast]);

  // Convert a SeoResearchRun into the shape SEOResearchCard / SEOGenericCard expect
  const researchCardData = useMemo(() => {
    if (!research?.response) return null;
    const r = research.response as any;
    return {
      keyword: targetKeyword,
      country: research.country_code || 'US',
      language: research.language_code || 'en',
      opportunity_count: (r.opportunities || []).length,
      summary: r.summary || {},
      opportunities: r.opportunities || [],
      errors: r.errors || {},
      latency_ms: r.latency_ms,
    };
  }, [research, targetKeyword]);

  return (
    <div className="space-y-4 p-4">
      <SectionHeader
        icon={Search}
        title="SEO Snapshot"
        subtitle={(
          <>
            Auto-derived target keyword: <Badge variant="outline" className="text-[10px] ml-1">{targetKeyword}</Badge>
          </>
        )}
        actions={(
          <>
            <a
              href={`/agent-hub?agent=kai&q=${encodeURIComponent(`research the keyword "${targetKeyword}"`)}`}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              Open in chat <ExternalLink className="h-3 w-3" />
            </a>
            <Button
              size="sm" variant="outline"
              onClick={fireResearch}
              disabled={refreshing}
              className="rounded-full text-xs">
              <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              {research ? 'Refresh' : 'Run audit'}
            </Button>
          </>
        )}
      />

      {loading && !research && (
        <div className="text-sm text-muted-foreground p-4 text-center">Loading cached research...</div>
      )}

      {!loading && !research && (
        <Card className="dashboard-card">
          <CardContent className="p-6 text-center">
            <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <div className="text-sm text-muted-foreground">No research cached yet.</div>
            <div className="text-xs text-muted-foreground mt-1">
              Click "Run audit" above to fire DataForSEO research for this product.
            </div>
          </CardContent>
        </Card>
      )}

      {research && researchCardData && (
        <Card className="dashboard-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground">
              Last refreshed {formatDate(research.created_at, { withTime: true })} · ${research.cost_usd.toFixed(4)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SEOResearchCard data={researchCardData} />
          </CardContent>
        </Card>
      )}

      {homepageDomain && domainSnap?.response && (
        <Card className="dashboard-card">
          <CardHeader className="pb-2">
            <CardTitle>Manufacturer domain — {homepageDomain}</CardTitle>
          </CardHeader>
          <CardContent>
            <SEOGenericCard data={{
              type: 'seo_domain_snapshot_card',
              domain: homepageDomain,
              country: domainSnap.country_code,
              items: (domainSnap.response as any)?.items || [],
            }} />
          </CardContent>
        </Card>
      )}

      {homepageDomain && rankedKws?.response && (
        <Card className="dashboard-card">
          <CardHeader className="pb-2">
            <CardTitle>Top ranking keywords for {homepageDomain}</CardTitle>
          </CardHeader>
          <CardContent>
            <SEOGenericCard data={{
              type: 'seo_ranked_keywords_card',
              domain: homepageDomain,
              country: rankedKws.country_code,
              items: (rankedKws.response as any)?.items || [],
            }} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProductSEOTab;
