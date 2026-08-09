/**
 * Product configurator (#321 M2, #260 Phase 1) — pick options, watch the model change, see the price.
 *
 * The material-only slice: choices repaint named glTF materials on the M0 model. Geometry
 * add/remove and incompatibility rules are Phase 2 of #260 and deliberately absent.
 *
 * **The price shown here is never computed here.** Every change re-asks
 * `get_configured_product_price`, which returns the total already derived. Adding the deltas up in
 * this component would be the second implementation of a money quantity, and the one most likely
 * to disagree with the quote that follows it —
 * [tests/unit/configuratorMoneyDerivation.test.ts](../../../../tests/unit/configuratorMoneyDerivation.test.ts)
 * fails the build on it.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader2, AlertTriangle, Save } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { formatMoney } from '@/utils/decimal';
import { ProductModelStage } from '@/components/features/ar/ProductModelViewer';
import { CanvasLoader, ThreeErrorBoundary } from '@/components/features/ar/CanvasChrome';
import { product3dService, modelPublicUrl } from '@/services/product3dService';
import {
  productConfiguratorService, selectionToValueIds, describeViolation,
  type OptionGroupWithValues, type ConfiguredPrice,
} from '@/services/productConfiguratorService';

interface ProductConfiguratorProps {
  productId: string;
  /**
   * GLB/glTF url. Optional — resolved from `product_3d_models` when omitted, so a mount site does
   * not have to know how models are stored. Options still price without one; they just have
   * nothing to repaint.
   */
  modelUrl?: string | null;
}

