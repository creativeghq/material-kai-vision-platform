/**
 * #207 — Storefront admin: enable the public /store/:slug page, set its copy, and pick which
 * priced products are published. The buyer flow lands on the existing /pay token → Stripe Connect.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Badge } from '@/components/core/ui/badge';
import { Loader2, Store, Copy, ExternalLink, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { storefrontService, type StorefrontConfig, type PublishableProduct } from '@/modules/finance/services/storefrontService';

export const StorefrontCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<StorefrontConfig | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [products, setProducts] = useState<PublishableProduct[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [c, ws, pubs] = await Promise.all([
        storefrontService.getConfig(workspaceId),
        supabase.from('workspaces').select('slug').eq('id', workspaceId).maybeSingle(),
        storefrontService.listPublishable(workspaceId),
      ]);
      setCfg(c);
      setSlug((ws.data as any)?.slug ?? null);
      setProducts(pubs);
    } catch (err: any) { toast({ title: 'Failed to load storefront', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [workspaceId]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try { await storefrontService.saveConfig(cfg); toast({ title: 'Storefront saved' }); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const togglePublished = async (p: PublishableProduct) => {
    try {
      await storefrontService.setPublished(workspaceId, p.product_id, !p.storefront_published);
      setProducts((ps) => ps.map((x) => x.product_id === p.product_id ? { ...x, storefront_published: !x.storefront_published } : x));
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const publicUrl = slug ? `${window.location.origin}/store/${slug}` : null;
  const publishedCount = products.filter((p) => p.storefront_published).length;
  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  if (loading || !cfg) {
    return <Card><CardContent className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2"><Store className="h-4 w-4" /> Online store</CardTitle>
        <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} />
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        <p className="text-xs text-muted-foreground">
          Publish priced products to a public page where anyone can buy them. Checkout creates a draft order and
          collects payment through Stripe (your connected account if configured). The order shows up paid in Invoices.
        </p>

        {cfg.enabled && publicUrl && (
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
            <span className="truncate font-mono">{publicUrl}</span>
            <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(publicUrl); toast({ title: 'Copied' }); }}><Copy className="h-3.5 w-3.5" /></button>
            <a className="text-muted-foreground hover:text-foreground" href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
        )}
        {cfg.enabled && !slug && (
          <p className="text-xs text-amber-500">This workspace has no public slug yet, so the store URL can&apos;t be formed. Set a workspace slug first.</p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Headline</Label>
            <Input value={cfg.headline ?? ''} onChange={(e) => setCfg({ ...cfg, headline: e.target.value })} placeholder="Shop our collection" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subheadline</Label>
            <Input value={cfg.subheadline ?? ''} onChange={(e) => setCfg({ ...cfg, subheadline: e.target.value })} placeholder="Curated materials, shipped to you" />
          </div>
        </div>
        <Button size="sm" className="rounded-full" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save store settings
        </Button>

        {/* Publish products */}
        <div className="space-y-2 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Published products</span>
            <Badge variant="outline" className="text-[10px]">{publishedCount} live</Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-8 pl-7 text-xs" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {products.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">No priced products yet. Add prices to products first.</p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-auto">
              {filtered.map((p) => (
                <div key={p.product_id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-1.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.price != null ? new Intl.NumberFormat(undefined, { style: 'currency', currency: p.currency }).format(p.price) : 'No price'}</div>
                  </div>
                  <Switch checked={p.storefront_published} onCheckedChange={() => togglePublished(p)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
