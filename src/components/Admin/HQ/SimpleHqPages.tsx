import React from 'react';
import { FileSearch, Globe, Search } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';

import { IngestionQualityPanel } from '../Ingestion/IngestionQualityPanel';
import { PlatformOverviewTab } from '../PlatformOverviewTab';
import { SearchAnalyticsDashboard } from '../SearchAnalyticsDashboard';

const Body: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="space-y-4 p-3 sm:p-6">{children}</div>
);

export const SearchAnalyticsPage: React.FC = () => (
  <div>
    <PageHeader icon={Search} title="Search Analytics" subtitle="Query volume, latency, cache behaviour and searches that found nothing." />
    <Body><SearchAnalyticsDashboard /></Body>
  </div>
);

export const PlatformOverviewPage: React.FC = () => (
  <div>
    <PageHeader icon={Globe} title="Platform Overview" subtitle="Workspaces, users, content and growth across the platform." />
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
