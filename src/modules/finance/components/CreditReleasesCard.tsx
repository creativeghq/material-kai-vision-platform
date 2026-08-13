/**
 * What has already been kept as income off this party's account — the other half of "release".
 *
 * `release_customer_credit` and `reverse_credit_release` both shipped working, and both were
 * unreachable: the release was one-way from the UI and the amount survived only as an
 * indistinguishable slice of a P&L-by-category total. So the operator could turn a customer's
 * leftover €400 into profit and then have no way to see that they had, which is precisely the
 * kind of action that must stay visible — it moves money out of a party's account without any
 * document being issued to them.
 *
 * The Undo is the RPC's own reversal: the release row is deleted, its allocations cascade away,
 * and the credit reappears on the party's account exactly as it was. Nothing is issued and
 * nothing is transmitted either way, so a mistaken release costs nothing but a click.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Coins, Loader2, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney, type CreditRelease } from '@/modules/finance/services/financeService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { formatDate } from '@/utils/datetime';

export const CreditReleasesCard: React.FC<{
  workspaceId: string;
  party: { companyId?: string | null; contactId?: string | null };
  /** Bumped by the parent after a release so this list re-reads what it just wrote. */
  refreshKey?: number;
  onChanged?: () => void;
}> = ({ workspaceId, party, refreshKey = 0, onChanged }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<CreditRelease[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId || (!party.companyId && !party.contactId)) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [list, cats] = await Promise.all([
        financeService.listCreditReleases(workspaceId, party),
        financeCategoriesService.list(workspaceId).catch(() => [] as FinanceCategory[]),
      ]);
      setRows(list);
      setCategories(cats);
    } catch {
      setRows([]);
    } finally { setLoading(false); }
  }, [workspaceId, party.companyId, party.contactId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const undo = async (r: CreditRelease) => {
    setBusy(r.id);
    try {
      const amount = await financeService.reverseCreditRelease(r.id);
      toast({
        title: 'Release undone',
        description: `${formatMoney(amount, r.currency)} is back on their account.`,
      });
      await load();
      onChanged?.();
    } catch (err: any) {
      toast({ title: 'Could not undo the release', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  // A party who has never had credit released has nothing to say here, and an empty card on every
  // record would be noise on hundreds of them.
  if (!loading && rows.length === 0) return null;

  const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0);
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized';

  return (
    <Card className="dashboard-card">
      <CardHeader className="px-5 py-3 border-b border-border/60 flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Coins className="h-4 w-4" /> Kept as income
        </CardTitle>
        {/* The number the operator actually asked for: how much of this party's money ended up as
            profit, in one figure, next to the individual acts that produced it. */}
        <span className="text-sm font-semibold text-emerald-500 tabular-nums">{formatMoney(total)}</span>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border/30 px-4 py-2 text-sm last:border-b-0">
            <span className="min-w-0">
              <span className="block">{formatMoney(Number(r.amount), r.currency)} <span className="text-muted-foreground">· {categoryName(r.category_id)}</span></span>
              <span className="block text-[10px] text-muted-foreground">
                {formatDate(r.released_at)}{r.notes ? ` · ${r.notes}` : ''}
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
              title="Put this credit back on their account. Nothing was issued to them, so nothing has to be cancelled."
              disabled={busy === r.id}
              onClick={() => void undo(r)}
            >
              {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RotateCcw className="h-3 w-3 mr-1" /> Undo</>}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
