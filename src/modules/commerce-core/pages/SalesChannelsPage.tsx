import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plug, Plus, Trash2, KeyRound, AlertTriangle, Rss, Copy, RefreshCw } from 'lucide-react';

import { useWorkspace } from '@/contexts/WorkspaceContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { COMMERCE_PLATFORMS, type CommercePlatform } from '@/modules/commerce/commerceVocabulary';
import { generateWebhookSecret, WOO_UNSAFE_SECRET } from '@/modules/commerce/webhookSecret';
import {
  storeConnectionsService, type StoreConnection, type StoreSyncLogRow,
} from '@/services/commerce/storeConnectionsService';
import {
  productFeedsService, feedUrl, FEED_FORMATS, type ProductFeed, type FeedFormat,
} from '@/services/commerce/productFeedsService';

const PLATFORM_LABEL: Record<CommercePlatform, string> = {
  skroutz: 'Skroutz',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  generic: 'Generic',
};

/** What each platform calls its own credentials, so the form asks for the right thing by name. */
const CREDENTIAL_FIELDS: Record<CommercePlatform, { key: string; label: string; hint?: string }[]> = {
  skroutz: [{ key: 'api_token', label: 'Smart Cart API token', hint: 'Merchants → Services → Skroutz Marketplace. Generating a new token expires the previous one.' }],
  shopify: [{ key: 'admin_token', label: 'Admin API access token', hint: 'Needs read_orders and write_orders.' }],
  woocommerce: [
    { key: 'consumer_key', label: 'Consumer key' },
    { key: 'consumer_secret', label: 'Consumer secret' },
  ],
  generic: [{ key: 'api_token', label: 'API token' }],
};

const OUTCOME_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  created: 'success', updated: 'info', skipped_dupe: 'neutral', needs_review: 'warning', error: 'error',
};

