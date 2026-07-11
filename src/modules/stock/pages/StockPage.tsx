import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, LayoutDashboard, Boxes, ArrowLeftRight, ClipboardList } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { Skeleton } from '@/components/core/ui/skeleton';
import { WarehousePanel } from '@/modules/finance/components/WarehousePanel';
import { StockOverviewSection } from '../components/StockOverviewSection';
import { MovementsSection } from '../components/MovementsSection';
import { StockCountsSection } from '../components/StockCountsSection';

// Stock Management module page. Extracted from the Finance "Warehouse" tab into a first-class
// entitlement-gated module (EntitlementGuard wraps this route). The Inventory grid reuses the
// battle-tested WarehousePanel; Overview / Movements / Counts are new module surfaces.
const PRELOAD_TABS = ['overview', 'inventory'];

export default function StockPage() {
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { can } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';

  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => new Set([tab, ...PRELOAD_TABS]));
  const fm = (v: string): true | undefined => (mountedTabs.has(v) ? true : undefined);

  const setTab = (v: string) => {
    setMountedTabs((prev) => (prev.has(v) ? prev : new Set(prev).add(v)));
    const p = new URLSearchParams(searchParams);
    p.set('tab', v);
    setSearchParams(p, { replace: true });
  };

  const ws = activeWorkspaceId ?? '';

  if (wsLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  // The nav link is hidden for non-warehouse users, but direct navigation could still land here.
  if (!can('warehouse.manage')) {
    return (
      <div className="min-h-screen">
        <PageHeader icon={Package} title="Stock" subtitle="Inventory management" />
        <div className="p-6">
          <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">
            You don’t have access to Stock for this workspace. Ask a workspace owner or admin.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader icon={Package} title="Stock" subtitle="Inventory, movements, transfers & stocktake across warehouses" />

      <div className="p-3 sm:p-6">
        <Tabs value={tab} onValueChange={setTab} orientation="vertical" className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <TabsList className="finance-tabs-list flex h-auto w-full shrink-0 flex-row flex-wrap gap-1 bg-transparent p-0 lg:w-56 lg:flex-col lg:flex-nowrap">
            <TabsTrigger value="overview" className="w-full justify-start"><LayoutDashboard className="h-4 w-4 mr-2" /> Overview</TabsTrigger>
            <TabsTrigger value="inventory" className="w-full justify-start"><Boxes className="h-4 w-4 mr-2" /> Inventory</TabsTrigger>
            <TabsTrigger value="movements" className="w-full justify-start"><ArrowLeftRight className="h-4 w-4 mr-2" /> Movements</TabsTrigger>
            <TabsTrigger value="counts" className="w-full justify-start"><ClipboardList className="h-4 w-4 mr-2" /> Stock counts</TabsTrigger>
          </TabsList>

          <div className="min-w-0 flex-1 space-y-4">
            <TabsContent value="overview" forceMount={fm('overview')} className="mt-0 space-y-4">
              <StockOverviewSection workspaceId={ws} onNavigate={setTab} />
            </TabsContent>
            <TabsContent value="inventory" forceMount={fm('inventory')} className="mt-0 space-y-4">
              <WarehousePanel workspaceId={ws} />
            </TabsContent>
            <TabsContent value="movements" forceMount={fm('movements')} className="mt-0 space-y-4">
              <MovementsSection workspaceId={ws} />
            </TabsContent>
            <TabsContent value="counts" forceMount={fm('counts')} className="mt-0 space-y-4">
              <StockCountsSection workspaceId={ws} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
