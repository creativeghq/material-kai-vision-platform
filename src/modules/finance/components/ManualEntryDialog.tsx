/**
 * Add an un-invoiced receivable / payable — money owed to or by the workspace
 * that is NOT tied to an invoice or supplier bill. Counterparty-aware so it
 * still rolls up under a customer/supplier in the Parties view + ledger.
 *
 *  - receivable: a customer owes us (shows in Receivables aging).
 *  - payable:    we owe a supplier (shows in Payables aging).
 *
 * Settle it later from "Record payment" or the row's Settle action — that runs
 * through the same payment-allocation machinery as invoices.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, type ManualEntryDirection, type PartyRow } from '@/modules/finance/services/financeService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

export const ManualEntryDialog: React.FC<{
  workspaceId: string;
  direction: ManualEntryDirection;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}> = ({ workspaceId, direction, open, onOpenChange, onSaved }) => {
  const { toast } = useToast();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [partyKey, setPartyKey] = useState<string>(''); // `${party_type}:${party_id}`
  const [categoryId, setCategoryId] = useState('');
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [busy, setBusy] = useState(false);

  const isReceivable = direction === 'receivable';

  useEffect(() => {
    if (!open) return;
    setDescription(''); setAmount(''); setPartyKey(''); setCategoryId('');
    setIssuedAt(new Date().toISOString().slice(0, 10)); setDueAt(''); setNotes('');
    (async () => {
      const [pp, cats] = await Promise.all([
        financeService.listParties({ workspaceId, role: isReceivable ? 'customer' : 'supplier' }).catch(() => []),
        financeCategoriesService.list(workspaceId).catch(() => []),
      ]);
      setParties(pp);
      setCategories(cats);
    })();
  }, [open, workspaceId, isReceivable]);

  const selectedParty = useMemo(
    () => parties.find((p) => `${p.party_type}:${p.party_id}` === partyKey) ?? null,
    [parties, partyKey],
  );

  const save = async () => {
    const amt = parseFloat(amount);
    if (!description.trim()) { toast({ title: 'Add a description', variant: 'destructive' }); return; }
    if (!Number.isFinite(amt) || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await financeService.createManualEntry({
        workspaceId,
        direction,
        description: description.trim(),
        amount: amt,
        categoryId: categoryId || null,
        counterpartyCompanyId: selectedParty?.party_type === 'company' ? selectedParty.party_id : null,
        counterpartyContactId: selectedParty?.party_type === 'contact' ? selectedParty.party_id : null,
        issuedAt: new Date(issuedAt).toISOString(),
        dueAt: dueAt || null,
        notes: notes || null,
      });
      toast({ title: isReceivable ? 'Receivable added' : 'Payable added' });
      onSaved(); onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isReceivable ? 'Add receivable (un-invoiced)' : 'Add payable (un-invoiced)'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isReceivable ? 'e.g. Deposit owed, advance, consulting fee' : 'e.g. Rent, utility, contractor advance'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{isReceivable ? 'Customer' : 'Supplier'} (optional)</Label>
              <Select value={partyKey} onValueChange={setPartyKey}>
                <SelectTrigger><SelectValue placeholder="None — unassigned" /></SelectTrigger>
                <SelectContent>
                  {parties.length === 0
                    ? <div className="px-2 py-1 text-xs text-muted-foreground">No {isReceivable ? 'customers' : 'suppliers'} in CRM</div>
                    : parties.map((p) => (
                      <SelectItem key={`${p.party_type}:${p.party_id}`} value={`${p.party_type}:${p.party_id}`}>
                        {p.display_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Due date (optional)</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Category (optional)</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {categories.length === 0
                  ? <div className="px-2 py-1 text-xs text-muted-foreground">Add categories in Settings</div>
                  : categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <p className="text-[11px] text-muted-foreground">
            This is tracked money only — no invoice or myDATA document is issued. It shows in{' '}
            {isReceivable ? 'Receivables' : 'Payables'} aging and under the {isReceivable ? 'customer' : 'supplier'}’s ledger.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
