import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Warehouse as WarehouseIcon, LayoutDashboard, Boxes, ArrowLeftRight, ClipboardList, TrendingUp, Ship, Truck } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { Skeleton } from '@/components/core/ui/skeleton';
import { WarehousePanel } from '@/modules/finance/components/WarehousePanel';
import { DispatchBoard } from '@/modules/finance/components/DispatchBoard';
import { StockOverviewSection } from '../components/StockOverviewSection';
import { MovementsSection } from '../components/MovementsSection';
import { StockCountsSection } from '../components/StockCountsSection';
import { ResupplySection } from '../components/ResupplySection';
import { InboundSection } from '../components/InboundSection';

// Warehouse module page (module slug stays 'stock' internally). Extracted from the Finance "Warehouse"
// tab into a first-class entitlement-gated module. Plain Radix tabs (no forceMount) so only the active
// panel renders — mirrors FinancePage; each tab loads its own data on open.
const TABS = ['overview', 'inventory', 'resupply', 'inbound', 'dispatch', 'movements', 'counts'];

export default function StockPage() {
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { can } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab') || 'overview';
  const tab = TABS.includes(raw) ? raw : 'overview';

  const setTab = (v: string) => {
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
        <PageHeader icon={WarehouseIcon} title="Warehouse" subtitle="Inventory management" />
        <div className="p-6">
          <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">
            You don’t have access to the Warehouse for this workspace. Ask a workspace owner or admin.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader icon={WarehouseIcon} title="Warehouse" subtitle="Inventory, movements, dispatch, resupply & stocktake" />

      <div className="p-3 sm:p-6">
        <Tabs value={tab} onValueChange={setTab} orientation="vertical" className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <TabsList className="finance-tabs-list flex h-auto w-full shrink-0 flex-row flex-wrap gap-1 bg-transparent p-0 lg:w-56 lg:flex-col lg:flex-nowrap">
            <TabsTrigger value="overview" className="w-full justify-start"><LayoutDashboard className="h-4 w-4 mr-2" /> Overview</TabsTrigger>
            <TabsTrigger value="inventory" className="w-full justify-start"><Boxes className="h-4 w-4 mr-2" /> Inventory</TabsTrigger>
            <TabsTrigger value="resupply" className="w-full justify-start"><TrendingUp className="h-4 w-4 mr-2" /> Resupply</TabsTrigger>
            <TabsTrigger value="inbound" className="w-full justify-start"><Ship className="h-4 w-4 mr-2" /> Inbound</TabsTrigger>
            <TabsTrigger value="dispatch" className="w-full justify-start"><Truck className="h-4 w-4 mr-2" /> Dispatch</TabsTrigger>
            <TabsTrigger value="movements" className="w-full justify-start"><ArrowLeftRight className="h-4 w-4 mr-2" /> Movements</TabsTrigger>
            <TabsTrigger value="counts" className="w-full justify-start"><ClipboardList className="h-4 w-4 mr-2" /> Stock counts</TabsTrigger>
          </TabsList>

          <div className="min-w-0 flex-1 space-y-4">
            <TabsContent value="overview" className="mt-0 space-y-4">
              <StockOverviewSection workspaceId={ws} onNavigate={setTab} />
            </TabsContent>
            <TabsContent value="inventory" className="mt-0 space-y-4">
              <WarehousePanel workspaceId={ws} />
            </TabsContent>
            <TabsContent value="resupply" className="mt-0 space-y-4">
              <ResupplySection workspaceId={ws} />
            </TabsContent>
            <TabsContent value="inbound" className="mt-0 space-y-4">
              <InboundSection workspaceId={ws} />
            </TabsContent>
            <TabsContent value="dispatch" className="mt-0 space-y-4">
              <DispatchBoard workspaceId={ws} readOnly={!can('finance.manage')} />
            </TabsContent>
            <TabsContent value="movements" className="mt-0 space-y-4">
              <MovementsSection workspaceId={ws} />
            </TabsContent>
            <TabsContent value="counts" className="mt-0 space-y-4">
              <StockCountsSection workspaceId={ws} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
