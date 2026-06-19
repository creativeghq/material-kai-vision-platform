/**
 * Quick add/manage internal finance categories scoped to one kind (income or expense).
 * Surfaced inline from the Income (invoices/receipts) and Expenses headers so an operator
 * can classify "what / where a payment goes" without leaving the document list. These are
 * internal labels only — no ΑΑΔΕ/myDATA classification. Categories of a kind apply across
 * every document of that side (invoices + receivable manual entries for income; supplier
 * bills + payable manual entries + myDATA inbox for expense). Full management still lives in
 * Settings → Finance Categories (CategoriesCard).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Tags } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
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

  // Show categories that apply to this side: the kind itself or "both".
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

  const remove = async (id: string) => {
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
          Internal labels for classifying {label} documents — invoices, receipts, supplier bills, and manual payables/receivables. Used for your own reporting; not sent to ΑΑΔΕ.
        </p>

        <div className="flex items-center gap-2">
          <Input
            className="h-9" placeholder={kind === 'income' ? 'e.g. Product sales, Consulting' : 'e.g. Materials, Rent, Subcontractors'}
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
          />
          <Button size="sm" className="rounded-full" onClick={add} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span className="ml-1">Add</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : relevant.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No {label} categories yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {relevant.map((c) => (
              <Badge key={c.id} variant="outline" className="gap-1 pr-1">
                {c.name}
                {c.kind === 'both' && <span className="text-[9px] text-muted-foreground">(both)</span>}
                <button type="button" className="ml-1 text-muted-foreground hover:text-destructive" onClick={() => remove(c.id)} title="Remove">
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
