/**
 * The annual packaging declaration, and the reusable-asset ledger behind it (#454).
 *
 * One derivation feeds both the ΕΜΠΑ report and the ΣΣΕΔ declaration, because ΥΑ 181504/2016 άρθρο
 * 5(2)(β)(ββ) requires the scheme to report any difference between them to ΕΟΑΝ — and intentional
 * under-declaration runs to €1.000.000.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Boxes, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import {
  packagingEprService, ESPR_LABEL, declarationNeedsAttention, supplierEprBlocksSale,
  esprNeedsAnswer, firstPlacedPieces, totalPlacedPieces,
  PACKAGING_LEGAL_BASIS, AMP_ON_EVERY_DOCUMENT, FOREIGN_EPR_DOES_NOT_EXEMPT,
  CONTAINER_IS_NOT_PACKAGING, WRAPS_STAY_IN_THE_POOL, REUSE_TARGET_PERCENT, REUSE_TARGET_FROM,
  type PackagingDeclaration, type ReusableAsset, type MaterialCategory,
  type SupplierEprPosition, type EsprPosition,
} from '@/modules/finance/services/packagingEprService';

export const PackagingDeclarationCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [declaration, setDeclaration] = useState<PackagingDeclaration | null>(null);
  const [assets, setAssets] = useState<ReusableAsset[]>([]);
  const [materials, setMaterials] = useState<MaterialCategory[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierEprPosition | null>(null);
  const [espr, setEspr] = useState<EsprPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    material: 'wood', name: '', acquiredNew: '0', acquiredUsed: '0', held: '0', cycles: '', kg: '',
  });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [d, a, m, s, e] = await Promise.all([
        packagingEprService.declaration(workspaceId, year),
        packagingEprService.reusableAssets(workspaceId, year),
        packagingEprService.materials(),
        packagingEprService.supplierPosition(workspaceId),
        packagingEprService.esprPosition(workspaceId),
      ]);
      setDeclaration(d); setAssets(a); setMaterials(m); setSuppliers(s); setEspr(e);
      setFailed(false);
    } catch {
      setDeclaration(null); setAssets([]); setSuppliers(null); setEspr(null); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId, year]);

  useEffect(() => { void load(); }, [load]);

  const saveAsset = async () => {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      await packagingEprService.saveReusableAsset({
        workspaceId, year,
        materialCode: draft.material,
        assetName: draft.name.trim(),
        acquiredNew: Number(draft.acquiredNew) || 0,
        acquiredUsed: Number(draft.acquiredUsed) || 0,
        heldFromPrior: Number(draft.held) || 0,
        averageCycles: draft.cycles === '' ? null : Number(draft.cycles),
        kgPerPiece: draft.kg === '' ? null : Number(draft.kg),
      });
      setDraft((d) => ({ ...d, name: '', acquiredNew: '0', acquiredUsed: '0', held: '0', cycles: '', kg: '' }));
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not record the asset',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const declarable = (declaration?.rows ?? []).filter((r) =>
    r.single_use_primary_kg > 0 || r.single_use_secondary_tertiary_kg > 0
    || r.reusable_total_placed_pieces > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="h-4 w-4 text-primary" /> Packaging declaration (ΕΜΠΑ / ΣΣΕΔ)
        </CardTitle>
        <CardDescription>
          Due 31 March, and the same figures serve both filings. Declarable base = imported +
          domestically packed − exported, at material level. {FOREIGN_EPR_DOES_NOT_EXEMPT}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="pkg-year" className="text-[11px]">Declaration year</Label>
            <Input
              id="pkg-year" type="number" className="mt-1 h-8 w-28 text-xs" value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
            />
          </div>
        </div>

        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Deriving the declaration…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The declaration could not be derived just now. That is not a statement that nothing is
            declarable.
          </p>
        )}

        {!loading && !failed && declaration && (
          <>
            <div
              className={`space-y-1 rounded-md border p-2 ${
                declarationNeedsAttention(declaration)
                  ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                  : 'border-hairline bg-surface-sunken text-muted-foreground'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {declarationNeedsAttention(declaration)
                  ? <AlertTriangle className="h-3.5 w-3.5" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                <span>{declaration.year}</span>
                {declaration.products_without_composition > 0 && (
                  <Badge variant="warning">
                    {declaration.products_without_composition} product(s) with no composition
                  </Badge>
                )}
              </div>
              <p>{declaration.reason}</p>
              <p>{declaration.legal_basis}</p>
              <p>{CONTAINER_IS_NOT_PACKAGING}</p>
            </div>

            {declarable.length === 0 && (
              <HubEmptyState
                title="Nothing declarable for this year"
                description="Either no packaged goods moved, or the products that moved carry no packaging composition — the card above says which."
              />
            )}

            {declarable.length > 0 && (
              <div className="table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Primary kg</TableHead>
                      <TableHead className="text-right">Sec.+tert. kg</TableHead>
                      <TableHead className="text-right">Reusable first</TableHead>
                      <TableHead className="text-right">Reusable total</TableHead>
                      <TableHead className="text-right">Cycles</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {declarable.map((r) => (
                      <TableRow key={r.material_code}>
                        <TableCell>
                          <span className="font-medium">{r.label_el}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {r.label_en} · Annex II {r.annex_ii_category}
                          </span>
                          {r.unweighed_components > 0 && (
                            <span className="block text-[11px] text-amber-800 dark:text-amber-300">
                              {r.unweighed_components} component(s) have no weight, so their kg are missing
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.single_use_primary_kg}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.single_use_secondary_tertiary_kg}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.reusable_first_placed_pieces}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.reusable_total_placed_pieces}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.average_cycles ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="space-y-2 rounded-md border border-hairline p-2">
              <p className="font-medium">Reusable assets — three counts, not one</p>
              <p className="text-[11px] text-muted-foreground">
                Pallets bought SECOND-HAND in the year are zero in the first-placed column and still
                count in the total, so first-placed cannot be derived as total minus prior.
              </p>
              {assets.map((a) => (
                <p key={a.id} className="tabular-nums text-[11px] text-muted-foreground">
                  {a.asset_name} · {a.material_code} · new {a.acquired_new_in_year} · used{' '}
                  {a.acquired_used_in_year} · held {a.held_from_prior_year} → first{' '}
                  {firstPlacedPieces(a)}, total {totalPlacedPieces(a)}, cycles {a.average_cycles ?? '—'}
                </p>
              ))}
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label htmlFor="pkg-mat" className="text-[11px]">Material</Label>
                  <Select value={draft.material} onValueChange={(v) => setDraft((d) => ({ ...d, material: v }))}>
                    <SelectTrigger id="pkg-mat" className="mt-1 h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {materials.map((m) => (
                        <SelectItem key={m.code} value={m.code}>{m.label_en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="pkg-name" className="text-[11px]">Asset</Label>
                  <Input id="pkg-name" className="mt-1 h-8 w-36 text-xs" value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="pkg-new" className="text-[11px]">New</Label>
                  <Input id="pkg-new" type="number" min="0" className="mt-1 h-8 w-20 text-xs" value={draft.acquiredNew}
                    onChange={(e) => setDraft((d) => ({ ...d, acquiredNew: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="pkg-used" className="text-[11px]">Used</Label>
                  <Input id="pkg-used" type="number" min="0" className="mt-1 h-8 w-20 text-xs" value={draft.acquiredUsed}
                    onChange={(e) => setDraft((d) => ({ ...d, acquiredUsed: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="pkg-held" className="text-[11px]">Held</Label>
                  <Input id="pkg-held" type="number" min="0" className="mt-1 h-8 w-20 text-xs" value={draft.held}
                    onChange={(e) => setDraft((d) => ({ ...d, held: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="pkg-cycles" className="text-[11px]">Cycles</Label>
                  <Input id="pkg-cycles" type="number" min="0" className="mt-1 h-8 w-20 text-xs" value={draft.cycles}
                    onChange={(e) => setDraft((d) => ({ ...d, cycles: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="pkg-kg" className="text-[11px]">kg each</Label>
                  <Input id="pkg-kg" type="number" min="0" className="mt-1 h-8 w-20 text-xs" value={draft.kg}
                    onChange={(e) => setDraft((d) => ({ ...d, kg: e.target.value }))} />
                </div>
                <Button size="sm" onClick={saveAsset} disabled={busy || !draft.name.trim()}>
                  <Save className="mr-1 h-3 w-3" /> Record
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                From {REUSE_TARGET_FROM}, {REUSE_TARGET_PERCENT}% of transport packaging must be
                reusable. {WRAPS_STAY_IN_THE_POOL}
              </p>
            </div>

            {suppliers && (
              <div
                className={`space-y-1 rounded-md border p-2 ${
                  supplierEprBlocksSale(suppliers)
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : 'border-hairline bg-surface-sunken text-muted-foreground'
                }`}
              >
                <p className="font-medium tabular-nums">
                  Producer registration: {suppliers.verified_against_register} of{' '}
                  {suppliers.suppliers} verified
                </p>
                <p>{suppliers.reason}</p>
                <p>{suppliers.legal_basis}</p>
              </div>
            )}

            {espr && (
              <div
                className={`space-y-1 rounded-md border p-2 ${
                  esprNeedsAnswer(espr)
                    ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                    : 'border-hairline bg-surface-sunken text-muted-foreground'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">ESPR art. 24 — {ESPR_LABEL[espr.status]}</span>
                  <Select
                    value={espr.enterprise_size ?? 'unset'}
                    disabled={busy}
                    onValueChange={async (v) => {
                      if (v === 'unset') return;
                      setBusy(true);
                      try {
                        await packagingEprService.setEnterpriseSize(workspaceId, v);
                        await load();
                      } finally { setBusy(false); }
                    }}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs" aria-label="Enterprise size">
                      <SelectValue placeholder="Not established" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">Not established</SelectItem>
                      <SelectItem value="micro">Micro</SelectItem>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p>{espr.reason}</p>
                <p>{espr.note}</p>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">{PACKAGING_LEGAL_BASIS}</p>
            <p className="text-[11px] text-muted-foreground">{AMP_ON_EVERY_DOCUMENT}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
