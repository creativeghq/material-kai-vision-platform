import React, { useEffect, useState } from 'react';
import { Settings2, Search, DownloadCloud } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { storeConnectionsService, type StoreConnection } from '@/services/commerce/storeConnectionsService';

interface Named { id: string; name: string }
interface ObservedKey { key: string; seen: number }

const NONE = '__none__';

export const ConnectionSettingsCard: React.FC<{
  connection: StoreConnection;
  onSaved: () => void;
}> = ({ connection, onSaved }) => {
  const { toast } = useToast();
  const [warehouses, setWarehouses] = useState<Named[]>([]);
  const [categories, setCategories] = useState<Named[]>([]);
  const [keys, setKeys] = useState<ObservedKey[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [w, c] = await Promise.all([
        supabase.from('warehouses').select('id, name').order('name'),
        supabase.from('finance_categories').select('id, name').eq('kind', 'income').order('name'),
      ]);
      if (cancelled) return;
      setWarehouses((w.data ?? []) as Named[]);
      setCategories((c.data ?? []) as Named[]);
    })();
    return () => { cancelled = true; };
  }, []);

  const patch = async (p: Parameters<typeof storeConnectionsService.updatePolicy>[1]) => {
    try { await storeConnectionsService.updatePolicy(connection.id, p); onSaved(); }
    catch (err) { toast({ title: 'Could not save', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  };

  const run = async (action: 'discover' | 'backfill') => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke('store-orders-sync', {
        body: { connection_id: connection.id, days: 30, discover_only: action === 'discover' },
      });
      if (error) throw error;
      if (action === 'discover') {
        setKeys((data?.keys ?? []) as ObservedKey[]);
        toast({
          title: `Scanned ${data?.scanned ?? 0} recent orders`,
          description: (data?.keys ?? []).length === 0
            ? 'None of them carried a custom field, so there is nothing to pick yet.'
            : 'Pick the field that holds the VAT number.',
        });
      } else {
        onSaved();
        toast({
          title: `${data?.created ?? 0} order(s) the webhook never delivered`,
          description: `${data?.duplicate ?? 0} already held, ${data?.review ?? 0} need review, ${data?.failed ?? 0} failed.`,
        });
      }
    } catch (err) {
      toast({ title: 'That did not work', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const pullable = connection.platform === 'shopify' || connection.platform === 'woocommerce';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" aria-hidden="true" /> {connection.name} — settings</CardTitle>
        <CardDescription>Where an order from this channel lands, and what the buyer asked for.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Warehouse orders draw from</Label>
            <Select
              value={connection.default_warehouse_id ?? NONE}
              onValueChange={(v) => patch({ default_warehouse_id: v === NONE ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— None —</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Income category</Label>
            <Select
              value={connection.income_category_id ?? NONE}
              onValueChange={(v) => patch({ income_category_id: v === NONE ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="eCommerce (default)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>eCommerce (default)</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Leave it on the default unless this workspace keeps its own chart of accounts.</p>
          </div>
          <div className="space-y-1">
            <Label>Receipt code</Label>
            <Input value={connection.default_doc_code_receipt}
              onChange={(e) => patch({ default_doc_code_receipt: e.target.value })} className="font-mono" />
          </div>
          <div className="space-y-1">
            <Label>Invoice code</Label>
            <Input value={connection.default_doc_code_invoice}
              onChange={(e) => patch({ default_doc_code_invoice: e.target.value })} className="font-mono" />
          </div>
        </div>

        {pullable && (
          <div className="space-y-2 rounded-sm border border-hairline p-3">
            <p className="text-xs font-semibold text-muted-foreground">Where this shop keeps the ΑΦΜ</p>
            <p className="text-xs text-muted-foreground">
              Neither Shopify nor WooCommerce has a VAT-number field, so it lives under whatever key the
              shop&apos;s invoicing plugin uses. Until one is set, every order from here lands for review
              rather than guessing a receipt — which a business buyer cannot deduct.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy === 'discover'} onClick={() => run('discover')}>
                <Search className="mr-1 h-3.5 w-3.5" /> {busy === 'discover' ? 'Scanning…' : 'Scan recent orders'}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy === 'backfill'} onClick={() => run('backfill')}>
                <DownloadCloud className="mr-1 h-3.5 w-3.5" /> {busy === 'backfill' ? 'Pulling…' : 'Pull the last 30 days'}
              </Button>
            </div>

            {keys.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {keys.map((k) => (
                  <Badge key={k.key} variant="neutral" className="text-[10px]">
                    {k.key} · seen {k.seen}
                  </Badge>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>VAT-number field</Label>
                <Input defaultValue={connection.vat_number_key ?? ''} placeholder="_billing_vat"
                  onBlur={(e) => patch({ vat_number_key: e.target.value.trim() || null })} className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label>Invoice-requested field</Label>
                <Input defaultValue={connection.invoice_request_key ?? ''} placeholder="_billing_invoice_type"
                  onBlur={(e) => patch({ invoice_request_key: e.target.value.trim() || null })} className="font-mono text-xs" />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
