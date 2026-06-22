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
import { Switch } from '@/components/core/ui/switch';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, type ManualEntryDirection, type PartyRow } from '@/modules/finance/services/financeService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { flowEventService } from '@/services/flows/flowEventService';

type SettlementMethod = 'bank_transfer' | 'cash' | 'card' | 'check' | 'other';
const SETTLEMENT_METHODS: Array<{ value: SettlementMethod; label: string }> = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
];

/** Party pre-bound by the caller (e.g. the CRM Account tab) so the counterparty
 * picker is hidden and the entry is always attributed to this company/contact. */
export interface LockedParty { party_type: 'company' | 'contact'; party_id: string; display_name: string }

export const ManualEntryDialog: React.FC<{
  workspaceId: string;
  direction: ManualEntryDirection;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  lockedParty?: LockedParty;
}> = ({ workspaceId, direction, open, onOpenChange, onSaved, lockedParty }) => {
  const { toast } = useToast();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [partyKey, setPartyKey] = useState<string>(''); // `${party_type}:${party_id}`
  const [categoryId, setCategoryId] = useState('');
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<SettlementMethod | ''>('');
  const [requestDoc, setRequestDoc] = useState(false);
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [busy, setBusy] = useState(false);

  const isReceivable = direction === 'receivable';
  // receivable → finance issues a receipt to the customer; payable → an invoice is expected.
  const docKind: 'receipt' | 'invoice' = isReceivable ? 'receipt' : 'invoice';

  useEffect(() => {
    if (!open) return;
    setDescription(''); setAmount('');
    setPartyKey(lockedParty ? `${lockedParty.party_type}:${lockedParty.party_id}` : '');
    setCategoryId('');
    setIssuedAt(new Date().toISOString().slice(0, 10)); setDueAt(''); setNotes('');
    setMethod(''); setRequestDoc(false);
    (async () => {
      const [pp, cats] = await Promise.all([
        // Skip the party list entirely when the counterparty is already locked by the caller.
        lockedParty ? Promise.resolve([] as PartyRow[]) : financeService.listParties({ workspaceId, role: isReceivable ? 'customer' : 'supplier' }).catch(() => []),
        financeCategoriesService.list(workspaceId).catch(() => []),
      ]);
      setParties(pp);
      setCategories(cats);
    })();
  }, [open, workspaceId, isReceivable, lockedParty]);

  const selectedParty = useMemo(
    () => parties.find((p) => `${p.party_type}:${p.party_id}` === partyKey) ?? null,
    [parties, partyKey],
  );

  const save = async () => {
    const amt = parseFloat(amount);
    if (!description.trim()) { toast({ title: 'Add a description', variant: 'destructive' }); return; }
    if (!Number.isFinite(amt) || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    const companyId = lockedParty?.party_type === 'company' ? lockedParty.party_id : (selectedParty?.party_type === 'company' ? selectedParty.party_id : null);
    const contactId = lockedParty?.party_type === 'contact' ? lockedParty.party_id : (selectedParty?.party_type === 'contact' ? selectedParty.party_id : null);
    const partyName = lockedParty?.display_name ?? selectedParty?.display_name ?? null;
    setBusy(true);
    try {
      const entry = await financeService.createManualEntry({
        workspaceId,
        direction,
        description: description.trim(),
        amount: amt,
        categoryId: categoryId || null,
        counterpartyCompanyId: companyId,
        counterpartyContactId: contactId,
        issuedAt: new Date(issuedAt).toISOString(),
        dueAt: dueAt || null,
        notes: notes || null,
        settlementMethod: method || null,
        financeDocRequested: requestDoc,
        financeDocKind: requestDoc ? docKind : null,
      });
      // Item 3 — ask finance to issue the document. Delivered via the seeded
      // "Finance Document Requested → Notify Finance" system-default flow.
      if (requestDoc) {
        const reviewerIds = await financeService.listWorkspaceApproverIds(workspaceId).catch(() => [] as string[]);
        flowEventService.emit('finance_document_requested', {
          entry_id: entry.id,
          reviewer_ids: reviewerIds,
          type: 'finance_document_requested',
          title: `Issue a ${docKind} — ${partyName ?? 'customer/supplier'}`,
          body: `${isReceivable ? 'Receivable' : 'Payable'} of ${amt.toFixed(2)} recorded${partyName ? ` for ${partyName}` : ''}. Finance is asked to issue a ${docKind}.`,
          action_url: '/finance?tab=parties',
        });
      }
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

          {lockedParty ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount</Label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{isReceivable ? 'Customer' : 'Supplier'}</Label>
                <Input value={lockedParty.display_name} disabled />
              </div>
            </div>
          ) : (
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
          )}

          <div className="space-y-1">
            <Label>Settlement method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as SettlementMethod)}>
              <SelectTrigger><SelectValue placeholder="How it's paid (optional)" /></SelectTrigger>
              <SelectContent>
                {SETTLEMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
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

          {/* Item 3 — optionally ask finance to issue a formal document for this entry. */}
          <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <div className="space-y-0.5">
              <Label className="cursor-pointer">Ask finance to issue a {docKind}</Label>
              <p className="text-[11px] text-muted-foreground">
                Notifies the finance team to issue a{docKind === 'invoice' ? 'n' : ''} {docKind} for this {isReceivable ? 'receivable' : 'payable'}.
              </p>
            </div>
            <Switch checked={requestDoc} onCheckedChange={setRequestDoc} />
          </div>

          <p className="text-[11px] text-muted-foreground">
            This is tracked money only — recording it issues no myDATA document by itself. It shows in{' '}
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
