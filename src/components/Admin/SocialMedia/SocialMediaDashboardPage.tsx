import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Send, Clock, FilePen, Coins, Plus, CalendarDays,
  BarChart2, Users2, Loader2,
} from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/core/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AdminStatCard } from '@/components/Admin/AdminStatCard';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { formatDistanceToNow } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SocialPost {
  id: string;
  platform: string;
  caption?: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  published_at?: string;
  scheduled_at?: string;
  credits_used?: number;
  created_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'bg-gray-400 text-white' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-500 text-white' },
  published: { label: 'Published', className: 'bg-green-500 text-white' },
  failed:    { label: 'Failed',    className: 'bg-red-500 text-white' },
};

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📸',
  facebook:  '📘',
  linkedin:  '💼',
  tiktok:    '🎵',
  pinterest: '📌',
  youtube:   '▶️',
  twitter:   '🐦',
  threads:   '🧵',
};

// ── Component ──────────────────────────────────────────────────────────────────

export function SocialMediaDashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [recentPosts, setRecentPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    scheduled: 0,
    drafts: 0,
    creditsThisWeek: 0,
  });

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

  // ── Load posts ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return;
    const load = async () => {
      setLoading(true);
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [{ data: allPosts }, { data: recent }] = await Promise.all([
          supabase.from('social_posts').select('id,status,credits_used,created_at').eq('workspace_id', workspaceId),
          supabase.from('social_posts')
            .select('id,platform,caption,status,published_at,scheduled_at,credits_used,created_at')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .limit(10),
        ]);

        const all = allPosts ?? [];
        const creditsThisWeek = all
          .filter((p: any) => p.created_at >= sevenDaysAgo)
          .reduce((sum: number, p: any) => sum + (p.credits_used ?? 0), 0);

        setStats({
          total:    all.length,
          published: all.filter((p: any) => p.status === 'published').length,
          scheduled: all.filter((p: any) => p.status === 'scheduled').length,
          drafts:    all.filter((p: any) => p.status === 'draft').length,
          creditsThisWeek,
        });

        setRecentPosts((recent ?? []) as SocialPost[]);
      } catch (err: any) {
        toast({ title: 'Failed to load posts', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [workspaceId]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 pb-10">
      <GlobalAdminHeader
        title="Social Media"
        description="Manage and schedule your social media content"
      />

      <div className="px-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <AdminStatCard title="Total Posts"   value={loading ? '…' : stats.total}           icon={FileText} />
          <AdminStatCard title="Published"     value={loading ? '…' : stats.published}       icon={Send} />
          <AdminStatCard title="Scheduled"     value={loading ? '…' : stats.scheduled}       icon={Clock} />
          <AdminStatCard title="Drafts"        value={loading ? '…' : stats.drafts}          icon={FilePen} />
          <AdminStatCard title="Credits This Week" value={loading ? '…' : stats.creditsThisWeek} icon={Coins} />
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => navigate('/admin/social-media/create')}>
            <Plus className="h-4 w-4 mr-2" />
            Create Post
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => navigate('/admin/social-media/calendar')}>
            <CalendarDays className="h-4 w-4 mr-2" />
            View Calendar
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => navigate('/admin/social-media/analytics')}>
            <BarChart2 className="h-4 w-4 mr-2" />
            Analytics
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => navigate('/profile?tab=social-accounts')}>
            <Users2 className="h-4 w-4 mr-2" />
            My Accounts
          </Button>
        </div>

        {/* Recent posts table */}
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">Recent Posts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : recentPosts.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No posts yet. Create your first post to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead>Caption</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Published At</TableHead>
                    <TableHead>Credits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPosts.map((post) => {
                    const badge = STATUS_BADGE[post.status] ?? STATUS_BADGE.draft;
                    const dateStr = post.published_at ?? post.scheduled_at;
                    return (
                      <TableRow key={post.id}>
                        <TableCell>
                          <span className="text-lg">
                            {PLATFORM_EMOJI[post.platform?.toLowerCase()] ?? '🌐'}
                          </span>{' '}
                          <span className="text-sm capitalize">{post.platform}</span>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <span className="text-sm text-muted-foreground line-clamp-1">
                            {post.caption ? post.caption.slice(0, 60) + (post.caption.length > 60 ? '…' : '') : '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={badge.className}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {dateStr
                            ? formatDistanceToNow(new Date(dateStr), { addSuffix: true })
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm">{post.credits_used ?? 0}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
