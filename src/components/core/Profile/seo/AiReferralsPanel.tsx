import React, { useEffect, useState } from 'react';
import { MousePointerClick } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { userWebsitesService } from '@/services/userWebsitesService';
import { formatDate } from '@/utils/datetime';
import { compact, statusPresentation } from './seoMetrics';
import { Sparkline } from './Sparkline';
import type { AiReferrals } from './aiCitations';

const Figure: React.FC<{ label: string; value: string | null; help: string }> = ({ label, value, help }) => (
  <div className="min-w-0" title={help}>
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold tabular-nums text-foreground">{value ?? '—'}</p>
  </div>
);

/** Visitors an AI assistant sent to the site, from GA4's session source. */
export const AiReferralsPanel: React.FC<{ websiteId: string }> = ({ websiteId }) => {
  const [data, setData] = useState<AiReferrals | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    userWebsitesService.aiReferrals(websiteId)
      .then((r) => { if (!cancelled) { setData(r); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [websiteId]);

  const ok = data?.status === 'ok';
  const points = (data?.series ?? []).map((p) => Number(p.v));

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MousePointerClick className="h-4 w-4 text-primary" />
          Visitors sent by AI assistants
        </CardTitle>
        <CardDescription>
          Sessions that arrived from ChatGPT, Perplexity, Copilot, Gemini and other assistants, as Google Analytics
          recorded their source.
          {data?.period_start && data.period_end ? ` ${formatDate(data.period_start)} → ${formatDate(data.period_end)}.` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {failed || !data ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {failed ? 'The referral report could not be loaded, so this is unknown.' : 'Loading…'}
          </p>
        ) : !ok ? (
          <HubEmptyState
            variant="empty"
            title={statusPresentation(data.status).placeholder}
            description={data.note ?? statusPresentation(data.status).explain}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label="AI-referred sessions" value={compact(data.ai_sessions)} help="Sessions whose GA4 source is an AI assistant." />
              <Figure
                label="Share of traffic"
                value={data.ai_share != null ? `${data.ai_share}%` : null}
                help="AI-referred sessions divided by sessions from the sources Google Analytics reported."
              />
              <Figure
                label="Engaged rate"
                value={data.ai_engaged_rate != null ? `${data.ai_engaged_rate}%` : null}
                help={`Engaged sessions from assistants. Site-wide: ${data.site_engaged_rate ?? '—'}%.`}
              />
              <Figure label="Key events" value={compact(Number(data.ai_conversions))} help="Conversions (key events) from AI-referred sessions." />
            </div>
            {data.site_engaged_rate != null && data.ai_engaged_rate != null && (
              <p className="text-[11px] text-muted-foreground">
                Site-wide engaged rate is {data.site_engaged_rate}%, so an assistant&rsquo;s visitor is
                {data.ai_engaged_rate >= data.site_engaged_rate ? ' more' : ' less'} engaged than the average one.
              </p>
            )}
            {points.length >= 2 && (
              <Sparkline points={points} className="h-10 w-full" ariaLabel="AI-referred sessions per day" />
            )}
            {data.platforms.length === 0 ? (
              <p className="text-xs text-muted-foreground">{data.note}</p>
            ) : (
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Assistant</th>
                      <th className="px-3 py-2 text-right">Sessions</th>
                      <th className="px-3 py-2 text-right">Engaged</th>
                      <th className="px-3 py-2 text-right">Key events</th>
                      <th className="px-3 py-2 text-left">GA4 source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {data.platforms.map((p) => (
                      <tr key={p.platform}>
                        <td className="px-3 py-2 text-xs font-medium text-foreground">{p.label}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{compact(p.sessions)}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{p.engaged_rate != null ? `${p.engaged_rate}%` : '—'}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{compact(Number(p.conversions))}</td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground">
                          {p.sources.map((s) => `${s.source} / ${s.medium}`).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AiReferralsPanel;
