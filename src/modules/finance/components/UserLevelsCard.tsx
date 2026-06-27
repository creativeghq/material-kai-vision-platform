/**
 * #227 — Customer pricing levels. Each level = a discount off this workspace's retail
 * price (ex-VAT). The default level applies to customers with no level set. Assign a
 * level per customer in CRM. Read by the pricing resolver (get_product_price_for_workspace).
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { financeService } from '@/modules/finance/services/financeService';
import { parseDecimalOr } from '@/utils/decimal';

interface Level {
  id: string; level_key: string; label: string; default_discount_pct: number;
  is_default: boolean; sort_order: number; is_active: boolean;
}

export const UserLevelsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPct, setNewPct] = useState('');

  const load = async () => {
    try { setLoading(true); setLevels(await financeService.listUserLevels(workspaceId)); }
    catch (err: any) { toast({ title: 'Failed to load levels', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  const saveDiscount = async (lvl: Level, pct: number) => {
    try {
      await financeService.upsertUserLevel({ id: lvl.id, workspaceId, levelKey: lvl.level_key, label: lvl.label, defaultDiscountPct: pct });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
      void load();
    }
  };

  const makeDefault = async (lvl: Level) => {
    try { await financeService.setDefaultUserLevel(workspaceId, lvl.id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const add = async () => {
    const label = newLabel.trim();
    const pct = parseDecimalOr(newPct, 0);
    if (!label) { toast({ title: 'Enter a level name', variant: 'destructive' }); return; }
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) { toast({ title: 'Invalid name', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await financeService.upsertUserLevel({ workspaceId, levelKey: key, label, defaultDiscountPct: Number.isFinite(pct) ? pct : 0, sortOrder: levels.length });
      setNewLabel(''); setNewPct(''); await load();
    } catch (err: any) {
      toast({ title: 'Add failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const remove = async (lvl: Level) => {
    if (lvl.is_default) { toast({ title: 'Set another level as default first', variant: 'destructive' }); return; }
    try { await financeService.deleteUserLevel(lvl.id); await load(); }
    catch (err: any) { toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' }); }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Customer Pricing Levels</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          The discount each level gets off your retail price (all prices ex-VAT). The <strong>default</strong> level applies to
          customers with no level set. Assign a level per customer in their CRM record.
        </p>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2">
            {levels.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{l.label}</span>
                  {l.is_default
                    ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">Default</span>
                    : <button type="button" className="text-[10px] text-muted-foreground hover:text-primary" onClick={() => makeDefault(l)}>Set default</button>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Input
                    className="h-8 w-20 text-right text-xs"
                    type="text" inputMode="decimal"
                    defaultValue={l.default_discount_pct}
                    onBlur={(e) => { const v = parseDecimalOr(e.target.value, NaN); if (Number.isFinite(v) && v !== l.default_discount_pct) void saveDiscount(l, v); }}
                  />
                  <span className="text-xs text-muted-foreground">% off</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive disabled:opacity-30" onClick={() => remove(l)} disabled={l.is_default}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">New level</Label>
            <Input className="h-8 text-xs" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Importer" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">% off</Label>
            <Input className="h-8 w-20 text-xs" type="text" inputMode="decimal" value={newPct} onChange={(e) => setNewPct(e.target.value)} placeholder="0" />
          </div>
          <Button size="sm" variant="outline" onClick={add} disabled={busy || !newLabel.trim()}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
