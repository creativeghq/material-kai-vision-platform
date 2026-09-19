import React from 'react';

import { GaBreakdownTable, num, sessionsColumn, trendColumn } from './seo/GaBreakdownTable';
import { breakdownOf, formatDuration, type GaBreakdowns } from './seo/gaBreakdowns';
import { useGaBreakdowns } from './seo/useGaBreakdowns';
import type { UserWebsite } from '@/services/userWebsitesService';

const engagement = num('secs_per_session', 'Avg. time', (n) => formatDuration(n));
const plain = (row: { value: string }) => <span className="truncate capitalize">{row.value}</span>;

/** Websites → Analytics → Devices & events. */
export const WebsiteAnalyticsTechPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { data, gate } = useGaBreakdowns(website.id);
  if (gate) return gate;

  const b = data as GaBreakdowns | null;

  return (
    <div className="space-y-4">
      <GaBreakdownTable
        title="Devices"
        description="A site that converts on desktop and not on mobile is a layout problem, not a traffic problem."
        breakdown={breakdownOf(b, 'device')}
        head="Device"
        renderName={plain}
        columns={[sessionsColumn, trendColumn, num('engaged_sessions', 'Engaged'), engagement, num('conversions', 'Conv.')]}
      />

      <GaBreakdownTable
        title="New vs returning"
        description="Returning visitors are the ones the site earned. New ones are the ones it reached."
        breakdown={breakdownOf(b, 'returning')}
        head="Visitor"
        renderName={plain}
        columns={[sessionsColumn, trendColumn, num('active_users', 'Users'), engagement, num('conversions', 'Conv.')]}
      />

      <GaBreakdownTable
        title="Events"
        description="What people did. Counted rather than sessionised — one session can fire an event many times."
        breakdown={breakdownOf(b, 'event')}
        head="Event"
        renderName={(row) => <span className="truncate font-mono text-xs">{row.value}</span>}
        columns={[num('event_count', 'Count'), sessionsColumn, num('active_users', 'Users'), num('conversions', 'Conv.')]}
        limit={40}
      />

      <GaBreakdownTable
        title="Browsers"
        breakdown={breakdownOf(b, 'browser')}
        head="Browser"
        renderName={plain}
        columns={[sessionsColumn, engagement]}
        limit={15}
      />

      <GaBreakdownTable
        title="Operating systems"
        breakdown={breakdownOf(b, 'os')}
        head="Operating system"
        renderName={plain}
        columns={[sessionsColumn, engagement]}
        limit={15}
      />

      <GaBreakdownTable
        title="Languages"
        description="The browser language people arrive with — which is not the language they read the site in."
        breakdown={breakdownOf(b, 'language')}
        head="Language"
        renderName={plain}
        columns={[sessionsColumn, engagement]}
        limit={15}
      />

      <GaBreakdownTable
        title="Hostnames"
        description="A hostname you do not recognise is a staging copy or someone else reporting into your property."
        breakdown={breakdownOf(b, 'hostname')}
        head="Hostname"
        renderName={(row) => <span className="truncate font-mono text-xs">{row.value}</span>}
        columns={[sessionsColumn, num('screen_page_views', 'Views')]}
        limit={15}
      />
    </div>
  );
};

export default WebsiteAnalyticsTechPanel;
