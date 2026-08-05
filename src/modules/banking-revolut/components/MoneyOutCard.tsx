/**
 * Money out via Revolut (#315 phase 3): supplier payments / refunds from the ERP.
 *
 * Two instruments, deliberately ranked:
 *   - Payment DRAFT (default): the ERP prepares it; a human approves in the Revolut
 *     app. No unattended money movement.
 *   - Direct payment: moves money immediately — rendered as the explicit, second choice.
 * Plus payout links (refund without knowing an IBAN) and pocket-to-pocket FX.
 *
 * Recipients are CRM bank rows; paying one requires its Revolut counterparty, which is
 * created VoP-GATED (name must match the IBAN; a hard mismatch blocks unless forced).
 * Every instruction is audited in `revolut_payouts` before Revolut is called.
 */
import React from 'react';
import { Copy, Landmark, Link2, Loader2, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { callRevolutApi, getRevolutStatus, type RevolutAccountInfo } from '../services/revolutConfigService';

interface CrmBankOption {
  id: string;
  bank_name: string;
  account_holder: string | null;
  iban: string | null;
  revolut_counterparty_id: string | null;
  vop_result: string | null;
  owner_name: string;
}

interface PayoutRow {
  id: string;
  created_at: string;
  kind: string;
  state: string;
  amount: number;
  currency: string;
  counterparty_name: string | null;
  reference: string | null;
  provider_url: string | null;
}

const stateWord = (s: string) =>
  s === 'failed'
    ? <span className="text-xs text-destructive">failed</span>
    : s === 'pending_approval'
      ? <span className="text-xs text-amber-600 dark:text-amber-400">awaiting approval</span>
      : s === 'completed'
        ? <span className="text-xs text-emerald-600 dark:text-emerald-400">completed</span>
        : <span className="text-xs text-muted-foreground">{s}</span>;

export const MoneyOutCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [connected, setConnected] = React.useState(false);
  const [pockets, setPockets] = React.useState<RevolutAccountInfo[]>([]);
  const [banks, setBanks] = React.useState<CrmBankOption[]>([]);
  const [history, setHistory] = React.useState<PayoutRow[]>([]);
  const [busy, setBusy] = React.useState(false);

  // Send form
  const [bankId, setBankId] = React.useState('');
  const [pocketId, setPocketId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [direct, setDirect] = React.useState(false);
  const [forceVop, setForceVop] = React.useState(false);
  const [vopBlocked, setVopBlocked] = React.useState(false);

  // Payout link form
  const [linkName, setLinkName] = React.useState('');
  const [linkAmount, setLinkAmount] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      const status = await getRevolutStatus(workspaceId);
      setConnected(status.connected && status.enabled);
      if (!status.connected) return;

      const [acc, cb, hist] = await Promise.all([
        callRevolutApi<{ accounts: RevolutAccountInfo[] }>('accounts', workspaceId).catch(() => ({ accounts: [] as RevolutAccountInfo[] })),
        supabase
          .from('crm_bank_accounts')
          .select('id, bank_name, account_holder, iban, revolut_counterparty_id, vop_result, company:crm_companies!company_id(name), contact:crm_contacts!contact_id(name)')
          .eq('workspace_id', workspaceId)
          .not('iban', 'is', null)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('revolut_payouts')
          .select('id, created_at, kind, state, amount, currency, counterparty_name, reference, provider_url')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      setPockets(acc.accounts ?? []);
      setBanks(((cb.data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        bank_name: String(r.bank_name ?? ''),
        account_holder: (r.account_holder as string | null) ?? null,
        iban: (r.iban as string | null) ?? null,
        revolut_counterparty_id: (r.revolut_counterparty_id as string | null) ?? null,
        vop_result: (r.vop_result as string | null) ?? null,
        owner_name: String((r.company as { name?: string } | null)?.name ?? (r.contact as { name?: string } | null)?.name ?? ''),
      })));
      setHistory((hist.data ?? []) as PayoutRow[]);
    } catch { /* card renders its empty states */ }
  }, [workspaceId]);

  React.useEffect(() => { void load(); }, [load]);

  const selectedPocket = pockets.find((p) => p.id === pocketId);
  const currency = selectedPocket?.currency ?? 'EUR';

  const send = async () => {
    const amt = Number(amount);
    if (!bankId || !pocketId || !(amt > 0)) {
      toast({ title: 'Pick a recipient, a source account and a positive amount', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const bank = banks.find((b) => b.id === bankId);
      // Ensure the VoP-gated counterparty exists before any instruction.
      if (bank && !bank.revolut_counterparty_id) {
        try {
          const cp = await callRevolutApi<{ vop_result?: string }>('create-counterparty', workspaceId, {
            crm_bank_account_id: bankId,
            ...(forceVop ? { force: true } : {}),
          });
          if (cp.vop_result === 'close_match') {
            toast({ title: 'Name is a close match', description: 'The bank reports a slightly different holder name — double-check before large amounts.' });
          }
          setVopBlocked(false);
        } catch (e) {
          const msg = (e as Error).message;
          if (/does NOT match/i.test(msg)) setVopBlocked(true);
          throw e;
        }
      }
      const out = await callRevolutApi<{ mode: string; note?: string }>('send-payment', workspaceId, {
        crm_bank_account_id: bankId,
        source_revolut_account_id: pocketId,
        amount: amt,
        currency,
        reference,
        mode: direct ? 'payment' : 'draft',
      });
      toast({
        title: direct ? 'Payment sent' : 'Draft created',
        description: out.note ?? (direct ? 'The transfer was submitted to Revolut.' : 'Approve it in the Revolut app to execute.'),
      });
      setAmount(''); setReference(''); setForceVop(false); setVopBlocked(false);
      await load();
    } catch (e) {
      toast({ title: 'Could not send', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const makeLink = async () => {
    const amt = Number(linkAmount);
    if (!linkName.trim() || !pocketId || !(amt > 0)) {
      toast({ title: 'Payout links need a recipient name, a source account and an amount', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const out = await callRevolutApi<{ url: string | null }>('create-payout-link', workspaceId, {
        counterparty_name: linkName.trim(),
        source_revolut_account_id: pocketId,
        amount: amt,
        currency,
        reference: `Payout to ${linkName.trim()}`,
      });
      if (out.url) {
        void navigator.clipboard.writeText(out.url);
        toast({ title: 'Payout link created & copied', description: out.url });
      } else {
        toast({ title: 'Payout link created', description: 'Find the claim URL in Revolut.' });
      }
      setLinkName(''); setLinkAmount('');
      await load();
    } catch (e) {
      toast({ title: 'Could not create link', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (!connected) return null; // money-out only exists once the connection is live

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4" /> Money out</CardTitle>
        <CardDescription className="text-xs">
          Pay suppliers or refund customers from the connected Revolut account. Drafts are prepared
          here and approved by a human in the Revolut app; direct payments move money immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-5">
        {/* Send to a CRM bank account */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Recipient (CRM bank account)</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={bankId} onChange={(e) => { setBankId(e.target.value); setVopBlocked(false); setForceVop(false); }}>
              <option value="">— choose —</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {(b.owner_name || b.account_holder || b.bank_name)} · {b.bank_name}{b.revolut_counterparty_id ? '' : ' (not linked yet)'}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">From account</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={pocketId} onChange={(e) => setPocketId(e.target.value)}>
              <option value="">— choose —</option>
              {pockets.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.currency} · {p.balance.toFixed(2)} {p.currency}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Amount ({currency})</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Shown on the recipient's statement" maxLength={140} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
            Send immediately (skip the in-app approval)
          </label>
          {vopBlocked && (
            <label className="flex items-center gap-2 text-xs text-destructive">
              <input type="checkbox" checked={forceVop} onChange={(e) => setForceVop(e.target.checked)} />
              The holder name does NOT match this IBAN — tick to proceed anyway
            </label>
          )}
          <Button size="sm" className="rounded-full" onClick={send} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
            {direct ? 'Send payment' : 'Create draft'}
          </Button>
        </div>

        {/* Supplier bill run */}
        <div className="border-t border-border/60 pt-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Send className="h-3.5 w-3.5" /> Supplier bill run</div>
          <p className="mb-2 text-xs text-muted-foreground">
            Drafts ONE payment run covering every due supplier bill whose supplier has a verified
            Revolut counterparty — a single approval in the Revolut app pays them all.
          </p>
          <Button size="sm" variant="outline" className="rounded-full" disabled={busy || !pocketId}
            onClick={async () => {
              if (!pocketId) { toast({ title: 'Pick a source account first', variant: 'destructive' }); return; }
              setBusy(true);
              try {
                const out = await callRevolutApi<{ drafted: number; skipped: Array<{ bill: string; reason: string }>; note?: string }>(
                  'pay-due-bills', workspaceId, { source_revolut_account_id: pocketId });
                toast({
                  title: out.drafted > 0 ? `${out.drafted} bill(s) drafted` : 'Nothing to draft',
                  description: out.skipped.length
                    ? `Skipped ${out.skipped.length}: ${out.skipped.map((s) => s.bill).join(', ')} (no linked counterparty).`
                    : out.note,
                });
                await load();
              } catch (e) {
                toast({ title: 'Bill run failed', description: (e as Error).message, variant: 'destructive' });
              } finally { setBusy(false); }
            }}>
            Draft all due bills
          </Button>
        </div>

        {/* Payout link */}
        <div className="border-t border-border/60 pt-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Link2 className="h-3.5 w-3.5" /> Payout link</div>
          <p className="mb-2 text-xs text-muted-foreground">Refund or pay someone without their IBAN — they claim the money via a link.</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1 space-y-1">
              <Label className="text-xs">Recipient name</Label>
              <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="As known to Revolut" />
            </div>
            <div className="w-32 space-y-1">
              <Label className="text-xs">Amount ({currency})</Label>
              <Input inputMode="decimal" value={linkAmount} onChange={(e) => setLinkAmount(e.target.value)} placeholder="0.00" />
            </div>
            <Button size="sm" variant="outline" className="rounded-full" onClick={makeLink} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}Create link
            </Button>
          </div>
        </div>

        {/* Recent instructions */}
        {history.length > 0 && (
          <div className="border-t border-border/60 pt-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Landmark className="h-3.5 w-3.5" /> Recent instructions</div>
            <div className="divide-y divide-border/60">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</span>
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{h.kind.replace('_', ' ')}</span>
                  <span className="min-w-0 flex-1 truncate">{h.counterparty_name || h.reference || '—'}</span>
                  {stateWord(h.state)}
                  <span className="shrink-0 font-medium">{Number(h.amount).toFixed(2)} {h.currency}</span>
                  {h.provider_url && (
                    <Button size="sm" variant="ghost" className="h-6 px-2"
                      onClick={() => { void navigator.clipboard.writeText(h.provider_url as string); toast({ title: 'Link copied' }); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
