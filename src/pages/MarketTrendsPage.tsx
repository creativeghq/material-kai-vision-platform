import React from 'react';
import { TrendingUp, Loader2 } from 'lucide-react';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { PageHeader } from '@/components/shared/PageHeader';
import { MarketTrendsTab } from '@/components/analytics/MarketTrendsTab';

/**
 * Platform-wide market trends — what buyers search for, save, quote and drop into 3D scenes.
 *
 * This used to be a tab on /factory-analytics, alongside a "My Business" scope that keyed products
 * off the free-text `products.metadata.factory_name`. That page is gone (#350): its supplier
 * identity model (`user_profiles.factory_verified`) had zero holders, so the nav tile it owned
 * rendered for nobody. Per-supplier analytics now live on the CRM company record, keyed on the
 * `brand_company_id` FK.
 *
 * What is left here is genuinely platform-wide, which is exactly why it does NOT belong on a
 * company: mounted there it would render identically on every supplier. The access level is
 * unchanged from before — with `isFactory` always false, /factory-analytics was already
 * admin-only in practice.
 */
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
