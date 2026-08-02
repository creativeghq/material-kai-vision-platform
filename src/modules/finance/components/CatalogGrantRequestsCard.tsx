/**
 * Pending catalog-access requests, for the operator to approve or decline.
 *
 * A dealer hitting "Request access to KEROS" on the duplicate warning inserts a row with
 * status='requested' — RLS lets them do no more than ask. This is the other half: without
 * it a request lands in a table nobody looks at.
 *
 * Approving grants visibility of that ONE factory's operator products. The dealer still
 * never gets a copy — they price the operator's row through product_prices.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, X, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { catalogGrantsService } from '@/services/catalogGrantsService';

interface RequestRow {
  id: string;
  workspaceId: string;
  workspaceName: string;
  factoryName: string | null;
  status: 'requested' | 'active' | 'revoked';
  requestedAt: string;
}

export const CatalogGrantRequestsCard: React.FC<{ workspaceIds: string[] }> = ({ workspaceIds }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (workspaceIds.length === 0) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('workspace_catalog_grants')
        .select('id, workspace_id, factory_name, status, requested_at, workspace:workspaces(name)')
        .in('workspace_id', workspaceIds)
        .order('requested_at', { ascending: false });
      setRows(((data ?? []) as any[]).map((r) => ({
        id: r.id,
        workspaceId: r.workspace_id,
        workspaceName: r.workspace?.name ?? '—',
        factoryName: r.factory_name ?? null,
        status: r.status,
        requestedAt: r.requested_at,
      })));
    } catch {
      setRows([]);
    } finally { setLoading(false); }
  }, [workspaceIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, status: 'active' | 'revoked') => {
    setBusy(id);
    try {
      await catalogGrantsService.setStatus(id, status);
      toast({ title: status === 'active' ? 'Access granted' : 'Access revoked' });
      await load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const pending = rows.filter((r) => r.status === 'requested');
  const granted = rows.filter((r) => r.status === 'active');

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> Catalog access
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Which of your factories each sub-workspace may sell. They price your product — they never get a copy of it.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No requests yet. A dealer asks from the product form when they try to add something you already carry.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Workspace</th>
                <th className="px-4 py-2 text-left">Factory</th>
                <th className="px-4 py-2 text-left">Requested</th>
                <th className="px-4 py-2 text-center">Status</th>
                <th className="px-4 py-2 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {[...pending, ...granted].map((r) => (
                <tr key={r.id} className="border-b border-border/30">
                  <td className="px-4 py-2 font-medium">{r.workspaceName}</td>
                  <td className="px-4 py-2">
                    {r.factoryName ?? <span className="text-muted-foreground">All factories</span>}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(r.requestedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-[10px] ${r.status === 'active' ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {r.status === 'active' ? 'Granted' : 'Awaiting you'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {r.status === 'requested' && (
                        <Button size="sm" variant="outline" className="rounded-full h-7"
                          disabled={busy === r.id} onClick={() => decide(r.id, 'active')}>
                          {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          <span className="ml-1 text-xs">Grant</span>
                        </Button>
                      )}
                      {r.status === 'active' && (
                        <Button size="sm" variant="ghost" className="rounded-full h-7"
                          disabled={busy === r.id} onClick={() => decide(r.id, 'revoked')}>
                          <X className="h-3.5 w-3.5" />
                          <span className="ml-1 text-xs">Revoke</span>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
};
