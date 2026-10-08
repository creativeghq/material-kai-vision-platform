import React, { useEffect, useState } from 'react';
import { Link2, Loader2, RefreshCw, Store } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { MoneyInput } from '@/components/core/ui/money-input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import {
  readProductFromUrl, createProductFromUrl, type PageProductDraft,
} from '@/services/embedKeysService';
import {
  storeConnectionsService, syncStoreProducts, type StoreConnection, type StoreProductsSyncResult,
} from '@/services/commerce/storeConnectionsService';

interface Props {
  workspaceId: string;
  onAdded: (productId: string) => void;
  onSynced: () => void;
}

const num = (v: string): number | null => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Where Product in Place gets products from besides the catalogue: the merchant's store, or a page link. */
export const PlaceSourcesPanel: React.FC<Props> = ({ workspaceId, onAdded, onSynced }) => {
  const { toast } = useToast();
  const [stores, setStores] = useState<StoreConnection[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [synced, setSynced] = useState<Record<string, StoreProductsSyncResult>>({});

  const [url, setUrl] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<PageProductDraft | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', price: null as number | null, w: '', h: '', d: '', publish: true });

  useEffect(() => {
    storeConnectionsService.list(workspaceId)
      .then((rows) => setStores(rows.filter((r) => (r.platform === 'shopify' || r.platform === 'woocommerce') && r.has_credentials)))
      .catch(() => setStores([]));
  }, [workspaceId]);

  const fail = (title: string, e: unknown) =>
    toast({ title, description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });

  const sync = async (s: StoreConnection) => {
    setSyncing(s.id);
    try {
      const r = await syncStoreProducts(s.id);
      setSynced((m) => ({ ...m, [s.id]: r }));
      onSynced();
    } catch (e) { fail('The store sync failed', e); } finally { setSyncing(null); }
  };

  const read = async () => {
    if (!url.trim()) return;
    setReading(true);
    setDraft(null);
    try {
      const r = await readProductFromUrl(workspaceId, url.trim());
      if (!r.found || !r.product) {
        toast({ title: 'Nothing to read on that page', description: r.reason, variant: 'destructive' });
        return;
      }
      setDraft(r.product);
      setExistingId(r.existing_product_id ?? null);
      const cm = (n: number | null) => (n ? String(Math.round(n * 10) / 10) : '');
      setForm({ name: r.product.name ?? '', price: r.product.price, w: cm(r.product.widthCm), h: cm(r.product.heightCm), d: cm(r.product.depthCm), publish: true });
    } catch (e) { fail('Could not read that page', e); } finally { setReading(false); }
  };

  const save = async () => {
    if (!draft || !form.name.trim()) return;
    setSaving(true);
    try {
      const r = await createProductFromUrl(workspaceId, {
        name: form.name.trim(), url: draft.url ?? url.trim(), description: draft.description, images: draft.images,
        sku: draft.sku, gtin: draft.gtin, mpn: draft.mpn, brand: draft.brand,
        price_gross: form.price, currency: draft.currency,
        width_cm: num(form.w), height_cm: num(form.h), depth_cm: num(form.d), publish: form.publish,
      });
      toast({ title: r.existed ? 'Already in your catalogue — linked to the page' : 'Added to your catalogue' });
      setDraft(null);
      setUrl('');
      onAdded(r.product_id);
    } catch (e) { fail('Could not add the product', e); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      {stores.length > 0 && (
        <div className="space-y-2 rounded-md border border-hairline p-3">
          <Label className="flex items-center gap-1.5"><Store className="h-3.5 w-3.5" />Import from your store</Label>
          <p className="text-xs text-muted-foreground">
            Links each store product to your catalogue so Add to cart puts it in your own store&apos;s cart. Products you
            already have are linked, never overwritten; new ones arrive as unpublished drafts.
          </p>
          {stores.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{s.name || s.store_url} <span className="text-muted-foreground">· {s.platform}</span></span>
              <div className="flex items-center gap-3">
                {synced[s.id] && (
                  <span className="text-xs text-muted-foreground">
                    {synced[s.id].created} new, {synced[s.id].linked} linked{synced[s.id].failed ? `, ${synced[s.id].failed} failed` : ''}
                  </span>
                )}
                <Button size="sm" variant="outline" disabled={syncing !== null} onClick={() => void sync(s)}>
                  {syncing === s.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sync products
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 rounded-md border border-hairline p-3">
        <Label className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" />Add a product from a link</Label>
        <div className="flex gap-2">
          <Input placeholder="https://yourshop.com/products/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button size="sm" variant="outline" disabled={reading || !url.trim()} onClick={() => void read()}>
            {reading && <Loader2 className="animate-spin" />}Read
          </Button>
        </div>
        {draft && (
          <div className="space-y-3 rounded-md bg-surface-sunken p-3">
            <div className="flex gap-3">
              {draft.images[0] && <img src={draft.images[0]} alt="" className="h-16 w-16 shrink-0 rounded-sm bg-card object-contain" />}
              <div className="min-w-0 flex-1 space-y-1.5">
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-label="Product name" />
                <p className="text-xs text-muted-foreground">
                  Read from the page&apos;s {draft.source === 'json-ld' ? 'product data' : 'share tags'}
                  {draft.sku ? ` · SKU ${draft.sku}` : ''}{draft.gtin ? ` · barcode ${draft.gtin}` : ''}
                  {existingId ? ' · already in your catalogue, it will be linked instead of added again' : ''}
                </p>
              </div>
            </div>
            {!existingId && (
              <>
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Price with VAT</Label>
                    <MoneyInput value={form.price} onValueChange={(v) => setForm((f) => ({ ...f, price: v ?? null }))} />
                  </div>
                  {(['w', 'h', 'd'] as const).map((k) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-xs">{k === 'w' ? 'Width' : k === 'h' ? 'Height' : 'Depth'} (cm)</Label>
                      <Input inputMode="decimal" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Width and height let Place it for me draw the product at its real size.</p>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.publish} onCheckedChange={(v) => setForm((f) => ({ ...f, publish: v }))} />
                  Publish it (shows on your widgets and online store)
                </label>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
              <Button size="sm" disabled={saving || !form.name.trim()} onClick={() => void save()}>
                {saving && <Loader2 className="animate-spin" />}{existingId ? 'Link it' : 'Add to catalogue'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
