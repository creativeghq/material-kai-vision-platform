/**
 * Bins, their barcodes and the rules that direct stock into them (#428).
 *
 * A location barcode is distinct from an item barcode on purpose — scanning a bin and scanning a
 * product are different questions. And a suggestion with no stated rule is a dropdown with extra
 * steps: the next receipt will land somewhere else and nobody will know why.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, MapPin, Plus, ScanLine } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import {
  locationService, LOCATION_KIND_LABEL, putawayDirects, putawayIsScannable,
  type WarehouseLocation, type PutawayRule, type LocationKind, type PutawaySuggestion,
} from '@/modules/stock/services/locationService';

const KINDS: LocationKind[] = ['bin', 'bulk', 'pick_face', 'staging', 'quarantine', 'van'];

export const LocationsPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [rules, setRules] = useState<PutawayRule[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ warehouse_id: '', code: '', barcode: '', kind: 'bin' as LocationKind, path: '' });
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [ruleDraft, setRuleDraft] = useState({ item_id: '', location_id: '', sequence: '100' });
  const [suggestion, setSuggestion] = useState<PutawaySuggestion | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [ls, rs, { data: whs }] = await Promise.all([
        locationService.list(workspaceId),
        locationService.rules(workspaceId).catch(() => [] as PutawayRule[]),
        supabase.from('warehouses').select('id, name').eq('workspace_id', workspaceId),
      ]);
      setLocations(ls); setRules(rs);
      setWarehouses((whs ?? []) as { id: string; name: string }[]);
      const { data: wis } = await supabase
        .from('warehouse_items')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .limit(200);
      setItems((wis ?? []) as { id: string; name: string }[]);
      setFailed(false);
    } catch {
      setLocations([]); setRules([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!draft.warehouse_id || !draft.code.trim()) return;
    setBusy(true);
    try {
      await locationService.create({
        workspace_id: workspaceId,
        warehouse_id: draft.warehouse_id,
        code: draft.code.trim(),
        barcode: draft.barcode.trim() || null,
        kind: draft.kind,
        path: draft.path.trim() || null,
      });
      setDraft((d) => ({ ...d, code: '', barcode: '', path: '' }));
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not create the location',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  /**
   * "Where would this go?" — the question a rule exists to answer.
   *
   * Shown with the RULE that chose it, because an operator cannot otherwise tell a considered
   * answer from a default, and a default is what this ticket exists to replace.
   */
  const preview = async (itemId: string) => {
    setRuleDraft((r) => ({ ...r, item_id: itemId }));
    if (!itemId) { setSuggestion(null); return; }
    try { setSuggestion(await locationService.suggestPutaway(itemId)); }
    catch { setSuggestion(null); }
  };

  const saveRule = async () => {
    if (!ruleDraft.item_id || !ruleDraft.location_id) return;
    setBusy(true);
    try {
      const item = items.find((i) => i.id === ruleDraft.item_id);
      const { data: wi } = await supabase
        .from('warehouse_items')
        .select('product_id, warehouse_id')
        .eq('id', ruleDraft.item_id)
        .maybeSingle();
      await locationService.saveRule({
        workspace_id: workspaceId,
        warehouse_id: (wi as { warehouse_id?: string } | null)?.warehouse_id ?? null,
        product_id: (wi as { product_id?: string } | null)?.product_id ?? null,
        location_id: ruleDraft.location_id,
        sequence: Number(ruleDraft.sequence) || 100,
        basis: 'fixed',
        is_active: true,
      });
      toast({ title: `Putaway rule saved${item ? ` for ${item.name}` : ''}` });
      await load();
      await preview(ruleDraft.item_id);
    } catch (err: unknown) {
      toast({
        title: 'Could not save the rule',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const unscannable = locations.filter((l) => l.is_active && !l.barcode).length;
  const unpathed = locations.filter((l) => l.is_active && !l.path).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" /> Locations and putaway
        </CardTitle>
        <CardDescription>
          Below the building. A van is a location here, not a note — an installation that writes
          &ldquo;3 bags of adhesive&rdquo; as free text overstates the shelves, silently.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading locations…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The locations could not be read just now. That is not a statement that there are none.
          </p>
        )}

        {!loading && !failed && locations.length === 0 && (
          <HubEmptyState
            title="No locations"
            description="Without bins there is no putaway, no scan-verified receiving and no pick sequence — a pick list sorted by line number walks the aisle twice."
          />
        )}

        {(unscannable > 0 || unpathed > 0) && (
          <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {unscannable > 0 && `${unscannable} locations have no barcode, so a putaway there cannot be scan-verified. `}
              {unpathed > 0 && `${unpathed} have no walking path, so a pick list cannot be ordered through them.`}
            </span>
          </p>
        )}

        {locations.length > 0 && (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Walking path</TableHead>
                  <TableHead>Next count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="tabular-nums">{l.code}</TableCell>
                    <TableCell><Badge variant="neutral">{LOCATION_KIND_LABEL[l.kind]}</Badge></TableCell>
                    <TableCell className="tabular-nums">
                      {l.barcode
                        ? <span className="inline-flex items-center gap-1"><ScanLine className="h-3 w-3" />{l.barcode}</span>
                        : <span className="text-destructive">none</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{l.path ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{l.next_count_due ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
          <div>
            <Label htmlFor="loc-wh" className="text-[11px]">Warehouse</Label>
            <Select value={draft.warehouse_id} onValueChange={(v) => setDraft((d) => ({ ...d, warehouse_id: v }))}>
              <SelectTrigger id="loc-wh" className="mt-1 h-8 w-44 text-xs">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="loc-code" className="text-[11px]">Code</Label>
            <Input
              id="loc-code" className="mt-1 h-8 w-32 text-xs" value={draft.code}
              onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} placeholder="A-01-02"
            />
          </div>
          <div>
            <Label htmlFor="loc-barcode" className="text-[11px]">Location barcode</Label>
            <Input
              id="loc-barcode" className="mt-1 h-8 w-40 text-xs" value={draft.barcode}
              onChange={(e) => setDraft((d) => ({ ...d, barcode: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="loc-path" className="text-[11px]">Walking path</Label>
            <Input
              id="loc-path" className="mt-1 h-8 w-32 text-xs" value={draft.path}
              onChange={(e) => setDraft((d) => ({ ...d, path: e.target.value }))} placeholder="A/01/02"
            />
          </div>
          <div>
            <Label htmlFor="loc-kind" className="text-[11px]">Kind</Label>
            <Select value={draft.kind} onValueChange={(v) => setDraft((d) => ({ ...d, kind: v as LocationKind }))}>
              <SelectTrigger id="loc-kind" className="mt-1 h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => <SelectItem key={k} value={k}>{LOCATION_KIND_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={create} disabled={busy || !draft.warehouse_id || !draft.code.trim()}>
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>

        <div className="space-y-2 rounded-md border border-hairline p-2">
          <p className="text-sm font-medium">Where does this go?</p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="rule-item" className="text-[11px]">Item</Label>
              <Select value={ruleDraft.item_id} onValueChange={preview}>
                <SelectTrigger id="rule-item" className="mt-1 h-8 w-56 text-xs">
                  <SelectValue placeholder="Choose an item" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rule-loc" className="text-[11px]">Send it to</Label>
              <Select
                value={ruleDraft.location_id}
                onValueChange={(v) => setRuleDraft((r) => ({ ...r, location_id: v }))}
              >
                <SelectTrigger id="rule-loc" className="mt-1 h-8 w-44 text-xs">
                  <SelectValue placeholder="Choose a bin" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={saveRule} disabled={busy || !ruleDraft.item_id || !ruleDraft.location_id}>
              Make that the rule
            </Button>
          </div>
          {suggestion && (
            <p
              className={`text-[11px] ${
                putawayDirects(suggestion) ? 'text-muted-foreground' : 'text-amber-800 dark:text-amber-300'
              }`}
            >
              {suggestion.reason}
              {putawayDirects(suggestion) && !putawayIsScannable(suggestion)
                ? ' Add a location barcode and the putaway can be confirmed rather than trusted.'
                : ''}
            </p>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          {rules.length === 0
            ? 'No putaway rules yet, so every receipt is a judgement call and the same product lands somewhere different each time.'
            : `${rules.length} putaway rules in force. The most specific one wins: a product rule beats a category rule beats a blanket one.`}
        </p>
      </CardContent>
    </Card>
  );
};
