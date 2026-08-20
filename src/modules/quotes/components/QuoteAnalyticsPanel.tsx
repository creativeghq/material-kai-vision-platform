import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Printer, Download, Loader2, Link2, Copy, ExternalLink, Users, Globe, Building2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { quotesService } from '../services/QuotesService';
import { formatDate } from '@/utils/datetime';

/**
 * QuoteAnalyticsPanel — admin-only view/download analytics for a single quote,
 * plus the public share-link manager. Mounted as the "Analytics" tab on
 * /quotes/manage/:id. Reads `quote_analytics_events` (admin RLS) directly.
 */

interface QuoteAnalyticsEventRow {
  id: string;
  event_type: 'viewed' | 'previewed' | 'downloaded';
  view_context: 'customer' | 'admin' | 'public' | 'preview';
  user_id: string | null;
  session_id: string;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface Props {
  quoteId: string;
  publicShareEnabled: boolean;
  publicShareToken: string | null;
  onShareChange?: () => void;
}

const CONTEXT_LABEL: Record<string, string> = {
  customer: 'Customer',
  admin: 'Admin',
  public: 'Public link',
  preview: 'Preview',
};

export const QuoteAnalyticsPanel: React.FC<Props> = ({
  quoteId,
  publicShareEnabled,
  publicShareToken,
  onShareChange,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<QuoteAnalyticsEventRow[]>([]);
  const [togglingShare, setTogglingShare] = useState(false);

  const shareUrl =
    publicShareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/q/${publicShareToken}`
      : null;

  const loadEvents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('quote_analytics_events')
        .select('id, event_type, view_context, user_id, session_id, metadata, created_at')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setEvents((data as QuoteAnalyticsEventRow[]) ?? []);
    } catch (err) {
      console.error('Failed to load quote analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quoteId) loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  const stats = useMemo(() => {
    const s = {
      viewsCustomer: 0,
      viewsPublic: 0,
      viewsAdmin: 0,
      previews: 0,
      downloads: 0,
      uniqueSessions: new Set<string>(),
      uniqueViewers: new Set<string>(),
      lastActivity: events[0]?.created_at ?? null,
    };
    for (const e of events) {
      s.uniqueSessions.add(e.session_id);
      if (e.user_id) s.uniqueViewers.add(e.user_id);
      if (e.event_type === 'previewed') s.previews += 1;
      else if (e.event_type === 'downloaded') s.downloads += 1;
      else if (e.event_type === 'viewed') {
        if (e.view_context === 'public') s.viewsPublic += 1;
        else if (e.view_context === 'admin') s.viewsAdmin += 1;
        else s.viewsCustomer += 1;
      }
    }
    return s;
  }, [events]);

  const handleToggleShare = async (next: boolean) => {
    try {
      setTogglingShare(true);
      await quotesService.setQuotePublicShare(quoteId, next);
      toast({
        title: next ? 'Public link enabled' : 'Public link disabled',
        description: next
          ? 'Anyone with the link can now view this quote.'
          : 'The link no longer resolves.',
      });
      onShareChange?.();
    } catch (err) {
      console.error('Failed to toggle share:', err);
      toast({ title: 'Error', description: 'Could not update sharing.', variant: 'destructive' });
    } finally {
      setTogglingShare(false);
    }
  };

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(
      () => toast({ title: 'Link copied', description: shareUrl }),
      () => toast({ title: 'Copy failed', variant: 'destructive' }),
    );
  };

  return (
    <div className="space-y-5">
      {/* Public share link manager */}
      <Card className="dashboard-card rounded-2xl border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                <Link2 className="h-4 w-4" /> Public share link
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                Generate a tokenized link anyone can open without logging in. Every public
                view and download is tracked below with the “Public link” context.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {togglingShare && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch checked={publicShareEnabled} onCheckedChange={handleToggleShare} disabled={togglingShare} />
            </div>
          </div>

          {publicShareEnabled && shareUrl && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <code className="text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex-1 min-w-0 truncate">
                {shareUrl}
              </code>
              <Button variant="outline" size="sm" className="gap-1" onClick={copyLink}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => window.open(shareUrl, '_blank')}>
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Eye} label="Customer views" value={stats.viewsCustomer} />
        <StatCard icon={Globe} label="Public views" value={stats.viewsPublic} />
        <StatCard icon={Printer} label="Previews" value={stats.previews} />
        <StatCard icon={Download} label="Downloads" value={stats.downloads} />
        <StatCard icon={Users} label="Unique visitors" value={stats.uniqueSessions.size} />
        <StatCard icon={Building2} label="Admin views" value={stats.viewsAdmin} />
      </div>

      {/* Activity timeline */}
      <Card className="dashboard-card rounded-2xl border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
              <Eye className="h-4 w-4" /> Recent activity
            </h3>
            <Badge variant="secondary">{events.length} event{events.length === 1 ? '' : 's'}</Badge>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No views or downloads recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-white/5">
              {events.slice(0, 60).map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <EventIcon type={e.event_type} />
                    <div className="min-w-0">
                      <span className="capitalize font-medium">{e.event_type}</span>
                      {e.metadata?.method && (
                        <span className="text-xs text-muted-foreground ml-1">({e.metadata.method})</span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] capitalize ${e.view_context === 'public' ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      {CONTEXT_LABEL[e.view_context] ?? e.view_context}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                    {formatDate(e.created_at, { withTime: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; value: number }> = ({
  icon: Icon,
  label,
  value,
}) => (
  <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
    <div className="flex items-center gap-3">
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: '2rem', height: '2rem', borderRadius: 'var(--radius-lg)', backgroundColor: 'hsl(var(--primary) / 0.1)' }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </div>
    </div>
  </div>
);

const EventIcon: React.FC<{ type: string }> = ({ type }) => {
  if (type === 'downloaded') return <Download className="h-4 w-4 text-green-500" />;
  if (type === 'previewed') return <Printer className="h-4 w-4 text-blue-500" />;
  return <Eye className="h-4 w-4 text-muted-foreground" />;
};

export default QuoteAnalyticsPanel;
