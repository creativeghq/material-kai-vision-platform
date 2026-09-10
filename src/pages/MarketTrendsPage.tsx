import React from 'react';
import { TrendingUp, Loader2 } from 'lucide-react';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { PageHeader } from '@/components/shared/PageHeader';
import { MarketTrendsTab } from '@/components/analytics/MarketTrendsTab';

/** Platform-wide market trends — what buyers search for, save, quote and drop into 3D scenes. */
export default function MarketTrendsPage() {
  const { isAdmin, loading } = useFactoryRole();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-2">
          <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Access restricted to workspace admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={TrendingUp}
        title="Market Trends"
        subtitle="What buyers are searching for, saving and quoting across the platform"
      />
      <div className="px-3 sm:px-6 py-4 sm:py-8">
        <MarketTrendsTab />
      </div>
    </div>
  );
}
