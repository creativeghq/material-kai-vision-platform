import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Network, Save, Link2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { workspaceManagementService } from '@/services/workspaceManagementService';

interface WsRow {
  id: string;
  name: string;
  parent_workspace_id: string | null;
  is_root: boolean;
  can_supply_products: boolean;
  catalog_access: 'operator_catalog' | 'own_products_only';
  commission_pct: number;
}

const rankOf = (w: WsRow) => (w.is_root ? 'operator' : w.can_supply_products ? 'dealer' : 'architect');

const MarketplaceNetworkPage: React.FC = () => {
  const { toast } = useToast();
  const { memberships, refresh } = useWorkspace();
  const [rows, setRows] = useState<WsRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { commission_pct: string; catalog_access: string }>>({});
  const [einvoicing, setEinvoicing] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Workspaces the caller owns/admins → their direct children are editable.
  const ownedIds = useMemo(
    () => new Set(memberships.filter((m) => m.role === 'owner' || m.role === 'admin').map((m) => m.workspaceId)),
    [memberships],
  );
  const nameById = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r.name])), [rows]);

  const load = async () => {
    setLoading(true);
    try {
      const [data, ent] = await Promise.all([
        workspaceManagementService.listManageable() as Promise<WsRow[]>,
        workspaceManagementService.getEntitlements('e-invoicing'),
      ]);
      setRows(data);
      setEinvoicing(ent);
      setDrafts(Object.fromEntries(data.map((r) => [r.id, { commission_pct: String(r.commission_pct), catalog_access: r.catalog_access }])));
    } catch (err: any) {
      toast({ title: 'Failed to load network', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const save = async (row: WsRow) => {
    const d = drafts[row.id];
    try {
      setSavingId(row.id);
      await workspaceManagementService.updateChildSettings(row.id, {
        commissionPct: parseFloat(d.commission_pct) || 0,
        catalogAccess: d.catalog_access as any,
      });
      toast({ title: `Updated ${row.name}` });
      await load();
      await refresh();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const editable = (r: WsRow) => !!r.parent_workspace_id && ownedIds.has(r.parent_workspace_id);

  const toggleEinvoicing = async (workspaceId: string, enabled: boolean) => {
    setEinvoicing((s) => ({ ...s, [workspaceId]: enabled }));
    try {
      await workspaceManagementService.setEntitlement(workspaceId, 'e-invoicing', enabled);
      toast({ title: enabled ? 'e-Invoicing enabled' : 'e-Invoicing disabled' });
    } catch (err: any) {
      setEinvoicing((s) => ({ ...s, [workspaceId]: !enabled }));
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  };

  // Owner/admin of a node can mint a referral link for people to sign up under it.
  const copyReferral = async (workspaceId: string) => {
    try {
      const code = await workspaceManagementService.generateReferral(workspaceId);
      const url = `${window.location.origin}/auth?mode=signup&ref=${code}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: 'Referral link copied', description: url });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  };

  return (
    <div>
      <PageHeader
        icon={Network}
        title="Network"
        subtitle="Your dealers, architects and their commission — you set the cut on each node's operator-catalog sales."
      />
      <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-6">
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-sm">Sub-workspaces</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2 text-left">Workspace</th>
                  <th className="px-4 py-2 text-left">Rank</th>
                  <th className="px-4 py-2 text-left">Parent</th>
                  <th className="px-4 py-2 text-left">Catalog access</th>
                  <th className="px-4 py-2 text-right">Commission %</th>
                  <th className="px-4 py-2 text-center">e-Invoicing</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => !r.is_root).length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No sub-workspaces yet. Create one from the workspace switcher.</td></tr>
                )}
                {rows.filter((r) => !r.is_root).map((r) => {
                  const canEdit = editable(r);
                  const d = drafts[r.id] ?? { commission_pct: String(r.commission_pct), catalog_access: r.catalog_access };
                  return (
                    <tr key={r.id} className="border-b border-border/30">
                      <td className="px-4 py-2 font-medium">{r.name}</td>
                      <td className="px-4 py-2"><Badge variant="outline" className="text-[10px] uppercase">{rankOf(r)}</Badge></td>
                      <td className="px-4 py-2 text-muted-foreground">{r.parent_workspace_id ? (nameById[r.parent_workspace_id] ?? '—') : '—'}</td>
                      <td className="px-4 py-2">
                        {canEdit ? (
                          <Select value={d.catalog_access} onValueChange={(v) => setDrafts((s) => ({ ...s, [r.id]: { ...d, catalog_access: v } }))}>
                            <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="operator_catalog">Full catalog</SelectItem>
                              <SelectItem value="own_products_only">Own only</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">{r.catalog_access === 'own_products_only' ? 'Own only' : 'Full catalog'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {canEdit ? (
                          <Input type="number" step="0.5" min="0" max="100" value={d.commission_pct}
                            onChange={(e) => setDrafts((s) => ({ ...s, [r.id]: { ...d, commission_pct: e.target.value } }))}
                            className="h-8 w-20 ml-auto text-right" />
                        ) : (
                          <span>{r.commission_pct}%</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {canEdit ? (
                          <Switch checked={!!einvoicing[r.id]} onCheckedChange={(v) => toggleEinvoicing(r.id, v)} />
                        ) : (
                          <span className="text-xs text-muted-foreground">{einvoicing[r.id] ? 'on' : 'off'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {ownedIds.has(r.id) && (
                            <Button size="sm" variant="ghost" onClick={() => copyReferral(r.id)} title="Copy sign-up referral link">
                              <Link2 className="h-3 w-3" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button size="sm" variant="outline" onClick={() => save(r)} disabled={savingId === r.id}>
                              {savingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default MarketplaceNetworkPage;