export default function SalesChannelsPage() {
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const ws = activeWorkspaceId ?? '';
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState<StoreConnection[]>([]);
  const [log, setLog] = useState<StoreSyncLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newPlatform, setNewPlatform] = useState<CommercePlatform>('shopify');
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState('');
  const [feeds, setFeeds] = useState<ProductFeed[]>([]);
  const [addingFeed, setAddingFeed] = useState(false);
  const [feedName, setFeedName] = useState('');
  const [feedFormat, setFeedFormat] = useState<FeedFormat>('google');
  const [rotating, setRotating] = useState<string | null>(null);
  const [rotateCreds, setRotateCreds] = useState<Record<string, string>>({});
  const [rotateSecret, setRotateSecret] = useState('');

  const platformFilter = searchParams.get('platform');

  const load = useCallback(async () => {
    if (!ws) return;
    setLoading(true);
    try {
      const [conns, entries, feedRows] = await Promise.all([
        storeConnectionsService.list(ws),
        storeConnectionsService.syncLog(ws),
        productFeedsService.list(ws),
      ]);
      setRows(conns);
      setLog(entries);
      setFeeds(feedRows);
    } catch (err) {
      toast({ title: 'Could not load sales channels', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [ws, toast]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(
    () => (platformFilter ? rows.filter((r) => r.platform === platformFilter) : rows),
    [rows, platformFilter],
  );

  const startAdd = () => {
    setAdding(true);
    setNewPlatform((platformFilter as CommercePlatform) || 'shopify');
    setNewName(''); setNewUrl(''); setCreds({}); setSecret(generateWebhookSecret());
  };

  const submit = async () => {
    if (!newName.trim()) { toast({ title: 'Give the connection a name', variant: 'destructive' }); return; }
    if (secret && WOO_UNSAFE_SECRET.test(secret)) {
      toast({ title: 'That webhook secret cannot work', description: 'WooCommerce decodes & \' " < > before signing, so every delivery would fail its signature check.', variant: 'destructive' });
      return;
    }
    try {
      await storeConnectionsService.create(ws, {
        platform: newPlatform, name: newName.trim(), store_url: newUrl.trim() || null,
        credentials: creds, webhook_secret: secret || null,
      });
      setAdding(false);
      await load();
      toast({ title: 'Channel connected', description: 'It stays disabled until you switch it on.' });
    } catch (err) {
      toast({ title: 'Could not save', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const patch = async (row: StoreConnection, p: Parameters<typeof storeConnectionsService.updatePolicy>[1]) => {
    try {
      await storeConnectionsService.updatePolicy(row.id, p);
      await load();
    } catch (err) {
      toast({ title: 'Could not save', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const startRotate = (row: StoreConnection) => {
    setRotating(row.id); setRotateCreds({}); setRotateSecret('');
  };

  const submitRotate = async (row: StoreConnection) => {
    try {
      await storeConnectionsService.setCredentials(row.id, rotateCreds, rotateSecret || undefined);
      setRotating(null);
      await load();
      toast({ title: 'Credentials replaced' });
    } catch (err) {
      toast({ title: 'Could not save', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const submitFeed = async () => {
    if (!feedName.trim()) { toast({ title: 'Give the feed a name', variant: 'destructive' }); return; }
    try { await productFeedsService.create(ws, { name: feedName, format: feedFormat }); setAddingFeed(false); await load(); }
    catch (err) { toast({ title: 'Could not create the feed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  };

  const patchFeed = async (f: ProductFeed, enabled: boolean) => {
    try { await productFeedsService.setEnabled(f.id, enabled); await load(); }
    catch (err) { toast({ title: 'Could not save', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  };

  const rotateFeed = async (f: ProductFeed) => {
    try {
      await productFeedsService.rotateToken(f.id);
      await load();
      toast({ title: 'Link rotated', description: 'The old link stops working immediately.' });
    } catch (err) {
      toast({ title: 'Could not rotate', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const removeFeed = async (f: ProductFeed) => {
    try { await productFeedsService.remove(f.id); await load(); }
    catch (err) { toast({ title: 'Could not remove', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  };

  const copyFeed = async (f: ProductFeed) => {
    try { await navigator.clipboard.writeText(feedUrl(f.public_token)); toast({ title: 'Link copied' }); }
    catch { toast({ title: 'Could not copy', description: 'Select the field and copy it by hand.', variant: 'destructive' }); }
  };

  const remove = async (row: StoreConnection) => {
    try { await storeConnectionsService.remove(row.id); await load(); }
    catch (err) { toast({ title: 'Could not remove', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  };

  if (wsLoading || loading) {
    return <div className="space-y-4 p-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="mobile-content space-y-4">
      <PageHeader
        icon={Plug}
        title="Sales Channels"
        subtitle="Marketplaces and webshops that send orders into Finance."
        actions={<Button onClick={startAdd}><Plus className="mr-1.5 h-4 w-4" /> Connect a channel</Button>}
      />

      <Tabs value={platformFilter ?? 'all'} onValueChange={(v) => {
        const next = new URLSearchParams(searchParams);
        if (v === 'all') next.delete('platform'); else next.set('platform', v);
        setSearchParams(next, { replace: true });
      }}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          {COMMERCE_PLATFORMS.map((p) => <TabsTrigger key={p} value={p}>{PLATFORM_LABEL[p]}</TabsTrigger>)}
        </TabsList>

        <TabsContent value={platformFilter ?? 'all'} className="mt-4 space-y-4">
          {adding && (
            <Card>
              <CardHeader>
                <CardTitle>Connect a channel</CardTitle>
                <CardDescription>The credentials are stored server-side and never read back into this screen.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Platform</Label>
                    <Select value={newPlatform} onValueChange={(v) => { setNewPlatform(v as CommercePlatform); setCreds({}); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COMMERCE_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{PLATFORM_LABEL[p]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Our Shopify store" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Store URL</Label>
                    <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://example.myshopify.com" />
                  </div>
                  {CREDENTIAL_FIELDS[newPlatform].map((f) => (
                    <div key={f.key} className="space-y-1 sm:col-span-2">
                      <Label>{f.label}</Label>
                      <Input type="password" autoComplete="off" value={creds[f.key] ?? ''} onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))} />
                      {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                    </div>
                  ))}
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Webhook secret</Label>
                    <div className="flex gap-2">
                      <Input value={secret} onChange={(e) => setSecret(e.target.value)} className="font-mono text-xs" />
                      <Button type="button" variant="outline" onClick={() => setSecret(generateWebhookSecret())}>Regenerate</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Paste this into the store&apos;s webhook settings. It avoids <code>&amp; &apos; &quot; &lt; &gt;</code> on purpose:
                      WooCommerce decodes those before signing, so a secret containing one fails every delivery with no error to read.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={submit}>Save connection</Button>
                  <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {visible.length === 0 && !adding ? (
            <Card>
              <CardContent className="p-0">
                <HubEmptyState
                  icon={Plug}
                  title={platformFilter ? `No ${PLATFORM_LABEL[platformFilter as CommercePlatform] ?? platformFilter} connection yet` : 'No sales channel connected yet'}
                  description="Connect a marketplace or webshop and its orders land in Finance as ordinary sales orders, with cost and category already on them."
                  action={<Button onClick={startAdd}><Plus className="mr-1.5 h-4 w-4" /> Connect a channel</Button>}
                />
              </CardContent>
            </Card>
          ) : visible.map((row) => (
            <Card key={row.id}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="truncate">{row.name}</span>
                    <Badge variant="neutral" className="text-[10px]">{PLATFORM_LABEL[row.platform] ?? row.platform}</Badge>
                    <Badge variant={row.enabled ? 'success' : 'neutral'} className="text-[10px]">{row.enabled ? 'active' : 'off'}</Badge>
                    {!row.has_credentials && <Badge variant="warning" className="text-[10px]">no credentials</Badge>}
                  </CardTitle>
                  <CardDescription className="truncate">{row.store_url || 'No store URL set'}</CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch checked={row.enabled} onCheckedChange={(v) => patch(row, { enabled: v })} aria-label="Enable channel" />
                  <Button size="sm" variant="ghost" onClick={() => remove(row)} aria-label="Remove connection">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {row.last_error && (
                  <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{row.last_error}</span>
                  </p>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">What happens when an order arrives</p>
                  {([
                    ['auto_upsert_customer', 'Create or match the customer in CRM'],
                    ['auto_issue_document', 'Issue the fiscal document automatically'],
                    ['auto_send_document_back', 'Send the document back to the channel'],
                    ['auto_decrement_stock', 'Reserve stock'],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <span className="text-sm">{label}</span>
                      <Switch checked={row[key]} onCheckedChange={(v) => patch(row, { [key]: v })} aria-label={label} />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    A fiscal document is numbered sequentially and transmitted to ΑΑΔΕ, so issuing cannot be undone — only credited.
                    Leave it off until the first orders have landed and read correctly.
                  </p>
                </div>

                {rotating === row.id ? (
                  <div className="space-y-3 rounded-sm border border-hairline p-3">
                    <p className="text-xs font-semibold text-muted-foreground">Replace credentials</p>
                    {CREDENTIAL_FIELDS[row.platform].map((f) => (
                      <div key={f.key} className="space-y-1">
                        <Label>{f.label}</Label>
                        <Input type="password" autoComplete="off" value={rotateCreds[f.key] ?? ''} onChange={(e) => setRotateCreds((c) => ({ ...c, [f.key]: e.target.value }))} />
                        {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                      </div>
                    ))}
                    <div className="space-y-1">
                      <Label>Webhook secret</Label>
                      <div className="flex gap-2">
                        <Input value={rotateSecret} onChange={(e) => setRotateSecret(e.target.value)} className="font-mono text-xs" placeholder="Leave blank to keep the current one" />
                        <Button type="button" variant="outline" onClick={() => setRotateSecret(generateWebhookSecret())}>Generate</Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => submitRotate(row)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRotating(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{row.has_credentials ? 'Credentials stored' : 'No credentials'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{row.has_webhook_secret ? 'Webhook secret set' : 'No webhook secret'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{row.last_sync_at ? `Last sync ${formatDate(row.last_sync_at, { withTime: true })}` : 'Never synced'}</span>
                  {rotating !== row.id && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => startRotate(row)}>
                      {row.has_credentials ? 'Replace credentials' : 'Add credentials'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2"><Rss className="h-4 w-4" aria-hidden="true" /> Product feeds</CardTitle>
                <CardDescription>The XML a marketplace polls to list your catalogue. Anyone holding the link can read your published products, so rotate it to revoke.</CardDescription>
              </div>
              {!addingFeed && <Button size="sm" variant="outline" onClick={() => { setAddingFeed(true); setFeedName(''); }}><Plus className="mr-1 h-3.5 w-3.5" /> New feed</Button>}
            </CardHeader>
            <CardContent className="space-y-3">
              {addingFeed && (
                <div className="grid gap-3 rounded-sm border border-hairline p-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={feedName} onChange={(e) => setFeedName(e.target.value)} placeholder="Skroutz listing" />
                  </div>
                  <div className="space-y-1">
                    <Label>Dialect</Label>
                    <Select value={feedFormat} onValueChange={(v) => setFeedFormat(v as FeedFormat)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FEED_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{FEED_FORMATS.find((f) => f.value === feedFormat)?.hint}</p>
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button size="sm" onClick={submitFeed}>Create</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingFeed(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {feeds.length === 0 && !addingFeed ? (
                <HubEmptyState
                  icon={Rss}
                  title="No feed yet"
                  description="A feed lists your published products as XML so a marketplace can import them. Skroutz needs its own dialect; Google, Shopify and WooCommerce share one."
                  action={<Button size="sm" onClick={() => { setAddingFeed(true); setFeedName(''); }}><Plus className="mr-1 h-3.5 w-3.5" /> New feed</Button>}
                />
              ) : feeds.map((f) => (
                <div key={f.id} className="space-y-2 border-t border-hairline pt-3 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{f.name}</span>
                    <Badge variant="neutral" className="text-[10px]">{FEED_FORMATS.find((x) => x.value === f.format)?.label ?? f.format}</Badge>
                    <Badge variant={f.enabled ? 'success' : 'neutral'} className="text-[10px]">{f.enabled ? 'live' : 'off'}</Badge>
                    <Switch checked={f.enabled} onCheckedChange={(v) => patchFeed(f, v)} aria-label="Enable feed" />
                    <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => removeFeed(f)} aria-label="Remove feed">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input readOnly value={feedUrl(f.public_token)} className="h-7 flex-1 font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => copyFeed(f)}><Copy className="mr-1 h-3 w-3" /> Copy</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => rotateFeed(f)}><RefreshCw className="mr-1 h-3 w-3" /> Rotate</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {f.last_fetched_at
                      ? `Last read ${formatDate(f.last_fetched_at, { withTime: true })} · ${f.fetch_count} reads · ${f.last_item_count ?? 0} products`
                      : 'Never read. If the importer is configured and this stays empty, it is not reaching us.'}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sync activity</CardTitle>
              <CardDescription>Every inbound order, and what we did with it. This is the first thing to read when orders stop.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {log.length === 0 ? (
                <HubEmptyState
                  icon={Plug}
                  title="Nothing has arrived yet"
                  description="Once a channel is connected and enabled, every order it sends shows up here — including the ones we refused and why."
                />
              ) : (
                <div className="table-scroll">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-sunken">
                      <tr className="text-left">
                        <th className="px-3 py-2 text-[11px] font-semibold">When</th>
                        <th className="px-3 py-2 text-[11px] font-semibold">Channel</th>
                        <th className="px-3 py-2 text-[11px] font-semibold">Order</th>
                        <th className="px-3 py-2 text-[11px] font-semibold">Outcome</th>
                        <th className="px-3 py-2 text-[11px] font-semibold">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.map((e) => (
                        <tr key={e.id} className="border-t border-hairline">
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDate(e.created_at, { withTime: true })}</td>
                          <td className="whitespace-nowrap px-3 py-2">{e.platform ?? '—'}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{e.external_order_id ?? '—'}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <Badge variant={OUTCOME_TONE[e.outcome] ?? 'neutral'} className="text-[10px]">{e.outcome.replace(/_/g, ' ')}</Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{e.message ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
