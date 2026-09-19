import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Globe2 } from 'lucide-react';

import { WorldChoropleth } from './seo/WorldChoropleth';
import { GaBreakdownTable, num, sessionsColumn } from './seo/GaBreakdownTable';
import { breakdownOf, countryFlag, countryName, formatDuration, type GaBreakdowns } from './seo/gaBreakdowns';
import { useGaBreakdowns } from './seo/useGaBreakdowns';
import type { UserWebsite } from '@/services/userWebsitesService';

const engagement = num('secs_per_session', 'Avg. time', (n) => formatDuration(n));

/** Websites → Analytics → Geography. */
export const WebsiteAnalyticsGeoPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { data, loading, gate } = useGaBreakdowns(website.id);
  if (gate) return gate;

  const countries = breakdownOf(data as GaBreakdowns | null, 'country');
  const cities = breakdownOf(data as GaBreakdowns | null, 'city');

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe2 className="h-4 w-4 text-primary" />
            Where your visitors are
          </CardTitle>
          <CardDescription>
            Sessions by country over the last {countries.window_days ?? 28} days. Shading is relative to your
            strongest market, so a second market is visible even when one country holds most of the traffic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-48 animate-pulse rounded-sm bg-surface-sunken" />
          ) : countries.status === 'ok' ? (
            <WorldChoropleth
              data={countries.rows
                .filter((r) => r.sessions != null)
                .map((r) => ({ code: r.value, value: r.sessions as number, label: r.label }))}
            />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {countries.note || 'No country data yet.'}
            </p>
          )}
        </CardContent>
      </Card>

      <GaBreakdownTable
        title="Countries"
        description="Every country Analytics attributed a session to."
        breakdown={countries}
        head="Country"
        renderName={(row) => (
          <span className="flex items-center gap-2">
            <span aria-hidden="true">{countryFlag(row.value)}</span>
            <span className="truncate">{countryName(row.value, row.label)}</span>
          </span>
        )}
        columns={[sessionsColumn, num('active_users', 'Users'), num('new_users', 'New'), engagement]}
      />

      <GaBreakdownTable
        title="Cities"
        description="Google resolves a city from the network, so a capital often absorbs a whole region."
        breakdown={cities}
        head="City"
        renderName={(row) => (
          <span className="flex items-center gap-2">
            <span className="truncate">{row.value}</span>
            {row.label && <span className="shrink-0 text-xs text-muted-foreground">{row.label}</span>}
          </span>
        )}
        columns={[sessionsColumn, num('active_users', 'Users'), engagement]}
      />
    </div>
  );
};

export default WebsiteAnalyticsGeoPanel;
