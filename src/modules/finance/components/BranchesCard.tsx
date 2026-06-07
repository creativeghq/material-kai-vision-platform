/** Manage establishments / branches. branch_code is the myDATA establishment number (0 = HQ). */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Loader2, Plus, Trash2, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { invoicingSetupService, type FinanceBranch } from '@/services/invoicingSetupService';

export const BranchesCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<FinanceBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ branch_code: '', name: '', address: '', street_number: '', postal_code: '', city: '' });

  const load = async () => {
    try { setLoading(true); setRows(await invoicingSetupService.ensureHeadquarters(workspaceId)); }
    catch (err: any) { toast({ title: 'Failed to load', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  const add = async () => {
    const code = parseInt(form.branch_code, 10);
    if (!Number.isFinite(code) || code < 0) { toast({ title: 'Enter a branch number (0 = HQ)', variant: 'destructive' }); return; }
    if (!form.name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await invoicingSetupService.addBranch(workspaceId, {
        branch_code: code, name: form.name.trim(),
        address: form.address || undefined, street_number: form.street_number || undefined,
        postal_code: form.postal_code || undefined, city: form.city || undefined,
      });
      setForm({ branch_code: '', name: '', address: '', street_number: '', postal_code: '', city: '' });
      setAdding(false); await load();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const toggle = async (b: FinanceBranch) => {
    try { await invoicingSetupService.updateBranch(b.id, { is_active: !b.is_active }); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };
  const remove = async (b: FinanceBranch) => {
    if (b.branch_code === 0) { toast({ title: 'Headquarters cannot be removed', variant: 'destructive' }); return; }
    try { await invoicingSetupService.deleteBranch(b.id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Establishments</CardTitle>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add establishment
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">Branches transmit to myDATA under their establishment number. Headquarters is branch 0. Assign numbering series to a branch in Document types.</p>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-1">
            {rows.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">#{b.branch_code}</Badge>
                  <span className="font-medium">{b.name}</span>
                  {[b.address, b.street_number, b.postal_code, b.city].some(Boolean) && (
                    <span className="text-xs text-muted-foreground">{[b.address, b.street_number, b.postal_code, b.city].filter(Boolean).join(' ')}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => toggle(b)}>
                    {b.is_active ? 'Active' : 'Inactive'}
                  </button>
                  {b.branch_code !== 0 && (
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => remove(b)}><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {adding && (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border/60 p-3">
            <div className="space-y-1">
              <Label className="text-xs">Branch number</Label>
              <Input className="h-8 text-xs" value={form.branch_code} onChange={(e) => setForm({ ...form, branch_code: e.target.value })} placeholder="1" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input className="h-8 text-xs" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Store — Athens" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Street</Label>
              <Input className="h-8 text-xs" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Number</Label>
              <Input className="h-8 text-xs" value={form.street_number} onChange={(e) => setForm({ ...form, street_number: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Postal code</Label>
              <Input className="h-8 text-xs" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">City</Label>
              <Input className="h-8 text-xs" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
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
