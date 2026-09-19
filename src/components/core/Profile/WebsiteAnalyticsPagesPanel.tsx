import React from 'react';
import { ExternalLink } from 'lucide-react';

import { GaBreakdownTable, num, sessionsColumn } from './seo/GaBreakdownTable';
import { breakdownOf, formatDuration, prettyPath, type GaBreakdowns } from './seo/gaBreakdowns';
import { useGaBreakdowns } from './seo/useGaBreakdowns';
import type { UserWebsite } from '@/services/userWebsitesService';

const engagement = num('secs_per_session', 'Avg. time', (n) => formatDuration(n));

/** Websites → Analytics → Pages. */
export const WebsiteAnalyticsPagesPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { data, gate } = useGaBreakdowns(website.id);
  if (gate) return gate;

  const pages = breakdownOf(data as GaBreakdowns | null, 'page');
  const landing = breakdownOf(data as GaBreakdowns | null, 'landing_page');
  const origin = website.url.replace(/\/+$/, '');

  const pathLink = (path: string, title?: string | null) => {
    const clean = prettyPath(path);
    return (
      <a
        href={`${origin}${clean.startsWith('/') ? clean : `/${clean}`}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group block min-w-0"
      >
        <span className="flex items-center gap-1 truncate font-medium group-hover:text-primary">
          <span className="truncate">{title || clean}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" aria-hidden="true" />
        </span>
        {title && <span className="block truncate text-xs text-muted-foreground">{clean}</span>}
      </a>
    );
  };

  return (
    <div className="space-y-4">
      <GaBreakdownTable
        title="Pages"
        description="Every page Analytics recorded a view for, busiest first."
        breakdown={pages}
        head="Page"
        renderName={(row) => pathLink(row.value, row.label)}
        columns={[
          sessionsColumn,
          num('screen_page_views', 'Views'),
          num('active_users', 'Users'),
          engagement,
          num('conversions', 'Conv.'),
        ]}
        limit={40}
      />

      <GaBreakdownTable
        title="Landing pages"
        description="Where sessions STARTED. A page high here and low in the table above is a doorway people leave from."
        breakdown={landing}
        head="Landing page"
        renderName={(row) => pathLink(row.value)}
        columns={[
          sessionsColumn,
          num('new_users', 'New users'),
          num('engaged_sessions', 'Engaged'),
          engagement,
        ]}
        limit={40}
      />
    </div>
  );
};

export default WebsiteAnalyticsPagesPanel;
