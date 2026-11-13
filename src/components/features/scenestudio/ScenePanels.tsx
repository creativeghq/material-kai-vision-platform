/** Scene Studio side panels (#564): styles to render in, the selected object, paint, and the catalogue picker. */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Package, RotateCcw, RotateCw, Search, Sparkles, Trash2, Wand2, X } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import type { VocabularyTerm } from '@/services/vocabularies';
import { sceneStudioService, type SceneObject, type SceneProduct } from '@/services/sceneStudioService';
import { effectiveSize } from '@/lib/scene/sceneGeometry';
import { SCENE_OBJECT_KINDS } from '@/lib/scene/sceneReadSchema';

export type StyleChoice =
  | { kind: 'style'; value: string; label: string; brief: string }
  | { kind: 'reference'; url: string; label: string };

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const StylePanel: React.FC<{
  styles: VocabularyTerm[];
  references: Array<{ url: string; label: string }>;
  active: StyleChoice | null;
  busy: boolean;
  disabled: boolean;
  onPick(choice: StyleChoice): void;
}> = ({ styles, references, active, busy, disabled, onPick }) => {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shownStyles = styles.filter((s) => !needle || s.label.toLowerCase().includes(needle) || String((s.metadata as { brief?: string })?.brief ?? '').toLowerCase().includes(needle));
  const custom = needle && !shownStyles.some((s) => s.label.toLowerCase() === needle);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Styles</CardTitle>
        <p className="text-xs text-muted-foreground">Click a style to render the current layout in it.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={(e) => { e.preventDefault(); if (custom && !disabled) onPick({ kind: 'style', value: needle, label: q.trim(), brief: q.trim() }); }}>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a style, then press Enter" className="pl-8" />
          </div>
        </form>
        <div className="grid grid-cols-2 gap-2">
          {shownStyles.map((s) => {
            const meta = (s.metadata ?? {}) as { brief?: string; palette?: string[] };
            const isActive = active?.kind === 'style' && active.value === s.value;
            return (
              <button
                key={s.value}
                type="button"
                disabled={disabled}
                onClick={() => onPick({ kind: 'style', value: s.value, label: s.label, brief: meta.brief ?? s.label })}
                className={`overflow-hidden rounded-sm border text-left disabled:opacity-50 ${isActive ? 'border-primary ring-2 ring-primary' : 'border-hairline hover:border-foreground/40'}`}
                title={meta.brief}
              >
                <div className="flex h-8">
                  {(meta.palette ?? []).map((c) => <span key={c} className="flex-1" style={{ backgroundColor: c }} />)}
                </div>
                <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs font-medium">
                  {s.label}
                  {busy && isActive && <Loader2 className="h-3 w-3 animate-spin" />}
                </div>
              </button>
            );
          })}
        </div>
        {custom && (
          <Button variant="outline" size="sm" className="w-full gap-1.5" disabled={disabled} onClick={() => onPick({ kind: 'style', value: needle, label: q.trim(), brief: q.trim() })}>
            <Sparkles className="h-3.5 w-3.5" />Render as “{q.trim()}”
          </Button>
        )}
        {references.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">From your renders</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {references.map((r) => {
                const isActive = active?.kind === 'reference' && active.url === r.url;
                return (
                  <button
                    key={r.url}
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick({ kind: 'reference', url: r.url, label: r.label })}
                    className={`overflow-hidden rounded-sm border disabled:opacity-50 ${isActive ? 'border-primary ring-2 ring-primary' : 'border-hairline'}`}
                    title={`Use the look of: ${r.label}`}
                  >
                    <img src={r.url} alt={r.label} className="aspect-square w-full object-cover" loading="lazy" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const ProductPicker: React.FC<{
  workspaceId: string;
  onPick(p: SceneProduct): void;
  onCancel(): void;
  title: string;
}> = ({ workspaceId, onPick, onCancel, title }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SceneProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      sceneStudioService.searchProducts(workspaceId, q)
        .then((r) => { if (live) { setResults(r); setError(null); } })
        .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Search failed'); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [workspaceId, q]);
  return (
    <div className="space-y-2 rounded-sm border border-hairline bg-surface-sunken p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{title}</span>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onCancel} aria-label="Close"><X className="h-3.5 w-3.5" /></Button>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your catalogue" autoFocus />
      {error ? <p className="text-xs text-destructive">{error}</p> : results === null ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Searching</p>
      ) : results.length === 0 ? (
        <p className="text-xs text-muted-foreground">No products match. Add products to your catalogue first.</p>
      ) : (
        <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
          {results.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(p)} className="overflow-hidden rounded-sm border border-hairline bg-card text-left hover:border-foreground/40" title={p.name}>
              {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="aspect-square w-full object-cover" loading="lazy" /> : <div className="flex aspect-square items-center justify-center"><Package className="h-5 w-5 text-muted-foreground" /></div>}
              <span className="block truncate px-1 py-0.5 text-[11px]">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const COLOUR_SWATCHES = ['#f4f1ea', '#d9cbb5', '#a4472c', '#b5651d', '#d4a017', '#5b7553', '#2f5d7c', '#3d3d5c', '#6b2d3c', '#3b3b3b', '#8d6e63', '#ffffff'];

export const ColourRow: React.FC<{ value: string | null; onChange(hex: string): void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {COLOUR_SWATCHES.map((c) => (
      <button
        key={c}
        type="button"
        onClick={() => onChange(c)}
        aria-label={`Colour ${c}`}
        className={`h-6 w-6 rounded-full border ${value === c ? 'ring-2 ring-primary ring-offset-1' : 'border-hairline'}`}
        style={{ backgroundColor: c }}
      />
    ))}
    <input type="color" value={value ?? '#cccccc'} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 cursor-pointer rounded-sm border border-hairline bg-transparent" aria-label="Pick any colour" />
  </div>
);

const mmField = (v: number) => String(Math.round(v / 10));

export const ObjectInspector: React.FC<{
  obj: SceneObject;
  product: SceneProduct | undefined;
  workspaceId: string;
  hasRender: boolean;
  applyBusy: boolean;
  changedSinceRender: boolean;
  onChange(patch: Partial<SceneObject>): void;
  onProduct(p: SceneProduct | null): void;
  onApplyToRender(): void;
  onDelete(): void;
  onClose(): void;
}> = ({ obj, product, workspaceId, hasRender, applyBusy, changedSinceRender, onChange, onProduct, onApplyToRender, onDelete, onClose }) => {
  const [picking, setPicking] = useState(false);
  const size = effectiveSize(obj, product);
  const [label, setLabel] = useState(obj.label);
  useEffect(() => setLabel(obj.label), [obj.id, obj.label]);
  const kinds = useMemo(() => SCENE_OBJECT_KINDS.map((k) => ({ value: k, label: titleCase(k) })), []);
  const sizeInput = (key: 'width_mm' | 'depth_mm' | 'height_mm' | 'elevation_mm', name: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{name}</Label>
      <Input
        inputMode="numeric"
        defaultValue={mmField(key === 'elevation_mm' ? obj.elevation_mm : size[key])}
        key={`${obj.id}-${key}-${key === 'elevation_mm' ? obj.elevation_mm : size[key]}`}
        disabled={key !== 'elevation_mm' && size.basis === 'product'}
        onBlur={(e) => {
          const cm = Number.parseFloat(e.target.value.replace(',', '.'));
          if (!Number.isFinite(cm) || cm < 0) return;
          const mm = Math.round(cm * 10);
          if (key === 'elevation_mm') onChange({ elevation_mm: mm });
          else if (mm > 0) onChange({ [key]: mm, size_source: 'manual' } as Partial<SceneObject>);
        }}
      />
    </div>
  );
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="truncate text-sm">{obj.label}</CardTitle>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose} aria-label="Deselect"><X className="h-3.5 w-3.5" /></Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => { if (label.trim() && label !== obj.label) onChange({ label: label.trim() }); }} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={obj.kind} onValueChange={(v) => onChange({ kind: v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{kinds.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Colour</Label>
          <ColourRow value={obj.colour_hex} onChange={(hex) => onChange({ colour_hex: hex })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Product</Label>
          {product ? (
            <div className="flex items-center gap-2 rounded-sm border border-hairline p-1.5">
              {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-10 w-10 rounded-sm object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate text-xs">{product.name}</span>
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => onProduct(null)}>Unlink</Button>
            </div>
          ) : null}
          {picking ? (
            <ProductPicker workspaceId={workspaceId} title="Swap for a product" onCancel={() => setPicking(false)} onPick={(p) => { setPicking(false); onProduct(p); }} />
          ) : (
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setPicking(true)}>
              <Package className="h-3.5 w-3.5" />{product ? 'Swap for another product' : 'Swap for a product'}
            </Button>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Size (cm)</Label>
            <Badge variant={size.basis === 'product' ? 'success' : size.basis === 'manual' ? 'info' : 'warning'}>
              {size.basis === 'product' ? 'From Product' : size.basis === 'manual' ? 'Typed' : 'Estimated'}
            </Badge>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {sizeInput('width_mm', 'Width')}
            {sizeInput('depth_mm', 'Depth')}
            {sizeInput('height_mm', 'Height')}
            {sizeInput('elevation_mm', 'Off Floor')}
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => onChange({ rotation_deg: (obj.rotation_deg + 315) % 360 })}><RotateCcw className="h-3.5 w-3.5" />45°</Button>
          <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => onChange({ rotation_deg: (obj.rotation_deg + 45) % 360 })}><RotateCw className="h-3.5 w-3.5" />45°</Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={onDelete} aria-label="Remove from the room"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
        {hasRender && (
          <div className="space-y-1 border-t border-hairline pt-3">
            <Button size="sm" variant="secondary" className="w-full gap-1.5" disabled={applyBusy || !changedSinceRender} onClick={onApplyToRender}>
              {applyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Apply to the current render
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {changedSinceRender
                ? 'Re-draws only this object in the render; everything outside it stays exactly as it is.'
                : 'Change the colour or product first. Moves and removals need a full render.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