export const ProductConfigurator: React.FC<ProductConfiguratorProps> = ({
  productId, modelUrl: modelUrlProp,
}) => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();

  const [groups, setGroups] = useState<OptionGroupWithValues[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [price, setPrice] = useState<ConfiguredPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [addingToQuote, setAddingToQuote] = useState(false);
  const [quotes, setQuotes] = useState<Array<{ id: string; name: string }>>([]);
  const [resolvedModelUrl, setResolvedModelUrl] = useState<string | null>(modelUrlProp ?? null);

  // Resolve the model ourselves when the caller did not supply one. glb/gltf only — usdz is the
  // iOS AR format and cannot be rendered in a WebGL canvas.
  useEffect(() => {
    if (modelUrlProp) { setResolvedModelUrl(modelUrlProp); return; }
    let cancelled = false;
    product3dService.listModels(productId)
      .then((models) => {
        if (cancelled) return;
        const renderable = models.find((m) => m.format === 'glb' || m.format === 'gltf');
        setResolvedModelUrl(renderable ? modelPublicUrl(renderable) : null);
      })
      .catch(() => { if (!cancelled) setResolvedModelUrl(null); });
    return () => { cancelled = true; };
  }, [productId, modelUrlProp]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    productConfiguratorService.listOptions(productId)
      .then((g) => {
        if (cancelled) return;
        setGroups(g);
        setSelection(productConfiguratorService.defaultSelection(g));
      })
      .catch((err) => {
        if (cancelled) return;
        toast({
          title: 'Could not load options',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId, toast]);

  const valueIds = useMemo(() => selectionToValueIds(selection), [selection]);

  // Re-price on every change. One round trip, no arithmetic on this side.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    setPricing(true);
    productConfiguratorService.priceConfiguration(activeWorkspaceId, productId, valueIds)
      .then((p) => { if (!cancelled) setPrice(p); })
      .catch(() => { if (!cancelled) setPrice(null); })
      .finally(() => { if (!cancelled) setPricing(false); });
    return () => { cancelled = true; };
  }, [activeWorkspaceId, productId, valueIds]);

  const overrides = useMemo(
    () => productConfiguratorService.materialOverrides(groups, selection),
    [groups, selection],
  );

  const handleUnmatched = useCallback((names: string[]) => setUnmatched(names), []);

  // Open quotes to hand a configuration to. Loaded once; a stale list only costs a failed pick.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    productConfiguratorService.openQuotes(activeWorkspaceId)
      .then((q) => { if (!cancelled) setQuotes(q); })
      .catch(() => { if (!cancelled) setQuotes([]); });
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  const save = async () => {
    if (!activeWorkspaceId) return;
    setSaving(true);
    try {
      await productConfiguratorService.saveConfiguration(activeWorkspaceId, productId, valueIds);
      toast({ title: 'Configuration saved' });
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Save, then add to a quote (#260 Phase 3).
   *
   * The configuration is saved first because the quote line REFERENCES it — a line whose choices
   * exist only in this component's state cannot be traced back to anything after the tab closes.
   */
  const addToQuote = async (quoteId: string) => {
    if (!activeWorkspaceId) return;
    setAddingToQuote(true);
    try {
      const config = await productConfiguratorService.saveConfiguration(
        activeWorkspaceId, productId, valueIds,
      );
      const line = await productConfiguratorService.addToQuote(quoteId, config.id, 1);
      toast({
        title: line.pricing_status === 'priced' ? 'Added to quote' : 'Added — needs a price',
        description: line.pricing_status === 'priced'
          ? `${formatMoney(line.line_total, price?.currency ?? 'EUR')} · ${Object.entries(line.options).map(([k, v]) => `${k}: ${v}`).join(' · ')}`
          : 'This product has no price, so the line is marked call-for-price.',
      });
    } catch (err) {
      toast({
        title: 'Could not add to the quote',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setAddingToQuote(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading options…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        This product has no configurable options yet.
      </p>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card>
        <CardContent className="p-0">
          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted/30">
            {resolvedModelUrl ? (
              <ThreeErrorBoundary>
                <React.Suspense fallback={<CanvasLoader />}>
                  <Canvas camera={{ position: [0, 2, 4], fov: 50 }} gl={{ antialias: true, alpha: true }}>
                    <ProductModelStage
                      url={resolvedModelUrl}
                      overrides={overrides}
                      onUnmatchedTargets={handleUnmatched}
                    />
                  </Canvas>
                </React.Suspense>
              </ThreeErrorBoundary>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                No 3D model uploaded for this product — options still price correctly.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.id} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">{group.label}</span>
              {group.is_required && <span className="text-xs text-muted-foreground">Required</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.values.map((value) => {
                const active = selection[group.id] === value.id;
                return (
                  <button
                    key={value.id}
                    type="button"
                    onClick={() => setSelection((s) => ({ ...s, [group.id]: value.id }))}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      active ? 'border-primary bg-primary/10' : 'border-border/60 hover:bg-muted'
                    }`}
                  >
                    {value.base_color_hex && (
                      <span
                        className="h-4 w-4 rounded-full border border-border/60"
                        style={{ backgroundColor: value.base_color_hex }}
                        aria-hidden
                      />
                    )}
                    <span>{value.label}</span>
                    {/* ONE option's authored delta — formatting a stored value, not deriving a
                        total. The total below comes from SQL. */}
                    {Number(value.price_delta) !== 0 && (
                      <span className="text-xs text-muted-foreground">
                        {Number(value.price_delta) > 0 ? '+' : ''}
                        {formatMoney(Number(value.price_delta), price?.currency ?? 'EUR')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Rule violations (#260 Phase 2), as the SERVER evaluated them. There is no local rules
            engine to disagree with it. */}
        {price && price.violations?.length > 0 && (
          <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3">
            {price.violations.map((v) => (
              <p key={`${v.when_value_id}-${v.then_value_id}-${v.type}`} className="text-xs text-destructive">
                {describeViolation(v)}
              </p>
            ))}
          </div>
        )}

        {/* An option whose target material is not in the model is an authoring mistake that
            otherwise looks like a working option that just does nothing. */}
        {unmatched.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              No material named {unmatched.map((n) => `“${n}”`).join(', ')} exists in this model, so
              {unmatched.length === 1 ? ' that option changes' : ' those options change'} nothing on
              screen. Check the option's target material against the uploaded file.
            </span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border/60 pt-4">
          <div>
            <p className="text-xs text-muted-foreground">Configured price</p>
            <p className="text-xl font-semibold">
              {pricing
                ? '…'
                : price?.configured_price != null
                  ? formatMoney(price.configured_price, price.currency)
                  : 'Not priced'}
            </p>
            {price && price.options_requested !== price.options_applied && (
              <p className="text-xs text-destructive">
                {price.options_requested - price.options_applied} selected option(s) were not
                recognised for this product and are not included.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {quotes.length > 0 && (
              // Disabled while a rule is violated. The database refuses the line anyway — the
              // handoff re-checks violations from the same call that prices it — so this is the
              // courtesy of not offering a button that cannot work, not the enforcement.
              <Select value="" onValueChange={addToQuote} disabled={addingToQuote || price?.is_valid === false}>
                <SelectTrigger className="w-[11rem] rounded-full">
                  <SelectValue placeholder={
                    price?.is_valid === false ? 'Fix conflicts first'
                      : addingToQuote ? 'Adding…' : 'Add to quote'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {quotes.map((q) => <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" className="rounded-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
