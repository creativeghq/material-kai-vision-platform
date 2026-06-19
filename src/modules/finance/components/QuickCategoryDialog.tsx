/**
 * Manage internal finance categories scoped to one kind (income or expense). Surfaced
 * inline from the Income (invoices/receipts) and Expenses headers so an operator can
 * add / rename / remove the labels used to segment documents ("what / where a payment
 * goes"). Internal only — no ΑΑΔΕ/myDATA classification. A category of a kind applies
 * across every document of that side (invoices + receivable manual entries for income;
 * supplier bills + payable manual entries + myDATA inbox for expense — all key off
 * finance_categories.category_id). Full management with margins also lives in
 * Settings → Finance Categories.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Pencil, Check, X, Tags } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

export const QuickCategoryDialog: React.FC<{
  workspaceId: string;
  kind: 'income' | 'expense';
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}> = ({ workspaceId, kind, open, onOpenChange, onChanged }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Categories that apply to this side: the kind itself or "both".
  const relevant = rows.filter((c) => c.kind === kind || c.kind === 'both');

  const load = useCallback(async () => {
    if (!workspaceId) return;
    try { setLoading(true); setRows(await financeCategoriesService.list(workspaceId)); }
    catch (err: any) { toast({ title: 'Failed to load categories', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const add = async () => {
    if (!name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await financeCategoriesService.create(workspaceId, { name: name.trim(), kind });
      setName('');
      await load();
      onChanged?.();
    } catch (err: any) { toast({ title: 'Failed to add', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const saveRename = async (id: string) => {
    if (!editName.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    try {
      await financeCategoriesService.update(id, { name: editName.trim() });
      setEditId(null);
      await load();
      onChanged?.();
    } catch (err: any) { toast({ title: 'Failed to rename', description: err?.message, variant: 'destructive' }); }
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this category? Documents already using it keep their label in history.')) return;
    try { await financeCategoriesService.remove(id); await load(); onChanged?.(); }
    catch (err: any) { toast({ title: 'Failed to remove', description: err?.message, variant: 'destructive' }); }
  };

  const label = kind === 'income' ? 'income' : 'expense';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 capitalize"><Tags className="h-4 w-4" /> {label} categories</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Internal labels for segmenting {label} documents — invoices, receipts, supplier bills and manual payables/receivables. Used for your own reporting and the category filter; not sent to ΑΑΔΕ.
        </p>

        {/* Add */}
        <div className="flex items-center gap-2">
          <Input
            className="h-9" placeholder={kind === 'income' ? 'New income category…' : 'New expense category…'}
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
          />
          <Button size="sm" className="rounded-full" onClick={add} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span className="ml-1">Add</span>
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : relevant.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No {label} categories yet. Add your first above.</p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-md border border-border/60 divide-y divide-border/50">
            {relevant.map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2">
                {editId === c.id ? (
                  <>
                    <Input
                      autoFocus className="h-8 flex-1" value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void saveRename(c.id); if (e.key === 'Escape') setEditId(null); }}
                    />
                    <button type="button" className="text-emerald-500 hover:text-emerald-400" onClick={() => saveRename(c.id)} title="Save"><Check className="h-4 w-4" /></button>
                    <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setEditId(null)} title="Cancel"><X className="h-4 w-4" /></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm truncate">{c.name}</span>
                    {c.kind === 'both' && <span className="text-[9px] text-muted-foreground">(both)</span>}
                    <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setEditId(c.id); setEditName(c.name); }} title="Rename"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => remove(c.id)} title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
