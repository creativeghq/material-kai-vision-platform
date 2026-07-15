/**
 * Manage the workspace's bank / cash accounts — where money lands on a payment in and
 * leaves from on a payment out. Shows the live running balance per account so the
 * operator always knows where they have what money (control surface until GoCardless).
 *
 * Each account can carry an IBAN and a free-form account/card reference so it's clear
 * which real-world account a row maps to. Add and Edit share one dialog form.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { Loader2, Plus, Trash2, Landmark, Star, Wallet, CreditCard, Globe, Banknote, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney, type BankAccountBalance, type BankAccountKind } from '@/modules/finance/services/financeService';
import { parseDecimalOr } from '@/utils/decimal';

const KIND_META: Record<BankAccountKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  bank: { label: 'Bank', icon: Landmark },
  cash: { label: 'Cash', icon: Banknote },
  card: { label: 'Card', icon: CreditCard },
  online: { label: 'Online', icon: Globe },
  other: { label: 'Other', icon: Wallet },
};

/** A card holds a number, an online wallet/bank holds an IBAN — label the reference field to suit. */
const refLabelFor = (kind: BankAccountKind) =>
  kind === 'card' ? 'Card number' : kind === 'cash' ? 'Reference (optional)' : 'Account number';

interface FormState {
  name: string;
  kind: BankAccountKind;
  currency: string;
  iban: string;
  accountRef: string;
  openingBalance: string;
  isActive: boolean;
  showOnInvoice: boolean;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: '', kind: 'bank', currency: 'EUR', iban: '', accountRef: '',
  openingBalance: '', isActive: true, showOnInvoice: false, notes: '',
};

