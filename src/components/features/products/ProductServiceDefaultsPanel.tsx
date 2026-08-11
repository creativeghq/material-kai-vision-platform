import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, ShieldCheck, Trash2, Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  customerAssetsService, describeInterval, type ProductServiceDefault,
} from '@/services/customerAssetsService';

interface Props {
  productId: string;
  workspaceId: string;
}

/**
 * Product-level service defaults (#343).
 *
 * This is where "a split AC always needs its filters cleaned every 3 months" is said ONCE.
 * `register_customer_asset` and the delivered-order trigger both copy these onto the new unit,
 * so the schedule exists before anyone thinks to add it — which is the difference between a
 * maintenance register that stays complete and one that quietly rots.
 *
 * `is_serviceable` is the switch that makes auto-registration happen at all: without it, a
 * delivered line creates no asset, and none of these defaults are ever read.
 */
export const ProductServiceDefaultsPanel: React.FC<Props> = ({ productId, workspaceId }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serviceable, setServiceable] = useState(false);
  const [warrantyMonths, setWarrantyMonths] = useState('');
  const [defaults, setDefaults] = useState<ProductServiceDefault[]>([]);
  const [draft, setDraft] = useState({ title: '', interval_months: '3', lead_days: '14', notify_customer: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: product }, list] = await Promise.all([
        supabase.from('products')
          .select('is_serviceable, default_warranty_months')
          .eq('id', productId).maybeSingle(),
        customerAssetsService.listDefaults({ product_id: productId }),
      ]);
      const p = product as { is_serviceable?: boolean; default_warranty_months?: number | null } | null;
      setServiceable(!!p?.is_serviceable);
      setWarrantyMonths(p?.default_warranty_months != null ? String(p.default_warranty_months) : '');
      setDefaults(list);
    } catch (err) {
      toast({
        title: 'Could not load service defaults',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [productId, toast]);

  useEffect(() => { void load(); }, [load]);

  const saveProductFields = async (next: { is_serviceable?: boolean; default_warranty_months?: number | null }) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('products').update(next).eq('id', productId);
      if (error) throw error;
      toast({ title: 'Saved' });
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const addDefault = async () => {
    const months = Number(draft.interval_months);
    if (!draft.title.trim() || !Number.isFinite(months) || months <= 0) return;
    setSaving(true);
    try {
      await customerAssetsService.saveDefault({
        workspace_id: workspaceId,
        product_id: productId,
        product_category: null,
        title: draft.title.trim(),
        interval_months: months,
        interval_days: null,
        lead_days: Number(draft.lead_days) || 14,
        notify_customer: draft.notify_customer,
      });
      setDraft({ title: '', interval_months: '3', lead_days: '14', notify_customer: false });
      await load();
    } catch (err) {
      toast({
        title: 'Could not add the default',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const removeDefault = async (id: string) => {
    setSaving(true);
    try {
      await customerAssetsService.deleteDefault(id);
      await load();
    } catch (err) {
      toast({
        title: 'Could not remove the default',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />After the sale</CardTitle>
          <CardDescription>
            What happens to this product once it is delivered and installed at a customer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="serviceable" className="text-sm">Track each unit after delivery</Label>
              <p className="text-xs text-muted-foreground mt-1">
                A delivered sales-order line registers a unit against the customer, carrying the
                warranty and schedule below. Leave off for consumables — you do not want a
                tracked asset per tube of silicone.
              </p>
            </div>
            <Switch
              id="serviceable"
              checked={serviceable}
              disabled={saving}
              onCheckedChange={(v) => { setServiceable(v); void saveProductFields({ is_serviceable: v }); }}
            />
          </div>

          <div className="flex items-end gap-3">
            <div className="w-40">
              <Label htmlFor="warranty-months" className="text-xs">Warranty (months)</Label>
              <Input
                id="warranty-months"
                type="number"
                min={0}
                value={warrantyMonths}
                placeholder="24"
                onChange={(e) => setWarrantyMonths(e.target.value)}
                onBlur={() => {
                  const n = warrantyMonths.trim() === '' ? null : Number(warrantyMonths);
                  if (n !== null && (!Number.isFinite(n) || n < 0)) return;
                  void saveProductFields({ default_warranty_months: n });
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground pb-2">
              Copied onto the unit at registration, counted from the install date.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" />Default service schedule</CardTitle>
          <CardDescription>
            Copied onto every unit of this product at registration, then editable per unit.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {defaults.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No recurring service defined for this product.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>What</TableHead>
                  <TableHead>How often</TableHead>
                  <TableHead>Remind</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defaults.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.title}</TableCell>
                    <TableCell>{describeInterval(d)}</TableCell>
                    <TableCell className="text-xs">{d.lead_days} days before</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[d.notify_internal ? 'team' : null, d.notify_customer ? 'customer' : null]
                        .filter(Boolean).join(' + ') || 'nobody'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" disabled={saving} onClick={() => void removeDefault(d.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Label className="text-xs">What needs doing</Label>
          <Input value={draft.title} placeholder="Clean the filters"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </div>
        <div className="w-32">
          <Label className="text-xs">Every (months)</Label>
          <Input type="number" min={1} value={draft.interval_months}
            onChange={(e) => setDraft({ ...draft, interval_months: e.target.value })} />
        </div>
        <div className="w-32">
          <Label className="text-xs">Remind (days)</Label>
          <Input type="number" min={0} value={draft.lead_days}
            onChange={(e) => setDraft({ ...draft, lead_days: e.target.value })} />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch id="default-notify-customer" checked={draft.notify_customer}
            onCheckedChange={(v) => setDraft({ ...draft, notify_customer: v })} />
          <Label htmlFor="default-notify-customer" className="text-xs">Email the customer too</Label>
        </div>
        <Button size="sm" variant="outline" disabled={saving || !draft.title.trim()} onClick={() => void addDefault()}>
          <Plus className="h-4 w-4 mr-1" />Add
        </Button>
      </div>
    </div>
  );
};

export default ProductServiceDefaultsPanel;
