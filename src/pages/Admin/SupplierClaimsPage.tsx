import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Check, X, RefreshCw, UserCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useToast } from '@/hooks/use-toast';
import { supplierClaimsService, type SupplierClaimQueueRow } from '@/services/supplierClaimsService';
import { formatDate } from '@/utils/datetime';

/**
 * Operator review queue for supplier identity claims (#324).
 *
 * Approving is not a formality: it records that a specific HUMAN represents a specific factory
 * (the RPC creates the CRM contact link and fails the whole approval if it cannot). That link is
 * what later grants the right to publish catalog data platform-wide, so the row has to show who
 * is asking — a workspace id cannot be vouched for.
 */
export default function SupplierClaimsPage() {
  const { toast } = useToast();
  const [claims, setClaims] = useState<SupplierClaimQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setClaims(await supplierClaimsService.claimQueue('pending'));
    } catch (e: any) {
      toast({ title: 'Failed to load claims', description: e?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const decide = async (row: SupplierClaimQueueRow, approve: boolean) => {
    setBusyId(row.id);
    try {
      await supplierClaimsService.decideClaim(row.id, approve, approve ? undefined : 'Rejected by operator');
      toast({
        title: approve ? 'Claim approved' : 'Claim rejected',
        description: approve
          ? `${row.requester_name || row.requester_email || 'The requester'} is now a confirmed contact of ${row.supplier_legal_name || row.vat_number} and may publish for them.`
          : undefined,
      });
      setClaims((prev) => prev.filter((c) => c.id !== row.id));
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  return (
    <div className="p-6 space-y-4">
      <SectionHeader
        icon={ShieldCheck}
        title="Supplier Identity Claims"
        subtitle="Approving links a person to a factory and grants them the right to publish its catalog data — operator-only."
        actions={
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Pending ({claims.length})</CardTitle>
          <p className="text-xs text-muted-foreground">
            A claim asks us to accept that this person speaks for this company. Their data will then
            outrank our own catalog extraction, so confirm the identity before approving.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : claims.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No pending claims.</p>
          ) : claims.map((c) => (
            <div key={c.id} className="dashboard-card p-3 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium">
                    {c.supplier_legal_name || 'Unnamed company'}
                    <span className="text-muted-foreground font-normal"> · {c.vat_number} · {c.country_code}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.requester_name || 'Unnamed user'}
                    {c.requester_email ? ` · ${c.requester_email}` : ''}
                    {' · from '}{c.requesting_workspace_name || c.requesting_workspace_id}
                    {' · '}{formatDate(c.created_at)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 text-[10px]">
                  <span className={c.risk_flag === 'low' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                    {c.risk_flag === 'low' ? 'Their own registered VAT matches' : 'VAT does not match their own — verify'}
                  </span>
                  {c.supplier_vat_validated && <span className="text-muted-foreground">VAT validated</span>}
                </div>
              </div>

              {/* Say plainly what pressing Approve will do — this is the whole point of the gate. */}
              <div className="flex items-start gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                <span>
                  Approving adds <span className="text-foreground font-medium">{c.requester_name || c.requester_email || 'this user'}</span>{' '}
                  as a confirmed contact of <span className="text-foreground font-medium">{c.supplier_legal_name || c.vat_number}</span>,
                  and lets them publish that company's product data to the shared catalog.
                </span>
              </div>

              {c.already_claimed_by && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Already claimed by {c.already_claimed_by} — approving will fail.
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="outline" className="h-8" disabled={busyId === c.id} onClick={() => decide(c, false)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
                <Button size="sm" className="h-8" disabled={busyId === c.id || !!c.already_claimed_by} onClick={() => decide(c, true)}>
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
