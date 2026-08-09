import React, { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { Percent, Plus, Trash2, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { useToast } from '@/hooks/use-toast';
import { realEstateService, type CommissionSplit, type CommissionTotals } from '../services/realEstateService';
import { formatDate } from '@/utils/datetime';

const money = (n: number | null | undefined, ccy: string) => formatMoney(n ?? 0, ccy || 'EUR', { decimals: 2 });

const PARTY_LABELS: Record<string, string> = {
  listing_agent: 'Listing agent',
  buyer_agent: 'Buyer agent',
  house: 'House',
  referral: 'Referral',
  external: 'External party',
};

/**
 * How one sale's commission is shared. Every `amount` here is READ from
 * `get_sale_commission_splits` — the row stores the rule (50%, or €500), never the figure, so a
 * corrected sale price re-derives every share instead of leaving stale numbers that no longer add up.
 *
 * Percentages are of the COMMISSION (net of VAT), not the sale price — the distinction that makes
 * "50% split" mean what an agent thinks it means. The card states it, because getting it wrong is
 * the single most expensive misunderstanding in this feature.
 */
export const CommissionSplitsCard: React.FC<{ ws: string | null; saleId: string; canManage: boolean }> = ({ ws, saleId, canManage }) => {
  const { toast } = useToast();
  const [splits, setSplits] = useState<CommissionSplit[] | null>(null);
  const [totals, setTotals] = useState<CommissionTotals | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ party_type: string; basis: string; pct: string; fixed_amount: string; label: string } | null>(null);

  const load = useCallback(async () => {
    if (!ws) return;
    try { const r = await realEstateService.listCommissionSplits(ws, saleId); setSplits(r.splits); setTotals(r.totals); }
    catch { setSplits([]); }
  }, [ws, saleId]);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!ws || !draft) return;
    setBusy(true);
    try {
      await realEstateService.upsertCommissionSplit(ws, {
        sale_id: saleId, party_type: draft.party_type, basis: draft.basis,
        pct: draft.basis === 'pct' ? draft.pct : null,
        fixed_amount: draft.basis === 'fixed' ? draft.fixed_amount : null,
        label: draft.label || null,
      });
      setDraft(null); await load();
    } catch (e) { toast({ title: 'Could not save', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const markPaid = async (s: CommissionSplit) => {
    if (!ws) return;
    try { await realEstateService.upsertCommissionSplit(ws, { split_id: s.split_id, paid_at: s.paid_at ? null : new Date().toISOString() }); await load(); }
    catch (e) { toast({ title: 'Could not update', description: (e as Error).message, variant: 'destructive' }); }
  };

  const remove = async (s: CommissionSplit) => {
    if (!ws) return;
    try { await realEstateService.deleteCommissionSplit(ws, s.split_id); await load(); }
    catch (e) { toast({ title: 'Could not delete', description: (e as Error).message, variant: 'destructive' }); }
  };

  if (splits === null) return null;
  const ccy = totals?.currency ?? 'EUR';
  // Over-allocation is an accounting error, not a rounding wobble — the brokerage has promised out
  // more than it earned. The nightly `realestate.commission_over_allocated` check reports it too;
  // this is so the person creating it sees it immediately.
  const over = (totals?.unallocated ?? 0) < -0.01;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><Percent className="h-4 w-4" /> Commission splits</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Percentages are of the commission ({money(totals?.commission_base, ccy)}, net of VAT) — not of the sale price.
          </p>
        </div>
        {canManage && !draft && (
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDraft({ party_type: 'listing_agent', basis: 'pct', pct: '50', fixed_amount: '', label: '' })}>
            <Plus className="mr-1 h-4 w-4" /> Add split
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {splits.length === 0 && !draft && <p className="py-2 text-sm text-muted-foreground">No splits yet — the whole fee sits with the house.</p>}

        {splits.map((s) => (
          <div key={s.split_id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
            <span className="font-medium">{PARTY_LABELS[s.party_type] ?? s.party_type}</span>
            {s.label && <span className="text-xs text-muted-foreground">{s.label}</span>}
            <span className="ml-auto font-medium tabular-nums">{money(s.amount, s.currency)}</span>
            {s.paid_at
              ? <span className="text-xs text-emerald-600 dark:text-emerald-400">paid {formatDate(s.paid_at)}</span>
              : <span className="text-xs text-amber-600 dark:text-amber-400">unpaid</span>}
            {canManage && (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs" onClick={() => markPaid(s)}>
                  <Check className="mr-1 h-3 w-3" /> {s.paid_at ? 'Unpay' : 'Paid'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-destructive" onClick={() => remove(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        ))}

        {totals && (
          <div className={`flex flex-wrap items-center gap-4 rounded-lg px-3 py-2 text-sm ${over ? 'bg-destructive/10' : 'bg-muted/40'}`}>
            <span>Allocated <strong className="tabular-nums">{money(totals.allocated, ccy)}</strong></span>
            <span className={over ? 'text-destructive' : ''}>
              {over ? 'Over-allocated by ' : 'Unallocated '}
              <strong className="tabular-nums">{money(Math.abs(totals.unallocated), ccy)}</strong>
            </span>
            {over && <span className="text-xs text-destructive">The splits promise out more than this sale earned.</span>}
          </div>
        )}

        {draft && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-xs">Party</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.party_type} onChange={(e) => setDraft({ ...draft, party_type: e.target.value })}>
                  {Object.entries(PARTY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Basis</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.basis} onChange={(e) => setDraft({ ...draft, basis: e.target.value })}>
                  <option value="pct">% of commission</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </div>
              {draft.basis === 'pct'
                ? <div><Label className="text-xs">Percent</Label><Input type="number" value={draft.pct} onChange={(e) => setDraft({ ...draft, pct: e.target.value })} /></div>
                : <div><Label className="text-xs">Amount</Label><Input type="number" value={draft.fixed_amount} onChange={(e) => setDraft({ ...draft, fixed_amount: e.target.value })} /></div>}
              <div><Label className="text-xs">Label (optional)</Label><Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Co-broke agency" /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDraft(null)}>Cancel</Button>
              <Button size="sm" className="rounded-full" disabled={busy} onClick={add}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Add</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
