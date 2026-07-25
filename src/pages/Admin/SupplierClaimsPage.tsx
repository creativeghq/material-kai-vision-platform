import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Check, X, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supplierClaimsService, type SupplierClaimRequest } from '@/services/supplierClaimsService';

/**
 * #247 / Workstream F — operator review queue for supplier identity claims.
 * Approving grants the requesting workspace cross-workspace order visibility, so
 * it is operator-only (the `decide_supplier_claim` RPC enforces it server-side).
 */
export default function SupplierClaimsPage() {
  const { toast } = useToast();
  const [claims, setClaims] = useState<SupplierClaimRequest[]>([]);
  const [wsNames, setWsNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await supplierClaimsService.listClaims('pending');
      setClaims(rows);
      setWsNames(await supplierClaimsService.workspaceNames(rows.map((r) => r.requesting_workspace_id)));
    } catch (e: any) {
      toast({ title: 'Failed to load claims', description: e?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, approve: boolean) => {
    setBusyId(id);
    try {
      await supplierClaimsService.decideClaim(id, approve, approve ? undefined : 'Rejected by operator');
      toast({ title: approve ? 'Claim approved' : 'Claim rejected' });
      setClaims((prev) => prev.filter((c) => c.id !== id));
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Supplier identity claims</h1>
          <p className="text-sm text-muted-foreground">Approving grants the workspace cross-workspace order visibility — operator-only.</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Pending ({claims.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : claims.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No pending claims.</p>
          ) : claims.map((c) => (
            <div key={c.id} className="dashboard-card p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{c.vat_number} · {c.country_code}</div>
                <div className="text-xs text-muted-foreground truncate">
                  Requested by {wsNames[c.requesting_workspace_id] || c.requesting_workspace_id}
                  {' · '}{new Date(c.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] ${c.risk_flag === 'low' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {c.risk_flag === 'low' ? 'own VAT match' : 'needs review'}
                </span>
                <Button size="sm" variant="outline" className="rounded-full h-8" disabled={busyId === c.id} onClick={() => decide(c.id, false)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
                <Button size="sm" className="rounded-full h-8" disabled={busyId === c.id} onClick={() => decide(c.id, true)}>
                  {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="h-3.5 w-3.5 mr-1" /> Approve</>}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
