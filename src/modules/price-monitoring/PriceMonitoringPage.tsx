import React from 'react';
import { TrendingUp } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { PriceMonitoringDashboard } from '@/components/business/price-monitoring/PriceMonitoringDashboard';

const PriceMonitoringPage: React.FC = () => (
  <div>
    <PageHeader
      icon={TrendingUp}
      title="Price Monitoring"
      subtitle="Track retailer prices for your products and get alerts on drops, new retailers and promos."
    />
    <PriceMonitoringDashboard />
  </div>
);

export default PriceMonitoringPage;
