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
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Wifi, Inbox, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatDate, todayLocalISO } from '@/utils/datetime';
import {
  einvoiceMandateService, MANDATE_LABEL, INBOUND_LABEL,
  declarationIsFiled, mandateNeedsAttention, fallbackIsIncident, inboundNeedsAttention,
  pullIsNotAcceptance, ERP_IS_NON_ISSUANCE, DECLARATION_IS_AN_OPERATOR_ACTION,
  ONE_DERIVATION_TWO_SERIALISATIONS, MANDATE_SCOPE,
  type MandatePosition, type InboundPosition, type OpenOutage,
} from '@/modules/finance/services/einvoiceMandateService';

export const EInvoicingMandateCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [position, setPosition] = useState<MandatePosition | null>(null);
  const [inbound, setInbound] = useState<InboundPosition | null>(null);
  const [openOutage, setOpenOutage] = useState<OpenOutage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ filedOn: todayLocalISO(), startDate: '2026-10-01' });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [p, i, o] = await Promise.all([
        einvoiceMandateService.position(workspaceId),
        einvoiceMandateService.inbound(workspaceId),
        einvoiceMandateService.openOutage(workspaceId),
      ]);
      setPosition(p); setInbound(i); setOpenOutage(o); setFailed(false);
    } catch {
      // A failed read is UNKNOWN, never "nothing to report" — this card's whole job is to say
      // whether we are compliant, and an empty state built out of an error says we are.
      setPosition(null); setInbound(null); setOpenOutage(null); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const fileDeclaration = async () => {
    setBusy(true);
    try {
      await einvoiceMandateService.recordDeclaration(workspaceId, draft.filedOn, draft.startDate);
      await load();
      toast({
        title: 'Filing recorded',
        description: 'This records that it was filed. It does not file it.',
      });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the filing',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <Card><CardContent className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> B2B e-invoicing mandate
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          {ERP_IS_NON_ISSUANCE} {MANDATE_SCOPE}
        </p>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        {failed && (
          <div className="flex items-center gap-2 rounded-md border border-hairline bg-surface-sunken p-3 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            Compliance position could not be read just now — this is not a statement that it is clean.
          </div>
        )}

        {!failed && position && (
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

            <div
              className={`space-y-1 rounded-md border p-3 text-xs ${
                position.status === 'declaration_missing' || position.status === 'channel_unrecorded'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : mandateNeedsAttention(position)
                    ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                    : 'border-hairline bg-surface-sunken text-muted-foreground'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {mandateNeedsAttention(position)
                  ? <AlertTriangle className="h-3.5 w-3.5" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                <Badge variant={mandateNeedsAttention(position) ? 'warning' : 'success'}>
                  {MANDATE_LABEL[position.status]}
                </Badge>
                <span className="tabular-nums">
                  since {formatDate(position.mandate_from)}: {position.via_provider} provider ·{' '}
                  {position.via_timologio} timologio · {position.via_erp_fallback} ERP ·{' '}
                  {position.channel_unrecorded} unrecorded
                </span>
              </div>
              <p>{position.reason}</p>
              <p>{position.legal_basis}</p>
              <p>{position.note}</p>
              {fallbackIsIncident(position) && (
                <p>
                  A fallback is an incident, not a retry: {position.fallback_unreconciled} of them
                  rely on an outage nobody has closed out.
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-hairline p-3 text-xs">
              <p className="font-medium">Δήλωση Έναρξης Ηλεκτρονικής Έκδοσης Στοιχείων</p>
              <p className="text-muted-foreground">{DECLARATION_IS_AN_OPERATOR_ACTION}</p>
              {declarationIsFiled(position) ? (
                <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Filed {formatDate(position.declaration_filed_on as string)}, starting{' '}
                  {formatDate(position.declared_start_date as string)}.
                </p>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label htmlFor="ein-filed" className="text-[11px]">Filed on</Label>
                    <Input
                      id="ein-filed" type="date" className="mt-1 h-8 w-40 text-xs" value={draft.filedOn}
                      onChange={(e) => setDraft((d) => ({ ...d, filedOn: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ein-start" className="text-[11px]">Declared start date</Label>
                    <Input
                      id="ein-start" type="date" className="mt-1 h-8 w-40 text-xs" value={draft.startDate}
                      onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                    />
                  </div>
                  <Button size="sm" onClick={fileDeclaration} disabled={busy}>
                    <Save className="mr-1 h-3 w-3" /> Record the filing
                  </Button>
                </div>
              )}
            </div>

            {inbound && (
              <div
                className={`space-y-1 rounded-md border p-3 text-xs ${
                  inboundNeedsAttention(inbound)
                    ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                    : 'border-hairline bg-surface-sunken text-muted-foreground'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  <Inbox className="h-3.5 w-3.5" />
                  <Badge variant={inboundNeedsAttention(inbound) ? 'warning' : 'neutral'}>
                    {INBOUND_LABEL[inbound.status]}
                  </Badge>
                  <span className="tabular-nums">
                    since {formatDate(inbound.due_from)}: {inbound.documents} received ·{' '}
                    {inbound.structured} structured · {inbound.pulled_from_mydata} pulled ·{' '}
                    {inbound.without_receipt_date} with no receipt date
                  </span>
                </div>
                <p>{inbound.reason}</p>
                <p>{pullIsNotAcceptance}</p>
                <p>{inbound.note}</p>
                <p>{ONE_DERIVATION_TWO_SERIALISATIONS}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
