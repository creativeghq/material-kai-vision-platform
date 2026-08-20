/**
 * EFT-POS terminal registry (settings_pos parity). Register the physical/virtual
 * card terminals a workspace charges through. A card(7)/IRIS(8) receipt issued on a
 * registered terminal is signed by Novus (Law 5155/2023) and finalized to AADE only after
 * the terminal charge succeeds. `terminal_id` + `pos_nsp_id` are sent to Novus as the
 * paymentMethod's `terminalId`/`posNspId` so the provider can bind the signature to the device.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2, Plus, Trash2, CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { invoicingSetupService, type FinanceBranch } from '@/services/invoicingSetupService';
import { posTerminalService, POS_NSP_PROVIDERS, type PosTerminal } from '@/services/fiscalConnectorService';

export const PosTerminalsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PosTerminal[]>([]);
  const [branches, setBranches] = useState<FinanceBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ label: '', terminal_id: '', pos_nsp_id: '2', branch_code: '0' });

  const load = async () => {
    try {
      setLoading(true);
      const [t, br] = await Promise.all([
        posTerminalService.list(workspaceId),
        invoicingSetupService.listBranches(workspaceId).catch(() => [] as FinanceBranch[]),
      ]);
      setRows(t);
      setBranches(br);
    } catch (err: any) { toast({ title: 'Failed to load terminals', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  const add = async () => {
    if (!form.label.trim()) { toast({ title: 'Label required', variant: 'destructive' }); return; }
    if (!form.terminal_id.trim()) { toast({ title: 'Terminal ID required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await posTerminalService.create({
        workspace_id: workspaceId,
        label: form.label.trim(),
        terminal_id: form.terminal_id.trim(),
        pos_nsp_id: parseInt(form.pos_nsp_id, 10),
        branch_code: parseInt(form.branch_code, 10) || 0,
        notes: null,
      });
      setForm({ label: '', terminal_id: '', pos_nsp_id: '2', branch_code: '0' });
      setAdding(false); await load();
      toast({ title: 'Terminal registered' });
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const toggle = async (t: PosTerminal) => {
    try { await posTerminalService.update(t.id, { is_active: !t.is_active }); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };
  const remove = async (t: PosTerminal) => {
    if (!window.confirm(`Remove terminal "${t.label}"?`)) return;
    try { await posTerminalService.remove(t.id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const nspName = (id: number) => POS_NSP_PROVIDERS.find((p) => p.id === id)?.name ?? `NSP ${id}`;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> EFT-POS Terminals</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add terminal
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Card &amp; IRIS payments on a registered terminal are digitally signed (Law 5155/2023) and
          transmitted to myDATA only after the terminal charge clears. Pick the provider (NSP) that matches
          your bank&apos;s terminal and enter the terminal ID printed on the device.
        </p>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 && !adding ? (
          <p className="py-3 text-center text-xs text-muted-foreground">No terminals registered. Card receipts will transmit without a terminal signature until one is added.</p>
        ) : (
          <div className="space-y-1">
            {rows.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-[10px]">{nspName(t.pos_nsp_id)}</Badge>
                  <span className="font-medium truncate">{t.label}</span>
                  <span className="text-xs text-muted-foreground font-mono truncate">{t.terminal_id}</span>
                  {branches.length > 1 && <span className="text-[10px] text-muted-foreground">#{t.branch_code}</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => toggle(t)}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => remove(t)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {adding && (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border/60 p-3">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Label</Label>
              <Input className="h-8 text-xs" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Front counter — Viva" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Provider (NSP)</Label>
              <Select value={form.pos_nsp_id} onValueChange={(v) => setForm({ ...form, pos_nsp_id: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POS_NSP_PROVIDERS.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Terminal ID</Label>
              <Input className="h-8 text-xs font-mono" value={form.terminal_id} onChange={(e) => setForm({ ...form, terminal_id: e.target.value })} placeholder="123456789" />
            </div>
            {branches.length > 1 && (
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Establishment</Label>
                <Select value={form.branch_code} onValueChange={(v) => setForm({ ...form, branch_code: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={String(b.branch_code)}>#{b.branch_code} {b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2 flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button size="sm" onClick={add} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null} Save</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
