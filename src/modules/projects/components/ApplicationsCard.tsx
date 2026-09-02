/**
 * Applications for payment.
 *
 * The table shows the CLAIM and the ANSWER side by side, because the gap between them is the
 * number a contractor chases and a single "amount" column hides it entirely.
 *
 * Every figure except those two is derived by `get_project_applications` — retention this
 * application, retention held to date, previously certified, net due, variance. None of it is
 * recomputed here: an application is cumulative, so the payment due is the difference from what
 * was certified before it, and a second implementation of that subtraction is how the same money
 * ends up with two answers.
 *
 * The last column says whether a claim has become a fiscal document yet. That transition is the
 * one open question on this feature and it is deliberately visible rather than implied.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Receipt, Trash2, Check } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { humanizeLabel } from '@/utils/humanize';
import { formatMoney } from '@/utils/decimal';
import { formatDate, todayLocalISO } from '@/utils/datetime';
import {
  applicationsService, isApplicationSettled,
  type ApplicationRow, type ApplicationStatus, type RetentionTerms,
} from '../services/applicationsService';

interface Props {
  projectId: string;
  workspaceId: string | null;
  currency?: string;
  isOwner: boolean;
}

const n = (v: number | string | null | undefined) => Number(v ?? 0);

const statusVariant = (s: ApplicationStatus) =>
  s === 'paid' ? 'success'
    : s === 'disputed' ? 'error'
      : s === 'certified' ? 'info' : 'neutral';

export const ApplicationsCard: React.FC<Props> = ({ projectId, workspaceId, currency = 'EUR', isOwner }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [terms, setTerms] = useState<RetentionTerms | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [certifying, setCertifying] = useState<ApplicationRow | null>(null);

  const load = useCallback(async () => {
    try {
      const [derived, t] = await Promise.all([
        applicationsService.derived(projectId),
        applicationsService.getRetentionTerms(projectId).catch(() => null),
      ]);
      setRows(derived);
      setTerms(t);
    } catch (e) {
      toast({ title: 'Failed to load applications', description: (e as Error).message, variant: 'destructive' });
      setRows([]);
    }
  }, [projectId, toast]);

  useEffect(() => { void load(); }, [load]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); }
    catch (e) { toast({ title: label, description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const money = (v: number | string | null | undefined) => formatMoney(n(v), currency);

  /**
   * What is still owed. Certified counts as OUTSTANDING, not settled — a certified application has
   * been agreed and not paid, and that is precisely what a contractor is waiting on.
   */
  const summary = useMemo(() => {
    const list = rows ?? [];
    const latest = list[list.length - 1];
    return {
      certifiedToDate: list.reduce((s, r) => s + n(r.certified_amount), 0),
      retentionHeld: latest ? n(latest.retention_cumulative) : 0,
      outstanding: list
        .filter((r) => !isApplicationSettled(r.status))
        .reduce((s, r) => s + (r.certified_amount === null ? n(r.net_due) : n(r.certified_amount)), 0),
    };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-5 py-3">
        <div>
          <CardTitle>Applications for payment</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Cumulative valuations: each states the work done to date, and what is due is the
            difference from what was certified before it.
            {terms && terms.retention_percent > 0 && (
              <> Retention {n(terms.retention_percent)}%, capped at {n(terms.retention_cap_percent)}% of the contract.</>
            )}
          </p>
        </div>
        {isOwner && workspaceId && (
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)} disabled={busy}>
            <Plus className="h-3.5 w-3.5" /> Application
          </Button>
        )}
      </CardHeader>

      <CardContent className="px-0 py-0">
        {rows === null ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <HubEmptyState
            icon={Receipt}
            title="No applications yet"
            description="Raise a valuation for the work done to date. Retention is deducted automatically and the amount due is worked out from what has already been certified."
            action={isOwner && workspaceId
              ? <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" /> Raise one</Button>
              : undefined}
          />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                  <th className="px-5 py-2 text-left">Ref</th>
                  <th className="px-3 py-2 text-left">To</th>
                  <th className="px-3 py-2 text-right">Gross to date</th>
                  <th className="px-3 py-2 text-right">Retention</th>
                  <th className="px-3 py-2 text-right">Prev. certified</th>
                  <th className="px-3 py-2 text-right">Claimed</th>
                  <th className="px-3 py-2 text-right">Certified</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-5 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-5 py-2 font-mono text-xs tabular-nums text-muted-foreground">{r.reference}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(r.period_to)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.gross_valuation)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {money(r.retention_cumulative)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {money(r.previously_certified)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{money(r.net_due)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.certified_amount === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          {money(r.certified_amount)}
                          {/* The gap between claimed and certified. Shown only once there is an
                              answer to compare against — before that nobody has disagreed. */}
                          {n(r.variance) !== 0 && (
                            <span className={`ml-1 text-[11px] ${n(r.variance) < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>
                              {n(r.variance) > 0 ? '+' : ''}{money(r.variance)}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(r.status)}>{humanizeLabel(r.status)}</Badge>
                      {/* The fiscal boundary, said out loud. A claim is not a filed document. */}
                      {r.invoice_id && (
                        <span className="ml-1 text-[11px] text-muted-foreground">invoiced</span>
                      )}
                    </td>
                    <td className="px-5 py-2">
                      {isOwner && (
                        <div className="flex justify-end gap-1">
                          {r.certified_amount === null && (
                            <Button size="sm" variant="ghost" title="Record what was certified"
                              disabled={busy} onClick={() => setCertifying(r)}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {r.status === 'certified' && (
                            <Button size="sm" variant="ghost" title="Mark paid" disabled={busy}
                              onClick={() => void act('Could not update', () => applicationsService.setStatus(r.id, 'paid'))}>
                              <Receipt className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" title="Delete" disabled={busy}
                            onClick={() => void act('Could not delete', () => applicationsService.remove(r.id))}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border/60 px-5 py-3 text-xs">
            <span className="text-muted-foreground">
              Certified to date <span className="font-medium tabular-nums text-foreground">{money(summary.certifiedToDate)}</span>
            </span>
            <span className="text-muted-foreground">
              Retention held <span className="font-medium tabular-nums text-foreground">{money(summary.retentionHeld)}</span>
            </span>
            <span className="text-muted-foreground">
              Outstanding <span className="font-medium tabular-nums text-foreground">{money(summary.outstanding)}</span>
            </span>
            {terms?.practical_completion_on && (
              <span className="text-muted-foreground">
                Half the retention releases at practical completion ({formatDate(terms.practical_completion_on)}),
                the rest {n(terms.defects_period_months)} months later.
              </span>
            )}
          </div>
        )}
      </CardContent>

      {creating && workspaceId && (
        <NewApplicationDialog
          projectId={projectId} workspaceId={workspaceId} currency={currency}
          lastGross={rows && rows.length ? n(rows[rows.length - 1].gross_valuation) : 0}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); void load(); }}
        />
      )}

      {certifying && (
        <CertifyDialog
          row={certifying} currency={currency}
          onClose={() => setCertifying(null)}
          onSaved={() => { setCertifying(null); void load(); }}
        />
      )}
    </Card>
  );
};

const NewApplicationDialog: React.FC<{
  projectId: string; workspaceId: string; currency: string; lastGross: number;
  onClose: () => void; onSaved: () => void;
}> = ({ projectId, workspaceId, currency, lastGross, onClose, onSaved }) => {
  const { toast } = useToast();
  const [periodTo, setPeriodTo] = useState(todayLocalISO());
  const [gross, setGross] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amount = Number(gross);
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ title: 'Give the cumulative value', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await applicationsService.create({
        workspace_id: workspaceId,
        project_id: projectId,
        period_to: periodTo,
        gross_valuation: amount,
        currency,
        due_on: dueOn || null,
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Could not raise the application', description: (e as Error).message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New application</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Valued to</Label>
            <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cumulative value of work done ({currency})</Label>
            <Input inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="0.00" />
            <p className="text-[11px] text-muted-foreground">
              Everything done to date, not just this period — retention and what has already been
              certified are taken off automatically.
              {lastGross > 0 && <> The last application was valued at {formatMoney(lastGross, currency)}.</>}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payment due by</Label>
            <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Raise'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const CertifyDialog: React.FC<{
  row: ApplicationRow; currency: string; onClose: () => void; onSaved: () => void;
}> = ({ row, currency, onClose, onSaved }) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState(String(n(row.net_due)));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      toast({ title: 'Give the certified amount', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Amount and status move together: the DB refuses a certified application with no amount.
      await applicationsService.certify(row.id, value);
      onSaved();
    } catch (e) {
      toast({ title: 'Could not record it', description: (e as Error).message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Certified amount — {row.reference}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Certified ({currency})</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              We claimed {formatMoney(n(row.net_due), currency)}. Enter what the payer actually
              certified — the difference is recorded, not hidden.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Record'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
