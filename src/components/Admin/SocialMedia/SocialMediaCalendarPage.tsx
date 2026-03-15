import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import {
  startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval,
  format, isSameDay, parseISO,
} from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SocialPost {
  id: string;
  platform: string;
  caption?: string;
  status: 'scheduled' | 'published';
  scheduled_at?: string;
  published_at?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  scheduled: 'bg-blue-500 text-white',
  published: 'bg-green-500 text-white',
};

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📸', facebook: '📘', linkedin: '💼', tiktok: '🎵',
  pinterest: '📌', youtube: '▶️', twitter: '🐦', threads: '🧵',
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Component ──────────────────────────────────────────────────────────────────

export function SocialMediaCalendarPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

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

  // ── Load posts for week ────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('social_posts')
          .select('id,platform,caption,status,scheduled_at,published_at')
          .eq('workspace_id', workspaceId)
          .in('status', ['scheduled', 'published'])
          .gte('scheduled_at', weekStart.toISOString())
          .lte('scheduled_at', weekEnd.toISOString())
          .order('scheduled_at', { ascending: true });
        if (error) throw error;
        setPosts((data ?? []) as SocialPost[]);
      } catch (err: any) {
        toast({ title: 'Failed to load calendar', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [workspaceId, weekStart]);

  const postsForDay = (day: Date) =>
    posts.filter((p) => {
      const dateStr = p.scheduled_at ?? p.published_at;
      if (!dateStr) return false;
      return isSameDay(parseISO(dateStr), day);
    });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 pb-10">
      <GlobalAdminHeader
        title="Content Calendar"
        description="View and manage scheduled posts"
        breadcrumbs={[
          { label: 'Social Media', path: '/admin/social-media' },
          { label: 'Calendar' },
        ]}
      />

      <div className="px-6 space-y-4">
        {/* Week navigation */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full ml-2"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            Today
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Desktop: 7-col grid */}
            <div className="hidden md:grid grid-cols-7 gap-2">
              {days.map((day, i) => {
                const dayPosts = postsForDay(day);
                const isToday = isSameDay(day, new Date());
                return (
                  <div key={day.toISOString()} className="flex flex-col gap-1 min-h-[180px]">
                    {/* Day header */}
                    <div
                      className={`text-center text-xs font-medium py-1 rounded ${
                        isToday
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {DAY_LABELS[i]}
                      <div className="text-lg font-bold leading-tight">{format(day, 'd')}</div>
                    </div>

                    {/* Posts */}
                    <div className="flex-1 space-y-1 p-1 border border-border rounded-lg bg-background/60">
                      {dayPosts.map((post) => (
                        <div
                          key={post.id}
                          className="dashboard-card p-2 text-xs cursor-default hover:shadow-sm transition"
                        >
                          <div className="flex items-center gap-1 mb-1">
                            <span>{PLATFORM_EMOJI[post.platform?.toLowerCase()] ?? '🌐'}</span>
                            <Badge className={`text-[10px] px-1 py-0 ${STATUS_BADGE[post.status] ?? ''}`}>
                              {post.status}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground line-clamp-2">
                            {post.caption ? post.caption.slice(0, 30) + (post.caption.length > 30 ? '…' : '') : '—'}
                          </p>
                        </div>
                      ))}

                      {dayPosts.length === 0 && (
                        <button
                          onClick={() => navigate('/admin/social-media/create')}
                          className="w-full h-full flex items-center justify-center text-muted-foreground/40 hover:text-primary transition py-6"
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile: list view */}
            <div className="md:hidden space-y-3">
              {days.map((day, i) => {
                const dayPosts = postsForDay(day);
                const isToday = isSameDay(day, new Date());
                return (
                  <div key={day.toISOString()} className="dashboard-card">
                    <div
                      className={`text-sm font-medium mb-2 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      {DAY_LABELS[i]}, {format(day, 'MMM d')}
                    </div>
                    {dayPosts.length === 0 ? (
                      <button
                        onClick={() => navigate('/admin/social-media/create')}
                        className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-primary transition"
                      >
                        <Plus className="h-3 w-3" /> Add post
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {dayPosts.map((post) => (
                          <div key={post.id} className="flex items-center gap-2 text-sm">
                            <span>{PLATFORM_EMOJI[post.platform?.toLowerCase()] ?? '🌐'}</span>
                            <Badge className={`text-xs ${STATUS_BADGE[post.status] ?? ''}`}>
                              {post.status}
                            </Badge>
                            <span className="text-muted-foreground truncate">
                              {post.caption?.slice(0, 30) ?? '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
