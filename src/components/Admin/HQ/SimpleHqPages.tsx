import React, { useState } from 'react';
import { FileSearch, Globe, Search } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { HubTabNav } from '@/components/core/hub/HubTabNav';
import { HubSegmented } from '@/components/core/hub/HubSegmented';
import { useUrlTab } from '@/hooks/useUrlTab';

import { IngestionQualityPanel } from '../Ingestion/IngestionQualityPanel';
import { PlatformOverviewTab } from '../PlatformOverviewTab';
import {
  SearchAnalyticsDashboard, SEARCH_ANALYTICS_TABS, SEARCH_TIME_RANGES, type SearchTimeRange,
} from '../SearchAnalyticsDashboard';

const SEARCH_TAB_IDS = SEARCH_ANALYTICS_TABS.map((t) => t.id);

const Body: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="space-y-4 p-3 sm:p-6">{children}</div>
);

/** Tabs and the time window live in the header, like every other HQ page; the panes share one load. */
export const SearchAnalyticsPage: React.FC = () => {
  const [tab, setTab] = useUrlTab(SEARCH_TAB_IDS, 'overview');
  const [timeRange, setTimeRange] = useState<SearchTimeRange>('30d');
  return (
    <div>
      <PageHeader
        icon={Search}
        title="Search Analytics"
        subtitle="Query volume, latency, cache behaviour and searches that found nothing."
        actions={<HubSegmented options={SEARCH_TIME_RANGES} value={timeRange} onChange={setTimeRange} aria-label="Time window" />}
      >
        <HubTabNav
          aria-label="Search Analytics sections"
          className="border-b-0"
          activeId={tab}
          onSelect={setTab}
          items={SEARCH_ANALYTICS_TABS.map((t) => ({ id: t.id, label: t.label }))}
        />
      </PageHeader>
      <Body><SearchAnalyticsDashboard tab={tab} timeRange={timeRange} /></Body>
    </div>
  );
};

export const PlatformOverviewPage: React.FC = () => (
  <div>
    <PageHeader icon={Globe} title="Platform Overview" subtitle="Every workspace on the platform, plus quotes, sign-ups, AI spend and catalogue growth." />
    <Body><PlatformOverviewTab /></Body>
  </div>
);

export const IngestionQualityPage: React.FC = () => (
  <div>
    <PageHeader
      icon={FileSearch}
      title="Ingestion Quality"
      subtitle="The post-ingestion audit of every catalogue. A problem with a catalogue is resolved here: re-check it or mark it clean."
    />
    <Body><IngestionQualityPanel /></Body>
  </div>
);
