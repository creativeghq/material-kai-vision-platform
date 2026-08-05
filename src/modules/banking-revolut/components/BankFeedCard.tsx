/**
 * Bank feed + reconciliation review queue (#315 phase 2).
 *
 * Shows the synced Revolut statement lines with their match state and lets a finance
 * user resolve the queue: confirm a suggested invoice, pick one manually, or ignore a
 * line (owner drawings, internal moves). Settlement always goes through the
 * `confirm-match` edge action → record-payment — this card never touches money tables.
 *
 * Status renders as plain colored words (design system: no badge pills for status).
 */
import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Loader2, RefreshCw, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { callRevolutApi } from '../services/revolutConfigService';

interface FeedRow {
  id: string;
  booked_at: string | null;
  counterparty_name: string | null;
  reference: string | null;
  amount: number;
  currency: string;
  direction: string | null;
  state: string;
  match_status: string;
  matched_invoice_id: string | null;
  suggested_invoice_ids: string[] | null;
}

interface InvoiceLite {
  id: string;
  internal_number: string;
  amount_due: number;
  currency: string;
  status: string;
}

const MatchWord: React.FC<{ row: FeedRow }> = ({ row }) => {
  // Outgoing lines settle supplier bills; show their match state too. Unmatched OUT
  // lines are normal (fees, FX, drawings) — render neutrally, not as a problem.
  if (row.direction !== 'in' && row.match_status !== 'matched') {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  switch (row.match_status) {
    case 'matched': return <span className="text-xs text-emerald-600 dark:text-emerald-400">Matched</span>;
    case 'suggested': return <span className="text-xs text-amber-600 dark:text-amber-400">Needs review</span>;
    case 'ignored': return <span className="text-xs text-muted-foreground">Ignored</span>;
    default: return <span className="text-xs text-destructive">Unmatched</span>;
  }
};

export const BankFeedCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<FeedRow[]>([]);
  const [invoices, setInvoices] = React.useState<Map<string, InvoiceLite>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [reviewOnly, setReviewOnly] = React.useState(false);
  const [picking, setPicking] = React.useState<FeedRow | null>(null);
  const [pickQuery, setPickQuery] = React.useState('');
  const [pickResults, setPickResults] = React.useState<InvoiceLite[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('revolut_bank_transactions')
        .select('id, booked_at, counterparty_name, reference, amount, currency, direction, state, match_status, matched_invoice_id, suggested_invoice_ids')
        .eq('workspace_id', workspaceId)
        .order('booked_at', { ascending: false })
        .limit(50);
      if (reviewOnly) q = q.in('match_status', ['suggested', 'unmatched']).eq('direction', 'in');
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const feed = (data ?? []).map((r) => ({
        ...r,
        suggested_invoice_ids: Array.isArray(r.suggested_invoice_ids) ? r.suggested_invoice_ids as string[] : null,
      })) as FeedRow[];
      setRows(feed);

      // Resolve the invoices referenced by matches/suggestions for display.
      const ids = [...new Set(feed.flatMap((r) => [r.matched_invoice_id, ...(r.suggested_invoice_ids ?? [])]).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: invs } = await supabase
          .from('invoices')
          .select('id, internal_number, amount_due, currency, status')
          .in('id', ids);
        setInvoices(new Map((invs ?? []).map((i) => [i.id, i as InvoiceLite])));
      } else {
        setInvoices(new Map());
      }
    } catch (e) {
      toast({ title: 'Failed to load bank feed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, reviewOnly, toast]);

  React.useEffect(() => { void load(); }, [load]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); await load(); }
    catch (e) { toast({ title: `${label} failed`, description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const syncNow = () => run('Sync', async () => {
    const out = await callRevolutApi<{ fetched: number; upserted: number }>('sync-now', workspaceId);
    toast({ title: 'Synced', description: `${out.fetched} transactions pulled.` });
  });
  const reconcile = () => run('Match', async () => {
    const out = await callRevolutApi<{ autoMatched: number; suggested: number; unmatched: number }>('reconcile', workspaceId);
    toast({ title: 'Matching complete', description: `${out.autoMatched} matched, ${out.suggested} for review, ${out.unmatched} unmatched.` });
  });
  const confirm = (row: FeedRow, invoiceId: string) => run('Confirm', async () => {
    await callRevolutApi('confirm-match', workspaceId, { transaction_row_id: row.id, invoice_id: invoiceId });
    setPicking(null);
    toast({ title: 'Payment recorded', description: 'Invoice settled through the normal payment path.' });
  });
  const ignore = (row: FeedRow, ig: boolean) => run('Ignore', async () => {
    await callRevolutApi('ignore-transaction', workspaceId, { transaction_row_id: row.id, ignore: ig });
  });

  const searchInvoices = React.useCallback(async (query: string) => {
    let q = supabase
      .from('invoices')
      .select('id, internal_number, amount_due, currency, status')
      .eq('workspace_id', workspaceId)
      .in('status', ['issued', 'partially_paid', 'overdue'])
      .gt('amount_due', 0)
      .order('created_at', { ascending: false })
      .limit(10);
    if (query.trim()) q = q.ilike('internal_number', `%${query.trim()}%`);
    const { data } = await q;
    setPickResults((data ?? []) as InvoiceLite[]);
  }, [workspaceId]);

  React.useEffect(() => {
    if (picking) void searchInvoices(pickQuery);
  }, [picking, pickQuery, searchInvoices]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-border/60 px-5 py-3">
        <div>
          <CardTitle className="text-base">Bank feed</CardTitle>
          <CardDescription className="text-xs">
            Incoming and outgoing transactions from the connected Revolut account. Incoming transfers
            are matched to open invoices automatically; the rest wait here for review.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={reviewOnly ? 'default' : 'outline'} className="rounded-full" onClick={() => setReviewOnly((v) => !v)}>
            Needs review
          </Button>
          <Button size="sm" variant="outline" className="rounded-full" onClick={reconcile} disabled={busy !== null}>
            {busy === 'Match' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}Match now
          </Button>
          <Button size="sm" variant="outline" className="rounded-full" onClick={syncNow} disabled={busy !== null}>
            {busy === 'Sync' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}Sync
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            {reviewOnly ? 'Nothing needs review.' : 'No transactions synced yet — connect Revolut and hit Sync.'}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => {
              const matched = r.matched_invoice_id ? invoices.get(r.matched_invoice_id) : null;
              const suggestions = (r.suggested_invoice_ids ?? []).map((id) => invoices.get(id)).filter(Boolean) as InvoiceLite[];
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  {r.direction === 'in'
                    ? <ArrowDownLeft className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    : <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{r.counterparty_name || 'Unknown'}</span>
                      <MatchWord row={r} />
                      {matched && <span className="text-xs text-muted-foreground">→ {matched.internal_number}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.booked_at ? new Date(r.booked_at).toLocaleDateString() : '—'}{r.reference ? ` · ${r.reference}` : ''}
                    </div>
                  </div>
                  <span className={`shrink-0 font-medium ${r.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                    {r.direction === 'in' ? '+' : '−'}{Number(r.amount).toFixed(2)} {r.currency}
                  </span>
                  {r.direction === 'in' && r.match_status !== 'matched' && (
                    <div className="flex shrink-0 items-center gap-1">
                      {suggestions.slice(0, 2).map((inv) => (
                        <Button key={inv.id} size="sm" variant="outline" className="rounded-full text-xs" disabled={busy !== null}
                          onClick={() => confirm(r, inv.id)}>
                          Settle {inv.internal_number}
                        </Button>
                      ))}
                      <Button size="sm" variant="ghost" className="rounded-full text-xs" disabled={busy !== null}
                        onClick={() => { setPicking(r); setPickQuery(''); }}>
                        <Search className="mr-1 h-3 w-3" />Pick invoice
                      </Button>
                      {r.match_status !== 'ignored'
                        ? <Button size="sm" variant="ghost" className="rounded-full text-xs text-muted-foreground" disabled={busy !== null} onClick={() => ignore(r, true)}>Ignore</Button>
                        : <Button size="sm" variant="ghost" className="rounded-full text-xs" disabled={busy !== null} onClick={() => ignore(r, false)}>Unignore</Button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!picking} onOpenChange={(o) => !o && setPicking(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Match {picking ? `${Number(picking.amount).toFixed(2)} ${picking.currency}` : ''} to an invoice
            </DialogTitle>
          </DialogHeader>
          <Input autoFocus placeholder="Search invoice number…" value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {pickResults.map((inv) => (
              <button key={inv.id} type="button" disabled={busy !== null}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => picking && confirm(picking, inv.id)}>
                <span className="font-medium">{inv.internal_number}</span>
                <span className="text-xs text-muted-foreground">due {Number(inv.amount_due).toFixed(2)} {inv.currency}</span>
              </button>
            ))}
            {pickResults.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No open invoices found.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
