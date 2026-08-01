/**
 * Packaging facts + the unit ladder they derive.
 *
 * Fill in what the supplier told you — how many pieces to a box, how many boxes to a pallet —
 * and everything else is computed: area per piece from the product's own dimensions, pieces per
 * pallet, m² per pallet. Nothing derivable is editable, because a second place to type 2.88 m²
 * is a second place for it to be wrong.
 *
 * This is what lets a supplier line of "288 m²" become 100 boards on the stock row, and a
 * "€450 per pallet" price break become €9.00 per board on a quote.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Boxes, AlertTriangle } from 'lucide-react';
import { Label } from '@/components/core/ui/label';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { productUomService, type ProductUom } from '@/services/productUomService';
import { UNITS } from '@/lib/units';
import { parseDecimal } from '@/utils/decimal';

const num = (s: string): number | null => {
  const v = parseDecimal(s);
  return v == null || !Number.isFinite(v) ? null : v;
};

export const ProductPackagingCard: React.FC<{ productId: string; workspaceId: string }> = ({
  productId, workspaceId,
}) => {
  const { toast } = useToast();
  const [baseUnit, setBaseUnit] = useState('pcs');
  const [piecesPerBox, setPiecesPerBox] = useState('');
  const [boxesPerPallet, setBoxesPerPallet] = useState('');
  const [m2Override, setM2Override] = useState('');
  const [kgPerPiece, setKgPerPiece] = useState('');
  const [uom, setUom] = useState<ProductUom | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [pack, ladder] = await Promise.all([
      productUomService.getPackaging(productId).catch(() => null),
      productUomService.getUom(productId).catch(() => null),
    ]);
    setBaseUnit(pack?.base_unit ?? 'pcs');
    setPiecesPerBox(pack?.pieces_per_box != null ? String(pack.pieces_per_box) : '');
    setBoxesPerPallet(pack?.boxes_per_pallet != null ? String(pack.boxes_per_pallet) : '');
    setM2Override(pack?.m2_per_piece_override != null ? String(pack.m2_per_piece_override) : '');
    setKgPerPiece(pack?.kg_per_piece != null ? String(pack.kg_per_piece) : '');
    setUom(ladder);
    setLoading(false);
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await productUomService.savePackaging(workspaceId, productId, {
        base_unit: baseUnit,
        pieces_per_box: num(piecesPerBox),
        boxes_per_pallet: num(boxesPerPallet),
        m2_per_piece_override: num(m2Override),
        kg_per_piece: num(kgPerPiece),
      });
      await load();
      toast({ title: 'Packaging saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }

  const derivedM2 = uom?.m2_per_piece ?? null;
  const derivedFromGeometry = derivedM2 != null && !m2Override.trim();
  const canConvertArea = derivedM2 != null;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="text-xs font-medium flex items-center gap-1">
        <Boxes className="h-3.5 w-3.5 text-primary" /> Packaging &amp; units
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        <Field label="Counted in">
          <Select value={baseUnit} onValueChange={setBaseUnit}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Pieces per box">
          <Input className="h-8 text-xs" inputMode="decimal" value={piecesPerBox}
            onChange={(e) => setPiecesPerBox(e.target.value)} placeholder="—" />
        </Field>
        <Field label="Boxes per pallet">
          <Input className="h-8 text-xs" inputMode="decimal" value={boxesPerPallet}
            onChange={(e) => setBoxesPerPallet(e.target.value)} placeholder="—" />
        </Field>
        <Field label="kg per piece">
          <Input className="h-8 text-xs" inputMode="decimal" value={kgPerPiece}
            onChange={(e) => setKgPerPiece(e.target.value)} placeholder="—" />
        </Field>
        <Field
          className="sm:col-span-2"
          label={derivedFromGeometry ? 'm² per piece (from the size)' : 'm² per piece (override)'}
        >
          <Input className="h-8 text-xs" inputMode="decimal" value={m2Override}
            onChange={(e) => setM2Override(e.target.value)}
            placeholder={derivedM2 != null ? String(derivedM2) : 'set the product size, or type it'} />
        </Field>
      </div>

      {/* Derived — read-only on purpose. A second place to type these is a second place to be wrong. */}
      <div className="rounded border border-border/40 px-2.5 py-2 text-[11px] space-y-0.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Derived</div>
        <Derived label="m² per piece" value={derivedM2} suffix="m²"
          note={derivedFromGeometry ? 'from the product size' : m2Override.trim() ? 'override' : undefined} />
        <Derived label="Pieces per pallet" value={uom?.pieces_per_pallet ?? null} />
        <Derived label="m² per box" value={uom?.m2_per_box ?? null} suffix="m²" />
        <Derived label="m² per pallet" value={uom?.m2_per_pallet ?? null} suffix="m²" />
        {!canConvertArea && (
          <p className="flex items-start gap-1.5 text-amber-500 pt-1">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            No area per piece, so this product cannot be converted between pieces and m². A
            supplier line billed in m² will be refused rather than counted as pieces.
          </p>
        )}
      </div>

      <Button size="sm" variant="outline" onClick={save} disabled={saving} className="w-full rounded-full">
        {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
        Save packaging
      </Button>
    </div>
  );
};

const Field: React.FC<{ label: string; className?: string; children: React.ReactNode }> =
  ({ label, className, children }) => (
    <div className={`space-y-1 ${className ?? ''}`}>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );

const Derived: React.FC<{ label: string; value: number | null; suffix?: string; note?: string }> =
  ({ label, value, suffix, note }) => (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={value == null ? 'text-muted-foreground' : ''}>
        {value == null ? '—' : `${value}${suffix ? ` ${suffix}` : ''}`}
        {note && value != null && <span className="ml-1 text-[10px] text-muted-foreground">({note})</span>}
      </span>
    </div>
  );

export default ProductPackagingCard;
