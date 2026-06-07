/** Manage finance categories (income / expense / both) used to classify documents + payments. */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Badge } from '@/components/core/ui/badge';
import { Loader2, Plus, Trash2, Tags, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

export const CategoriesCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FinanceCategory['kind']>('both');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  const importDefaults = async () => {
    setImporting(true);
    try {
      const n = await financeCategoriesService.importDefaults(workspaceId);
      toast({ title: n > 0 ? `Imported ${n} categories` : 'Already up to date', description: n > 0 ? 'Standard income/expense categories added — edit or remove any you don’t need.' : 'All default categories already exist.' });
      await load();
    } catch (err: any) { toast({ title: 'Import failed', description: err?.message, variant: 'destructive' }); }
    finally { setImporting(false); }
  };

  const load = async () => {
    try { setLoading(true); setRows(await financeCategoriesService.list(workspaceId)); }
    catch (err: any) { toast({ title: 'Failed to load', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  const add = async () => {
    if (!name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setBusy(true);
    try { await financeCategoriesService.create(workspaceId, { name: name.trim(), kind }); setName(''); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    try { await financeCategoriesService.remove(id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const kindBadge = (k: FinanceCategory['kind']) =>
    k === 'income' ? 'default' : k === 'expense' ? 'destructive' : 'outline';

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2"><Tags className="h-4 w-4" /> Finance categories</CardTitle>
        <Button size="sm" variant="outline" className="rounded-full" onClick={importDefaults} disabled={importing}>
          {importing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />} Import default categories
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">Classify invoices, receipts, expenses and payments. Pick a category on each document or payment.</p>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No categories yet.</p>
        ) : (
          <div className="space-y-1">
            {rows.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <span>{c.name}</span>
                <div className="flex items-center gap-3">
                  <Badge variant={kindBadge(c.kind)} className="text-[10px]">{c.kind}</Badge>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => remove(c.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Materials, Rent, Services" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kind</Label>
            <Select value={kind} onValueChange={(v: any) => setKind(v)}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Both</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" onClick={add} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
