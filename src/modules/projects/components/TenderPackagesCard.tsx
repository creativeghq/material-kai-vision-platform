/**
 * Tender packages — the enquiry, the bids, and the comparison that picks one.
 *
 * The comparison is the point. A package line shows every bidder's rate side by side with the
 * lowest PRICED one marked; a line somebody left blank is never "lowest", because a bid that wins
 * on what it omitted is the classic way a subcontract goes wrong.
 *
 * The totals row is what decides most awards, and it is deliberately per-bidder rather than a
 * single "cheapest" verdict: the lowest total often belongs to the bid with the most exclusions,
 * which is why `notes` sits beside it.
 *
 * AWARDING CALLS ONE RPC. The purchase order, its lines, the recomputed totals, the package stamp
 * and the losing bids all move together — never a sequence of writes from here, which is the
 * create-then-stamp pair that lets the same package twice when the second write fails.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Gavel, Send, Check } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { humanizeLabel } from '@/utils/humanize';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import {
  tendersService, isBidComparable,
  type TenderPackage, type ComparisonRow, type PackageStatus,
} from '../services/tendersService';
import { TenderPackageWorkspace } from './TenderPackageWorkspace';

interface Props {
  projectId: string;
  workspaceId: string | null;
  currency?: string;
  isOwner: boolean;
  /** Called after an award, so the CVR picks up the new commitment. */
  onChanged?: () => void;
}

const n = (v: number | string | null | undefined) => Number(v ?? 0);

const statusVariant = (s: PackageStatus) =>
  s === 'awarded' ? 'success' : s === 'cancelled' ? 'neutral' : s === 'issued' ? 'info' : 'neutral';

