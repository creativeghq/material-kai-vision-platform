import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Eye, Globe } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Skeleton } from '@/components/core/ui/skeleton';
import { realEstateService, type PropertyListItem, type ListingStatus } from '../services/realEstateService';

const STATUS_VARIANT: Record<ListingStatus, string> = {
  draft: 'bg-muted text-muted-foreground', active: 'bg-emerald-500/15 text-emerald-500',
  under_offer: 'bg-amber-500/15 text-amber-500', sold: 'bg-blue-500/15 text-blue-500',
  rented: 'bg-blue-500/15 text-blue-500', withdrawn: 'bg-muted text-muted-foreground',
  archived: 'bg-muted text-muted-foreground',
};

const money = (n: number | null, ccy: string) => (n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0 }).format(n));

export default function RealEstatePage() {
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { can } = usePermissions();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PropertyListItem[] | null>(null);
  const [creating, setCreating] = useState(false);
  const canManage = can('realestate.listings.manage');

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try { setRows(await realEstateService.listProperties(activeWorkspaceId)); }
    catch (e) { toast({ title: 'Failed to load listings', description: (e as Error).message, variant: 'destructive' }); setRows([]); }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const createDraft = async () => {
    if (!activeWorkspaceId) return;
    setCreating(true);
    try {
      const p = await realEstateService.createProperty(activeWorkspaceId, { title: 'Untitled listing', property_type: 'residential', transaction_type: 'sale' });
      navigate(`/properties/${p.id}`);
    } catch (e) { toast({ title: 'Could not create listing', description: (e as Error).message, variant: 'destructive' }); }
    finally { setCreating(false); }
  };

  if (wsLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!can('realestate.view')) {
    return (
      <div className="min-h-screen">
        <PageHeader icon={Building2} title="Real Estate" subtitle="Property listings & management" />
        <div className="p-6"><div className="dashboard-card p-8 text-center text-sm text-muted-foreground">You don’t have access to Real Estate for this workspace. Ask a workspace owner or admin.</div></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader icon={Building2} title="Real Estate" subtitle="List, manage and publish your properties"
        actions={canManage ? <Button onClick={createDraft} disabled={creating} className="rounded-full"><Plus className="mr-2 h-4 w-4" /> New listing</Button> : undefined} />

      <div className="p-3 sm:p-6">
        {rows === null ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <div className="dashboard-card p-10 text-center">
            <Building2 className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No listings yet.{canManage ? ' Create your first property to get started.' : ''}</p>
            {canManage && <Button onClick={createDraft} disabled={creating} className="mt-4 rounded-full"><Plus className="mr-2 h-4 w-4" /> New listing</Button>}
          </div>
        ) : (
          <Card><CardContent className="p-0">
            <div className="divide-y divide-border">
              {rows.map((r) => (
                <button key={r.id} onClick={() => navigate(`/properties/${r.id}`)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.title || 'Untitled listing'}</span>
                      {r.reference_code && <span className="shrink-0 text-xs text-muted-foreground">#{r.reference_code}</span>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[r.property_type, r.transaction_type.replace('_', ' '), [r.town, r.region].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="hidden shrink-0 text-sm font-medium sm:block">{money(r.price, r.currency)}</div>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.is_public && <Globe className="h-3.5 w-3.5 text-emerald-500" aria-label="Public" />}
                    {r.view_count > 0 && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Eye className="h-3 w-3" />{r.view_count}</span>}
                    <Badge className={`${STATUS_VARIANT[r.listing_status]} rounded-full border-0 text-[11px] capitalize`}>{r.listing_status.replace('_', ' ')}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
