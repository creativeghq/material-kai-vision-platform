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
import { BarChart3, RefreshCw, Loader2, Users, Eye, Heart, MessageCircle, Share2, AlertTriangle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { HubTabNav } from '@/components/core/hub/HubTabNav';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { supabaseConfig } from '@/config/apis/supabaseConfig';
import { formatDate, todayLocalISO, localISODateOffset } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';
import {
  DailyReachChart, ContentDecayChart, PostingFrequencyTable, Loadable,
  type DailyPoint, type PlatformTotals, type DecayBucket, type FrequencyRow,
} from './SocialInsightsCharts';
import { PlatformIcon, platformLabel } from '@/components/core/icons/PlatformIcon';
import { SocialPostEditorDialog } from './SocialPostEditorDialog';

const SUPABASE_FUNCTIONS_URL = `${supabaseConfig.projectUrl}/functions/v1`;

interface PostRow {
  id: string;
  platform: string;
  caption: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  zernio_post_id: string | null;
  social_account_id: string | null;
  /**
   * `platforms` is the PER-LEG outcome, keyed by platform name (#384 A). The aggregate `status`
   * says the post published; a leg can still have failed underneath it, and until this was
   * rendered a post that reached 3 of 4 networks was pixel-identical to one that reached all 4.
   */
  metadata: {
    platform_post_url?: string | null;
    platforms?: Record<string, { status?: string; error?: string; url?: string; at?: string }> | null;
  } | null;
}

/**
 * Why an account contributed nothing to an import. Rendered, never swallowed: an import that
 * returns 0 and says nothing looks exactly like one that worked, which is how the first version
 * of this screen reported "Analytics synced" over an empty table for a whole afternoon.
 */
interface SyncNote {
  account_id: string;
  platform: string;
  handle: string | null;
  code: string;
  message: string;
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

interface AccountRow {
  id: string;
  platform: string;
  handle: string | null;
  metadata: { accountType?: string } | null;
}

/**
 * What a connected account can actually answer, which is NOT the same question for a member
 * profile and a business page.
 *
 * Nearly everything on this screen is derived from a POST LIST — per-post engagement, the decay
 * curve, cadence-vs-engagement, the daily rollup. LinkedIn publishes no listing API for a
 * personal profile, so for a member account every one of those is empty by construction, and
 * rendering them anyway produces a screen of blank panels that reads as breakage. It also costs
 * three Zernio round trips per load to fetch nothing.
 *
 * What a member account HAS instead is the aggregate LinkedIn computes server-side, which needs
 * no post list at all — and which includes saves and sends, two figures a business page can
 * never return. So this is a fork in the road, not a ladder.
 */
interface AccountCapabilities {
  /** The platform will enumerate this account's posts, so post-derived views have input. */
  perPost: boolean;
  /** LinkedIn member aggregate — the account-level totals endpoint. */
  aggregate: boolean;
  /** Cannot be swept; past posts arrive one URL at a time. */
  urlImport: boolean;
}

const isLinkedInMember = (a: AccountRow) =>
  a.platform === 'linkedin' && a.metadata?.accountType === 'personal';

const capabilitiesOf = (a: AccountRow): AccountCapabilities =>
  isLinkedInMember(a)
    ? { perPost: false, aggregate: true, urlImport: true }
    : { perPost: true, aggregate: false, urlImport: false };

/** Kept as a named concept: several surfaces below turn on exactly this. */
const needsUrlImport = (a: AccountRow) => capabilitiesOf(a).urlImport;

/**
 * A company page the connected member administers.
 *
 * LinkedIn does not always return the name: for several pages it answers with the id alone, and
 * Zernio fills `name` with a literal "Organization <id>". That placeholder must never reach the
 * screen — it looks like a rendering bug and tells the reader nothing. `vanityName` is the
 * reliable marker of a page LinkedIn actually described, so the named ones are listed and the
 * rest are counted.
 */
interface LinkedInOrg {
  id: string;
  name: string;
  vanityName?: string;
  logoUrl?: string | null;
}

const isNamedOrg = (o: LinkedInOrg) =>
  Boolean(o.vanityName) && !/^Organization \d+$/.test(o.name);

/**
 * One account's account-level figures, normalised across platforms by the edge handler.
 *
 * `unavailable` is not decoration. Instagram, Facebook and LinkedIn all answer with a metric
 * OMITTED and named here when the platform could not serve it, precisely so it is never confused
 * with a real zero — a Facebook Page that earned nothing and a Page not enrolled in monetisation
 * both report 0, and only this list separates "we did not get an answer" from either.
 */
interface AccountMetrics {
  platform: string;
  metrics: Record<string, { total: number; unit?: string; currency?: string | null }>;
  unavailable: string[];
  code?: string;
  message?: string;
}

/**
 * Platform metric keys are the platform's own vocabulary and read like it — `page_media_view`,
 * `accounts_engaged`, `organic_followers_gained`. Anything not named here falls back to its key
 * de-snaked, which is why an unknown metric still renders rather than being dropped: a new
 * metric appearing upstream should show up as an ugly label, never vanish.
 */
const METRIC_LABELS: Record<string, string> = {
  // LinkedIn member
  impressions: 'Impressions', reach: 'Reach', reactions: 'Reactions', comments: 'Comments',
  shares: 'Reshares', saves: 'Saves', sends: 'Sends', engagementRate: 'Engagement rate',
  // LinkedIn organisation
  unique_impressions: 'Unique impressions', clicks: 'Clicks', likes: 'Likes',
  engagement_rate: 'Engagement rate', organic_followers_gained: 'Organic followers gained',
  followers_gained: 'Followers gained', followers_lost: 'Followers lost',
  // Instagram
  views: 'Views', accounts_engaged: 'Accounts engaged', total_interactions: 'Interactions',
  replies: 'Replies', reposts: 'Reposts', follows_and_unfollows: 'Follows & unfollows',
  profile_links_taps: 'Profile link taps',
  // Facebook Page
  page_media_view: 'Media views', page_views_total: 'Page views',
  page_post_engagements: 'Post engagements', page_video_views: 'Video views',
  page_video_view_time: 'Video view time', page_follows: 'Follows',
};

const metricLabel = (key: string) =>
  METRIC_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

/** Rates arrive as a percentage from LinkedIn members and as 0..1 from LinkedIn orgs. */
const formatMetric = (key: string, m: { total: number; unit?: string; currency?: string | null }) => {
  if (key === 'engagementRate') return `${m.total.toFixed(2)}%`;
  if (key === 'engagement_rate') return `${(m.total * 100).toFixed(2)}%`;
  if (m.unit === 'micro_amount') return `${(m.total / 1_000_000).toFixed(2)} ${m.currency ?? ''}`.trim();
  return formatNumber(m.total);
};

const statusVariant = (s: string) =>
  s === 'published' ? 'success' : s === 'failed' ? 'error' : s === 'scheduled' ? 'info' : 'neutral';

/**
 * The networks this post did NOT reach.
 *
 * Read from the per-leg record rather than from `status`: `post.partial` sets the aggregate to
 * `published` and says only that SOMETHING failed, so the badge alone cannot distinguish a post
 * that went everywhere from one that went almost everywhere. An empty list here means every leg
 * we were told about succeeded — not that none was checked, because a post with no leg records at
 * all renders nothing extra and keeps reading exactly as it did.
 */
const failedLegs = (post: { metadata?: { platforms?: Record<string, { status?: string; error?: string }> | null } | null }) =>
  Object.entries(post.metadata?.platforms ?? {})
    .filter(([, leg]) => leg?.status === 'failed')
    .map(([platform, leg]) => ({ platform, error: leg?.error }));

/** `—` for an absent value, never 0: "not synced yet" and "nobody saw it" are different facts. */
const num = (v: number | null | undefined) => (v == null ? '—' : formatNumber(v));

/**
 * LinkedIn's DAILY aggregate arrives as one date/count array PER METRIC; the chart wants one row
 * per date. Reach is deliberately absent — LinkedIn does not compute unique members reached on a
 * daily breakdown, only lifetime — so it stays undefined rather than being filled with
 * impressions, which is a different quantity that would silently overstate it.
 */
type LinkedInDailySeries = Record<string, Array<{ date: string; count: number }> | undefined>;

const linkedInDailyToPoints = (series: LinkedInDailySeries): DailyPoint[] => {
  const byDate = new Map<string, DailyPoint>();
  const put = (key: 'impressions' | 'likes' | 'comments' | 'shares' | 'saves', rows?: Array<{ date: string; count: number }>) => {
    for (const row of rows ?? []) {
      const point = byDate.get(row.date)
        ?? { date: row.date, postCount: 0, metrics: {} as DailyPoint['metrics'] };
      point.metrics[key] = row.count;
      byDate.set(row.date, point);
    }
  };
  put('impressions', series.impressions);
  // LinkedIn calls them reactions; every other platform here calls them likes.
  put('likes', series.reactions);
  put('comments', series.comments);
  put('shares', series.shares);
  put('saves', series.saves);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};

export const SocialAnalyticsPanel: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, MetricRow>>({});
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [platformTotals, setPlatformTotals] = useState<PlatformTotals[]>([]);
  const [decay, setDecay] = useState<DecayBucket[]>([]);
  const [frequency, setFrequency] = useState<FrequencyRow[]>([]);
  // Distinguished from "no data": these five endpoints are gated on Zernio's Analytics add-on,
  // and an empty chart because the plan lacks it needs a different answer from an empty chart
  // because nobody has posted.
  const [addonMissing, setAddonMissing] = useState(false);
  const [syncNotes, setSyncNotes] = useState<SyncNote[]>([]);
  const [importUrl, setImportUrl] = useState('');
  // LinkedIn aggregates a personal profile's totals server-side, so this needs no post list —
  // which is the whole reason it is the only analytics such an account has.
  const [liScopeMissing, setLiScopeMissing] = useState(false);
  const [liOrgs, setLiOrgs] = useState<LinkedInOrg[]>([]);
  /**
   * Separate from `loading` on purpose. The DB reads finish in milliseconds; the Zernio
   * pass-throughs are four sequential network hops to a third party and took the whole tab
   * hostage behind one spinner. Now the tables render as soon as they can and only the panels
   * still waiting say so.
   */
  const [derivedLoading, setDerivedLoading] = useState(true);
  /**
   * Account-level metrics per connected account, whatever the platform. Normalised server-side
   * onto one shape so this does not need four renderers — and carrying `unavailable` separately,
   * because a metric the platform declined to serve is NOT a zero and must not render as one.
   */
  const [accountMetrics, setAccountMetrics] = useState<Record<string, AccountMetrics>>({});
  /**
   * `all`, or a connected account's id. Stacking every account's panels down one page was
   * readable with one account and stops being so at three.
   */
  const [activeTab, setActiveTab] = useState<string>('all');
  /** The post open in the editor. A row is a record you can finish, not just a number. */
  const [openPostId, setOpenPostId] = useState<string | null>(null);

  /** POST one zernio-api action for this workspace. Throws with the server's own message. */
  const callAction = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/zernio-api`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, workspace_id: activeWorkspaceId, ...extra }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.success === false) {
      const err = new Error(json?.error || `${action} failed (${res.status})`);
      (err as Error & { code?: string }).code = json?.code;
      throw err;
    }
    return json;
  }, [activeWorkspaceId]);

  /** The local reads. Fast, and everything the tables need — nothing here waits on Zernio. */
  const loadCore = useCallback(async (): Promise<AccountRow[]> => {
    if (!activeWorkspaceId) { setLoading(false); setDerivedLoading(false); return []; }
    setLoading(true);
    const [p, m, i, a] = await Promise.all([
      supabase.from('social_posts')
        .select('id, platform, caption, status, scheduled_at, published_at, zernio_post_id, social_account_id, metadata')
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
        .select('id, platform, handle, metadata')
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
    const accountRows = (a.data ?? []) as AccountRow[];
    setAccounts(accountRows);
    // Everything above is a local read. Release the screen HERE — the third-party calls below
    // are the slow part, and holding four tables hostage to them is what made this tab feel
    // broken on open.
    setLoading(false);
    return accountRows;
  }, [activeWorkspaceId]);

  /**
   * The derived views, read live from Zernio and never stored — it already computes them, and a
   * cached rollup would be a second derivation of the same number.
   *
   * Asked for STRICTLY by capability. A workspace whose only account is a LinkedIn member
   * profile has no post list, so daily/decay/cadence are empty by construction: asking for them
   * spends three round trips to render three blank panels. It asks the member endpoint instead,
   * which is the one that can answer.
   */
  const loadDerived = useCallback(async (accountRows: AccountRow[], forAccountId?: string) => {
    if (!activeWorkspaceId || !accountRows.length) { setDerivedLoading(false); return; }
    setDerivedLoading(true);

    // On a per-account tab the derived reads are narrowed to that account. Every one of these
    // endpoints accepts an account filter; without it the tab charts the whole workspace under a
    // heading naming one account, which is a wrong number that looks completely plausible.
    const scoped = forAccountId ? accountRows.filter(a => a.id === forAccountId) : accountRows;
    const scope = forAccountId ? { social_account_id: forAccountId } : {};

    const members = scoped.filter(a => capabilitiesOf(a).aggregate);
    const anyPerPost = scoped.some(a => capabilitiesOf(a).perPost);

    // EVERY account, every platform. Instagram, Facebook Pages and LinkedIn pages each have an
    // account-level endpoint and none of them had ever been called from here.
    const perAccount = Promise.allSettled(
      scoped.map(a => callAction('get_account_metrics', { social_account_id: a.id })),
    ).then((results) => {
      const next: Record<string, AccountMetrics> = {};
      scoped.forEach((acct, idx) => {
        const r = results[idx];
        if (r.status === 'fulfilled') {
          next[acct.id] = {
            platform: acct.platform,
            metrics: r.value?.metrics ?? {},
            unavailable: r.value?.unavailable ?? [],
            code: r.value?.code,
            message: r.value?.message,
          };
        } else {
          // A refusal is a fact about the account, and belongs on that account's tab rather
          // than disappearing into a console line.
          const err = r.reason as Error & { code?: string };
          next[acct.id] = {
            platform: acct.platform, metrics: {}, unavailable: [],
            code: err?.code ?? 'error', message: err?.message,
          };
        }
      });
      setAccountMetrics(next);
    });

    const [postDerived, memberDerived] = await Promise.all([
      anyPerPost
        // Settled, not all: the decay curve failing must not blank the daily chart beside it.
        ? Promise.allSettled([
          callAction('get_daily_metrics', scope),
          callAction('get_content_decay', scope),
          callAction('get_posting_frequency', scope),
        ])
        : Promise.resolve(null),
      members.length
        ? Promise.allSettled([
          ...members.map(acct => callAction('get_linkedin_aggregate', { social_account_id: acct.id })),
          // DAILY for the reach chart. `get_daily_metrics` derives from a post list, so it is
          // empty for a member account no matter how much reach the profile actually has —
          // which is how a profile with 28k impressions rendered an empty chart.
          callAction('get_linkedin_aggregate', {
            social_account_id: members[0].id,
            aggregation: 'DAILY',
            from_date: localISODateOffset(-29),
            to_date: todayLocalISO(),
          }),
          // Which company pages this same connection already administers.
          callAction('get_linkedin_organizations', { social_account_id: members[0].id }),
        ])
        : Promise.resolve(null),
    ]);

    let dailyPoints: DailyPoint[] = [];
    if (postDerived) {
      const [dm, cd, pf] = postDerived;
      // Only meaningful about endpoints we actually called — a workspace that asked for none of
      // them has learned nothing about the add-on and must not claim it is missing.
      setAddonMissing([dm, cd, pf].some(
        (r) => r.status === 'rejected' && (r.reason as Error & { code?: string })?.code === 'analytics_addon_required',
      ));
      dailyPoints = dm.status === 'fulfilled' ? (dm.value.dailyData ?? []) : [];
      setPlatformTotals(dm.status === 'fulfilled' ? (dm.value.platformBreakdown ?? []) : []);
      setDecay(cd.status === 'fulfilled' ? (cd.value.buckets ?? []) : []);
      setFrequency(pf.status === 'fulfilled' ? (pf.value.frequency ?? []) : []);
    } else {
      setAddonMissing(false);
      setPlatformTotals([]);
      setDecay([]);
      setFrequency([]);
    }

    if (memberDerived) {
      // The member TOTALS are no longer read here — `get_account_metrics` serves them for every
      // platform on one shape, and keeping a second copy of the same numbers is how two panels
      // start disagreeing. What is still only knowable here is whether the connection was
      // authorised without permission to read analytics.
      setLiScopeMissing(members.some((_, idx) => {
        const r = memberDerived[idx];
        return r.status === 'rejected'
          && (r.reason as Error & { code?: string })?.code === 'missing_scope';
      }));

      const orgRes = memberDerived[memberDerived.length - 1];
      setLiOrgs(orgRes.status === 'fulfilled' ? (orgRes.value?.organizations ?? []) : []);

      // Substitute only where the post-derived source came back with nothing to plot, so a
      // workspace that has both an org page and a member profile keeps the richer series.
      const memberDaily = memberDerived[memberDerived.length - 2];
      if (!dailyPoints.length && memberDaily.status === 'fulfilled') {
        dailyPoints = linkedInDailyToPoints(memberDaily.value?.analytics ?? {});
      }
    } else {
      setLiScopeMissing(false);
      setLiOrgs([]);
    }

    setDaily(dailyPoints);
    // The per-account sweep runs alongside the two above; the panel is not "loaded" until it
    // lands too, or its cards would flash an empty state on the way in.
    await perAccount;
    setDerivedLoading(false);
  }, [activeWorkspaceId, callAction]);

  /**
   * A full refresh is the LOCAL read only. The derived reads follow from it through the effect
   * below, because they also have to re-run when the tab changes — and doing both here as well
   * would fire them twice per sync.
   */
  const load = useCallback(async () => { await loadCore(); }, [loadCore]);

  useEffect(() => { void loadCore(); }, [loadCore]);

  // Whenever the account set or the selected tab changes. Deliberately NOT coupled to loadCore:
  // re-reading the DB on every tab click would flash the whole-page skeleton over tables that
  // already hold the right rows.
  useEffect(() => {
    if (!accounts.length) { setDerivedLoading(false); return; }
    void loadDerived(accounts, activeTab === 'all' ? undefined : activeTab);
  }, [accounts, activeTab, loadDerived]);

  /**
   * Pull fresh numbers from Zernio for this workspace, then re-read.
   *
   * `postUrls` turns this into a by-URL import, which is the ONLY import a LinkedIn personal
   * profile has: LinkedIn publishes no listing API for one, so the sweep every other platform
   * uses returns nothing and cannot be made to return anything.
   */
  const sync = async (postUrls?: string[]) => {
    if (!activeWorkspaceId) return;
    setSyncing(true);
    try {
      const call = callAction;

      // Import FIRST. Analytics only covers posts carrying a zernio_post_id, and a post written
      // natively in LinkedIn has none until it is imported — which is why a freshly connected
      // account used to show an empty list and a refresh that appeared to do nothing.
      const importRes = await call('import_external_posts', postUrls?.length ? { post_urls: postUrls } : {});
      // Post metrics for the workspace, then one insights call per connected account.
      await call('get_post_analytics');
      for (const acct of accounts) {
        await call('get_account_insights', { social_account_id: acct.id });
      }
      await load();

      // The server explains every account that contributed nothing. Keep those on the screen
      // rather than in a toast that vanishes: "why is this still empty" is asked minutes later.
      const notes = (importRes?.notes ?? []) as SyncNote[];
      const failures = (importRes?.errors ?? []) as string[];
      setSyncNotes(notes);

      if (importRes?.imported) {
        toast({
          title: 'Analytics synced',
          description: `Imported ${importRes.imported} post${importRes.imported === 1 ? '' : 's'}`
            + (importRes.with_metrics ? `, ${importRes.with_metrics} with engagement figures.` : '.'),
        });
      } else if (failures.length) {
        // A 100%-failed import used to render as "Analytics synced" with an empty body.
        toast({ title: 'Nothing could be imported', description: failures[0], variant: 'destructive' });
      } else {
        toast({
          title: 'Synced — no new posts',
          description: notes[0]?.message ?? 'Follower and engagement figures are up to date.',
        });
      }
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

  /** Import one already-published post by its URL, for accounts that cannot be swept. */
  const importByUrl = async () => {
    const url = importUrl.trim();
    if (!url) return;
    await sync([url]);
    setImportUrl('');
  };

  const urlImportAccounts = useMemo(() => accounts.filter(needsUrlImport), [accounts]);
  /**
   * What this workspace's mix of accounts can actually answer. Every conditional panel below
   * reads one of these rather than re-deriving "is it LinkedIn and personal" in place — that
   * test is already wrong for the next platform that draws the same distinction (Instagram
   * personal vs business, Facebook profile vs page).
   */
  const anyPerPost = useMemo(() => accounts.some(a => capabilitiesOf(a).perPost), [accounts]);
  const anyAggregate = useMemo(() => accounts.some(a => capabilitiesOf(a).aggregate), [accounts]);

  /** The account this tab is about, or null on the cross-account view. */
  const tabAccount = useMemo(
    () => accounts.find(a => a.id === activeTab) ?? null,
    [accounts, activeTab],
  );

  // A tab whose account was just disconnected must not strand the screen on an empty view.
  useEffect(() => {
    if (activeTab !== 'all' && !accounts.some(a => a.id === activeTab)) setActiveTab('all');
  }, [accounts, activeTab]);

  /**
   * One tab per account, plus the cross-account view — offered only from TWO accounts up. With
   * one connected account a tab strip is pure chrome: it names the thing you are already looking
   * at and offers nowhere else to go.
   */
  const tabItems = useMemo(() => (
    accounts.length < 2 ? [] : [
      { id: 'all', label: 'All accounts', count: accounts.length },
      ...accounts.map(a => ({
        id: a.id,
        label: a.handle ?? platformLabel(a.platform),
        count: posts.filter(p => p.social_account_id === a.id).length,
      })),
    ]
  ), [accounts, posts]);

  /** Posts belonging to the active tab. The cross-account view shows everything. */
  const visiblePosts = useMemo(
    () => (tabAccount ? posts.filter(p => p.social_account_id === tabAccount.id) : posts),
    [posts, tabAccount],
  );

  /** Insight snapshots for the active tab, same rule. */
  const visibleInsights = useMemo(
    () => (tabAccount ? insights.filter(r => r.social_account_id === tabAccount.id) : insights),
    [insights, tabAccount],
  );

  // Which panels this tab may show. On a single account it is that account's answer; across all
  // of them it is the union, because a page and a profile can be connected side by side.
  const tabPerPost = tabAccount ? capabilitiesOf(tabAccount).perPost : anyPerPost;
  const tabAggregate = tabAccount ? capabilitiesOf(tabAccount).aggregate : anyAggregate;
  const tabUrlImport = tabAccount ? capabilitiesOf(tabAccount).urlImport : urlImportAccounts.length > 0;
  const metricAccounts = tabAccount ? [tabAccount] : accounts;

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
      {tabItems.length > 0 && (
        <HubTabNav
          items={tabItems}
          activeId={activeTab}
          onSelect={setActiveTab}
          aria-label="Connected accounts"
        />
      )}

      {addonMissing && (
        <div className="dashboard-card flex items-start gap-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
          <div>
            <p className="font-medium">Some of these need the Zernio Analytics add-on</p>
            <p className="text-muted-foreground mt-1">
              Reach over time, content decay, cadence and follower history are gated behind it, and
              the platform account does not have it. Post-level engagement below still works.
            </p>
          </div>
        </div>
      )}

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
          {visibleInsights.length === 0 ? (
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
                  {visibleInsights.map(row => (
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

      {/* The only analytics a personal LinkedIn profile has. Rendered whenever one is connected,
          including at zero — a connected account showing nothing at all is the state that sent
          somebody looking for a bug last time. */}
      {/* Account-level metrics, one card per account on this tab. Every platform has such an
          endpoint — Instagram, Facebook Pages, LinkedIn pages and members — and until now only
          LinkedIn members were being asked. The shape is normalised server-side, so this is one
          renderer rather than four. */}
      {metricAccounts.map(acct => {
        const am = accountMetrics[acct.id];
        const entries = Object.entries(am?.metrics ?? {});
        const caps = capabilitiesOf(acct);
        return (
          <Card key={acct.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlatformIcon platform={acct.platform} className="h-4 w-4" />
                {acct.handle ?? platformLabel(acct.platform)}
              </CardTitle>
              <CardDescription>
                {caps.aggregate
                  ? <>Lifetime totals across this profile’s posts. LinkedIn adds these up itself, so
                      they need no post list — which is why they work where the posts table cannot,
                      and why they cannot be broken down per post. Saves and sends are
                      personal-profile figures; a company page returns 0 for both, so these are not
                      a lesser version of page analytics but a different set.</>
                  : <>Account-level figures {platformLabel(acct.platform)} reports for the last 30
                      days. These cover the whole account across every surface, which is a different
                      question from what any single post did.</>}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Loadable loading={derivedLoading}>
                {liScopeMissing && caps.aggregate ? (
                  <div className="flex items-start gap-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
                    <div>
                      <p className="font-medium">This connection cannot read post analytics</p>
                      <p className="text-muted-foreground mt-1">
                        It was authorised without the <code>r_member_postAnalytics</code> permission.
                        Disconnect and reconnect the account, accepting the analytics permission —
                        until then every figure here reads zero whether or not anyone engaged.
                      </p>
                    </div>
                  </div>
                ) : am?.code && !entries.length ? (
                  <div className="flex items-start gap-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
                    <p className="text-muted-foreground">
                      {am.message ?? 'These figures could not be read for this account.'}
                    </p>
                  </div>
                ) : entries.length === 0 ? (
                  <HubEmptyState
                    variant="empty"
                    icon={BarChart3}
                    title="No account figures yet"
                    description={`${platformLabel(acct.platform)} has not reported account-level numbers for this account yet.`}
                  />
                ) : (
                  <>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                      {entries.map(([key, m]) => (
                        <div key={key}>
                          <dt className="text-xs text-muted-foreground">{metricLabel(key)}</dt>
                          <dd className="mt-0.5 text-lg font-semibold tabular-nums">{formatMetric(key, m)}</dd>
                        </div>
                      ))}
                    </dl>

                    {/* Named, never zeroed. The platform declined to serve these, which is a
                        different fact from "nobody engaged" — and the two look identical the
                        moment an unavailable metric is rendered as 0. */}
                    {am!.unavailable.length > 0 && (
                      <p className="mt-4 border-t border-hairline pt-3 text-xs text-muted-foreground">
                        Not available from {platformLabel(acct.platform)} for this period:{' '}
                        {am!.unavailable.map(metricLabel).join(', ')}. These are withheld rather than
                        counted as zero.
                      </p>
                    )}
                  </>
                )}

                {/* "Can we manage more than one?" — for LinkedIn the answer is already yes, and
                    already connected. A member connection carries every company page that member
                    administers; publishing picks between them. Nobody connects those separately,
                    so the only thing missing was anyone asking what they are. */}
                {caps.aggregate && liOrgs.length > 0 && (
                  <div className="mt-4 border-t border-hairline pt-3">
                    <p className="text-sm font-medium">
                      This connection already administers {liOrgs.length} company{' '}
                      {liOrgs.length === 1 ? 'page' : 'pages'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {liOrgs.filter(isNamedOrg).map(org => (
                        <span
                          key={org.id}
                          className="inline-flex items-center gap-2 rounded-sm border border-hairline bg-surface-sunken px-2 py-1 text-xs"
                        >
                          {org.logoUrl
                            ? <img src={org.logoUrl} alt="" className="h-4 w-4 rounded-sm object-cover" />
                            : <PlatformIcon platform="linkedin" className="h-3.5 w-3.5" />}
                          {org.name}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {liOrgs.filter(o => !isNamedOrg(o)).length > 0 && (
                        <>
                          {liOrgs.filter(o => !isNamedOrg(o)).length} more that LinkedIn returned by
                          id only — usually a page the member is listed on without full admin rights.{' '}
                        </>
                      )}
                      Publishing can target any of these <strong className="text-foreground">without
                      connecting anything else</strong>. Connecting one as its own account
                      additionally gives per-post analytics and the comments inbox — the two things a
                      personal profile cannot have, and the only real reason to add a page here.
                    </p>
                  </div>
                )}
              </Loadable>
            </CardContent>
          </Card>
        );
      })}

      {/* Shown when EITHER source can fill it: post-derived for a business page, the member
          aggregate for a personal profile. */}
      {(tabPerPost || tabAggregate) && (
        <DailyReachChart daily={daily} platforms={platformTotals} loading={derivedLoading} />
      )}

      {/* Both derive from a post list and have no member-account substitute, so for a workspace
          with only personal profiles they are not "empty" — they are inapplicable, and an empty
          state that invites you to wait for data that can never arrive is worse than absence. */}
      {tabPerPost && (
        <>
          <ContentDecayChart buckets={decay} loading={derivedLoading} />
          <PostingFrequencyTable rows={frequency} loading={derivedLoading} />
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Posts
          </CardTitle>
          <CardDescription>
            {tabPerPost
              ? <>Everything this workspace has drafted, scheduled or published, plus up to a year
                  of posts published natively on each connected account — Sync now imports those.
                  Newest first, with the engagement reported for each.</>
              : <>Everything this workspace has drafted, scheduled or published. Posts written
                  directly on a personal profile are not listed here — LinkedIn will not enumerate
                  them for anyone — so they arrive one URL at a time. Their engagement is still
                  counted in the lifetime totals above.</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* What the last sync could NOT do, per account. On screen rather than in a toast:
              an empty table with no explanation is the thing this panel kept producing. */}
          {syncNotes.length > 0 && (
            <div className="space-y-2">
              {syncNotes.map(note => (
                <div key={note.account_id} className="flex items-start gap-3 rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
                  <PlatformIcon platform={note.platform} className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">{note.handle ?? platformLabel(note.platform)}</p>
                    <p className="text-muted-foreground mt-0.5">{note.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* The only import a personal LinkedIn profile has. Offered whenever one is connected,
              not hidden behind the failure — the sweep can never succeed for it. */}
          {tabUrlImport && (
            <div className="rounded-sm border border-hairline p-3">
              <p className="text-sm font-medium">Import a published post by URL</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                For {(tabAccount ? [tabAccount] : urlImportAccounts).map(a => a.handle ?? platformLabel(a.platform)).join(', ')} —
                LinkedIn keeps personal profiles off its listing API, so posts are imported one link
                at a time. Any age, including before you connected, with full engagement figures.
              </p>
              <div className="mt-2 flex gap-2">
                <Input
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void importByUrl(); }}
                  placeholder="https://www.linkedin.com/posts/…"
                  disabled={syncing}
                  aria-label="Post URL to import"
                />
                <Button variant="secondary" onClick={() => void importByUrl()} disabled={syncing || !importUrl.trim()}>
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Import'}
                </Button>
              </div>
            </div>
          )}

          {visiblePosts.length === 0 ? (
            <HubEmptyState
              variant="empty"
              icon={BarChart3}
              title="No posts yet"
              description={urlImportAccounts.length === accounts.length && accounts.length > 0
                ? 'Paste a post URL above to import one, or write a new post from My accounts.'
                : 'Sync now to pull up to a year of posts already published on your connected accounts, or write a new one from My accounts.'}
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
                  {visiblePosts.map(post => {
                    const m = metrics[post.id];
                    return (
                      // The whole row opens the post. Every one of these was written by the agent
                      // and could only be changed by going back to chat and describing which row
                      // you meant — for a record the screen was already showing.
                      <TableRow
                        key={post.id}
                        className="cursor-pointer"
                        onClick={() => setOpenPostId(post.id)}
                      >
                        <TableCell className="max-w-xs">
                          <div className="flex items-start gap-2">
                            <PlatformIcon platform={post.platform} className="mt-0.5 h-4 w-4 shrink-0" />
                            {/* A LinkedIn personal profile exposes engagement but NOT the text or
                                media, so an imported row legitimately has no caption. The
                                permalink is then the only thing that identifies it. */}
                            {post.caption
                              ? <span className="truncate text-sm">{post.caption}</span>
                              : post.metadata?.platform_post_url
                                ? (
                                  <a
                                    href={post.metadata.platform_post_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    // The row opens the editor; this opens the live post. Without
                                    // stopping the bubble one click would do both.
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 truncate text-sm text-primary hover:underline"
                                  >
                                    View on {platformLabel(post.platform)} <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                )
                                : <span className="truncate text-sm text-muted-foreground">(no caption)</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(post.status)} className="capitalize">{post.status}</Badge>
                          {/* A failed leg under a published post. Named, because "something
                              failed" is not something anyone can act on (#384 A). */}
                          {failedLegs(post).map((leg) => (
                            <Badge
                              key={leg.platform}
                              variant="error"
                              className="ml-1"
                              title={leg.error ?? undefined}
                            >
                              {platformLabel(leg.platform)} failed
                            </Badge>
                          ))}
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

      <SocialPostEditorDialog
        postId={openPostId}
        accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle }))}
        onClose={() => setOpenPostId(null)}
        onChanged={() => { void loadCore(); }}
      />
    </div>
  );
};

export default SocialAnalyticsPanel;
