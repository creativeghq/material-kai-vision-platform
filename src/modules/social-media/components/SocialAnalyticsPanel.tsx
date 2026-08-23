/**
 * Social analytics — posts, their metrics, and account-level insights.
 *
 * This surface did not exist. `social_posts`, `social_post_analytics` and `social_account_insights`
 * were written by the publish path and by two background agents every 2h/24h, Zernio's analytics
 * add-on was being paid for, and nothing in `src/` rendered any of it: the capability registry
 * carried `social-post` with NO pageRoute, formally logged as a gap. Asking the agent was the only
 * way to see a number you had already collected.
 *
 * Numbers here are READ, never re-derived: `engagement_rate` is what Zernio reported for that post,
 * not likes+comments over reach computed a second time in TypeScript.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, Loader2, Users, Eye, Heart, MessageCircle, Share2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { supabaseConfig } from '@/config/apis/supabaseConfig';
import { formatDate } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';
import { PlatformIcon, platformLabel } from '@/components/core/icons/PlatformIcon';

const SUPABASE_FUNCTIONS_URL = `${supabaseConfig.projectUrl}/functions/v1`;

interface PostRow {
  id: string;
  platform: string;
  caption: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  zernio_post_id: string | null;
}

interface MetricRow {
  post_id: string;
  synced_at: string | null;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  engagement_rate: number | null;
}

interface InsightRow {
  social_account_id: string;
  snapshot_date: string;
  followers_count: number | null;
  posts_count: number | null;
  avg_engagement: number | null;
  reach_7d: number | null;
  impressions_7d: number | null;
}

interface AccountRow { id: string; platform: string; handle: string | null }

const statusVariant = (s: string) =>
  s === 'published' ? 'success' : s === 'failed' ? 'error' : s === 'scheduled' ? 'info' : 'neutral';

/** `—` for an absent value, never 0: "not synced yet" and "nobody saw it" are different facts. */
const num = (v: number | null | undefined) => (v == null ? '—' : formatNumber(v));

