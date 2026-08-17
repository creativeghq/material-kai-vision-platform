/**
 * Project Products — products tracked against a project with a Selection → Confirmed →
 * Ordered → Shipped → Delivered lifecycle. Lines are added manually (catalog search or a
 * custom line) or imported live-linked from the project's quotes. Each line carries an
 * agreed `sold_price` (editable, project-owned) plus a reference price resolved through the
 * role-correct pricing hierarchy (get_product_price_for_workspace) — when no upstream price
 * exists for this workspace's chain the line shows "Ask for a quote".
 *
 * Owner-only (operator/dealer/architect). End-customer collaborators never reach this tab.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import {
  Package, Loader2, Plus, Trash2, Tag, DownloadCloud, Search, X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  projectsService,
  PROJECT_PRODUCT_STATUSES,
  type ProjectProductStatus,
  type ProjectProductWithDisplay,
} from '../../services/projectsService';
import { statusTone } from '@/utils/statusTone';

const STATUS_LABELS: Record<ProjectProductStatus, string> = {
  selection: 'Selection',
  confirmed: 'Confirmed',
  ordered: 'Ordered',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

const money = (n: number | null | undefined, c: string | null | undefined) => formatMoney(n, c ?? 'EUR');

export const ProductsTab: React.FC<{ projectId: string; workspaceId?: string | null }> = ({ projectId, workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ProjectProductWithDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // row id being mutated
  const [importing, setImporting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setRows(await projectsService.listProjectProducts(projectId));
    } catch {
      toast({ title: 'Failed to load products', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);
  useEffect(() => { load(); }, [load]);

  const importFromQuotes = async () => {
    setImporting(true);
    try {
      const n = await projectsService.importProductsFromQuotes(projectId);
      toast({ title: n > 0 ? `Imported ${n} line${n === 1 ? '' : 's'} from quotes` : 'Nothing new to import' });
      if (n > 0) await load();
    } catch (err: any) {
      toast({ title: 'Import failed', description: err?.message, variant: 'destructive' });
    } finally { setImporting(false); }
  };

  const setStatus = async (id: string, status: ProjectProductStatus) => {
    setBusy(id);
    try {
      await projectsService.updateProjectProduct(id, { status });
      setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch { toast({ title: 'Failed to update status', variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const saveSold = async (id: string, value: string) => {
    const sold = value.trim() === '' ? null : Number(value);
    // A price is a non-negative number or it is nothing. "-50" and "1e9" are both valid `number`s,
    // which is exactly why nothing downstream catches them (#358 PQ-14).
    if (sold != null && (!Number.isFinite(sold) || sold < 0)) {
      toast({ title: 'Enter a price of 0 or more', variant: 'destructive' });
      return;
    }
    setBusy(id);
    try {
      await projectsService.updateProjectProduct(id, { sold_price: sold });
      setRows(prev => prev.map(r => r.id === id ? { ...r, sold_price: sold } : r));
    } catch { toast({ title: 'Failed to save price', variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const resolvePrice = async (row: ProjectProductWithDisplay) => {
    if (!row.product_id) { toast({ title: 'Custom lines have no catalog price', variant: 'destructive' }); return; }
    if (!workspaceId) { toast({ title: 'No workspace pricing available', description: 'This project has no workspace — ask for a quote.', variant: 'destructive' }); return; }
    setBusy(row.id);
    try {
      // The line's own quantity and unit, so a volume break applies to a project spec the same
      // way it does on a quote (#332 step 1c). A project is where large quantities actually
      // occur, so this is the surface where a missing break was most visibly wrong.
      const p = await projectsService.resolveProductPrice(workspaceId, row.product_id, {
        quantity: row.quantity, unit: row.unit,
      });
      if (p.ask_for_quote) {
        await projectsService.updateProjectProduct(row.id, { price_source: 'ask_for_quote' });
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, price_source: 'ask_for_quote' } : r));
        toast({ title: 'No price available — marked "Ask for a quote"' });
      } else {
        const ref = p.suggested_sell ?? p.base_price;
        await projectsService.updateProjectProduct(row.id, {
          quoted_price: ref, price_source: 'catalog', price_currency: p.currency,
          // prefill the agreed price only if not already set
          ...(row.sold_price == null ? { sold_price: ref } : {}),
        });
        setRows(prev => prev.map(r => r.id === row.id ? {
          ...r, quoted_price: ref, reference_price: r.source_quote_item_id ? r.reference_price : ref,
          price_source: 'catalog', price_currency: p.currency,
          sold_price: r.sold_price == null ? ref : r.sold_price,
        } : r));
        toast({ title: `Price resolved (${money(ref, p.currency)})` });
      }
    } catch (err: any) {
      toast({ title: 'Price lookup failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this product from the project?')) return;
    setBusy(id);
    try {
      await projectsService.deleteProjectProduct(id);
      setRows(prev => prev.filter(r => r.id !== id));
    } catch { toast({ title: 'Failed to remove', variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-medium flex items-center gap-2"><Package className="h-4 w-4" /> Products</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-full" onClick={importFromQuotes} disabled={importing}>
            {importing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5 mr-1" />}
            Import from quotes
          </Button>
          <Button size="sm" className="rounded-full" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add product
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="dashboard-card"><CardContent className="py-12 text-center">
          <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No products tracked on this project yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Add one manually, or import the lines from an attached quote.</p>
        </CardContent></Card>
      ) : (
        <Card className="dashboard-card"><CardContent className="p-0"><div className="divide-y divide-white/8">
          {rows.map((r) => (
            <div key={r.id} className="p-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <p className="font-medium truncate">{r.display_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.display_sku ? `${r.display_sku} · ` : ''}Qty {r.quantity}{r.unit ? ` ${r.unit}` : ''}
                  {r.source_quote_item_id ? ' · from quote' : ''}
                </p>
              </div>

              <Select value={r.status} onValueChange={(v) => setStatus(r.id, v as ProjectProductStatus)}>
                <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_PRODUCT_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className={`hidden md:inline-flex text-xs capitalize ${statusTone(r.status)}`}>{STATUS_LABELS[r.status]}</span>

              <div className="text-right w-[110px]">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Reference</p>
                {r.price_source === 'ask_for_quote' && r.reference_price == null ? (
                  <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-300 border-amber-500/30">Ask for a quote</Badge>
                ) : (
                  <p className="text-sm">{money(r.reference_price, r.price_currency)}</p>
                )}
              </div>

              <div className="w-[120px]">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Sold</Label>
                <Input
                  type="number" min="0" step="0.01" defaultValue={r.sold_price ?? ''}
                  className="h-8" placeholder="—"
                  onBlur={(e) => { if (String(r.sold_price ?? '') !== e.target.value) saveSold(r.id, e.target.value); }}
                />
              </div>

              <Button
                size="icon" variant="ghost" className="h-8 w-8" title="Fetch price from catalog / pricing rules"
                onClick={() => resolvePrice(r)} disabled={busy === r.id || !r.product_id}>
                {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(r.id)} disabled={busy === r.id}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div></CardContent></Card>
      )}

      <AddProductDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        projectId={projectId}
        workspaceId={workspaceId ?? null}
        onAdded={() => { setAddOpen(false); load(); }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

const AddProductDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  projectId: string;
  workspaceId: string | null;
  onAdded: () => void;
}> = ({ open, onClose, projectId, workspaceId, onAdded }) => {
  const { toast } = useToast();
  const [tab, setTab] = useState<'catalog' | 'custom'>('catalog');
  const [busy, setBusy] = useState(false);

  // catalog search
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; sku: string | null }>>([]);
  const [picked, setPicked] = useState<{ id: string; name: string; sku: string | null } | null>(null);
  const [searching, setSearching] = useState(false);

  // shared fields
  const [qty, setQty] = useState('1');
  const [customName, setCustomName] = useState('');
  const [customSku, setCustomSku] = useState('');
  const [soldPrice, setSoldPrice] = useState('');

  const reset = () => {
    setTab('catalog'); setQuery(''); setResults([]); setPicked(null);
    setQty('1'); setCustomName(''); setCustomSku(''); setSoldPrice('');
  };

  const runSearch = useMemo(() => {
    let t: any;
    return (val: string) => {
      clearTimeout(t);
      t = setTimeout(async () => {
        if (!val.trim()) { setResults([]); return; }
        setSearching(true);
        try { setResults(await projectsService.searchProducts(val)); }
        catch { /* ignore */ }
        finally { setSearching(false); }
      }, 250);
    };
  }, []);

  const add = async () => {
    const sold = soldPrice.trim() === '' ? null : Number(soldPrice);
    if (sold != null && (!Number.isFinite(sold) || sold < 0)) {
      toast({ title: 'Enter a sold price of 0 or more', variant: 'destructive' }); return;
    }
    // Quantity was `Number(qty) || 1`, which turned "-3" into -3 and "0" into 1 — a line that
    // subtracts from the project, or one that silently disagrees with what was typed.
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({ title: 'Quantity must be greater than zero', variant: 'destructive' }); return;
    }
    setBusy(true);
    try {
      if (tab === 'catalog') {
        if (!picked) { toast({ title: 'Pick a product', variant: 'destructive' }); setBusy(false); return; }
        await projectsService.addProjectProduct({
          project_id: projectId, workspace_id: workspaceId, product_id: picked.id,
          quantity, sold_price: sold,
        });
      } else {
        if (!customName.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); setBusy(false); return; }
        await projectsService.addProjectProduct({
          project_id: projectId, workspace_id: workspaceId,
          custom_name: customName.trim(), custom_sku: customSku.trim() || null,
          quantity, sold_price: sold, price_source: 'manual',
        });
      }
      toast({ title: 'Product added' });
      reset();
      onAdded();
    } catch (err: any) {
      toast({ title: 'Failed to add', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Product to Project</DialogTitle></DialogHeader>

        <div className="flex gap-2">
          <Button size="sm" variant={tab === 'catalog' ? 'default' : 'outline'} className="rounded-full flex-1" onClick={() => setTab('catalog')}>From catalog</Button>
          <Button size="sm" variant={tab === 'custom' ? 'default' : 'outline'} className="rounded-full flex-1" onClick={() => setTab('custom')}>Custom line</Button>
        </div>

        {tab === 'catalog' ? (
          <div className="space-y-2">
            {picked ? (
              <div className="flex items-center justify-between rounded-md border border-white/10 p-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{picked.name}</p>
                  {picked.sku && <p className="text-xs text-muted-foreground">{picked.sku}</p>}
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPicked(null)}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Search products by name or SKU…" value={query}
                    onChange={(e) => { setQuery(e.target.value); runSearch(e.target.value); }} />
                </div>
                {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
                {results.length > 0 && (
                  <div className="max-h-48 overflow-auto rounded-md border border-white/10 divide-y divide-white/8">
                    {results.map(p => (
                      <button key={p.id} className="w-full text-left p-2 hover:bg-muted/40" onClick={() => { setPicked(p); setResults([]); setQuery(''); }}>
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        {p.sku && <p className="text-xs text-muted-foreground">{p.sku}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1"><Label>Name</Label><Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Bespoke oak door" /></div>
            <div className="space-y-1"><Label>SKU / Ref (optional)</Label><Input value={customSku} onChange={(e) => setCustomSku(e.target.value)} /></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label>Quantity</Label><Input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div className="space-y-1"><Label>Sold price (optional)</Label><Input type="number" min="0" step="0.01" value={soldPrice} onChange={(e) => setSoldPrice(e.target.value)} placeholder="—" /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={busy}>Cancel</Button>
          <Button onClick={add} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