export const BankAccountsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<BankAccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Dialog: null = closed; { id: null } = adding; { id: '…' } = editing that account.
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const load = async () => {
    try { setLoading(true); setRows(await financeService.getBankAccountBalances(workspaceId)); }
    catch (err: any) { toast({ title: 'Failed to load accounts', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  const openAdd = () => { setForm(EMPTY_FORM); setEditing({ id: null }); };
  const openEdit = (r: BankAccountBalance) => {
    setForm({
      name: r.name,
      kind: r.kind,
      currency: r.currency,
      iban: r.iban ?? '',
      accountRef: r.account_ref ?? '',
      openingBalance: String(r.opening_balance ?? ''),
      isActive: r.is_active,
      showOnInvoice: r.show_on_invoice,
      notes: '',
    });
    setEditing({ id: r.bank_account_id });
  };

  const patch = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const common = {
        name: form.name.trim(),
        kind: form.kind,
        currency: form.currency.trim().toUpperCase() || 'EUR',
        // IBAN only applies to a bank account; a reference (card no. / account ref) to anything
        // but cash. Cash has neither — don't persist stale values if the kind was switched.
        iban: form.kind === 'bank' ? (form.iban.trim() || null) : null,
        accountRef: form.kind === 'cash' ? null : (form.accountRef.trim() || null),
        openingBalance: form.openingBalance.trim() === '' ? 0 : parseDecimalOr(form.openingBalance, 0),
        notes: form.notes.trim() || null,
      };
      if (editing?.id) {
        await financeService.updateBankAccount(editing.id, {
          name: common.name, kind: common.kind, currency: common.currency,
          iban: common.iban, account_ref: common.accountRef,
          opening_balance: common.openingBalance, is_active: form.isActive,
          show_on_invoice: form.showOnInvoice, notes: common.notes,
        });
      } else {
        await financeService.createBankAccount({ workspaceId, ...common, showOnInvoice: form.showOnInvoice });
      }
      setEditing(null);
      await load();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const makeDefault = async (id: string) => {
    try { await financeService.setDefaultBankAccount(workspaceId, id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const remove = async (r: BankAccountBalance) => {
    const msg = r.payment_count > 0
      ? `Delete "${r.name}"? Its ${r.payment_count} payment(s) stay in history but become unassigned.`
      : `Delete "${r.name}"?`;
    if (!window.confirm(msg)) return;
    try { await financeService.deleteBankAccount(r.bank_account_id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const totalsByCurrency = rows.reduce((acc, r) => {
    acc[r.currency] = (acc[r.currency] ?? 0) + Number(r.current_balance || 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2"><Landmark className="h-4 w-4" /> Bank &amp; cash accounts</CardTitle>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {Object.entries(totalsByCurrency).map(([cur, total]) => (
            <span key={cur}>Total: <span className="font-semibold text-foreground">{formatMoney(total, cur)}</span></span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Define where money sits. When you record a payment you pick the account it lands in (or is paid from), and each account's balance updates here — opening balance plus money in, minus money out.
          </p>
          <Button size="sm" variant="outline" className="shrink-0" onClick={openAdd}>
            <Plus className="h-3 w-3 mr-1" /> Add account
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No accounts yet. Add your first bank or cash account.</p>
        ) : (
          <div className="space-y-1">
            {rows.map((r) => {
              const Meta = KIND_META[r.kind] ?? KIND_META.other;
              return (
                <div key={r.bank_account_id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Meta.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{r.name}</span>
                        {r.is_default && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                        {r.show_on_invoice && <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-500">On invoice</Badge>}
                        {!r.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {Meta.label} · {r.currency}
                        {r.iban ? ` · ${r.iban}` : r.account_ref ? ` · ${r.account_ref}` : ''}
                        {' · '}{r.payment_count} movement{r.payment_count === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className={`text-sm font-semibold tabular-nums ${Number(r.current_balance) < 0 ? 'text-destructive' : ''}`}>{formatMoney(Number(r.current_balance), r.currency)}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">+{formatMoney(Number(r.total_in), r.currency)} · −{formatMoney(Number(r.total_out), r.currency)}</div>
                    </div>
                    {!r.is_default && (
                      <button type="button" title="Make default" className="text-muted-foreground hover:text-primary" onClick={() => makeDefault(r.bank_account_id)}>
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button type="button" title="Edit" className="text-muted-foreground hover:text-primary" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Delete" className="text-muted-foreground hover:text-destructive" onClick={() => remove(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit account' : 'New account'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input className="h-9 text-sm" value={form.name} onChange={(e) => patch('name', e.target.value)} placeholder="e.g. Piraeus business, Cash register" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={form.kind} onValueChange={(v: any) => patch('kind', v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_META) as BankAccountKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_META[k].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Input className="h-9 text-sm uppercase" value={form.currency} onChange={(e) => patch('currency', e.target.value)} maxLength={3} />
              </div>
            </div>
            {/* IBAN only for a bank account; a reference for anything but cash. A cash account is
                just a name + balance — no bank numbers to fill in. */}
            {form.kind === 'bank' && (
              <div className="space-y-1">
                <Label className="text-xs">IBAN</Label>
                <Input className="h-9 text-sm" value={form.iban} onChange={(e) => patch('iban', e.target.value)} placeholder="GR00 0000 0000 0000 0000 0000 000" />
              </div>
            )}
            {form.kind !== 'cash' && (
              <div className="space-y-1">
                <Label className="text-xs">{refLabelFor(form.kind)}</Label>
                <Input className="h-9 text-sm" value={form.accountRef} onChange={(e) => patch('accountRef', e.target.value)}
                  placeholder={form.kind === 'card' ? 'Last 4 or full card number' : 'Account number / reference'} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Opening balance</Label>
              <Input className="h-9 text-sm text-right" type="text" inputMode="decimal" value={form.openingBalance}
                onChange={(e) => patch('openingBalance', e.target.value)} placeholder="0.00" />
              <p className="text-[11px] text-muted-foreground">Balance before any platform-recorded movements. Money in/out is added on top.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} className="text-sm" value={form.notes} onChange={(e) => patch('notes', e.target.value)} placeholder="Optional" />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
              <span className="text-xs">Show on invoice <span className="text-muted-foreground">— prints this account's name &amp; IBAN in the payment details on your invoices</span></span>
              <Switch checked={form.showOnInvoice} onCheckedChange={(v) => patch('showOnInvoice', v)} />
            </label>
            {editing?.id && (
              <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                <span className="text-xs">Active <span className="text-muted-foreground">— inactive accounts are hidden from payment pickers</span></span>
                <Switch checked={form.isActive} onCheckedChange={(v) => patch('isActive', v)} />
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              {editing?.id ? 'Save changes' : 'Add account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
