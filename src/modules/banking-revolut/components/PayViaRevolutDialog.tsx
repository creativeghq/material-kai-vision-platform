/**
 * Pay a supplier bill via Revolut — in context, from the Payables row (#315).
 *
 * The flow the bill deserves: open from the bill → recipient is the supplier's own CRM
 * bank account (VoP-verified when the Revolut counterparty is first created) → pick the
 * source pocket → Draft (default: a human approves in the Revolut app) or Send now.
 * The payment reference carries the bill number, so when the transfer executes, the
 * bank-feed matcher settles the bill automatically — no second bookkeeping step.
 */
import React from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { callRevolutApi, getRevolutStatus, type RevolutAccountInfo } from '../services/revolutConfigService';

interface BillInfo {
  id: string;
  supplier_bill_number: string | null;
  supplier_name: string | null;
  supplier_company_id: string | null;
  supplier_contact_id: string | null;
  amount_due: number;
  currency: string;
}

interface BankOption {
  id: string;
  bank_name: string;
  account_holder: string | null;
  iban: string | null;
  is_primary: boolean;
  revolut_counterparty_id: string | null;
  vop_result: string | null;
}

export const PayViaRevolutDialog: React.FC<{
  workspaceId: string;
  billId: string | null;
  onClose: () => void;
}> = ({ workspaceId, billId, onClose }) => {
  const { toast } = useToast();
  const [connected, setConnected] = React.useState<boolean | null>(null);
  const [bill, setBill] = React.useState<BillInfo | null>(null);
  const [banks, setBanks] = React.useState<BankOption[]>([]);
  const [pockets, setPockets] = React.useState<RevolutAccountInfo[]>([]);
  const [bankId, setBankId] = React.useState('');
  const [pocketId, setPocketId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [direct, setDirect] = React.useState(false);
  const [forceVop, setForceVop] = React.useState(false);
  const [vopBlocked, setVopBlocked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!billId) return;
    setConnected(null); setBill(null); setBanks([]); setVopBlocked(false); setForceVop(false); setDirect(false);
    void (async () => {
      try {
        const status = await getRevolutStatus(workspaceId);
        setConnected(status.connected && status.enabled);
        if (!status.connected) return;

        const { data: b } = await supabase
          .from('supplier_bills')
          .select('id, supplier_bill_number, supplier_name, supplier_company_id, supplier_contact_id, amount_due, currency')
          .eq('id', billId)
          .maybeSingle();
        if (!b) return;
        const info = b as BillInfo;
        setBill(info);
        setAmount(String(Number(info.amount_due).toFixed(2)));
        setReference(info.supplier_bill_number ?? '');

        let bq = supabase
          .from('crm_bank_accounts')
          .select('id, bank_name, account_holder, iban, is_primary, revolut_counterparty_id, vop_result')
          .eq('workspace_id', workspaceId)
          .not('iban', 'is', null)
          .order('is_primary', { ascending: false });
        bq = info.supplier_company_id
          ? bq.eq('company_id', info.supplier_company_id)
          : bq.eq('contact_id', info.supplier_contact_id ?? '00000000-0000-0000-0000-000000000000');
        const [{ data: bankRows }, acc] = await Promise.all([
          bq,
          callRevolutApi<{ accounts: RevolutAccountInfo[] }>('accounts', workspaceId).catch(() => ({ accounts: [] as RevolutAccountInfo[] })),
        ]);
        const options = (bankRows ?? []) as BankOption[];
        setBanks(options);
        setBankId(options[0]?.id ?? '');
        const ccy = String(info.currency ?? 'EUR').toUpperCase();
        const pocketList = acc.accounts ?? [];
        setPockets(pocketList);
        setPocketId(pocketList.find((p) => p.currency === ccy)?.id ?? pocketList[0]?.id ?? '');
      } catch (e) {
        setConnected(false); // degrade to the connect-first message instead of an eternal spinner
        toast({ title: 'Could not prepare the payment', description: (e as Error).message, variant: 'destructive' });
      }
    })();
  }, [billId, workspaceId, toast]);

  const send = async () => {
    if (!bill) return;
    const amt = Number(amount);
    if (!bankId || !pocketId || !(amt > 0)) {
      toast({ title: 'Pick the supplier account, a source account and a positive amount', variant: 'destructive' });
      return;
    }
    const bankSel = banks.find((b) => b.id === bankId);
    if (direct && !window.confirm(
      `Send ${amt.toFixed(2)} ${String(bill.currency ?? 'EUR').toUpperCase()} to ${bankSel?.account_holder || bankSel?.bank_name || 'this account'} NOW? This moves money immediately, without the in-app approval.`,
    )) return;
    setBusy(true);
    try {
      const bank = bankSel;
      if (bank && !bank.revolut_counterparty_id) {
        try {
          await callRevolutApi('create-counterparty', workspaceId, {
            crm_bank_account_id: bankId,
            ...(forceVop ? { force: true } : {}),
          });
          setVopBlocked(false);
        } catch (e) {
          if (/does NOT match/i.test((e as Error).message)) setVopBlocked(true);
          throw e;
        }
      }
      const out = await callRevolutApi<{ note?: string }>('send-payment', workspaceId, {
        crm_bank_account_id: bankId,
        source_revolut_account_id: pocketId,
        amount: amt,
        currency: String(bill.currency ?? 'EUR').toUpperCase(),
        reference: reference || bill.supplier_bill_number || '',
        mode: direct ? 'payment' : 'draft',
      });
      toast({
        title: direct ? 'Payment sent' : 'Draft created — approve it in the Revolut app',
        description: out.note ?? `When the transfer executes, bill ${bill.supplier_bill_number ?? ''} settles itself from the bank feed.`,
      });
      onClose();
    } catch (e) {
      toast({ title: 'Could not send', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!billId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Pay {bill?.supplier_name || 'supplier'}{bill?.supplier_bill_number ? ` — ${bill.supplier_bill_number}` : ''}
          </DialogTitle>
        </DialogHeader>

        {connected === null ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !connected ? (
          <p className="py-4 text-sm text-muted-foreground">
            Connect Revolut Business first (Profile → Keys) to pay suppliers from here.
          </p>
        ) : banks.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            This supplier has no bank account with an IBAN in CRM. Add one on their profile
            (Bank Accounts card) — it will be name-verified before any money moves.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs" htmlFor="pvr-bank">Supplier account</Label>
              <Select value={bankId} onValueChange={(v) => { setBankId(v); setVopBlocked(false); setForceVop(false); }}>
                <SelectTrigger id="pvr-bank"><SelectValue placeholder="— choose —" /></SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {(b.account_holder || b.bank_name)} · {b.iban}{b.revolut_counterparty_id ? ' ✓' : ' (will be verified)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs" htmlFor="pvr-pocket">From</Label>
              <Select value={pocketId} onValueChange={setPocketId}>
                <SelectTrigger id="pvr-pocket"><SelectValue placeholder="— choose —" /></SelectTrigger>
                <SelectContent>
                  {pockets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name || p.currency} · {p.balance.toFixed(2)} {p.currency}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs" htmlFor="pvr-amount">Amount ({bill?.currency ?? 'EUR'})</Label>
                <Input id="pvr-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs" htmlFor="pvr-ref">Reference</Label>
                <Input id="pvr-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={140} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="pvr-direct" checked={direct} onCheckedChange={(v) => setDirect(v === true)} />
              <Label htmlFor="pvr-direct" className="text-xs font-normal text-muted-foreground">Send immediately (skip the in-app approval)</Label>
            </div>
            {vopBlocked && (
              <div className="flex items-center gap-2">
                <Checkbox id="pvr-force" checked={forceVop} onCheckedChange={(v) => setForceVop(v === true)} />
                <Label htmlFor="pvr-force" className="text-xs font-normal text-destructive">The holder name does NOT match this IBAN — tick to proceed anyway</Label>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" className="rounded-full" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button className="rounded-full" onClick={send} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                {direct ? 'Send payment' : 'Create draft'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
