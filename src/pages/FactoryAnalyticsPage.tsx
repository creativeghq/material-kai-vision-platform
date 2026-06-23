import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Loader2, TrendingUp, Package, ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Button } from '@/components/core/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { PageHeader } from '@/components/shared/PageHeader';
import { MyFactoryTab } from '@/components/analytics/MyFactoryTab';
import { MarketTrendsTab } from '@/components/analytics/MarketTrendsTab';

export default function FactoryAnalyticsPage() {
  const { user } = useAuth();
  const { isFactory, isAdmin, factoryClaimedName, loading } = useFactoryRole();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isFactory && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-2">
          <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Access restricted to verified factories and admins.</p>
        </div>
      </div>
    );
  }

  const defaultTab = isFactory ? 'my-factory' : 'market-trends';

  return (
    <div>
      <PageHeader
        icon={Building2}
        title="Factory Analytics"
        subtitle={isAdmin ? 'Full platform + factory analytics view' : 'Your factory performance and market trends'}
      />
      <div className="px-3 sm:px-6 py-4 sm:py-8">
        {factoryClaimedName && (
          <div className="mb-4 flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link to={`/discover?tab=products&factory=${encodeURIComponent(factoryClaimedName)}`}>
                <Package className="h-3.5 w-3.5 mr-1.5" />
                Products
                <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
              </Link>
            </Button>
          </div>
        )}
        <Tabs defaultValue={defaultTab} className="space-y-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            {isFactory && (
              <TabsTrigger value="my-factory" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />My Factory
              </TabsTrigger>
            )}
            <TabsTrigger value="market-trends" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />Market Trends
            </TabsTrigger>
          </TabsList>

          {isFactory && user && (
            <TabsContent value="my-factory">
              <MyFactoryTab factoryName={factoryClaimedName ?? ''} userId={user.id} tier={isAdmin ? 'enterprise' : 'pro'} />
            </TabsContent>
          )}

          <TabsContent value="market-trends">
            <MarketTrendsTab isFactory={isFactory} factoryName={factoryClaimedName ?? undefined} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
