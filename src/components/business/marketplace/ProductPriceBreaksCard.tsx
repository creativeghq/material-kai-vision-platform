/**
 * Quantity discounts — "5 pallets is cheaper than 5 boards".
 *
 * A break is entered in whatever unit the seller thinks in and compared against the order in
 * BASE units, so a threshold of "1 pallet" fires on an order of 288 m² when the ladder relates
 * them. Resolution happens inside `get_product_price_for_workspace`, the same function quotes,
 * orders and the POS already call — a break is not a second pricing path, it is one more source
 * in the existing discount ladder.
 *
 * Discounts do NOT stack: a customer on 10% ordering a pallet at 15% pays 15%. The preview
 * below shows exactly what the resolver would charge, including which rule won, because "why is
 * this price what it is" has to stay answerable.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Percent, Tag } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import { productUomService, type PriceBreak, type ProductUom } from '@/services/productUomService';
import { formatMoney } from '@/modules/finance/services/financeService';
import { parseDecimal } from '@/utils/decimal';
import { LineIdentityPicker } from '@/components/business/lines/LineIdentityPicker';
import { variantKey } from '@/services/lineIdentityRules';

const num = (s: string): number | null => {
  const v = parseDecimal(s);
  return v == null || !Number.isFinite(v) ? null : v;
};

type Kind = 'percent' | 'price';

export const ProductPriceBreaksCard: React.FC<{ productId: string; workspaceId: string }> = ({
  productId, workspaceId,
}) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PriceBreak[]>([]);
  const [uom, setUom] = useState<ProductUom | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  /**
   * #374 — which variant this ladder is for. Empty = the product-wide ladder, which is what
   * every break was before. The two coexist: the resolver prefers an exact-variant break and
   * falls back to the product-wide one, so "5 pallets of anything" and "5 pallets of Nero"
   * are both expressible.
   */
  const [variantAttrs, setVariantAttrs] = useState<Record<string, string>>({});
  const vkey = variantKey(variantAttrs);

  // New-break form
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [kind, setKind] = useState<Kind>('percent');
  const [value, setValue] = useState('');

  // Preview
  const [previewQty, setPreviewQty] = useState('');
  const [previewUnit, setPreviewUnit] = useState('pcs');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    const [list, ladder] = await Promise.all([
      productUomService.listBreaks(workspaceId, productId, vkey).catch(() => [] as PriceBreak[]),
      productUomService.getUom(productId).catch(() => null),
    ]);
    setRows(list);
    setUom(ladder);
    if (ladder) { setUnit(ladder.base_unit); setPreviewUnit(ladder.base_unit); }
    setLoading(false);
  }, [workspaceId, productId, vkey]);

  useEffect(() => { void load(); }, [load]);

  const units = uom ? productUomService.availableUnits(uom) : ['pcs'];

  const add = async () => {
    const q = num(qty);
    const v = num(value);
    if (q == null || q <= 0) { toast({ title: 'Enter a quantity', variant: 'destructive' }); return; }
    if (v == null || v < 0) { toast({ title: 'Enter a discount or a price', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await productUomService.saveBreak({
        workspace_id: workspaceId, product_id: productId,
        min_quantity: q, unit,
        variant_key: vkey,
        discount_percent: kind === 'percent' ? v : null,
        unit_price: kind === 'price' ? v : null,
      });
      setQty(''); setValue('');
      await load();
      toast({ title: 'Price break added' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try { await productUomService.deleteBreak(id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const runPreview = async () => {
    const q = num(previewQty);
    if (q == null || q <= 0) return;
    setPreviewing(true);
    try {
      setPreview(await productUomService.previewPrice(workspaceId, productId, q, previewUnit, vkey));
    } catch (err: any) {
      toast({ title: 'Preview failed', description: err?.message, variant: 'destructive' });
      setPreview(null);
    } finally { setPreviewing(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }

  const currency = (preview?.currency as string) ?? 'EUR';
  const source = preview?.discount_source as string | undefined;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="text-xs font-medium flex items-center gap-1">
        <Percent className="h-3.5 w-3.5 text-primary" /> Quantity discounts
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Applies to</Label>
        <LineIdentityPicker
          productId={productId}
          value={variantAttrs}
          onChange={(next) => setVariantAttrs(next.selected_attributes)}
        />
        <div className="text-[11px] text-muted-foreground">
          {vkey ? 'This variant only. The product-wide ladder still covers the rest.'
                : 'Every variant. Choose one above to give it its own ladder.'}
        </div>
      </div>

      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From</TableHead>
              <TableHead>Gives</TableHead>
              <TableHead>Applies at</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const base = uom ? productUomService.convertToBase(uom, r.min_quantity, r.unit) : null;
              return (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums">{r.min_quantity} {r.unit}</TableCell>
                  <TableCell>
                    {r.discount_percent != null
                      ? <span className="text-emerald-500">−{r.discount_percent}%</span>
                      : <span className="text-emerald-500">{formatMoney(Number(r.unit_price), r.currency)} / {r.unit}</span>}
                  </TableCell>
                  {/* The threshold restated in base units — the comparison the resolver actually
                      makes. Blank means this unit cannot be converted, so the break never fires. */}
                  <TableCell className={base == null ? 'text-amber-500' : 'text-muted-foreground'}>
                    {base == null
                      ? `never — ${r.unit} is not convertible for this product`
                      : `${base} ${uom?.base_unit}`}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => remove(r.id)} title="Remove">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-5 items-end">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">From quantity</Label>
          <Input className="h-8 text-xs" inputMode="decimal" value={qty}
            onChange={(e) => setQty(e.target.value)} placeholder="5" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Unit</Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Gives</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Discount %</SelectItem>
              <SelectItem value="price">Fixed price per unit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{kind === 'percent' ? 'Percent' : 'Price'}</Label>
          <Input className="h-8 text-xs" inputMode="decimal" value={value}
            onChange={(e) => setValue(e.target.value)} placeholder={kind === 'percent' ? '15' : '450'} />
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={add} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Add
        </Button>
      </div>

      {/* What would we actually charge — straight from the resolver, not recomputed here. */}
      <div className="rounded border border-border/40 px-2.5 py-2 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Tag className="h-3 w-3" /> What would we charge?
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input className="h-8 text-xs w-24" inputMode="decimal" value={previewQty}
            onChange={(e) => setPreviewQty(e.target.value)} placeholder="Quantity" />
          <Select value={previewUnit} onValueChange={setPreviewUnit}>
            <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8" onClick={runPreview} disabled={previewing}>
            {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Check'}
          </Button>
          {preview && (
            <span className="text-xs">
              {preview.final_sell != null
                ? <>
                    <span className="font-medium">{formatMoney(Number(preview.final_sell), currency)}</span>
                    <span className="text-muted-foreground"> per {String(preview.price_unit ?? '')}</span>
                    {source && source !== 'none' && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        ({source.replace(/_/g, ' ')})
                      </span>
                    )}
                  </>
                : <span className="text-muted-foreground">No price set for this product yet.</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductPriceBreaksCard;
