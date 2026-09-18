/** e-Invoicing onboarding. "Mark done" records a claim; only Novus turns a rung green. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Check, CheckCircle2, Clock, Download, FileSignature, Hand,
  History, Loader2, MinusCircle, RefreshCw, Send, Upload, XCircle,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDate } from '@/utils/datetime';
import {
  einvoiceOnboardingService,
  type ApplicationDraft,
  type EInvoiceOnboarding,
  type EInvoiceOnboardingStep,
  type HistoryEntry,
  type OnboardingStepState,
} from '@/services/einvoiceOnboardingService';

interface Props {
  workspaceId: string;
  onGoToIdentity?: () => void;
}

const STATE_LOOK: Record<OnboardingStepState, {
  icon: React.ElementType; tone: string; ring: string; label: string;
}> = {
  done: { icon: CheckCircle2, tone: 'text-[hsl(var(--success))]', ring: 'border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success-bg))]', label: 'Done' },
  self_reported: { icon: Hand, tone: 'text-[hsl(var(--info))]', ring: 'border-[hsl(var(--info)/0.35)] bg-[hsl(var(--info-bg))]', label: 'Marked done' },
  awaiting_confirmation: { icon: Clock, tone: 'text-[hsl(var(--warning))]', ring: 'border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning-bg))]', label: 'Waiting on Novus' },
  waiting: { icon: Clock, tone: 'text-[hsl(var(--warning))]', ring: 'border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning-bg))]', label: 'In progress' },
  todo: { icon: ArrowRight, tone: 'text-primary', ring: 'border-primary bg-surface-sunken', label: 'Your turn' },
  pending: { icon: Clock, tone: 'text-muted-foreground', ring: 'border-hairline', label: 'Not yet' },
  blocked: { icon: MinusCircle, tone: 'text-muted-foreground', ring: 'border-hairline', label: 'Earlier step first' },
  failed: { icon: XCircle, tone: 'text-[hsl(var(--error))]', ring: 'border-[hsl(var(--error)/0.35)] bg-[hsl(var(--error-bg))]', label: 'Needs attention' },
  not_applicable: { icon: MinusCircle, tone: 'text-muted-foreground', ring: 'border-hairline', label: 'Not needed' },
};

const ACTOR_LABEL: Record<string, string> = {
  you: 'You', novus: 'Novus', aade: 'The business, at ΑΑΔΕ',
  SOFTWARE_HOUSE: 'Us', CLIENT: 'The customer', NOVUS: 'Novus', SYSTEM: 'Automatic',
};

const OVERALL: Record<EInvoiceOnboarding['overall'], { variant: 'success' | 'warning' | 'error' | 'neutral'; label: string }> = {
  not_started: { variant: 'neutral', label: 'Not started' },
  in_progress: { variant: 'warning', label: 'In progress' },
  active: { variant: 'success', label: 'Active — this VAT can issue' },
  attention: { variant: 'error', label: 'Needs attention' },
};

const EMPTY_DRAFT: ApplicationDraft = {
  administrator_full_name: '', administrator_vat: '', transaction_types: ['B2B'],
  isp_provider_name: '', isp_contract_number: '', isp_contract_date: null, contact_backup_phone: '',
};

export const EInvoiceOnboardingCard: React.FC<Props> = ({ workspaceId, onGoToIdentity }) => {
  const { toast } = useToast();
  const [data, setData] = useState<EInvoiceOnboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<ApplicationDraft>(EMPTY_DRAFT);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setBusy('refresh');
    try {
      const next = await einvoiceOnboardingService.status(workspaceId);
      setData(next);
      if (next.application) {
        const a = next.application;
        setDraft({
          administrator_full_name: a.administrator_full_name ?? '',
          administrator_vat: a.administrator_vat ?? '',
          transaction_types: a.transaction_types?.length ? a.transaction_types : ['B2B'],
          isp_provider_name: a.isp_provider_name ?? '',
          isp_contract_number: a.isp_contract_number ?? '',
          isp_contract_date: a.isp_contract_date ?? null,
          contact_backup_phone: a.contact_backup_phone ?? '',
        });
      }
    } catch (err) {
      toast({ title: 'Could not read the onboarding status', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async (key: string, fn: () => Promise<EInvoiceOnboarding>, ok?: string) => {
    setBusy(key);
    try {
      setData(await fn());
      if (ok) toast({ title: ok });
    } catch (err) {
      toast({ title: 'That did not go through', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }, [toast]);

  const download = useCallback(async () => {
    setBusy('download');
    try {
      const blob = await einvoiceOnboardingService.downloadContract(workspaceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `novus-contract-${data?.contract_number ?? 'draft'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: 'Could not download the contract', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }, [workspaceId, data?.contract_number, toast]);

  if (loading) {
    return <Card><CardContent className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }
  if (!data) return null;

  const sent = !!data.request_id;
  const overall = OVERALL[data.overall];
  const needsIdentity = data.prerequisites_missing.length > 0;

  return (
    <Card>
      <CardHeader className="border-b border-hairline px-5 py-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <FileSignature className="h-4 w-4" /> Register for e-invoicing
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Novus files a provider declaration with ΑΑΔΕ for your VAT number. Until that is done,
              this business cannot issue a legal invoice through us.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={overall.variant}>{overall.label}</Badge>
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy !== null}>
              <RefreshCw className={cn('h-3.5 w-3.5', busy === 'refresh' && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5">
        {sent && data.is_sandbox && (
          <p className="rounded-sm border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning-bg))] px-3 py-2 text-xs text-[hsl(var(--warning))]">
            This is a <strong>sandbox</strong> registration. It proves the flow works; it does not let
            this VAT issue a real document.
          </p>
        )}

        {data.warning && (
          <p className="rounded-sm border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning-bg))] px-3 py-2 text-xs text-[hsl(var(--warning))]">
            {data.warning}
          </p>
        )}

        {data.sync_error && (
          <p className="rounded-sm border border-[hsl(var(--error)/0.35)] bg-[hsl(var(--error-bg))] px-3 py-2 text-xs text-[hsl(var(--error))]">
            Could not reach Novus — the steps below are as of{' '}
            {data.last_synced_at ? formatDate(data.last_synced_at) : 'an earlier check'}. {data.sync_error}
          </p>
        )}

        {!sent && (
          <div className="rounded-sm border border-hairline p-4 space-y-4">
            <div className="text-sm font-medium">The application</div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="admin-name">Administrator — full name</Label>
                <Input
                  id="admin-name" value={draft.administrator_full_name}
                  onChange={(e) => setDraft({ ...draft, administrator_full_name: e.target.value })}
                  placeholder="The person who signs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-vat">Administrator — ΑΦΜ</Label>
                <Input
                  id="admin-vat" value={draft.administrator_vat} inputMode="numeric"
                  onChange={(e) => setDraft({ ...draft, administrator_vat: e.target.value })}
                  placeholder="Their own, not the company's"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>What this business issues</Label>
              <div className="flex gap-4">
                {(['B2B', 'B2C'] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={draft.transaction_types.includes(t)}
                      onCheckedChange={(v) => {
                        const next = v
                          ? [...draft.transaction_types, t]
                          : draft.transaction_types.filter((x) => x !== t);
                        if (!next.length) {
                          toast({ title: 'Pick at least one', description: 'Novus needs to know whether this business invoices businesses, consumers, or both.' });
                          return;
                        }
                        setDraft({ ...draft, transaction_types: next });
                      }}
                    />
                    {t === 'B2B' ? 'Invoices to businesses (B2B)' : 'Receipts to consumers (B2C)'}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                B2G is a separate arrangement and is not handled here.
              </p>
            </div>

            {draft.transaction_types.includes('B2C') && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="isp-name">Internet provider</Label>
                  <Input id="isp-name" value={draft.isp_provider_name}
                    onChange={(e) => setDraft({ ...draft, isp_provider_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="isp-num">Their contract number</Label>
                  <Input id="isp-num" value={draft.isp_contract_number}
                    onChange={(e) => setDraft({ ...draft, isp_contract_number: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="isp-date">Contract date</Label>
                  <Input id="isp-date" type="date" value={draft.isp_contract_date ?? ''}
                    onChange={(e) => setDraft({ ...draft, isp_contract_date: e.target.value || null })} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="outline" size="sm" disabled={busy !== null}
                onClick={() => void run('save', () => einvoiceOnboardingService.saveApplication(workspaceId, draft), 'Application saved')}
              >
                {busy === 'save' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Save
              </Button>
              <Button
                size="sm" disabled={busy !== null || needsIdentity}
                onClick={() => void run('create', () => einvoiceOnboardingService.create(workspaceId), 'Sent to Novus')}
              >
                {busy === 'create' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Send to Novus
              </Button>
              {needsIdentity && (
                <span className="text-xs text-muted-foreground">
                  Still needed: {data.prerequisites_missing.join(', ')}.
                  {onGoToIdentity && (
                    <button type="button" onClick={onGoToIdentity} className="ml-1 font-medium text-primary hover:underline">
                      Business Identity
                    </button>
                  )}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sending this creates a real contract at Novus with its own number. Send it once.
            </p>
          </div>
        )}

        <ol className="space-y-0">
          {data.steps.map((step, i) => (
            <StepRow
              key={step.key}
              step={step}
              last={i === data.steps.length - 1}
              busy={busy}
              onAck={(undo) => void run(
                `ack-${step.key}`,
                () => einvoiceOnboardingService.acknowledge(workspaceId, step.ack_action!, undo),
                undo ? 'Unmarked' : 'Marked done — we will keep checking with Novus',
              )}
              onDownload={
                step.key === 'contract_delivered' && sent && step.state !== 'not_applicable' && step.state !== 'blocked'
                  ? download : undefined
              }
              onUpload={step.key === 'contract_signed' && sent ? () => fileInput.current?.click() : undefined}
            />
          ))}
        </ol>

        <input
          ref={fileInput} type="file" accept="application/pdf" className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void run('upload', () => einvoiceOnboardingService.uploadSigned(workspaceId, file), 'Sent to Novus for review');
          }}
        />

        {sent && (
          <div className="border-t border-hairline pt-3">
            {history === null ? (
              <Button
                variant="ghost" size="sm" disabled={busy !== null}
                onClick={async () => {
                  setBusy('history');
                  try { setHistory(await einvoiceOnboardingService.history(workspaceId)); }
                  catch (err) { toast({ title: 'Could not load the history', description: (err as Error).message, variant: 'destructive' }); }
                  finally { setBusy(null); }
                }}
              >
                <History className="h-3.5 w-3.5 mr-1" /> What has happened so far
              </Button>
            ) : history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Novus has recorded no changes yet.</p>
            ) : (
              <ol className="space-y-1.5">
                {history.map((h, i) => (
                  <li key={`${h.occurredAt}-${i}`} className="text-xs flex gap-2">
                    <span className="text-muted-foreground tabular-nums shrink-0">{formatDate(h.occurredAt)}</span>
                    <span className="min-w-0">
                      <Badge variant="neutral">{ACTOR_LABEL[h.actor] ?? h.actor}</Badge>{' '}
                      {h.message || h.status}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {sent && data.overall !== 'active' && (
          <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
            <span className="text-[11px] text-muted-foreground">
              Request {data.request_id}
              {data.last_synced_at && ` · checked ${formatDate(data.last_synced_at)}`}
            </span>
            <Button
              variant="ghost" size="sm" disabled={busy !== null}
              onClick={() => void run('cancel', () => einvoiceOnboardingService.cancel(workspaceId), 'Application cancelled')}
            >
              Cancel the application
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const StepRow: React.FC<{
  step: EInvoiceOnboardingStep;
  last: boolean;
  busy: string | null;
  onAck: (undo: boolean) => void;
  onDownload?: () => void;
  onUpload?: () => void;
}> = ({ step, last, busy, onAck, onDownload, onUpload }) => {
  const look = STATE_LOOK[step.state];
  const Icon = look.icon;
  const acked = !!step.acknowledged_at;
  const dim = step.state === 'not_applicable' || step.state === 'blocked';

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <span className={cn('h-7 w-7 rounded-full grid place-items-center border', look.ring)}>
          <Icon className={cn('h-3.5 w-3.5', look.tone)} />
        </span>
        {!last && <span className="w-px flex-1 bg-[hsl(var(--hairline))] my-1" aria-hidden />}
      </div>

      <div className={cn('min-w-0 flex-1 pb-5', dim && 'opacity-60')}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{step.title}</span>
          <Badge variant={
            step.state === 'done' ? 'success'
              : step.state === 'failed' ? 'error'
                : step.state === 'todo' ? 'info'
                  : step.state === 'awaiting_confirmation' || step.state === 'waiting' ? 'warning'
                    : 'neutral'
          }>{look.label}</Badge>
          {step.manual && step.state !== 'not_applicable' && (
            <Badge variant="neutral">Manual · {ACTOR_LABEL[step.actor]}</Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-1 leading-snug">{step.detail}</p>
        {step.note && <p className="text-xs mt-1 leading-snug">{step.note}</p>}

        {step.substeps && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(step.substeps).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-sm border border-hairline px-2 py-0.5 text-[11px] text-muted-foreground">
                {v === 'DONE' ? <Check className="h-3 w-3 text-[hsl(var(--success))]" />
                  : v === 'FAILED' ? <XCircle className="h-3 w-3 text-[hsl(var(--error))]" />
                    : <Clock className="h-3 w-3" />}
                {k.replace(/([A-Z])/g, ' $1').toLowerCase()}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-2">
          {onDownload && (
            <Button variant="outline" size="sm" onClick={onDownload} disabled={busy !== null}>
              <Download className="h-3.5 w-3.5 mr-1" /> Download the contract
            </Button>
          )}
          {onUpload && step.state !== 'done' && step.state !== 'not_applicable' && (
            <Button variant="outline" size="sm" onClick={onUpload} disabled={busy !== null}>
              <Upload className="h-3.5 w-3.5 mr-1" /> Upload the signed PDF
            </Button>
          )}
          {step.ack_action && (
            <Button
              variant={acked ? 'ghost' : 'secondary'} size="sm"
              onClick={() => onAck(acked)} disabled={busy !== null}
            >
              {busy === `ack-${step.key}` ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <Check className="h-3.5 w-3.5 mr-1" />}
              {acked ? 'Not done after all' : 'Mark done'}
            </Button>
          )}
        </div>

        {acked && step.confirmed_by !== 'novus' && (
          <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Marked done here on {formatDate(step.acknowledged_at!)} — self-reported, not confirmed by Novus.
          </p>
        )}
      </div>
    </li>
  );
};
