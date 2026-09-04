/**
 * The subcontractor's pricing page — `/bid/:token`.
 *
 * Nobody here has an account, and they never need one. The token is the whole boundary, and it is
 * per BID: this page can only ever show one subcontractor's own lines, so a forwarded link cannot
 * reveal what a competitor quoted.
 *
 * Everything on it is deliberately plain. The person opening it is standing in a van or an office
 * that has never heard of this platform, and the only thing they came to do is put a rate against
 * some lines and send it back.
 *
 * A BLANK LINE STAYS BLANK. It is submitted as null, not zero — "we did not price this" and "we
 * will do it for nothing" are different answers, and treating the first as the second is how a bid
 * wins on what it left out.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';

interface PackageInfo {
  reference: string | null;
  name: string;
  scope: string | null;
  currency: string;
  due_at: string | null;
  project_name: string | null;
}
interface Item {
  id: string;
  item_ref: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  sort: number;
}
interface Line {
  id: string;
  package_item_id: string;
  quantity: number | null;
  rate: number | null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'closed'; name: string }
  | { kind: 'ready'; pkg: PackageInfo; items: Item[]; lines: Line[]; submitted: boolean; notes: string | null };

export const PublicBidPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) { setState({ kind: 'not_found' }); return; }
    const { data, error: err } = await supabase.functions.invoke('tender-bid-portal', {
      body: { action: 'resolve_token', token },
    });
    if (err || !data || data.not_found) { setState({ kind: 'not_found' }); return; }
    if (data.closed) { setState({ kind: 'closed', name: data.package?.name ?? 'this package' }); return; }

    setState({
      kind: 'ready',
      pkg: data.package,
      items: data.items ?? [],
      lines: data.lines ?? [],
      submitted: !!data.submitted,
      notes: data.notes ?? null,
    });
    setDraft(Object.fromEntries(
      (data.lines ?? []).map((l: Line) => [l.id, l.rate === null || l.rate === undefined ? '' : String(l.rate)]),
    ));
    setNotes(data.notes ?? '');
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const lineFor = (itemId: string) =>
    state.kind === 'ready' ? state.lines.find((l) => l.package_item_id === itemId) ?? null : null;

  /** Live total of what has been typed. Blank lines contribute nothing and are counted separately. */
  const totals = useMemo(() => {
    if (state.kind !== 'ready') return { total: 0, unpriced: 0 };
    let total = 0; let unpriced = 0;
    for (const item of state.items) {
      const line = lineFor(item.id);
      const raw = line ? draft[line.id] : '';
      const rate = raw === '' || raw === undefined ? null : Number(raw);
      if (rate === null || !Number.isFinite(rate)) { unpriced++; continue; }
      total += rate * Number(line?.quantity ?? item.quantity ?? 0);
    }
    return { total, unpriced };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, draft]);

  const submit = async () => {
    if (state.kind !== 'ready') return;
    setSaving(true);
    setError(null);
    try {
      const rates = state.lines.map((l) => {
        const raw = draft[l.id];
        // Blank means NOT PRICED and is sent as null, never as 0.
        const rate = raw === '' || raw === undefined ? null : Number(raw);
        return { bid_item_id: l.id, rate: rate !== null && Number.isFinite(rate) ? rate : null };
      });
      const { data, error: err } = await supabase.functions.invoke('tender-bid-portal', {
        body: { action: 'submit', token, rates, notes },
      });
      if (err || !data?.ok) throw new Error(err?.message || 'Could not send your prices.');
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    );
  }

  if (state.kind === 'not_found') {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-lg font-medium">This link is not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have expired, or the enquiry may have been withdrawn. Ask whoever sent it for a
          new link.
        </p>
      </div>
    );
  }

  if (state.kind === 'closed') {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-lg font-medium">{state.name} is closed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This enquiry has been decided, so it is no longer taking prices. Thank you for your time.
        </p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-700 dark:text-emerald-400" aria-hidden />
        <h1 className="mt-3 text-lg font-medium">Thank you — your prices are in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You can come back to this link and change them until the enquiry is decided.
        </p>
      </div>
    );
  }

  const { pkg, items, submitted } = state;
  const money = (v: number) => formatMoney(v, pkg.currency);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="border-b border-hairline pb-5">
        <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
          {pkg.reference ? `${pkg.reference} · ` : ''}Enquiry
        </p>
        <h1 className="mt-1 text-2xl font-medium">{pkg.name}</h1>
        {pkg.project_name && (
          <p className="mt-1 text-sm text-muted-foreground">{pkg.project_name}</p>
        )}
        {pkg.due_at && (
          <p className="mt-2 text-sm">
            Prices due back by <strong>{formatDate(pkg.due_at)}</strong>
          </p>
        )}
        {submitted && (
          <p className="mt-2 text-xs text-muted-foreground">
            You have already sent prices for this. Changing them below and sending again replaces
            what you sent.
          </p>
        )}
      </header>

      {pkg.scope && (
        <section className="border-b border-hairline py-5">
          <h2 className="text-sm font-medium">Scope</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{pkg.scope}</p>
        </section>
      )}

      <section className="py-5">
        <h2 className="text-sm font-medium">Your rates</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Leave a line blank if you are not pricing it. A blank line is recorded as not priced — it
          is never treated as zero.
        </p>

        <div className="mt-3 table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                <th className="px-3 py-2 text-left">Ref</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate ({pkg.currency})</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const line = lineFor(item.id);
                const raw = line ? draft[line.id] ?? '' : '';
                const rate = raw === '' ? null : Number(raw);
                const qty = Number(line?.quantity ?? item.quantity ?? 0);
                return (
                  <tr key={item.id} className="border-t border-hairline">
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                      {item.item_ref ?? '—'}
                    </td>
                    <td className="px-3 py-2">{item.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {item.quantity ?? '—'}{item.unit ? ` ${item.unit}` : ''}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        inputMode="decimal"
                        className="h-9 w-28 text-right"
                        placeholder="—"
                        value={raw}
                        disabled={!line}
                        onChange={(e) => line && setDraft((d) => ({ ...d, [line.id]: e.target.value }))}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {rate === null || !Number.isFinite(rate)
                        ? <span className="text-muted-foreground">not priced</span>
                        : money(rate * qty)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-hairline bg-surface-sunken font-medium">
                <td className="px-3 py-2" colSpan={4}>
                  Your total
                  {totals.unpriced > 0 && (
                    <span className="ml-2 text-[11px] font-normal text-amber-800 dark:text-amber-300">
                      {totals.unpriced} line{totals.unpriced === 1 ? '' : 's'} not priced
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-t border-hairline py-5">
        <Label className="text-xs">Anything we should know</Label>
        <textarea
          className="mt-1 min-h-24 w-full rounded-sm border border-hairline bg-background p-2 text-sm"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Exclusions, qualifications, lead times…"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Say what your price excludes. It is read alongside the figures, not after the decision.
        </p>
      </section>

      {error && <p className="pb-3 text-sm text-destructive">{error}</p>}

      <div className="flex justify-end border-t border-hairline pt-5">
        <Button onClick={() => void submit()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send my prices
        </Button>
      </div>
    </div>
  );
};

export default PublicBidPage;
