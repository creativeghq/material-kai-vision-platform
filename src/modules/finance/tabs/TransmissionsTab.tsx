/**
 * myDATA transmissions — every attempt we made, and what AADE said back.
 *
 * The counterpart to the myDATA Book: the Book is AADE's monthly aggregate, this is our
 * per-document log. `fiscal_submissions` has carried one row per attempt since day one — MARK,
 * authentication code, provider, credits, error code, the lot — and had NO surface at all. The
 * only read anywhere was server-side, pulling an authentication code onto a PDF. So the one
 * question an operator actually has once e-invoicing is live — *did our documents land, and which
 * did not and why* — could only be answered with SQL.
 *
 * ONE ROW PER ATTEMPT, NOT PER DOCUMENT. The accepted row and the three rejections before it are
 * all the record. Collapsing to the current state of each document would hide precisely what is
 * needed when something is not landing.
 *
 * A rejection is shown with its provider error CODE, not just the message: AADE's codes are the
 * thing you can look up and act on (313 is a forbidden classification, 228 is a document already
 * filed, 401 is an unauthorized issuer VAT), and the message alone sends people guessing.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2, RefreshCw, Send } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { FINANCE_BASE, FINANCE_TAB, financeTabUrl } from '@/modules/finance/routes';
import {
  fiscalConnectorService,
  type FiscalSubmission,
  type TransmissionStatusFilter,
} from '@/services/fiscalConnectorService';

type Props = { workspaceId: string | null | undefined };

const STATUS_FILTERS: { value: TransmissionStatusFilter; label: string }[] = [
  { value: 'all', label: 'All attempts' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'offline', label: 'Queued (AADE offline)' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'error', label: 'Errored' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Tinted squared tags, per the design system — never a saturated fill. */
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  accepted: 'success',
  offline: 'warning',
  rejected: 'error',
  error: 'error',
  cancelled: 'neutral',
  pending: 'info',
};

/** What the status MEANS, in the operator's terms rather than the provider's. */
const STATUS_HELP: Record<string, string> = {
  accepted: 'Registered at AADE with a MARK.',
  offline: 'AADE was down; the provider will transmit it and the MARK arrives later.',
  rejected: 'AADE refused the document. It has no MARK — fix it and send again.',
  // NOT "nothing was filed". `transmission_failure` is set on a thrown fetch, a non-JSON body or
  // any 5XX — cases where the provider may well have filed the document and simply failed to say
  // so. Telling an operator it is safe to retry is how one sale becomes two legal documents.
  error: 'The provider could not be reached, so we do not know whether it was filed. Check before re-sending.',
  cancelled: 'A cancellation filed at AADE for a movement document.',
  pending: 'Sent, no verdict recorded yet.',
};

const DOC_LABEL: Record<string, string> = {
  invoices: 'Invoice',
  credit_notes: 'Credit note',
  delivery_notes: 'Delivery note',
};

/** The document's own page, so a failing transmission is one click from the thing that failed. */
function documentHref(s: FiscalSubmission): string | null {
  const id = s.document_id ?? s.invoice_id;
  if (!id) return null;
  // An invoice has a page of its own. A credit note and a delivery note do not — they live in
  // their list — so the link goes to the LIST, through `financeTabUrl` rather than a hand-built
  // `?tab=` string. It deliberately carries no `?id=`: nothing reads one, and a parameter that
  // silently does nothing reads as a broken link rather than an honest one.
  if (s.document_table === 'credit_notes') return financeTabUrl(FINANCE_TAB.creditNotes);
  if (s.document_table === 'delivery_notes') return financeTabUrl(FINANCE_TAB.deliveryNotes);
  return `${FINANCE_BASE}/invoices/${id}`;
}