export const TenderPackagesCard: React.FC<Props> = ({
  projectId, workspaceId, currency = 'EUR', isOwner, onChanged,
}) => {
  const { toast } = useToast();
  const [packages, setPackages] = useState<TenderPackage[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');

  const loadPackages = useCallback(async () => {
    try {
      const list = await tendersService.listPackages(projectId);
      setPackages(list);
      setActiveId((cur) => (cur && list.some((p) => p.id === cur) ? cur : (list[0]?.id ?? null)));
    } catch (e) {
      toast({ title: 'Failed to load packages', description: (e as Error).message, variant: 'destructive' });
      setPackages([]);
    }
  }, [projectId, toast]);

  useEffect(() => { void loadPackages(); }, [loadPackages]);

  const loadComparison = useCallback(async () => {
    if (!activeId) { setRows([]); return; }
    try { setRows(await tendersService.comparison(activeId)); }
    catch (e) { toast({ title: 'Failed to load the comparison', description: (e as Error).message, variant: 'destructive' }); }
  }, [activeId, toast]);

  useEffect(() => { void loadComparison(); }, [loadComparison]);

  const act = async (label: string, fn: () => Promise<unknown>, alsoPackages = false) => {
    setBusy(true);
    try {
      await fn();
      if (alsoPackages) await loadPackages();
      await loadComparison();
      onChanged?.();
    } catch (e) {
      toast({ title: label, description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const active = packages?.find((p) => p.id === activeId) ?? null;
  const money = (v: number | string | null | undefined) => formatMoney(n(v), active?.currency ?? currency);

  /** The distinct package lines, in the order the comparison returned them. */
  const lines = useMemo(() => {
    const seen = new Map<string, ComparisonRow>();
    for (const r of rows) if (!seen.has(r.package_item_id)) seen.set(r.package_item_id, r);
    return [...seen.values()];
  }, [rows]);

  /** The bidders whose prices belong in a comparison — received only. */
  const bidders = useMemo(() => {
    const seen = new Map<string, { bid_id: string; name: string; status: string }>();
    for (const r of rows) {
      if (!r.bid_id || !r.company_id) continue;
      if (r.bid_status && !isBidComparable(r.bid_status)) continue;
      if (!seen.has(r.bid_id)) {
        seen.set(r.bid_id, { bid_id: r.bid_id, name: r.company_name ?? 'Unnamed', status: r.bid_status ?? '' });
      }
    }
    return [...seen.values()];
  }, [rows]);

  const cell = (itemId: string, bidId: string) =>
    rows.find((r) => r.package_item_id === itemId && r.bid_id === bidId) ?? null;

  const bidTotal = (bidId: string) =>
    rows.filter((r) => r.bid_id === bidId).reduce((s, r) => s + n(r.amount), 0);

  /**
   * How many lines a bidder left unpriced.
   *
   * Their total silently excludes those lines, so the bid with the most omissions looks cheapest —
   * which is the trap this whole comparison exists to avoid. The count sits beside the total so
   * the two are never read apart.
   */
  const unpricedCount = (bidId: string) =>
    rows.filter((r) => r.bid_id === bidId && r.amount === null).length;

  const createPackage = async () => {
    if (!workspaceId || !newName.trim()) return;
    await act('Could not create the package', async () => {
      const created = await tendersService.createPackage({
        workspace_id: workspaceId, project_id: projectId, name: newName.trim(), currency,
      });
      setNewName('');
      setActiveId(created.id);
    }, true);
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle>Tender packages</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Send a trade package to several subcontractors and compare what comes back. Awarding one
          creates the purchase order, so the commitment shows in the cost report straight away.
        </p>
      </CardHeader>

      <CardContent className="px-0 py-0">
        {packages === null ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : packages.length === 0 ? (
          <div className="px-5 py-4">
            <HubEmptyState
              icon={Gavel}
              title="No packages out to tender"
              description="Bundle a trade into a package, invite subcontractors, and compare their rates line by line before you award it."
              action={isOwner && workspaceId ? (
                <div className="flex gap-2">
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder="Plumbing package" className="h-9 w-48" />
                  <Button size="sm" onClick={() => void createPackage()} disabled={busy || !newName.trim()}>
                    <Plus className="h-3.5 w-3.5" /> Create
                  </Button>
                </div>
              ) : undefined}
            />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-2">
              {packages.map((p) => (
                <button key={p.id} type="button" onClick={() => setActiveId(p.id)}
                  className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors ${
                    p.id === activeId ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}>
                  <span className="font-mono tabular-nums">{p.reference}</span>
                  {p.name}
                  <Badge variant={statusVariant(p.status)}>{humanizeLabel(p.status)}</Badge>
                </button>
              ))}
              {isOwner && workspaceId && (
                <div className="ml-auto flex items-center gap-2">
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder="New package" className="h-8 w-40" />
                  <Button size="sm" variant="ghost" onClick={() => void createPackage()} disabled={busy || !newName.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {active && (
              <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-surface-sunken px-5 py-2 text-xs text-muted-foreground">
                {active.due_at && <span>Bids due {formatDate(active.due_at)}</span>}
                {active.status === 'awarded' ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Awarded — the subcontract is a purchase order on this project.
                  </span>
                ) : (
                  <span>{bidders.length} bid{bidders.length === 1 ? '' : 's'} received</span>
                )}
                {isOwner && active.status !== 'awarded' && (
                  <Button size="sm" variant="ghost" className="ml-auto" disabled={busy}
                    onClick={() => void act('Could not delete', () => tendersService.removePackage(active.id), true)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            )}

            {active && workspaceId && isOwner && (
              <TenderPackageWorkspace
                projectId={projectId}
                workspaceId={workspaceId}
                packageId={active.id}
                currency={active.currency ?? currency}
                locked={active.status === 'awarded'}
                onChanged={() => { void loadComparison(); onChanged?.(); }}
              />
            )}

            {lines.length === 0 ? (
              <div className="border-t border-border/60 px-5 py-6 text-center text-sm text-muted-foreground">
                Nothing to compare yet — the package has no items.
              </div>
            ) : bidders.length === 0 ? (
              <div className="border-t border-border/60 px-5 py-6 text-center text-sm text-muted-foreground">
                {lines.length} item{lines.length === 1 ? '' : 's'} ready to send. No bids marked received yet.
              </div>
            ) : (
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                      <th className="px-5 py-2 text-left">Ref</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      {bidders.map((b) => (
                        <th key={b.bid_id} className="px-3 py-2 text-right">{b.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.package_item_id} className="border-t border-border/60">
                        <td className="px-5 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                          {l.item_ref ?? '—'}
                        </td>
                        <td className="px-3 py-2">{l.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {l.quantity ?? '—'}{l.unit ? ` ${l.unit}` : ''}
                        </td>
                        {bidders.map((b) => {
                          const c = cell(l.package_item_id, b.bid_id);
                          return (
                            <td key={b.bid_id}
                              className={`px-3 py-2 text-right tabular-nums ${
                                c?.is_lowest ? 'font-medium text-emerald-700 dark:text-emerald-400' : ''
                              }`}>
                              {c?.amount === null || c?.amount === undefined ? (
                                // Never shown as zero: an unpriced line is an omission, and a bid
                                // that wins on what it left out is how a subcontract goes wrong.
                                <span className="text-amber-800 dark:text-amber-300">not priced</span>
                              ) : money(c.amount)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-t border-border/60 bg-surface-sunken font-medium">
                      <td className="px-5 py-2" colSpan={3}>Total</td>
                      {bidders.map((b) => {
                        const missing = unpricedCount(b.bid_id);
                        return (
                          <td key={b.bid_id} className="px-3 py-2 text-right tabular-nums">
                            {money(bidTotal(b.bid_id))}
                            {missing > 0 && (
                              <span className="block text-[11px] font-normal text-amber-800 dark:text-amber-300">
                                {missing} line{missing === 1 ? '' : 's'} not priced
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {isOwner && active?.status !== 'awarded' && (
                      <tr className="border-t border-border/60">
                        <td className="px-5 py-2" colSpan={3} />
                        {bidders.map((b) => (
                          <td key={b.bid_id} className="px-3 py-2 text-right">
                            <Button size="sm" variant="outline" disabled={busy}
                              onClick={() => void act('Could not award', async () => {
                                await tendersService.award(active!.id, b.bid_id);
                                toast({
                                  title: `Awarded to ${b.name}`,
                                  description: 'A purchase order has been raised — the commitment is now in the cost report.',
                                });
                              }, true)}>
                              <Check className="h-3.5 w-3.5" /> Award
                            </Button>
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <p className="border-t border-border/60 px-5 py-3 text-[11px] text-muted-foreground">
              The lowest priced rate on each line is highlighted. A line nobody priced is shown as
              unpriced rather than as zero — the cheapest total is not always the cheapest bid.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

/** Re-exported so the send action has a home when the invite flow lands. */
export { Send };
