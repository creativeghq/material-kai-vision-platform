import React from 'react';
import { HeartPulse } from 'lucide-react';

import { GenerationProviderHealth } from '../GenerationProviderHealth';
import { CapabilityLedgerPanel } from '../OperationsDashboard/CapabilityLedgerPanel';
import { StorageAuditPanel } from '../StorageAuditPanel';
import { SystemHealthMonitor } from '../SystemHealthMonitor';
import { useAdminAttention } from './adminAttention';
import { HqTabbedPage } from './HqTabbedPage';

const SystemHealthPage: React.FC = () => {
  const { data } = useAdminAttention();
  return (
    <HqTabbedPage
      icon={HeartPulse}
      title="System Health"
      subtitle="Services, generation providers, platform capabilities and storage."
      tabs={[
        { id: 'services', label: 'Services', render: () => <SystemHealthMonitor /> },
        // Reads the active probe, not ai_usage_logs: that row is written before the call and never corrected on failure.
        { id: 'providers', label: 'Generation Providers', count: data?.providers.failing, render: () => <GenerationProviderHealth /> },
        { id: 'capabilities', label: 'Capabilities', render: () => <CapabilityLedgerPanel /> },
        { id: 'storage', label: 'Storage', render: () => <StorageAuditPanel /> },
      ]}
    />
  );
};

export default SystemHealthPage;
