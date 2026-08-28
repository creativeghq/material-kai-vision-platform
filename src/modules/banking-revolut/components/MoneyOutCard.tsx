/**
 * Revolut treasury (#315) — the money-out operations that DON'T belong to a bill.
 *
 * Supplier payments live where the debt lives: Finance → Payables ("Send" on each bill,
 * "Draft all due" in the header) via PayViaRevolutDialog. What remains here:
 *   - Payout links: refund or pay someone WITHOUT knowing an IBAN (claim by URL).
 *   - The recent-instructions audit (drafts, payments, links, FX) with live states.
 */
import React from 'react';
import { Copy, Landmark, Link2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { callRevolutApi, getRevolutStatus, type RevolutAccountInfo } from '../services/revolutConfigService';
import { formatDate } from '@/utils/datetime';

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
      ? <span className="text-xs text-warning">awaiting approval</span>
      : s === 'completed' || s === 'claimed'
        ? <span className="text-xs text-success">{s}</span>
        : <span className="text-xs text-muted-foreground">{s}</span>;

export const MoneyOutCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [connected, setConnected] = React.useState(false);
  const [pockets, setPockets] = React.useState<RevolutAccountInfo[]>([]);
  const [history, setHistory] = React.useState<PayoutRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [pocketId, setPocketId] = React.useState('');
  const [linkName, setLinkName] = React.useState('');
  const [linkAmount, setLinkAmount] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      const status = await getRevolutStatus(workspaceId);
      setConnected(status.connected && status.enabled);
      if (!status.connected) return;
      const [acc, hist] = await Promise.all([
        callRevolutApi<{ accounts: RevolutAccountInfo[] }>('accounts', workspaceId).catch(() => ({ accounts: [] as RevolutAccountInfo[] })),
        supabase
          .from('revolut_payouts')
          .select('id, created_at, kind, state, amount, currency, counterparty_name, reference, provider_url')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      setPockets(acc.accounts ?? []);
      setPocketId((prev) => prev || ((acc.accounts ?? []).find((p) => p.currency === 'EUR') ?? (acc.accounts ?? [])[0])?.id || '');
      setHistory((hist.data ?? []) as PayoutRow[]);
    } catch { /* card renders its empty states */ }
  }, [workspaceId]);

  React.useEffect(() => { void load(); }, [load]);

  const currency = pockets.find((p) => p.id === pocketId)?.currency ?? 'EUR';

  /**
   * Synchronous latch (#359 CM-20). `busy` is React state, so a double-click enters `makeLink()`
   * twice before the first render — and a payout link is money the recipient can claim, so two
   * links is twice the money out with no way to un-issue the second.
   */
  const creatingLink = React.useRef(false);

  const makeLink = async () => {
    const amt = Number(linkAmount);
    if (!linkName.trim() || !pocketId || !(amt > 0)) {
      toast({ title: 'Payout links need a recipient name, a source account and an amount', variant: 'destructive' });
      return;
    }
    // A payout link moves money to WHOEVER OPENS IT — there is no IBAN and no name check on the
    // claim. Every other money-out path on this screen confirms; this one did not.
    if (!window.confirm(
      `Create a payout link for ${amt.toFixed(2)} ${currency} to ${linkName.trim()}?\n\n`
      + 'Anyone who opens the link can claim it, so send it only to the person it is for.',
    )) return;
    if (creatingLink.current) return;
    creatingLink.current = true;
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
    } finally { creatingLink.current = false; setBusy(false); }
  };

  if (!connected) return null;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-4 w-4" /> Revolut Treasury</CardTitle>
        <CardDescription className="text-xs">
          Supplier bills are paid from Finance → Payables (the Send action on each bill).
          Here: payout links for refunds without an IBAN, and the audit of every instruction.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Link2 className="h-3.5 w-3.5" /> Payout link</div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1 space-y-1">
              <Label className="text-xs" htmlFor="mo-link-name">Recipient name</Label>
              <Input id="mo-link-name" value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="As known to Revolut" />
            </div>
            <div className="w-40 space-y-1">
              <Label className="text-xs" htmlFor="mo-pocket">From</Label>
              <Select value={pocketId} onValueChange={setPocketId}>
                <SelectTrigger id="mo-pocket"><SelectValue placeholder="— choose —" /></SelectTrigger>
                <SelectContent>
                  {pockets.map((p) => <SelectItem key={p.id} value={p.id}>{p.currency} · {p.balance.toFixed(2)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-28 space-y-1">
              <Label className="text-xs" htmlFor="mo-amount">Amount</Label>
              <Input id="mo-amount" inputMode="decimal" value={linkAmount} onChange={(e) => setLinkAmount(e.target.value)} placeholder="0.00" />
            </div>
            <Button size="sm" variant="outline" onClick={makeLink} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}Create link
            </Button>
          </div>
        </div>

        {history.length > 0 && (
          <div className="border-t border-border/60 pt-4">
            <div className="mb-2 text-sm font-medium">Recent instructions</div>
            <div className="divide-y divide-border/60">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{formatDate(h.created_at)}</span>
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{h.kind.replace('_', ' ')}</span>
                  <span className="min-w-0 flex-1 truncate">{h.counterparty_name || h.reference || '—'}</span>
                  {stateWord(h.state)}
                  <span className="shrink-0 font-medium">{Number(h.amount).toFixed(2)} {h.currency}</span>
                  {h.provider_url && (
                    <Button size="sm" variant="ghost" className="h-6 px-2" aria-label="Copy payout link"
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