export const TransmissionsTab: React.FC<Props> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<FiscalSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<TransmissionStatusFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // `loading` is cleared on EVERY path including the no-workspace one — returning early before
  // the `finally` left the pane spinning for ever when it was opened before the workspace
  // resolved, with no empty state and nothing to retry.
  //
  // The `cancelled` latch is why the filter can be changed quickly: two overlapping queries would
  // otherwise race, and an earlier "All" response landing after a later "Rejected" one would fill
  // the table with rows the filter excludes while the Select still reads Rejected.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!workspaceId) { setRows([]); setLoading(false); return; }
      setLoading(true);
      try {
        const next = await fiscalConnectorService.listTransmissions(workspaceId, { status });
        if (!cancelled) setRows(next);
      } catch (err: any) {
        if (!cancelled) toast({ title: 'Could not load transmissions', description: err?.message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, status, reloadKey, toast]);

  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  const retry = async (s: FiscalSubmission) => {
    setBusy(s.id);
    try {
      const r = await fiscalConnectorService.retransmit(s);
      toast({
        title: r?.fiscal?.mark ? `Transmitted · MARK ${r.fiscal.mark}` : 'Sent to myDATA',
        description: r?.fiscal?.skipped ? 'Already transmitted — the stamp was repaired.' : undefined,
      });
      load();
    } catch (err: any) {
      toast({ title: 'Retransmission failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  // A count of what is NOT landing, because that is the number worth acting on. Derived from the
  // rows on screen rather than a second query, so it can never disagree with the list under it.
  const unresolved = useMemo(
    () => rows.filter((r) => r.status === 'rejected' || r.status === 'error').length,
    [rows],
  );

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>myDATA transmissions</CardTitle>
          <CardDescription>
            Every attempt to file a document with AADE, newest first — one row per attempt, so a
            document that took three tries shows all three.
            {unresolved > 0 && (
              <span className="ml-1 text-amber-800 dark:text-amber-300">
                {unresolved} {unresolved === 1 ? 'attempt has' : 'attempts have'} not landed.
              </span>
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as TransmissionStatusFilter)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <HubEmptyState
            variant={status === 'all' ? 'empty' : 'filtered'}
            icon={Send}
            title={status === 'all' ? 'Nothing has been transmitted yet' : 'No attempts with that status'}
            description={
              status === 'all'
                ? 'Every document sent to AADE through the e-invoicing connector is recorded here — the MARK it came back with, or the reason it did not.'
                : 'Every attempt in this workspace has a different status.'
            }
            action={status === 'all' ? undefined : (
              <Button variant="outline" onClick={() => setStatus('all')}>Clear filter</Button>
            )}
          />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Document</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Series / AA</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-left">MARK</th>
                  <th className="px-3 py-2 text-right tabular-nums">Credits</th>
                  <th className="px-3 py-2 text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const href = documentHref(s);
                  const failed = s.status === 'rejected' || s.status === 'error';
                  return (
                    <tr key={s.id} className="border-b border-hairline align-top">
                      {/* WITH THE TIME. Retries land seconds apart, so a date alone renders
                          every attempt of a document identically — and the order of attempts is
                          the one thing this table exists to show. */}
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(s.created_at, { withTime: true })}</td>
                      <td className="px-3 py-2">
                        {href ? (
                          <Link to={href} className="underline underline-offset-2">
                            {DOC_LABEL[s.document_table ?? ''] ?? 'Document'}
                          </Link>
                        ) : (DOC_LABEL[s.document_table ?? ''] ?? 'Document')}
                        {/* `fiscal_submissions.attempt` defaults to 1 and no writer ever sets
                            it, so a badge reading it could never appear. The timestamp above
                            carries the time, which orders the attempts honestly. */}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{s.fiscal_invoice_type ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {[s.series, s.aa].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={STATUS_VARIANT[s.status] ?? 'neutral'} title={STATUS_HELP[s.status] ?? ''}>
                          {s.status}
                        </Badge>
                        {s.transmission_failure && (
                          <div className="mt-1 text-[10px] text-muted-foreground">connection lost</div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {s.mark ?? <span className="text-muted-foreground">—</span>}
                        {failed && (s.error_code || s.error_message) && (
                          <div className="mt-1 flex items-start gap-1 font-sans text-[11px] text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>
                              {s.error_code && <span className="font-mono">{s.error_code}</span>}
                              {s.error_code && s.error_message ? ' · ' : ''}
                              {s.error_message}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.provider_credits != null ? s.provider_credits : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {/* Only for an attempt that did not land. A retransmission of an accepted
                            document is refused by the provider anyway (the UID is already filed),
                            so offering it would only invite a confusing error. */}
                        {/* A rejection is a verdict: nothing was filed, re-sending is right.
                            An attempt whose connection dropped is NOT — the document may already
                            be at AADE — so it gets no one-click retry and the status text says
                            to check first. */}
                        {failed && !s.transmission_failure && (s.document_id || s.invoice_id) && (
                          <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => void retry(s)}>
                            {busy === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Send again'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
