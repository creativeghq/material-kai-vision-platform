import React from 'react';
import { Building2 } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/core/ui/skeleton';

// #249 P0 — Real Estate portfolio scaffold. Proves the module route + EntitlementGuard chain works
// end-to-end. P1 replaces this with the `/properties` portfolio grid (clone of ProjectsListPage) and
// wires `/properties/:id` to the workbench (clone of ProjectDetailPage).
export default function RealEstatePage() {
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { can } = usePermissions();

  if (wsLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  // Route reachability is gated by EntitlementGuard (workspace owns 'real-estate'); this is the
  // in-page capability gate, mirroring HRPage — direct navigation without the capability is blocked.
  if (!can('realestate.view')) {
    return (
      <div className="min-h-screen">
        <PageHeader icon={Building2} title="Real Estate" subtitle="Property listings & management" />
        <div className="p-6">
          <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">
            You don’t have access to Real Estate for this workspace. Ask a workspace owner or admin.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader icon={Building2} title="Real Estate" subtitle="List, manage and publish your properties" />
      <div className="p-3 sm:p-6">
        <div className="dashboard-card p-8 text-center">
          <Building2 className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Property portfolio</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            The Real Estate module is enabled for this workspace. Listing management, public listing
            pages, leads and portal syndication are coming next.
          </p>
          {activeWorkspaceId && (
            <p className="mt-4 text-[11px] text-muted-foreground/70">Workspace {activeWorkspaceId}</p>
          )}
        </div>
      </div>
    </div>
  );
}
