/**
 * Team cards + card expenses (#315 phase 4).
 *
 * Issue instant VIRTUAL cards to Revolut team members, freeze/unfreeze them, and browse
 * the card expenses Revolut captured — each with its receipt downloadable on demand
 * (fetched live from Revolut, never persisted, so there is no storage-GC surface).
 *
 * Auto-import of expenses into HR expense reports is the flagged next milestone on
 * #315 — this card is the browsing/issuing surface it will build on.
 */
import React from 'react';
import { CreditCard, Download, Loader2, Plus, Receipt } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { callRevolutApi, getRevolutStatus } from '../services/revolutConfigService';

interface Member { id: string; email?: string; first_name?: string; last_name?: string }
interface CardRow { id: string; label?: string; state?: string; virtual?: boolean; holder_id?: string; last_digits?: string }
interface ExpenseRow {
  id: string;
  state?: string;
  merchant?: { name?: string };
  amount?: number;
  currency?: string;
  spent_at?: string;
  receipts?: Array<{ id: string; file_name?: string; content_type?: string }>;
}

export const CardsExpensesCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [connected, setConnected] = React.useState(false);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [cards, setCards] = React.useState<CardRow[]>([]);
  const [expenses, setExpenses] = React.useState<ExpenseRow[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [holderId, setHolderId] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [limitCardId, setLimitCardId] = React.useState<string | null>(null);
  const [limitAmount, setLimitAmount] = React.useState('');
  const [inviteEmail, setInviteEmail] = React.useState('');

  React.useEffect(() => {
    getRevolutStatus(workspaceId)
      .then((s) => setConnected(s.connected && s.enabled))
      .catch(() => setConnected(false));
  }, [workspaceId]);

  const loadAll = async () => {
    setBusy('load');
    try {
      const [m, c, e] = await Promise.all([
        callRevolutApi<{ members: Member[] }>('team-members', workspaceId).catch(() => ({ members: [] as Member[] })),
        callRevolutApi<{ cards: CardRow[] }>('cards', workspaceId).catch(() => ({ cards: [] as CardRow[] })),
        callRevolutApi<{ expenses: ExpenseRow[] }>('expenses', workspaceId).catch(() => ({ expenses: [] as ExpenseRow[] })),
      ]);
      setMembers(m.members ?? []);
      setCards(c.cards ?? []);
      setExpenses((e.expenses ?? []).slice(0, 25));
      setLoaded(true);
    } finally { setBusy(null); }
  };

  const run = async (labelTxt: string, fn: () => Promise<void>) => {
    setBusy(labelTxt);
    try { await fn(); }
    catch (e) { toast({ title: `${labelTxt} failed`, description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const issueCard = () => run('Issue card', async () => {
    if (!holderId) { toast({ title: 'Pick a team member', variant: 'destructive' }); return; }
    await callRevolutApi('create-card', workspaceId, { holder_id: holderId, label });
    setLabel('');
    toast({ title: 'Virtual card issued' });
    await loadAll();
  });

  const toggleFreeze = (card: CardRow) => run(card.state === 'frozen' ? 'Unfreeze' : 'Freeze', async () => {
    const frozen = card.state === 'frozen';
    await callRevolutApi(frozen ? 'unfreeze-card' : 'freeze-card', workspaceId, { card_id: card.id });
    toast({ title: frozen ? 'Card unfrozen' : 'Card frozen' });
    await loadAll();
  });

  const downloadReceipt = (exp: ExpenseRow, receiptId: string, fileName?: string) =>
    run('Receipt', async () => {
      const out = await callRevolutApi<{ base64: string; content_type: string }>('expense-receipt', workspaceId, {
        expense_id: exp.id, receipt_id: receiptId,
      });
      const bytes = Uint8Array.from(atob(out.base64), (ch) => ch.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: out.content_type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `receipt-${exp.id}`;
      a.click();
      URL.revokeObjectURL(url);
    });

  const memberName = (id?: string) => {
    const m = members.find((x) => x.id === id);
    return m ? `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || id : id;
  };

  if (!connected) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" /> Team Cards &amp; Expenses</CardTitle>
          <CardDescription>
            Issue virtual Revolut cards to team members and browse card expenses with their receipts.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={loadAll} disabled={busy !== null}>
          {busy === 'load' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          {loaded ? 'Refresh' : 'Load'}
        </Button>
      </CardHeader>
      {loaded && (
        <CardContent className="space-y-6">
          {/* Issue */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 space-y-1">
              <Label className="text-xs" htmlFor="ce-member">Team member</Label>
              <select id="ce-member" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={holderId} onChange={(e) => setHolderId(e.target.value)}>
                <option value="">— choose —</option>
                {members.map((m) => <option key={m.id} value={m.id}>{memberName(m.id)}</option>)}
              </select>
            </div>
            <div className="w-44 space-y-1">
              <Label className="text-xs" htmlFor="ce-label">Card label</Label>
              <Input id="ce-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Site expenses" maxLength={30} />
            </div>
            <Button size="sm" className="rounded-full" onClick={issueCard} disabled={busy !== null}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Issue virtual card
            </Button>
            <div className="w-52 space-y-1">
              <Label className="text-xs" htmlFor="ce-invite">Not in Revolut yet? Invite by email</Label>
              <div className="flex gap-1">
                <Input id="ce-invite" className="h-9 text-xs" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="new.hire@company.gr" />
                <Button size="sm" variant="outline" className="rounded-full text-xs" disabled={busy !== null}
                  onClick={() => run('Invite', async () => {
                    await callRevolutApi('create-card-invitation', workspaceId, { email: inviteEmail.trim() });
                    setInviteEmail('');
                    toast({ title: 'Invitation sent', description: 'Once they join, issue their card here.' });
                  })}>
                  Invite
                </Button>
              </div>
            </div>
          </div>

          {/* Cards */}
          {cards.length > 0 && (
            <div className="space-y-1">
              <div className="text-sm font-medium">Cards</div>
              <div className="divide-y divide-border/60">
                {cards.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {c.label || 'Card'} {c.last_digits ? `•••• ${c.last_digits}` : ''}
                      <span className="ml-2 text-xs text-muted-foreground">{memberName(c.holder_id)}{c.virtual ? ' · virtual' : ''}</span>
                    </span>
                    {c.state === 'frozen'
                      ? <span className="text-xs text-sky-600 dark:text-sky-400">frozen</span>
                      : <span className="text-xs text-emerald-600 dark:text-emerald-400">{c.state ?? 'active'}</span>}
                    {limitCardId === c.id ? (
                      <span className="flex items-center gap-1">
                        <Input className="h-7 w-24 text-xs" inputMode="decimal" autoFocus placeholder="€ / month"
                          value={limitAmount} onChange={(e) => setLimitAmount(e.target.value)} />
                        <Button size="sm" variant="outline" className="rounded-full text-xs" disabled={busy !== null}
                          onClick={() => run('Limit', async () => {
                            const amt = Number(limitAmount);
                            if (!(amt > 0)) { toast({ title: 'Enter a positive monthly amount', variant: 'destructive' }); return; }
                            await callRevolutApi('set-card-limit', workspaceId, { card_id: c.id, amount: amt, period: 'month', currency: 'EUR' });
                            setLimitCardId(null); setLimitAmount('');
                            toast({ title: 'Monthly limit set' });
                          })}>
                          Set
                        </Button>
                        <Button size="sm" variant="ghost" className="rounded-full text-xs" onClick={() => setLimitCardId(null)}>Cancel</Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" className="rounded-full text-xs" disabled={busy !== null}
                        onClick={() => { setLimitCardId(c.id); setLimitAmount(''); }}>
                        Limit
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="rounded-full text-xs" disabled={busy !== null} onClick={() => toggleFreeze(c)}>
                      {c.state === 'frozen' ? 'Unfreeze' : 'Freeze'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expenses */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium"><Receipt className="h-3.5 w-3.5" /> Recent expenses (90 days)</div>
              <Button size="sm" variant="outline" className="rounded-full text-xs" disabled={busy !== null}
                onClick={() => run('Import', async () => {
                  const out = await callRevolutApi<{ imported: number; unmatchedPerson: number; receipts: number }>('import-expenses', workspaceId);
                  toast({
                    title: 'Expenses imported',
                    description: `${out.imported} attributed to employees (${out.receipts} receipts)${out.unmatchedPerson ? `; ${out.unmatchedPerson} had no matching employee email` : ''}.`,
                  });
                })}>
                Import to expense reports
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Import attributes each card expense to the employee whose email matches the card holder,
              into their monthly report — receipts included. Runs automatically with the sync too.
            </p>
            {expenses.length === 0 ? (
              <p className="text-xs text-muted-foreground">No card expenses in the window.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {expenses.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">
                      {e.spent_at ? new Date(e.spent_at).toLocaleDateString() : '—'}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{e.merchant?.name || 'Expense'}</span>
                    <span className="shrink-0 font-medium">{Number(e.amount ?? 0).toFixed(2)} {e.currency ?? ''}</span>
                    {(e.receipts ?? []).map((rc) => (
                      <Button key={rc.id} size="sm" variant="ghost" className="h-6 px-2" title={rc.file_name || 'Receipt'}
                        disabled={busy !== null} onClick={() => downloadReceipt(e, rc.id, rc.file_name)}>
                        <Download className="h-3 w-3" />
                      </Button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
};
