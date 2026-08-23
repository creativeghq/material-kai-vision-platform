/**
 * The derived analytics Zernio computes and nothing here ever asked for: daily reach over time,
 * how engagement accumulates after publishing, and how cadence relates to engagement per platform.
 *
 * All three are PASS-THROUGH reads. Zernio does the derivation; we render it. Nothing is stored,
 * because a stored rollup is a second derivation of the same quantity and drifts the moment
 * either side changes.
 *
 * Charts follow the platform's `--chart-N` tokens in fixed order and stop at TWO series. The
 * palette was run through the colour validator: slots 1+2 pass CVD separation in both themes,
 * where 2+3 (blue↔purple) collide at ΔE 3.8 for deuteranopia — so a four-line chart using the
 * ramp in order would be unreadable for a red-green colourblind reader. Everything plotted is
 * also present as a number in a table below it, which is the required relief for the light
 * theme's contrast warning on chart-1.
 */
import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { Activity, TrendingDown, CalendarClock } from 'lucide-react';
import { formatNumber } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';

export interface DailyPoint {
  date: string;
  postCount: number;
  metrics: {
    impressions?: number; reach?: number; likes?: number; comments?: number;
    shares?: number; saves?: number; clicks?: number; views?: number;
  };
}

export interface PlatformTotals {
  platform: string;
  postCount: number;
  impressions: number; reach: number; likes: number; comments: number;
  shares: number; saves: number; clicks: number; views: number;
}

export interface DecayBucket {
  bucket_order: number;
  bucket_label: string;
  avg_pct_of_final: number;
  post_count: number;
}

export interface FrequencyRow {
  platform: string;
  posts_per_week: number;
  avg_engagement_rate: number;
  avg_engagement: number;
  weeks_count: number;
}

/** Recharts needs concrete colours, and the tokens are HSL triples. */
const SERIES_1 = 'hsl(var(--chart-1))';
const SERIES_2 = 'hsl(var(--chart-2))';

const axis = { stroke: 'hsl(var(--muted-foreground))', fontSize: 11 };
const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '4px',
  fontSize: '12px',
};

const num = (v: number | null | undefined) => (v == null ? '—' : formatNumber(v));

export const DailyReachChart: React.FC<{ daily: DailyPoint[]; platforms: PlatformTotals[] }> = ({ daily, platforms }) => {
  // Two series only, and they share a scale — impressions and reach are both "how many saw it",
  // so one axis is honest. Engagement counts are orders of magnitude smaller and live in the
  // table rather than on a second y-axis, which would be the dual-axis mistake.
  const data = daily.map(d => ({
    date: d.date,
    impressions: d.metrics.impressions ?? 0,
    reach: d.metrics.reach ?? 0,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" /> Reach over time
        </CardTitle>
        <CardDescription>
          Impressions and unique reach per day across every connected account. Engagement counts
          are in the breakdown below — they are a different order of magnitude and do not belong
          on the same axis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <HubEmptyState
            variant="empty"
            icon={Activity}
            title="No daily data yet"
            description="Zernio builds this from published posts. Sync your accounts, then give it a day."
          />
        ) : (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" {...axis} tickFormatter={(d: string) => formatDate(d)} minTickGap={24} />
                  <YAxis {...axis} width={52} tickFormatter={(v: number) => formatNumber(v)} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(d: string) => formatDate(d)}
                    formatter={(v: number, name: string) => [formatNumber(v), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="impressions" name="Impressions" stroke={SERIES_1} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="reach" name="Reach" stroke={SERIES_2} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {platforms.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform</TableHead>
                      <TableHead className="text-right">Posts</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">Reach</TableHead>
                      <TableHead className="text-right">Likes</TableHead>
                      <TableHead className="text-right">Comments</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="text-right">Saves</TableHead>
                      <TableHead className="text-right">Clicks</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {platforms.map(p => (
                      <TableRow key={p.platform}>
                        <TableCell className="capitalize">{p.platform}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(p.postCount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(p.impressions)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(p.reach)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(p.likes)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(p.comments)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(p.shares)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(p.saves)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(p.clicks)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(p.views)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export const ContentDecayChart: React.FC<{ buckets: DecayBucket[] }> = ({ buckets }) => {
  const data = [...buckets].sort((a, b) => a.bucket_order - b.bucket_order);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4" /> How long a post keeps working
        </CardTitle>
        <CardDescription>
          Share of a post&rsquo;s FINAL engagement already reached by each age. A curve that is
          near 100% by the first day means late posting costs you the whole day&rsquo;s audience.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <HubEmptyState
            variant="empty"
            icon={TrendingDown}
            title="Not enough history"
            description="Zernio needs several published posts with a settled engagement curve before it can measure decay."
          />
        ) : (
          <>
            {/* One series — no legend: the title names it. */}
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="bucket_label" {...axis} />
                  <YAxis {...axis} width={44} unit="%" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => [`${v.toFixed(1)}%`, 'of final engagement']}
                  />
                  <Bar dataKey="avg_pct_of_final" fill={SERIES_2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Age</TableHead>
                    <TableHead className="text-right">% of final engagement</TableHead>
                    <TableHead className="text-right">Posts measured</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map(b => (
                    <TableRow key={b.bucket_label}>
                      <TableCell>{b.bucket_label}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.avg_pct_of_final.toFixed(1)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{num(b.post_count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export const PostingFrequencyTable: React.FC<{ rows: FrequencyRow[] }> = ({ rows }) => {
  // A table, not a chart. This is a correlation across two dimensions (platform × cadence) with a
  // sample size per row, and `weeks_count` is the number that decides whether to believe any of
  // it — a bar chart would hide exactly that.
  const sorted = [...rows].sort(
    (a, b) => a.platform.localeCompare(b.platform) || a.posts_per_week - b.posts_per_week,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4" /> Cadence vs engagement
        </CardTitle>
        <CardDescription>
          What each posting rate actually earned, per platform. Read the weeks column first — a
          rate observed for two weeks is an anecdote, not a finding.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {sorted.length === 0 ? (
          <div className="p-4">
            <HubEmptyState
              variant="empty"
              icon={CalendarClock}
              title="Not enough weeks yet"
              description="This compares posting rates against each other, so it needs several weeks of history per platform."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Posts / week</TableHead>
                  <TableHead className="text-right">Avg engagement rate</TableHead>
                  <TableHead className="text-right">Avg engagement</TableHead>
                  <TableHead className="text-right">Weeks observed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(r => (
                  <TableRow key={`${r.platform}-${r.posts_per_week}`}>
                    <TableCell className="capitalize">{r.platform}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.posts_per_week}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.avg_engagement_rate.toFixed(2)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{num(r.avg_engagement)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.weeks_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
