import React from 'react';

import { GaBreakdownTable, num, sessionsColumn } from './seo/GaBreakdownTable';
import { breakdownOf, type GaBreakdowns } from './seo/gaBreakdowns';
import { useGaBreakdowns } from './seo/useGaBreakdowns';
import { formatMoney } from '@/utils/decimal';
import type { UserWebsite } from '@/services/userWebsitesService';

/** Websites → Analytics → Products & ads. */
export const WebsiteAnalyticsCommercePanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { data, gate } = useGaBreakdowns(website.id);
  if (gate) return gate;

  const b = data as GaBreakdowns | null;

  return (
    <div className="space-y-4">
      <GaBreakdownTable
        title="Products"
        description="Views, carts and purchases per item. Empty unless the store sends GA4 ecommerce events."
        breakdown={breakdownOf(b, 'item')}
        head="Product"
        renderName={(row) => (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.value}</span>
            {row.label && <span className="truncate text-xs text-muted-foreground">{row.label}</span>}
          </span>
        )}
        columns={[
          num('items_viewed', 'Viewed'),
          num('items_added_to_cart', 'Added'),
          num('items_purchased', 'Bought'),
          num('total_revenue', 'Revenue', (n) => formatMoney(n)),
        ]}
        limit={40}
      />

      <GaBreakdownTable
        title="Ad campaigns"
        description="What each campaign cost and what it returned. Needs a linked Google Ads account — cost is never inferred from sessions."
        breakdown={breakdownOf(b, 'ads_campaign')}
        head="Campaign"
        renderName={(row) => (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.value}</span>
            {row.label && <span className="truncate text-xs text-muted-foreground">{row.label}</span>}
          </span>
        )}
        columns={[
          sessionsColumn,
          num('ad_cost', 'Cost', (n) => formatMoney(n)),
          num('ad_clicks', 'Clicks'),
          num('conversions', 'Conv.'),
          num('total_revenue', 'Revenue', (n) => formatMoney(n)),
          num('roas', 'ROAS', (n) => `${n.toFixed(2)}×`),
        ]}
        limit={40}
      />
    </div>
  );
};

export default WebsiteAnalyticsCommercePanel;
