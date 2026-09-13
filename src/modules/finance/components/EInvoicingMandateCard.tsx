/**
 * Finance → Settings → e-Invoicing: the MANDATE, and whether we are meeting it (#444).
 *
 * From 1/10/2026 a B2B invoice issued from our own ERP is legally NON-ISSUANCE (Ε.2004/13.02.2026
 * §2) — even though the transmission succeeds and returns a MARK. That is the whole danger: the
 * unlawful path and the lawful one are indistinguishable from the outside, so the only way anyone
 * can tell is if the platform records WHICH channel each document went out on and says so here.
 *
 * A fallback is an incident, not a retry. It is counted in the open, never swallowed.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/utils/datetime';

/** A.1128/2025 art. 2 §2: the second period. Legacy channels run in parallel to 31/12/2026. */
const MANDATE_FROM = '2026-10-01';
const GRACE_UNTIL = '2026-12-31';

interface Row {
  issuance_channel: string | null;
  issued_at: string | null;
}

export const EInvoicingMandateCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openOutage, setOpenOutage] = useState<{ started_at: string; detail: string | null } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const [inv, outage] = await Promise.all([
      supabase.from('invoices')
        .select('issuance_channel, issued_at')
        .eq('workspace_id', workspaceId)
        .not('issued_at', 'is', null)
        .gte('issued_at', MANDATE_FROM),
      supabase.from('fiscal_outage_events')
        .select('started_at, detail')
        .eq('workspace_id', workspaceId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1),
    ]);
    // A failed read is UNKNOWN, never "nothing to report" — this card's whole job is to say
    // whether we are compliant, and an empty state built out of an error says we are.
    if (inv.error || outage.error) { setFailed(true); setRows([]); return; }
    setFailed(false);
    setRows((inv.data ?? []) as Row[]);
    setOpenOutage((outage.data ?? [])[0] ?? null);
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  if (rows === null) {
    return (
      <Card><CardContent className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }

  const fallback = rows.filter((r) => r.issuance_channel === 'erp_fallback').length;
  const unrecorded = rows.filter((r) => !r.issuance_channel).length;
  const provider = rows.filter((r) => r.issuance_channel === 'provider' || r.issuance_channel === 'timologio').length;
  const mandateLive = new Date().toISOString().slice(0, 10) >= MANDATE_FROM;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> B2B e-invoicing mandate
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          From {formatDate(MANDATE_FROM)} a B2B invoice must be issued through a certified provider
          or AADE&rsquo;s <span className="font-mono">timologio</span>. Issuing it from our own ERP
          counts as <strong>not issuing it at all</strong> — the transmission still returns a MARK,
          which is why this is counted rather than assumed. Legacy channels run in parallel until{' '}
          {formatDate(GRACE_UNTIL)}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {failed ? (
          <div className="flex items-center gap-2 rounded-md border border-hairline bg-surface-sunken p-3 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            Compliance position could not be read just now — this is not a statement that it is clean.
          </div>
        ) : (
          <>
            {openOutage && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                  <Wifi className="h-4 w-4" /> Loss of connection open since {formatDate(openOutage.started_at)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  While this is open, B2B invoices may lawfully go out on the ERP channel. Close it
                  and re-transmit everything it covered — the exemption ends when the outage does.
                  {openOutage.detail ? ` Recorded reason: ${openOutage.detail}` : ''}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Through a provider" value={provider} tone="ok" />
              <Stat
                label="ERP fallback"
                value={fallback}
                tone={fallback > 0 ? 'warn' : 'ok'}
                hint={fallback > 0 ? 'Lawful only under a recorded outage.' : undefined}
              />
              <Stat
                label="No channel recorded"
                value={unrecorded}
                tone={unrecorded > 0 ? 'bad' : 'ok'}
                hint={unrecorded > 0 ? 'Cannot be shown to have been lawfully issued.' : undefined}
              />
            </div>

            {!mandateLive && (
              <p className="text-xs text-muted-foreground">
                The mandate has not started yet. These counts are here so the channel is already
                being recorded when it does — a document issued before {formatDate(MANDATE_FROM)}
                with no channel is history, not an exposure.
              </p>
            )}
            {mandateLive && unrecorded === 0 && fallback === 0 && rows.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Every B2B invoice issued since the mandate went through a certified provider.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

const Stat: React.FC<{ label: string; value: number; tone: 'ok' | 'warn' | 'bad'; hint?: string }> = ({
  label, value, tone, hint,
}) => (
  <div className="rounded-md border border-border/60 p-3">
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Badge variant={tone === 'bad' ? 'error' : tone === 'warn' ? 'warning' : 'neutral'}>
        <span className="tabular-nums">{value}</span>
      </Badge>
    </div>
    {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);
