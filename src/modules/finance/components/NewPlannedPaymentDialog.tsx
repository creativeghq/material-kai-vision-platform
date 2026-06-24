import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  financeService, type PlannedPaymentCategory, type PlannedPaymentDirection,
} from '@/modules/finance/services/financeService';

interface Party { type: 'company' | 'contact'; id: string; label: string }

interface Props {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  defaultDirection?: PlannedPaymentDirection;
}

const CATEGORIES: { value: PlannedPaymentCategory; label: string }[] = [
  { value: 'supplier_bill', label: 'Supplier bill' },
  { value: 'rent', label: 'Rent' },
  { value: 'utility', label: 'Utility' },
  { value: 'tax', label: 'Tax' },
  { value: 'salary', label: 'Salary' },
  { value: 'loan', label: 'Loan' },
  { value: 'expense', label: 'Expense' },
  { value: 'expected_receipt', label: 'Expected receipt (incoming)' },
  { value: 'other', label: 'Other' },
];

export const NewPlannedPaymentDialog: React.FC<Props> = ({
  workspaceId, open, onOpenChange, onCreated, defaultDirection = 'out',
}) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const [direction, setDirection] = useState<PlannedPaymentDirection>(defaultDirection);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<string>('0');
  const [currency, setCurrency] = useState('EUR');
  const [scheduledFor, setScheduledFor] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<PlannedPaymentCategory>('supplier_bill');
  const [reminderAt, setReminderAt] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [party, setParty] = useState<Party | null>(null);
  const [partySearch, setPartySearch] = useState('');
  const [partyOptions, setPartyOptions] = useState<Party[]>([]);

  useEffect(() => {
    if (!open) return;
    setDirection(defaultDirection);
    setTitle('');
    setAmount('0');
    setCurrency('EUR');
    setScheduledFor(new Date().toISOString().slice(0, 10));
    setCategory(defaultDirection === 'in' ? 'expected_receipt' : 'supplier_bill');
    setReminderAt('');
    setNotes('');
    setParty(null);
    setPartySearch('');
  }, [open, defaultDirection]);

  // Search across CRM
  useEffect(() => {
    if (!open) return;
    const term = partySearch.trim();
    if (term.length < 2) { setPartyOptions([]); return; }
    const filterCol = direction === 'out' ? 'is_supplier' : 'is_client';
    const t = setTimeout(async () => {
      const [companies, contacts] = await Promise.all([
        supabase.from('crm_companies').select('id, name')
          .eq(direction === 'out' ? 'is_supplier' : 'is_customer', true)
          .ilike('name', `%${term}%`).limit(8),
        supabase.from('crm_contacts').select('id, name, first_name, last_name, email')
          .eq(filterCol, true)
          .or(`name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`).limit(8),
      ]);
      const opts: Party[] = [];
      for (const c of companies.data ?? []) opts.push({ type: 'company', id: c.id, label: `${c.name} (company)` });
      for (const c of contacts.data ?? []) {
        const label = c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id;
        opts.push({ type: 'contact', id: c.id, label });
      }
      setPartyOptions(opts);
    }, 200);
    return () => clearTimeout(t);
  }, [partySearch, open, direction]);

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({ title: 'Amount must be positive', variant: 'destructive' }); return;
    }
    if (!title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' }); return;
    }
    try {
      setBusy(true);
      // Business rollup: a person attached to a company is attributed to the BUSINESS.
      let cpCompanyId = party?.type === 'company' ? party.id : null;
      let cpContactId = party?.type === 'contact' ? party.id : null;
      if (cpContactId && !cpCompanyId) {
        const rolled = await financeService.resolvePrimaryCompanyId(cpContactId).catch(() => null);
        if (rolled) { cpCompanyId = rolled; cpContactId = null; }
      }
      await financeService.createPlannedPayment({
        workspaceId, direction, title: title.trim(), amount: parsedAmount, currency,
        scheduledFor, category,
        counterpartyCompanyId: cpCompanyId,
        counterpartyContactId: cpContactId,
        notes: notes || undefined,
        reminderAt: reminderAt || null,
      });
      toast({ title: 'Planned payment added' });
      onCreated();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message ?? 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add planned payment</DialogTitle>
          <DialogDescription>
            Schedule an upcoming payment (or expected receipt). Won't affect AR/AP totals until you mark it Paid.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as PlannedPaymentDirection)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="out">Outgoing (we pay)</SelectItem>
                  <SelectItem value="in">Incoming (we expect)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as PlannedPaymentCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rent — June 2026" />
          </div>

          <div className="space-y-1">
            <Label>{direction === 'out' ? 'Pay to (CRM)' : 'Expect from (CRM)'}</Label>
            {party ? (
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-sm">{party.label}</span>
                <Button size="sm" variant="ghost" onClick={() => setParty(null)}>Change</Button>
              </div>
            ) : (
              <div className="relative">
                <Input placeholder="Search CRM…" value={partySearch} onChange={(e) => setPartySearch(e.target.value)} />
                {partyOptions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border/60 bg-popover shadow-md">
                    {partyOptions.map((o) => (
                      <button key={`${o.type}-${o.id}`} type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => { setParty(o); setPartySearch(''); setPartyOptions([]); }}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Amount *</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Reminder date (optional)</Label>
            <Input type="date" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
