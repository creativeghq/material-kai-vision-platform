import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ListTree, Loader2, PenLine, Trash2 } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { compact } from './seoMetrics';
import { useLaunchQuickStart } from './dashboardPrimitives';

interface PlanRow {
  id: string;
  pillar_cluster_id: string | null;
  cluster_name: string;
  primary_keyword: string;
  secondary_keywords: string[];
  volume: number | null;
  article_id: string | null;
  article_title: string | null;
  published_url: string | null;
  status: 'idea' | 'briefed' | 'writing' | 'written' | 'published';
}

const STATUS_VARIANT: Record<PlanRow['status'], 'neutral' | 'info' | 'warning' | 'success'> = {
  idea: 'neutral', briefed: 'info', writing: 'warning', written: 'success', published: 'success',
};
const STATUS_LABEL: Record<PlanRow['status'], string> = {
  idea: 'Idea', briefed: 'Briefed', writing: 'Writing', written: 'Written', published: 'Published',
};

/** Websites → Articles: the topic plan, grouped by pillar. A page's stage comes from its article. */
export const TopicPlanCard: React.FC<{ websiteId: string; onOpenResearch?: () => void }> = ({ websiteId, onOpenResearch }) => {
  const { toast } = useToast();
  const launchQuickStart = useLaunchQuickStart();
  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('seo_topic_cluster_board' as never)
      .select('id, pillar_cluster_id, cluster_name, primary_keyword, secondary_keywords, volume, article_id, article_title, published_url, status')
      .eq('website_id', websiteId).order('volume', { ascending: false, nullsFirst: false });
    if (error) toast({ title: 'Could not read the plan', description: error.message, variant: 'destructive' });
    setRows((data ?? []) as PlanRow[]);
  }, [websiteId, toast]);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const all = rows ?? [];
    const pillars = all.filter((r) => !r.pillar_cluster_id);
    return pillars.map((p) => ({ pillar: p, children: all.filter((r) => r.pillar_cluster_id === p.id) }));
  }, [rows]);

  const setBriefed = async (r: PlanRow) => {
    setBusy(r.id);
    const { error } = await supabase.from('seo_topic_clusters' as never)
      .update({ status: r.status === 'briefed' ? 'idea' : 'briefed' } as never).eq('id', r.id);
    setBusy(null);
    if (error) { toast({ title: 'Not changed', description: error.message, variant: 'destructive' }); return; }
    await load();
  };

  const remove = async (r: PlanRow) => {
    setBusy(r.id);
    const { error } = await supabase.from('seo_topic_clusters' as never).delete().eq('id', r.id);
    setBusy(null);
    if (error) { toast({ title: 'Not removed', description: error.message, variant: 'destructive' }); return; }
    await load();
  };

  const line = (r: PlanRow, pillar: boolean) => (
    <div key={r.id} className={`flex flex-wrap items-center gap-3 py-2 ${pillar ? '' : 'pl-5'}`}>
      <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${pillar ? 'font-semibold' : 'font-medium'}`}>{r.primary_keyword}</div>
        {r.secondary_keywords?.length > 0 && (
          <div className="truncate text-[11px] text-muted-foreground">{r.secondary_keywords.slice(0, 5).join(', ')}</div>
        )}
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{r.volume ? `${compact(r.volume)}/mo` : '—'}</span>
      {!r.article_id && (
        <>
          <Button size="sm" variant="ghost" onClick={() => void setBriefed(r)} disabled={busy === r.id}>
            {r.status === 'briefed' ? 'Back to idea' : 'Mark briefed'}
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => launchQuickStart('seo-article', 'Generate full article', websiteId, r.primary_keyword)}>
            <PenLine className="h-3.5 w-3.5" /> Write
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void remove(r)} disabled={busy === r.id} title="Remove from the plan">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      {r.published_url && (
        <a className="text-xs text-primary underline" href={r.published_url} target="_blank" rel="noopener noreferrer">Live page</a>
      )}
    </div>
  );

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ListTree className="h-4 w-4 text-primary" /> Topic plan</CardTitle>
        <CardDescription>
          One page per keyword cluster, under its pillar. A page moves to Writing, Written and Published by itself when an
          article for its keyword exists, is finished and goes live.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : groups.length === 0 ? (
          <HubEmptyState
            icon={ListTree}
            title="No topic plan yet"
            description="Open a keyword research run and press Save as plan on its clusters."
            action={onOpenResearch ? <Button variant="outline" onClick={onOpenResearch}>Keyword research</Button> : undefined}
          />
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.pillar.id} className="divide-y divide-hairline rounded-sm border border-hairline px-3">
                {line(g.pillar, true)}
                {g.children.map((c) => line(c, false))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
