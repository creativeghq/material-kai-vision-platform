import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { storeProductOverlays, type StoreProductOverlay } from '@/services/embedKeysService';

const CUTOUT_BADGE: Record<StoreProductOverlay['cutout_status'], { label: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'error' }> = {
  none: { label: 'No cut-out', variant: 'neutral' },
  pending: { label: 'Queued', variant: 'info' },
  ready: { label: 'Cut out', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
  outdated: { label: 'Photo changed', variant: 'warning' },
};

export const StoreProductOverlaysPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [origins, setOrigins] = useState<string[] | null>(null);
  const [origin, setOrigin] = useState('');
  const [products, setProducts] = useState<StoreProductOverlay[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { w: string; h: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [cutting, setCutting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storeProductOverlays.origins(workspaceId)
      .then((o) => { if (!cancelled) { setOrigins(o); setOrigin((cur) => cur || o[0] || ''); } })
      .catch(() => { if (!cancelled) setOrigins([]); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const load = useCallback(() => {
    if (!origin) return;
    setProducts(null);
    setLoadError(null);
    storeProductOverlays.list(workspaceId, origin)
      .then((r) => setProducts(r.products))
      .catch((e) => { setProducts([]); setLoadError(e instanceof Error ? e.message : 'Could not read the shop.'); });
  }, [workspaceId, origin]);
  useEffect(() => { load(); }, [load]);

  const draftFor = (p: StoreProductOverlay) =>
    drafts[p.external_id] ?? { w: p.width_cm == null ? '' : String(p.width_cm), h: p.height_cm == null ? '' : String(p.height_cm) };

  const saveSize = async (p: StoreProductOverlay) => {
    const d = draftFor(p);
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    setSavingId(p.external_id);
    try {
      await storeProductOverlays.setSize(workspaceId, origin, { external_id: p.external_id, title: p.title, width_cm: num(d.w), height_cm: num(d.h) });
      setProducts((cur) => cur?.map((x) => (x.external_id === p.external_id ? { ...x, width_cm: num(d.w), height_cm: num(d.h) } : x)) ?? cur);
      setDrafts((cur) => { const next = { ...cur }; delete next[p.external_id]; return next; });
    } catch (e) {
      toast({ title: 'Could not save the size', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const needCutout = (products ?? []).filter((p) => p.image && p.cutout_status !== 'ready');

  const prepare = async () => {
    setCutting(true);
    try {
      for (let round = 0; round < 12; round++) {
        const r = await storeProductOverlays.prepare(workspaceId, origin, needCutout.map((p) => p.external_id));
        setProducts(r.products);
        if (!r.products.some((p) => p.cutout_status === 'pending')) break;
      }
    } catch (e) {
      toast({ title: 'Could not make the cut-outs', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setCutting(false);
    }
  };

  if (origins === null) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (origins.length === 0) {
    return (
      <p className="rounded-md border border-hairline p-3 text-xs text-muted-foreground">
        Add your shop&apos;s address (https://…) to this key&apos;s allowed websites, then you can give its products real sizes and clean cut-outs here.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-hairline p-3">
      <div className="space-y-0.5">
        <Label>Sizes and cut-outs for your shop&apos;s products</Label>
        <p className="text-xs text-muted-foreground">
          Read live from your shop. A size makes a piece stand in the visitor&apos;s room at its real width; a cut-out removes the photo&apos;s
          background once (1 credit per product). Only these two facts are stored, never the product itself.
        </p>
      </div>
      {origins.length > 1 && (
        <Select value={origin} onValueChange={setOrigin}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{origins.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {products === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : loadError ? (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          {loadError} <Button variant="ghost" size="sm" onClick={load}>Retry</Button>
        </p>
      ) : products.length === 0 ? (
        <p className="text-xs text-muted-foreground">{origin} lists no products.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {products.filter((p) => p.width_cm != null || p.height_cm != null).length} of {products.length} sized ·{' '}
              {products.filter((p) => p.cutout_status === 'ready').length} cut out
            </span>
            <Button size="sm" variant="outline" disabled={cutting || needCutout.length === 0} onClick={() => void prepare()}>
              {cutting && <Loader2 className="animate-spin" />}{cutting ? 'Making cut-outs…' : `Prepare cut-outs (${needCutout.length})`}
            </Button>
          </div>
          <ul className="max-h-72 divide-y divide-hairline overflow-y-auto rounded-md border border-hairline">
            {products.map((p) => {
              const d = draftFor(p);
              const dirty = !!drafts[p.external_id];
              const badge = CUTOUT_BADGE[p.cutout_status] ?? CUTOUT_BADGE.none;
              return (
                <li key={p.external_id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  {p.cutout_url || p.image
                    ? <img src={p.cutout_url ?? p.image ?? ''} alt="" className="h-10 w-10 shrink-0 rounded-sm bg-surface-sunken object-contain" />
                    : <span className="h-10 w-10 shrink-0 rounded-sm bg-surface-sunken" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{p.title || p.external_id}</p>
                    <Badge variant={badge.variant} className="text-[11px]" title={p.cutout_error ?? undefined}>{badge.label}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Input aria-label={`Width of ${p.title} in cm`} inputMode="decimal" className="h-8 w-16 tabular-nums" placeholder="W"
                      value={d.w} onChange={(e) => setDrafts((c) => ({ ...c, [p.external_id]: { ...d, w: e.target.value } }))} />
                    ×
                    <Input aria-label={`Height of ${p.title} in cm`} inputMode="decimal" className="h-8 w-16 tabular-nums" placeholder="H"
                      value={d.h} onChange={(e) => setDrafts((c) => ({ ...c, [p.external_id]: { ...d, h: e.target.value } }))} />
                    cm
                    <Button size="sm" variant="ghost" disabled={!dirty || savingId === p.external_id} onClick={() => void saveSize(p)}>
                      {savingId === p.external_id ? <Loader2 className="animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};
