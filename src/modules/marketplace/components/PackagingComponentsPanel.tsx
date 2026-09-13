/**
 * The packaging on one product, one row per separable component (#454).
 *
 * PPWR art. 6(9) assesses each separable component on its own, so a carton, the wrap around the
 * pallet and the pallet itself are three facts, not one "packaging" field. The recyclability grade
 * is tri-state: an unassessed one is NOT a C, because a C is a measured verdict with a fee attached.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Package, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  packagingEprService, TIER_LABEL, GRADE_LABEL, componentIsIncomplete, recycledContentIsKnown,
  type PackagingComponent, type MaterialCategory, type PackagingTier, type RecyclabilityGrade,
} from '@/modules/finance/services/packagingEprService';

interface Props {
  workspaceId: string;
  productId: string;
}

const TIERS: PackagingTier[] = ['primary', 'secondary', 'tertiary'];
const GRADES: RecyclabilityGrade[] = ['unassessed', 'A', 'B', 'C'];

export const PackagingComponentsPanel: React.FC<Props> = ({ workspaceId, productId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PackagingComponent[]>([]);
  const [materials, setMaterials] = useState<MaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    name: '', tier: 'secondary' as PackagingTier, material: 'paper_transport',
    grams: '', pieces: '1', reusable: false, grade: 'unassessed' as RecyclabilityGrade, recycled: '',
  });

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const [c, m] = await Promise.all([
        packagingEprService.componentsFor(productId),
        packagingEprService.materials(),
      ]);
      setRows(c); setMaterials(m); setFailed(false);
    } catch {
      setRows([]); setFailed(true);
    } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      await packagingEprService.saveComponent({
        workspaceId, productId,
        componentName: draft.name.trim(),
        tier: draft.tier,
        materialCode: draft.material,
        gramsPerUnit: draft.grams === '' ? null : Number(draft.grams),
        piecesPerUnit: Number(draft.pieces) || 1,
        isReusable: draft.reusable,
        recyclabilityGrade: draft.grade,
        recycledContentPercent: draft.recycled === '' ? null : Number(draft.recycled),
      });
      setDraft((d) => ({ ...d, name: '', grams: '', recycled: '' }));
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not save the component',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await packagingEprService.deleteComponent(id);
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not remove the component',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-md border border-hairline p-3 text-xs">
      <p className="flex items-center gap-2 font-medium">
        <Package className="h-3.5 w-3.5 text-primary" /> Packaging components
      </p>
      <p className="text-[11px] text-muted-foreground">
        One row per separable component. The weights here are what the annual ΕΜΠΑ/ΣΣΕΔ declaration
        is built from, so a component with no weight is missing tonnage rather than nil.
      </p>

      {loading && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      )}

      {!loading && failed && (
        <p className="flex items-start gap-2 text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The packaging could not be read just now. That is not a statement that there is none.
        </p>
      )}

      {!loading && !failed && rows.length === 0 && (
        <p className="text-muted-foreground">
          No packaging recorded. Everything inside the freight container counts — the container
          itself does not.
        </p>
      )}

      {rows.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2 border-b border-hairline pb-1">
          <span className="font-medium">{c.component_name}</span>
          <Badge variant="neutral">{TIER_LABEL[c.tier]}</Badge>
          <span className="text-muted-foreground">{c.material_code}</span>
          <span className="tabular-nums">
            {c.grams_per_unit == null ? 'no weight on file' : `${c.grams_per_unit} g`} ×{' '}
            {c.pieces_per_unit}
          </span>
          {c.is_reusable && <Badge variant="info">reusable</Badge>}
          <Badge variant={c.recyclability_grade === 'unassessed' ? 'warning' : 'neutral'}>
            {GRADE_LABEL[c.recyclability_grade]}
          </Badge>
          <span className="text-muted-foreground">
            {recycledContentIsKnown(c) ? `${c.recycled_content_percent}% recycled` : 'recycled content unmeasured'}
          </span>
          <span className="text-muted-foreground">keep {c.retention_years} yrs</span>
          {componentIsIncomplete(c) && (
            <span className="text-amber-800 dark:text-amber-300">incomplete</span>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={() => remove(c.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="pkc-name" className="text-[11px]">Component</Label>
          <Input id="pkc-name" className="mt-1 h-8 w-36 text-xs" value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="pkc-tier" className="text-[11px]">Tier</Label>
          <Select value={draft.tier} onValueChange={(v) => setDraft((d) => ({ ...d, tier: v as PackagingTier }))}>
            <SelectTrigger id="pkc-tier" className="mt-1 h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIERS.map((t) => <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pkc-mat" className="text-[11px]">Material</Label>
          <Select value={draft.material} onValueChange={(v) => setDraft((d) => ({ ...d, material: v }))}>
            <SelectTrigger id="pkc-mat" className="mt-1 h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {materials.map((m) => <SelectItem key={m.code} value={m.code}>{m.label_en}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pkc-g" className="text-[11px]">Grams</Label>
          <Input id="pkc-g" type="number" min="0" className="mt-1 h-8 w-24 text-xs" value={draft.grams}
            onChange={(e) => setDraft((d) => ({ ...d, grams: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="pkc-p" className="text-[11px]">Pieces</Label>
          <Input id="pkc-p" type="number" min="0" className="mt-1 h-8 w-20 text-xs" value={draft.pieces}
            onChange={(e) => setDraft((d) => ({ ...d, pieces: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="pkc-grade" className="text-[11px]">Recyclability</Label>
          <Select value={draft.grade} onValueChange={(v) => setDraft((d) => ({ ...d, grade: v as RecyclabilityGrade }))}>
            <SelectTrigger id="pkc-grade" className="mt-1 h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GRADES.map((g) => <SelectItem key={g} value={g}>{GRADE_LABEL[g]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pkc-rec" className="text-[11px]">Recycled %</Label>
          <Input id="pkc-rec" type="number" min="0" max="100" className="mt-1 h-8 w-24 text-xs" value={draft.recycled}
            onChange={(e) => setDraft((d) => ({ ...d, recycled: e.target.value }))} />
        </div>
        <Button
          size="sm" variant={draft.reusable ? 'secondary' : 'outline'} className="h-8"
          onClick={() => setDraft((d) => ({ ...d, reusable: !d.reusable }))}
        >
          Reusable
        </Button>
        <Button size="sm" onClick={add} disabled={busy || !draft.name.trim()}>
          <Plus className="mr-1 h-3 w-3" /> Add
        </Button>
      </div>
    </div>
  );
};
