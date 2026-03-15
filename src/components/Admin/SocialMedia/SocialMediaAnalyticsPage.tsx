import React, { useState, useEffect } from 'react';
import {
  Eye, Radio, TrendingUp, Coins, Loader2,
} from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/core/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AdminStatCard } from '@/components/Admin/AdminStatCard';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';

// ── Types ──────────────────────────────────────────────────────────────────────

type DateRange = '7' | '30' | '90';

interface OverallStats {
  impressions: number;
  reach: number;
  engagementRate: number;
  creditsSpent: number;
}

interface CreditsBreakdown {
  caption: number;
  image: number;
  video: number;
}

interface PlatformRow {
  platform: string;
  posts: number;
  impressions: number;
  avgEngagement: number;
  credits: number;
}

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📸', facebook: '📘', linkedin: '💼', tiktok: '🎵',
  pinterest: '📌', youtube: '▶️', twitter: '🐦', threads: '🧵',
};

// ── Component ──────────────────────────────────────────────────────────────────

export function SocialMediaAnalyticsPage() {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [overallStats, setOverallStats] = useState<OverallStats>({
    impressions: 0,
    reach: 0,
    engagementRate: 0,
    creditsSpent: 0,
  });
  const [creditsBreakdown, setCreditsBreakdown] = useState<CreditsBreakdown>({
    caption: 0,
    image: 0,
    video: 0,
  });
  const [platformRows, setPlatformRows] = useState<PlatformRow[]>([]);

  // ── Load workspace ─────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();
      if (data) setWorkspaceId(data.workspace_id);
    };
    load();
  }, []);

  // ── Load analytics ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return;
    const load = async () => {
      setLoading(true);
      try {
        const since = new Date(
          Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000,
        ).toISOString();

        // Fetch posts + analytics in parallel
        const [{ data: postsData }, { data: analyticsData }] = await Promise.all([
          supabase
            .from('social_posts')
            .select('id,platform,credits_used,credits_breakdown,status')
            .eq('workspace_id', workspaceId)
            .gte('created_at', since),
          supabase
            .from('social_post_analytics')
            .select('post_id,impressions,reach,engagement_rate')
            .gte('created_at', since),
        ]);

        const posts = postsData ?? [];
        const analytics = analyticsData ?? [];

        // Overall stats
        const totalImpressions = analytics.reduce(
          (s: number, a: any) => s + (a.impressions ?? 0), 0,
        );
        const totalReach = analytics.reduce(
          (s: number, a: any) => s + (a.reach ?? 0), 0,
        );
        const avgEngagement =
          analytics.length > 0
            ? analytics.reduce((s: number, a: any) => s + (a.engagement_rate ?? 0), 0) /
              analytics.length
            : 0;
        const totalCredits = posts.reduce(
          (s: number, p: any) => s + (p.credits_used ?? 0), 0,
        );

        setOverallStats({
          impressions: totalImpressions,
          reach: totalReach,
          engagementRate: Math.round(avgEngagement * 100) / 100,
          creditsSpent: totalCredits,
        });

        // Credits breakdown
        const breakdown: CreditsBreakdown = { caption: 0, image: 0, video: 0 };
        posts.forEach((p: any) => {
          const cb = p.credits_breakdown;
          if (cb && typeof cb === 'object') {
            breakdown.caption += cb.caption ?? 0;
            breakdown.image   += cb.image   ?? 0;
            breakdown.video   += cb.video   ?? 0;
          }
        });
        setCreditsBreakdown(breakdown);

        // Per-platform aggregation
        const platformMap: Record<string, { posts: number; impressions: number; engagements: number[]; credits: number }> = {};
        const analyticsMap: Record<string, any> = {};
        analytics.forEach((a: any) => {
          analyticsMap[a.post_id] = a;
        });

        posts.forEach((p: any) => {
          const key = (p.platform ?? 'unknown').toLowerCase();
          if (!platformMap[key]) {
            platformMap[key] = { posts: 0, impressions: 0, engagements: [], credits: 0 };
          }
          platformMap[key].posts   += 1;
          platformMap[key].credits += p.credits_used ?? 0;
          const an = analyticsMap[p.id];
          if (an) {
            platformMap[key].impressions     += an.impressions ?? 0;
            platformMap[key].engagements.push(an.engagement_rate ?? 0);
          }
        });

        const rows: PlatformRow[] = Object.entries(platformMap).map(([plat, vals]) => ({
          platform: plat,
          posts: vals.posts,
          impressions: vals.impressions,
          avgEngagement:
            vals.engagements.length > 0
              ? Math.round(
                  (vals.engagements.reduce((s, v) => s + v, 0) / vals.engagements.length) * 100,
                ) / 100
              : 0,
          credits: vals.credits,
        }));

        setPlatformRows(rows);
      } catch (err: any) {
        toast({ title: 'Failed to load analytics', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [workspaceId, dateRange]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 pb-10">
      <GlobalAdminHeader
        title="Analytics"
        description="Track performance across all social channels"
        breadcrumbs={[
          { label: 'Social Media', path: '/admin/social-media' },
          { label: 'Analytics' },
        ]}
      />

      <div className="px-6 space-y-6">
        {/* Date range tabs */}
        <Tabs value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger
              value="7"
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Last 7 days
            </TabsTrigger>
            <TabsTrigger
              value="30"
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Last 30 days
            </TabsTrigger>
            <TabsTrigger
              value="90"
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Last 90 days
            </TabsTrigger>
          </TabsList>

          {/* Stats — same for all tab content */}
          {(['7', '30', '90'] as DateRange[]).map((range) => (
            <TabsContent key={range} value={range} className="mt-4 space-y-6">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Stat cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <AdminStatCard title="Total Impressions" value={overallStats.impressions.toLocaleString()} icon={Eye} />
                    <AdminStatCard title="Total Reach"       value={overallStats.reach.toLocaleString()} icon={Radio} />
                    <AdminStatCard title="Avg Engagement"   value={`${overallStats.engagementRate}%`} icon={TrendingUp} />
                    <AdminStatCard title="Credits Spent"    value={overallStats.creditsSpent} icon={Coins} />
                  </div>

                  {/* Credits breakdown */}
                  <Card className="dashboard-card">
                    <CardHeader>
                      <CardTitle className="text-base">Credits Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(
                          [
                            { key: 'caption', label: 'Caption generation' },
                            { key: 'image',   label: 'Image generation'   },
                            { key: 'video',   label: 'Video generation'   },
                          ] as { key: keyof CreditsBreakdown; label: string }[]
                        ).map(({ key, label }) => (
                          <div key={key} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-medium">{creditsBreakdown[key]} credits</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Per-platform table */}
                  <Card className="dashboard-card">
                    <CardHeader>
                      <CardTitle className="text-base">Per-Platform Performance</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {platformRows.length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                          No data for this period.
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Platform</TableHead>
                              <TableHead>Posts</TableHead>
                              <TableHead>Impressions</TableHead>
                              <TableHead>Avg Engagement</TableHead>
                              <TableHead>Credits</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {platformRows.map((row) => (
                              <TableRow key={row.platform}>
                                <TableCell>
                                  <span className="text-lg mr-1">
                                    {PLATFORM_EMOJI[row.platform] ?? '🌐'}
                                  </span>
                                  <span className="capitalize">{row.platform}</span>
                                </TableCell>
                                <TableCell>{row.posts}</TableCell>
                                <TableCell>{row.impressions.toLocaleString()}</TableCell>
                                <TableCell>{row.avgEngagement}%</TableCell>
                                <TableCell>{row.credits}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
