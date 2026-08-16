import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Boxes, RefreshCw, Send, Check, History, Info, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { SectionHeader } from '@/components/shared/SectionHeader';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import {
  catalogMasterService, type CatalogMasterProduct, type MasterPriceDrift, type MasterChangelogEntry,
} from '@/services/catalogMasterService';

/**
 * Master catalog surface (#324 phases 3–4). One page, two audiences:
 *
 *  • A confirmed manufacturer sees THEIR products and can publish facts and a price.
 *    Facts become the effective values platform-wide; a price only becomes an offer.
 *  • The operator sees published asks that differ from what we currently pay, and accepts
 *    them into the operator catalog's cost. That accept is the ONLY route from a supplier's
 *    published price to a real cost anywhere on the platform.
 */
export default function MasterCatalogPage() {
  const { activeWorkspaceId, isRootWorkspace } = useWorkspace();
  const { toast } = useToast();
  // The price-change notification links here with ?product=<master id>. Landing on the page
  // and leaving the operator to find the row by eye defeats the point of the link.
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('product');
  const focusRef = useRef<HTMLTableRowElement | null>(null);

  const [gate, setGate] = useState<{ allowed: boolean; reason?: string; platformSupplierId?: string; legalName?: string } | null>(null);
  const [rows, setRows] = useState<CatalogMasterProduct[]>([]);
  const [drift, setDrift] = useState<MasterPriceDrift[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CatalogMasterProduct | null>(null);
  const [history, setHistory] = useState<{ row: CatalogMasterProduct; entries: MasterChangelogEntry[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // A workspace with no claim (or a member who is not the confirmed contact) simply gets
      // `allowed: false` — the same shape as a thrown gate, so the page renders one way.
      const g: Awaited<ReturnType<typeof catalogMasterService.publishingAllowed>> = activeWorkspaceId
        ? await catalogMasterService.publishingAllowed(activeWorkspaceId).catch(() => ({ allowed: false }))
        : { allowed: false };
      setGate(g);
      setRows(g.allowed && g.platformSupplierId ? await catalogMasterService.listForSupplier(g.platformSupplierId) : []);
      setDrift(isRootWorkspace ? await catalogMasterService.priceDrift(true).catch(() => []) : []);
    } catch (e: any) {
      toast({ title: 'Failed to load catalog', description: e?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [activeWorkspaceId, isRootWorkspace, toast]);

  useEffect(() => { void load(); }, [load]);

  // Once the rows are in, bring the linked one into view. Runs after both lists render, so it
  // works whichever table the row landed in (operator drift, or the supplier's own products).
  useEffect(() => {
    if (!focusId || loading) return;
    focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusId, loading, drift, rows]);

  const accept = async (d: MasterPriceDrift) => {
    setBusyId(d.master_product_id);
    try {
      const res = await catalogMasterService.acceptPrice(d.master_product_id);
      toast({
        title: 'Price accepted',
        description: `Your catalog cost is now ${res.cost} ${d.list_price_currency ?? 'EUR'} on ${res.productsUpdated} product(s). No other workspace was touched.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const openHistory = async (row: CatalogMasterProduct) => {
    try {
      setHistory({ row, entries: await catalogMasterService.changelog(row.id) });
    } catch (e: any) {
      toast({ title: 'Failed to load history', description: e?.message, variant: 'destructive' });
    }
  };

  const gateMessage = useMemo(() => {
    if (!gate || gate.allowed) return null;
    switch (gate.reason) {
      case 'not_claimed': return 'Claim your manufacturer identity from Profile → Business to publish product data.';
      case 'revoked': return 'This company\'s claim was withdrawn by the operator. Publishing is disabled.';
      case 'no_confirmed_contact': return 'The operator has not yet confirmed a contact person for this company.';
      case 'not_the_confirmed_contact': return 'Publishing is limited to the person the operator confirmed for this company.';
      default: return null;
    }
  }, [gate]);

  return (
    <div className="p-6 space-y-4">
      <SectionHeader
        icon={Boxes}
        title="Master catalog"
        subtitle="Manufacturer-published product data outranks our catalog extraction. A published price is an offer to the operator, never a change to anyone's negotiated cost."
        actions={
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center gap-2 justify-center py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {/* ── Operator: published asks awaiting a decision ────────────────── */}
          {isRootWorkspace && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Price changes to review ({drift.length})</CardTitle>
                <p className="text-xs text-muted-foreground">
                  What each factory now asks, against what your catalog currently pays. Accepting updates
                  your own cost only — every other workspace keeps its own negotiated price.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {drift.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">Nothing to review.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left font-medium px-4 py-2">Product</th>
                        <th className="text-left font-medium px-4 py-2">Supplier</th>
                        <th className="text-right font-medium px-4 py-2">You pay</th>
                        <th className="text-right font-medium px-4 py-2">They ask</th>
                        <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {drift.map((d) => {
                        const up = d.operator_cost != null && d.list_price != null && d.list_price > d.operator_cost;
                        return (
                          <tr
                            key={d.master_product_id}
                            ref={d.master_product_id === focusId ? focusRef : undefined}
                            className={`border-b last:border-0 ${d.master_product_id === focusId ? 'bg-primary/5' : ''}`}
                          >
                            <td className="px-4 py-2">
                              <div>{d.name || d.normalized_sku}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">{d.normalized_sku}</div>
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">{d.supplier_name || '—'}</td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {d.operator_cost != null ? `${d.operator_cost} ${d.operator_cost_currency ?? ''}` : <span className="text-muted-foreground">not set</span>}
                            </td>
                            <td className={`px-4 py-2 text-right tabular-nums font-medium ${up ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {d.list_price} {d.list_price_currency ?? ''}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <Button size="sm" className="rounded-full h-8" disabled={busyId === d.master_product_id} onClick={() => accept(d)}>
                                {busyId === d.master_product_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="h-3.5 w-3.5 mr-1" /> Accept</>}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Manufacturer: my published products ─────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>
                {gate?.allowed ? `${gate.legalName || 'Your'} products (${rows.length})` : 'Your products'}
              </CardTitle>
              {gate?.allowed && (
                <p className="text-xs text-muted-foreground">
                  What you publish here becomes the trusted description of these products across the platform.
                </p>
              )}
            </CardHeader>
            <CardContent className={rows.length ? 'p-0' : undefined}>
              {gateMessage ? (
                <div className="flex items-start gap-2 py-10 px-4 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" /> {gateMessage}
                </div>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">
                  No products carry your identity yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left font-medium px-4 py-2">SKU</th>
                      <th className="text-left font-medium px-4 py-2">Name</th>
                      <th className="text-right font-medium px-4 py-2">Your price</th>
                      <th className="text-left font-medium px-4 py-2">Source</th>
                      <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const mine = Object.values(r.field_authority ?? {}).some((a) => a === 'manufacturer');
                      return (
                        <tr
                          key={r.id}
                          ref={r.id === focusId && !isRootWorkspace ? focusRef : undefined}
                          className={`border-b last:border-0 ${r.id === focusId ? 'bg-primary/5' : ''}`}
                        >
                          <td className="px-4 py-2 font-mono text-xs">{r.normalized_sku}</td>
                          <td className="px-4 py-2">{r.name || <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {r.list_price != null ? `${r.list_price} ${r.list_price_currency ?? ''}` : <span className="text-muted-foreground">not published</span>}
                          </td>
                          <td className="px-4 py-2">
                            {mine
                              ? <span className="text-emerald-600 dark:text-emerald-400">Published by you</span>
                              : <span className="text-muted-foreground">From our extraction</span>}
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            <Button size="sm" variant="ghost" className="rounded-full h-8" onClick={() => openHistory(r)}>
                              <History className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" className="rounded-full h-8 ml-1" onClick={() => setEditing(r)}>
                              <Send className="h-3.5 w-3.5 mr-1" /> Publish
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <PublishDialog row={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void load(); }} />
      <HistoryDialog data={history} onClose={() => setHistory(null)} />
    </div>
  );
}

/** Publish facts and/or a price for one master row. */
const PublishDialog: React.FC<{ row: CatalogMasterProduct | null; onClose: () => void; onDone: () => void }> = ({ row, onClose, onDone }) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [barcode, setBarcode] = useState('');
  const [origin, setOrigin] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [saving, setSaving] = useState(false);
  /**
   * Volume tiers (#332 step 7). A factory sells "€480/m² at 1 pallet, €450 at 5"; before this
   * the dialog offered one number, so a tier ladder was flattened to whichever price got typed.
   * Held as strings because they are form fields, parsed once on submit.
   */
  const [tiers, setTiers] = useState<Array<{ min_quantity: string; unit: string; unit_price: string }>>([]);

  useEffect(() => {
    if (!row) return;
    const a = (row.attributes ?? {}) as Record<string, unknown>;
    setName(row.name ?? '');
    setDescription(typeof a.description === 'string' ? a.description : '');
    setBarcode(row.barcode ?? '');
    setOrigin(typeof a.country_of_origin === 'string' ? a.country_of_origin : '');
    setPrice(row.list_price != null ? String(row.list_price) : '');
    setCurrency(row.list_price_currency ?? 'EUR');
    setTiers([]);
    void catalogMasterService.listPriceBreaks(row.id)
      .then((bs) => setTiers(bs.map((b) => ({
        min_quantity: String(b.min_quantity),
        unit: b.unit ?? '',
        unit_price: b.unit_price != null ? String(b.unit_price) : '',
      }))))
      // Silent: no visible tiers is the honest state when RLS hides them or the fetch fails.
      // Publishing then replaces nothing, because submit only writes when the operator edited.
      .catch(() => setTiers([]));
  }, [row]);

  const addTier = () => setTiers((t) => [...t, { min_quantity: '', unit: '', unit_price: '' }]);
  const setTier = (i: number, patch: Partial<{ min_quantity: string; unit: string; unit_price: string }>) =>
    setTiers((t) => t.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeTier = (i: number) => setTiers((t) => t.filter((_, j) => j !== i));

  const submit = async () => {
    if (!row) return;
    setSaving(true);
    try {
      const facts: Record<string, unknown> = {};
      if (name.trim() && name.trim() !== (row.name ?? '')) facts.name = name.trim();
      const a = (row.attributes ?? {}) as Record<string, unknown>;
      if (description.trim() && description.trim() !== a.description) facts.description = description.trim();
      if (barcode.trim() && barcode.trim() !== (row.barcode ?? '')) facts.barcode = barcode.trim();
      if (origin.trim() && origin.trim() !== a.country_of_origin) facts.country_of_origin = origin.trim();

      if (Object.keys(facts).length > 0) await catalogMasterService.publishFacts(row.id, facts);

      const p = price.trim() === '' ? null : Number(price);
      if (p != null && Number.isFinite(p) && p !== row.list_price) {
        await catalogMasterService.publishPrice(row.id, p, currency);
      }
      // Tiers are published as a SET: every row that carries a quantity and a price. A tier with
      // neither is an empty form row, not an instruction, so it is dropped rather than rejected.
      const cleanTiers = tiers
        .map((t) => ({
          min_quantity: Number(t.min_quantity),
          unit: t.unit.trim() || null,
          unit_price: t.unit_price.trim() === '' ? null : Number(t.unit_price),
          discount_percent: null,
          currency,
        }))
        .filter((t) => Number.isFinite(t.min_quantity) && t.min_quantity > 0
          && t.unit_price != null && Number.isFinite(t.unit_price));
      const tiersTouched = cleanTiers.length > 0 || tiers.length > 0;
      if (tiersTouched) await catalogMasterService.publishPriceBreaks(row.id, cleanTiers);

      if (Object.keys(facts).length === 0 && p === row.list_price && !tiersTouched) {
        toast({ title: 'Nothing changed' });
      } else {
        toast({
          title: 'Published',
          description: 'Product details are live platform-wide. Any price change is sent to the operator to accept.',
        });
      }
      onDone();
    } catch (e: any) {
      toast({ title: 'Publish failed', description: e?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish {row?.normalized_sku}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Product name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Barcode / EAN</Label>
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Country of origin</Label>
              <Input value={origin} onChange={(e) => setOrigin(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Your price</Label>
              <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Volume tiers</Label>
              <Button type="button" size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={addTier}>
                Add tier
              </Button>
            </div>
            {tiers.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                One flat price. Add tiers if your price drops at volume — &ldquo;from 5 pallets, €450/m²&rdquo;.
              </p>
            ) : (
              <div className="space-y-2">
                {tiers.map((t, i) => (
                  <div key={i} className="grid grid-cols-[90px_80px_1fr_auto] items-center gap-2">
                    <Input className="h-8 text-xs" placeholder="from qty" inputMode="decimal"
                      value={t.min_quantity} onChange={(e) => setTier(i, { min_quantity: e.target.value })} />
                    <Input className="h-8 text-xs" placeholder="unit"
                      value={t.unit} onChange={(e) => setTier(i, { unit: e.target.value })} />
                    <Input className="h-8 text-xs" placeholder={`price / unit (${currency})`} inputMode="decimal"
                      value={t.unit_price} onChange={(e) => setTier(i, { unit_price: e.target.value })} />
                    <button type="button" className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeTier(i)} aria-label="Remove tier">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Product details replace ours everywhere immediately. Your price and tiers are sent to the operator
            as an offer — they never change what any customer already agreed to pay.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const HistoryDialog: React.FC<{ data: { row: CatalogMasterProduct; entries: MasterChangelogEntry[] } | null; onClose: () => void }> = ({ data, onClose }) => (
  <Dialog open={!!data} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>History · {data?.row.normalized_sku}</DialogTitle></DialogHeader>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {(data?.entries ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No changes recorded.</p>
        ) : data?.entries.map((e) => (
          <div key={e.id} className="text-xs border-b last:border-0 pb-2">
            <div className="flex items-center justify-between">
              <span className="font-medium capitalize">{e.change_kind}</span>
              <span className="text-muted-foreground">{formatDate(e.created_at, { withTime: true })}</span>
            </div>
            <div className="text-muted-foreground break-all">{Object.keys(e.changed_fields ?? {}).join(', ')}</div>
          </div>
        ))}
      </div>
    </DialogContent>
  </Dialog>
);