export const SocialAnalyticsPanel: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, MetricRow>>({});
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    const [p, m, i, a] = await Promise.all([
      supabase.from('social_posts')
        .select('id, platform, caption, status, scheduled_at, published_at, zernio_post_id')
        .eq('workspace_id', activeWorkspaceId)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('social_post_analytics')
        .select('post_id, synced_at, impressions, reach, likes, comments, shares, saves, clicks, engagement_rate')
        .eq('workspace_id', activeWorkspaceId),
      supabase.from('social_account_insights')
        .select('social_account_id, snapshot_date, followers_count, posts_count, avg_engagement, reach_7d, impressions_7d')
        .eq('workspace_id', activeWorkspaceId)
        .order('snapshot_date', { ascending: false }),
      supabase.from('social_accounts')
        .select('id, platform, handle')
        .eq('workspace_id', activeWorkspaceId).eq('is_active', true),
    ]);
    setPosts((p.data ?? []) as PostRow[]);
    // Newest row per post — the sync appends, so a post can carry several snapshots.
    const byPost: Record<string, MetricRow> = {};
    for (const row of (m.data ?? []) as MetricRow[]) {
      const prev = byPost[row.post_id];
      if (!prev || (row.synced_at ?? '') > (prev.synced_at ?? '')) byPost[row.post_id] = row;
    }
    setMetrics(byPost);
    // Latest snapshot per account, same reason.
    const seen = new Set<string>();
    setInsights(((i.data ?? []) as InsightRow[]).filter(r => {
      if (seen.has(r.social_account_id)) return false;
      seen.add(r.social_account_id);
      return true;
    }));
    setAccounts((a.data ?? []) as AccountRow[]);
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => { void load(); }, [load]);

  /** Pull fresh numbers from Zernio for this workspace, then re-read. */
  const sync = async () => {
    if (!activeWorkspaceId) return;
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const call = (action: string, extra: Record<string, unknown> = {}) =>
        fetch(`${SUPABASE_FUNCTIONS_URL}/zernio-api`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, workspace_id: activeWorkspaceId, ...extra }),
        }).then(async (r) => {
          const j = await r.json().catch(() => ({}));
          if (!r.ok || j?.success === false) throw new Error(j?.error || `${action} failed (${r.status})`);
          return j;
        });

      // Import FIRST. Analytics only covers posts carrying a zernio_post_id, and a post written
      // natively in LinkedIn has none until it is imported — which is why a freshly connected
      // account used to show an empty list and a refresh that appeared to do nothing.
      const importRes = await call('import_external_posts');
      // Post metrics for the workspace, then one insights call per connected account.
      await call('get_post_analytics');
      for (const acct of accounts) {
        await call('get_account_insights', { social_account_id: acct.id });
      }
      await load();
      toast({
        title: 'Analytics synced',
        description: importRes?.imported
          ? `Imported ${importRes.imported} existing post${importRes.imported === 1 ? '' : 's'} from your accounts.`
          : undefined,
      });
    } catch (err) {
      toast({
        title: 'Sync failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const accountLabel = useMemo(() => {
    const m: Record<string, { platform: string; text: string }> = {};
    for (const a of accounts) m[a.id] = { platform: a.platform, text: a.handle ?? platformLabel(a.platform) };
    return m;
  }, [accounts]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="dashboard-card h-24 animate-pulse bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Audience
            </CardTitle>
            <CardDescription>
              Latest follower and reach snapshot per connected account. Refreshed daily by the
              Social Insights Sync agent.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void sync()} disabled={syncing || accounts.length === 0}>
            {syncing
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Syncing…</>
              : <><RefreshCw className="h-4 w-4 mr-1" /> Sync now</>}
          </Button>
        </CardHeader>
        <CardContent>
          {insights.length === 0 ? (
            <HubEmptyState
              variant="empty"
              icon={Users}
              title="No audience snapshots yet"
              description={accounts.length === 0
                ? 'Connect an account first — insights are collected per connected account.'
                : 'The daily agent has not run since these accounts were connected. Sync now to pull the first snapshot.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Followers</TableHead>
                    <TableHead className="text-right">Posts</TableHead>
                    <TableHead className="text-right">Avg engagement</TableHead>
                    <TableHead className="text-right">Reach 7d</TableHead>
                    <TableHead className="text-right">Impressions 7d</TableHead>
                    <TableHead className="text-right">As of</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.map(row => (
                    <TableRow key={row.social_account_id}>
                      <TableCell>
                        {accountLabel[row.social_account_id] ? (
                          <span className="flex items-center gap-2">
                            <PlatformIcon platform={accountLabel[row.social_account_id].platform} className="h-4 w-4 shrink-0" />
                            <span className="text-sm">{accountLabel[row.social_account_id].text}</span>
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{num(row.followers_count)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(row.posts_count)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.avg_engagement == null ? '—' : `${row.avg_engagement.toFixed(2)}%`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{num(row.reach_7d)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(row.impressions_7d)}</TableCell>
                      <TableCell className="text-right">{formatDate(row.snapshot_date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Posts
          </CardTitle>
          <CardDescription>
            Everything this workspace has drafted, scheduled or published, plus up to a year of
            posts published natively on each connected account — Sync now imports those. Newest
            first, with the engagement Zernio reports for each.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <HubEmptyState
              variant="empty"
              icon={BarChart3}
              title="No posts yet"
              description="Sync now to pull up to a year of posts already published on your connected accounts, or write a new one from My accounts."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Post</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead className="text-right"><Eye className="inline h-3 w-3" /> Reach</TableHead>
                    <TableHead className="text-right"><Heart className="inline h-3 w-3" /> Likes</TableHead>
                    <TableHead className="text-right"><MessageCircle className="inline h-3 w-3" /> Comments</TableHead>
                    <TableHead className="text-right"><Share2 className="inline h-3 w-3" /> Shares</TableHead>
                    <TableHead className="text-right">Engagement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map(post => {
                    const m = metrics[post.id];
                    return (
                      <TableRow key={post.id}>
                        <TableCell className="max-w-xs">
                          <div className="flex items-start gap-2">
                            <PlatformIcon platform={post.platform} className="mt-0.5 h-4 w-4 shrink-0" />
                            <span className="truncate text-sm">{post.caption || <span className="text-muted-foreground">(no caption)</span>}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(post.status)} className="capitalize">{post.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {post.published_at
                            ? formatDate(post.published_at, { withTime: true })
                            : post.scheduled_at
                              ? `scheduled ${formatDate(post.scheduled_at, { withTime: true })}`
                              : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{num(m?.reach)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(m?.likes)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(m?.comments)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(m?.shares)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m?.engagement_rate == null ? '—' : `${m.engagement_rate.toFixed(2)}%`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SocialAnalyticsPanel;
