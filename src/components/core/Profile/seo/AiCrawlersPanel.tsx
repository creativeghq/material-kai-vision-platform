import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Copy, Loader2, RefreshCw, Unplug } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { userWebsitesService } from '@/services/userWebsitesService';
import { formatDate, timeAgo } from '@/utils/datetime';
import { compact, statusPresentation } from './seoMetrics';
import { Sparkline } from './Sparkline';
import { ingestUrl, PURPOSE_LABEL, workerScript, type AiCrawls } from './aiCrawlers';

const TH = 'px-3 py-2';

const Setup: React.FC<{ websiteId: string; secret: string | null; connected: boolean; busy: boolean; onConnect: () => void; onDisconnect: () => void }> = ({
  websiteId, secret, connected, busy, onConnect, onDisconnect,
}) => {
  const { toast } = useToast();
  const url = ingestUrl(process.env.SUPABASE_URL || '', websiteId);
  const script = workerScript(url);
  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast({ title: `${what} copied` }))
      .catch(() => toast({ title: `Could not copy the ${what.toLowerCase()}`, variant: 'destructive' }));
  };
  return (
    <div className="space-y-3 rounded-sm border border-hairline bg-surface-sunken p-3 text-xs">
      <p className="text-muted-foreground">
        Crawlers run no JavaScript, so only your server or CDN sees them. On Cloudflare, add a Worker on the site&rsquo;s
        route with this script and a secret named <code>KAI_CRAWLER_SECRET</code>. Any other host can POST the same signed
        JSON from its access log.
      </p>
      {secret && (
        <div className="space-y-1">
          <p className="font-medium text-foreground">Secret — shown once. Store it now; rotating it replaces it.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-sm border border-hairline bg-card px-2 py-1">{secret}</code>
            <Button size="sm" variant="outline" onClick={() => copy(secret, 'Secret')}><Copy className="mr-1 h-3.5 w-3.5" />Copy</Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!connected ? (
          <Button size="sm" disabled={busy} onClick={onConnect}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Bot className="mr-1 h-3.5 w-3.5" />}
            Connect a log source
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={onConnect}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />Rotate secret
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onDisconnect}>
              <Unplug className="mr-1 h-3.5 w-3.5" />Disconnect
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={() => copy(script, 'Worker script')}>
          <Copy className="mr-1 h-3.5 w-3.5" />Copy Worker script
        </Button>
      </div>
    </div>
  );
};

/** Which AI crawlers read the site, what they never read, and whether a crawled page later received that assistant's visitors. */
export const AiCrawlersPanel: React.FC<{ websiteId: string }> = ({ websiteId }) => {
  const { toast } = useToast();
  const [data, setData] = useState<AiCrawls | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    userWebsitesService.aiCrawls(websiteId)
      .then((r) => { if (!cancelled) { setData(r); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [websiteId]);
  useEffect(() => load(), [load]);

  const connect = async () => {
    setBusy(true);
    try {
      setSecret(await userWebsitesService.connectCrawlerSource(websiteId));
      load();
    } catch (e) {
      toast({ title: 'Could not connect the log source', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      await userWebsitesService.disconnectCrawlerSource(websiteId);
      setSecret(null);
      load();
    } catch (e) {
      toast({ title: 'Could not disconnect the log source', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const ok = data?.status === 'ok';
  const points = (data?.series ?? []).map((p) => Number(p.v));
  const join = data?.referral_join;

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4 text-primary" />
          AI crawlers reading the site
        </CardTitle>
        <CardDescription>
          Requests from GPTBot, ClaudeBot, PerplexityBot and other AI crawlers, taken from the site&rsquo;s own request log,
          over the last {data?.days ?? 30} days.
          {data?.source?.last_received_at ? ` Last delivery ${timeAgo(data.source.last_received_at)}.` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {failed || !data ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {failed ? 'The crawler report could not be loaded, so this is unknown.' : 'Loading…'}
          </p>
        ) : (
          <>
            {!ok && (
              <HubEmptyState
                variant="empty"
                title={statusPresentation(data.status).placeholder}
                description={data.note ?? statusPresentation(data.status).explain}
              />
            )}
            <Setup
              websiteId={websiteId}
              secret={secret}
              connected={!!data.source}
              busy={busy}
              onConnect={connect}
              onDisconnect={disconnect}
            />
            {ok && (
              <>
                {points.length >= 2 && <Sparkline points={points} className="h-10 w-full" ariaLabel="AI crawler requests per day" />}
                <div className="table-scroll">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                      <tr>
                        <th className={`${TH} text-left`}>Crawler</th>
                        <th className={`${TH} text-left`}>Why it reads</th>
                        <th className={`${TH} text-right`}>Requests</th>
                        <th className={`${TH} text-right`}>Pages</th>
                        <th className={`${TH} text-left`}>IP check</th>
                        <th className={`${TH} text-left`}>Last seen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {data.bots.map((b) => (
                        <tr key={b.bot}>
                          <td className="px-3 py-2 text-xs"><span className="font-medium text-foreground">{b.bot}</span> <span className="text-muted-foreground">{b.label}</span></td>
                          <td className="px-3 py-2 text-xs">{PURPOSE_LABEL[b.purpose] ?? b.purpose}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{compact(b.hits)}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{compact(b.pages)}</td>
                          <td className="px-3 py-2 text-xs">
                            {b.unverified > 0 ? <Badge variant="warning">{compact(b.unverified)} not from the vendor&rsquo;s IPs</Badge>
                              : b.verified > 0 ? <Badge variant="success">Vendor IPs</Badge>
                              : <Badge variant="neutral">Vendor publishes no IP list</Badge>}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(b.last_seen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {data.source && data.coverage.some((c) => c.pages_total > 0) && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">Pages each assistant has never read</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.coverage.map((c) => (
                    <div key={c.platform} className="rounded-sm border border-hairline p-2 text-xs">
                      <p className="font-medium text-foreground">
                        {c.label}: {compact(c.pages_crawled)} of {compact(c.pages_total)} pages read
                      </p>
                      {c.never_crawled_sample.length > 0 && (
                        <p className="mt-1 break-all text-[11px] text-muted-foreground">
                          Never read, e.g. {c.never_crawled_sample.slice(0, 5).join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {join && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">Read by an assistant → visitors from that assistant</p>
                {join.status !== 'ok' || join.rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {join.note ?? 'No page was both read by an assistant and visited from it in this period.'}
                  </p>
                ) : (
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                        <tr>
                          <th className={`${TH} text-left`}>Page</th>
                          <th className={`${TH} text-left`}>Assistant</th>
                          <th className={`${TH} text-right`}>Crawler reads</th>
                          <th className={`${TH} text-right`}>Visitors sent</th>
                          <th className={`${TH} text-right`}>Key events</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {join.rows.map((r) => (
                          <tr key={`${r.path}|${r.platform}`}>
                            <td className="max-w-[18rem] truncate px-3 py-2 text-xs text-foreground" title={r.path}>{r.path}</td>
                            <td className="px-3 py-2 text-xs">{r.label}</td>
                            <td className="px-3 py-2 text-right text-xs tabular-nums">{data.source ? compact(r.crawls) : '—'}</td>
                            <td className="px-3 py-2 text-right text-xs tabular-nums">{compact(r.referred_sessions)}</td>
                            <td className="px-3 py-2 text-right text-xs tabular-nums">{compact(Number(r.conversions))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AiCrawlersPanel;
