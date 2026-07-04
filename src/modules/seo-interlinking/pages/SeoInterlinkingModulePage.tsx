import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw, Loader2, AlertTriangle, CheckCircle2, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';

interface AdminWebsiteRow {
  id: string;
  user_id: string;
  url: string;
  display_name: string | null;
  is_active: boolean;
  is_default: boolean;
  page_count: number;
  max_pages: number;
  last_crawled_at: string | null;
  last_crawl_error: string | null;
  user_email: string | null;
  user_full_name: string | null;
}

interface Counters {
  total_sites: number;
  total_pages: number;
  errored: number;
  never_crawled: number;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const SeoInterlinkingPanel: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminWebsiteRow[]>([]);
  const [counters, setCounters] = useState<Counters>({ total_sites: 0, total_pages: 0, errored: 0, never_crawled: 0 });
  const [loading, setLoading] = useState(true);
  const [recrawling, setRecrawling] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);

    const sitesQuery = await supabase
      .from('user_websites')
      .select('id, user_id, url, display_name, is_active, is_default, page_count, max_pages, last_crawled_at, last_crawl_error')
      .order('last_crawled_at', { ascending: false, nullsFirst: false });

    const sites = (sitesQuery.data ?? []) as Omit<AdminWebsiteRow, 'user_email' | 'user_full_name'>[];

    // Hydrate user info — best-effort lookup against user_profiles
    const userIds = Array.from(new Set(sites.map((s) => s.user_id)));
    let userMap = new Map<string, { email: string | null; full_name: string | null }>();
    if (userIds.length > 0) {
      const profilesQuery = await supabase
        .from('user_profiles')
        .select('user_id, email, full_name')
        .in('user_id', userIds);
      for (const u of profilesQuery.data || []) {
        userMap.set(u.user_id, { email: u.email ?? null, full_name: u.full_name ?? null });
      }
    }

    const enriched: AdminWebsiteRow[] = sites.map((s) => ({
      ...s,
      user_email: userMap.get(s.user_id)?.email ?? null,
      user_full_name: userMap.get(s.user_id)?.full_name ?? null,
    }));

    setRows(enriched);
    setCounters({
      total_sites: enriched.length,
      total_pages: enriched.reduce((sum, r) => sum + (r.page_count || 0), 0),
      errored: enriched.filter((r) => !!r.last_crawl_error).length,
      never_crawled: enriched.filter((r) => !r.last_crawled_at).length,
    });

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleRecrawl = async (row: AdminWebsiteRow) => {
    setRecrawling((c) => ({ ...c, [row.id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('crawl-user-website', {
        body: { website_id: row.id, mode: 'full' },
      });
      if (error || !data?.success) throw new Error(await edgeErrorMessage(error, 'Crawl failed'));
      toast({
        title: 'Recrawl complete',
        description: `${data.data?.pages_indexed ?? 0} of ${data.data?.pages_discovered ?? 0} pages indexed`,
      });
      load();
    } catch (e: any) {
      toast({ title: 'Recrawl failed', description: e.message, variant: 'destructive' });
      load();
    } finally {
      setRecrawling((c) => ({ ...c, [row.id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Connected user websites — sitemap-indexed pages used by the SEO article generator for site-aware link suggestions.
      </p>

      <div className="space-y-6">
        {/* Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="dashboard-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total sites</p>
              <p className="text-2xl font-semibold">{counters.total_sites}</p>
            </CardContent>
          </Card>
          <Card className="dashboard-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Indexed pages</p>
              <p className="text-2xl font-semibold">{counters.total_pages.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="dashboard-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Errored</p>
              <p className="text-2xl font-semibold text-red-500">{counters.errored}</p>
            </CardContent>
          </Card>
          <Card className="dashboard-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Never crawled</p>
              <p className="text-2xl font-semibold text-muted-foreground">{counters.never_crawled}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">Connected Websites</CardTitle>
            <CardDescription>
              Per-user connected sites. The SEO pipeline reads from <code>user_websites</code> + <code>user_website_pages</code> when generating inter-linking suggestions for that user's articles.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No websites have been connected yet. Users add sites from <Link to="/profile" className="text-primary hover:underline">their profile page</Link>.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Website</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-right">Pages</TableHead>
                    <TableHead>Last Crawl</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium truncate max-w-[280px]">
                            {r.display_name || r.url.replace(/^https?:\/\//, '')}
                          </span>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline truncate inline-flex items-center gap-1 max-w-[280px]"
                          >
                            {r.url}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm truncate max-w-[200px]">
                            {r.user_full_name || '—'}
                          </span>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {r.user_email || r.user_id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-medium">{r.page_count}</span>
                        <span className="text-xs text-muted-foreground"> / {r.max_pages}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{timeAgo(r.last_crawled_at)}</span>
                      </TableCell>
                      <TableCell>
                        {r.last_crawl_error ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Error
                          </Badge>
                        ) : !r.is_active ? (
                          <Badge variant="outline">Inactive</Badge>
                        ) : r.last_crawled_at && r.page_count > 0 ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Healthy
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Recrawl"
                          onClick={() => handleRecrawl(r)}
                          disabled={!!recrawling[r.id]}
                        >
                          {recrawling[r.id] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Show errors for quick triage */}
        {counters.errored > 0 && (
          <Card className="dashboard-card border-red-500/30">
            <CardHeader>
              <CardTitle className="text-base text-red-500 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Sites with errors
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.filter((r) => r.last_crawl_error).map((r) => (
                <div key={r.id} className="text-sm">
                  <p className="font-medium truncate">{r.url}</p>
                  <p className="text-xs text-red-500 break-all">{r.last_crawl_error}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default SeoInterlinkingPanel;
