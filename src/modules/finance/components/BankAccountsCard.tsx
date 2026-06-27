/**
 * Manage the workspace's bank / cash accounts — where money lands on a payment in and
 * leaves from on a payment out. Shows the live running balance per account so the
 * operator always knows where they have what money (control surface until GoCardless).
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Badge } from '@/components/core/ui/badge';
import { Loader2, Plus, Trash2, Landmark, Star, Wallet, CreditCard, Globe, Banknote } from 'lucide-react';
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

export const BankAccountsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<BankAccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // New-account form
  const [name, setName] = useState('');
  const [kind, setKind] = useState<BankAccountKind>('bank');
  const [currency, setCurrency] = useState('EUR');
  const [openingBalance, setOpeningBalance] = useState('');

  const load = async () => {
    try { setLoading(true); setRows(await financeService.getBankAccountBalances(workspaceId)); }
    catch (err: any) { toast({ title: 'Failed to load accounts', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  const add = async () => {
    if (!name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await financeService.createBankAccount({
        workspaceId, name: name.trim(), kind, currency: currency.trim().toUpperCase() || 'EUR',
        openingBalance: openingBalance.trim() === '' ? 0 : parseDecimalOr(openingBalance, 0),
      });
      setName(''); setKind('bank'); setCurrency('EUR'); setOpeningBalance('');
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
        <p className="text-xs text-muted-foreground">
          Define where money sits. When you record a payment you pick the account it lands in (or is paid from), and each account's balance updates here — opening balance plus money in, minus money out.
        </p>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No accounts yet. Add your first bank or cash account below.</p>
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
                    <button type="button" title="Delete" className="text-muted-foreground hover:text-destructive" onClick={() => remove(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add new account */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-end pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Piraeus business, Cash register" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={kind} onValueChange={(v: any) => setKind(v)}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_META) as BankAccountKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_META[k].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Currency</Label>
            <Input className="h-8 w-20 text-xs uppercase" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Opening balance</Label>
            <Input className="h-8 w-28 text-xs text-right" type="text" inputMode="decimal" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0.00" />
          </div>
          <Button size="sm" variant="outline" onClick={add} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
