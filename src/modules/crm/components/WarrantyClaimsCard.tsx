/**
 * Callbacks and warranty claims for one customer (#437).
 *
 * Three money outcomes were booked identically as "a job". The cause decides which one this is,
 * and an undecided cause is UNKNOWN rather than ours — defaulting it to internal rework writes off
 * every supplier recovery in the pile.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, LifeBuoy, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import {
  warrantyClaimService, CAUSE_LABEL, OUTCOME_LABEL, WINDOW_LABEL, URGENCY_LABEL,
  CLAIM_STATUS_LABEL, causeIsDecided, outcomeIsUnknown, claimNeedsWork, isInsideWindow,
  RETROSPECTIVE_ATTACH,
  type WarrantyClaim, type ClaimPosition, type ClaimCause, type Urgency, type ClaimStatus,
} from '@/modules/crm/services/warrantyClaimService';
import { assetsService, type EmployeeOption } from '@/services/assetsService';

const CAUSES: ClaimCause[] = ['workmanship', 'product_failure', 'customer_change', 'undetermined'];
const URGENCIES: Urgency[] = ['low', 'normal', 'high', 'emergency'];
/** `assigned` is not offered: it is what assigning someone MEANS, and a status you can set without
 *  naming a fitter is a claim that looks handled and has nobody on it. */
const SETTABLE_STATUSES: ClaimStatus[] = ['reported', 'scheduled', 'resolved', 'rejected'];

export const WarrantyClaimsCard: React.FC<{ workspaceId: string; companyId: string }> = ({
  workspaceId, companyId,
}) => {
  const { toast } = useToast();
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [positions, setPositions] = useState<Record<string, ClaimPosition>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ description: '', urgency: 'normal' as Urgency, installedOn: '' });
  const [installers, setInstallers] = useState<EmployeeOption[]>([]);

  const load = useCallback(async () => {
    if (!workspaceId || !companyId) return;
    setLoading(true);
    try {
      const rows = await warrantyClaimService.listForCompany(workspaceId, companyId);
      setClaims(rows); setFailed(false);
      const entries = await Promise.all(rows.map(async (c) => [
        c.id, await warrantyClaimService.position(c.id).catch(() => null),
      ] as const));
      setPositions(Object.fromEntries(entries.filter((e) => e[1]) as [string, ClaimPosition][]));
    } catch {
      setClaims([]); setPositions({}); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId, companyId]);

  useEffect(() => { void load(); }, [load]);

  // Who can be sent. An empty list leaves the picker saying so rather than offering nobody.
  useEffect(() => {
    let live = true;
    if (!workspaceId) return;
    assetsService.listEmployees(workspaceId)
      .then((rows) => { if (live) setInstallers(rows); })
      .catch(() => { if (live) setInstallers([]); });
    return () => { live = false; };
  }, [workspaceId]);

  const guard = async (fn: () => Promise<unknown>, title: string) => {
    setBusy(true);
    try { await fn(); await load(); } catch (err: unknown) {
      toast({
        title, description: err instanceof Error ? err.message : String(err), variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const create = () => guard(async () => {
    if (!draft.description.trim()) return;
    await warrantyClaimService.create({
      workspaceId,
      customerCompanyId: companyId,
      description: draft.description.trim(),
      urgency: draft.urgency,
      installedOn: draft.installedOn || null,
    });
    setDraft({ description: '', urgency: 'normal', installedOn: '' });
  }, 'Could not raise the claim');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LifeBuoy className="h-4 w-4 text-primary" /> Callbacks and warranty claims
        </CardTitle>
        <CardDescription>
          Our workmanship, a failed product, or a change of mind — three different money outcomes.
          {' '}{RETROSPECTIVE_ATTACH}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the claims…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The claims could not be read just now. That is not a statement that none are open.
          </p>
        )}

        {!loading && !failed && claims.length === 0 && (
          <HubEmptyState
            title="No callbacks on record"
            description="A post-install defect is one of three things, and today it lives in WhatsApp. Raising it here is what tells them apart later."
          />
        )}

        {!loading && !failed && claims.map((c) => {
          const p = positions[c.id] ?? null;
          return (
            <div
              key={c.id}
              className={`space-y-1 rounded-md border p-2 ${
                claimNeedsWork(p)
                  ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                  : 'border-hairline bg-surface-sunken text-muted-foreground'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {claimNeedsWork(p)
                  ? <AlertTriangle className="h-3.5 w-3.5" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                <span className="font-medium">{c.description}</span>
                <Badge variant="neutral">{CLAIM_STATUS_LABEL[c.status]}</Badge>
                <Badge variant={c.urgency === 'emergency' ? 'error' : 'neutral'}>
                  {URGENCY_LABEL[c.urgency]}
                </Badge>
                <span className="tabular-nums">reported {formatDate(c.reported_on)}</span>
                {p && (
                  <Badge variant={isInsideWindow(p.callback_window) ? 'info' : 'neutral'}>
                    {WINDOW_LABEL[p.callback_window]}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={c.cause ?? 'none'}
                  disabled={busy}
                  onValueChange={(v) => v !== 'none' && guard(
                    () => warrantyClaimService.setCause(c.id, v as ClaimCause),
                    'Could not record the cause',
                  )}
                >
                  <SelectTrigger className="h-8 w-56 text-xs" aria-label={`Cause of ${c.description}`}>
                    <SelectValue placeholder="Cause not decided" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Cause not decided</SelectItem>
                    {CAUSES.map((k) => <SelectItem key={k} value={k}>{CAUSE_LABEL[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
                {p && (
                  <Badge variant={outcomeIsUnknown(p) ? 'warning' : 'success'}>
                    {OUTCOME_LABEL[p.money_outcome]}
                  </Badge>
                )}
                {!causeIsDecided(c.cause) && (
                  <span>Not ours by default — that is what writes off the supplier recoveries.</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={c.installer_employee_id ?? 'none'}
                  disabled={busy || installers.length === 0}
                  onValueChange={(v) => v !== 'none' && guard(
                    () => warrantyClaimService.assign(c.id, { installerEmployeeId: v }),
                    'Could not assign the callback',
                  )}
                >
                  <SelectTrigger className="h-8 w-56 text-xs" aria-label={`Fitter for ${c.description}`}>
                    <SelectValue placeholder={installers.length === 0 ? 'No one to assign yet' : 'Not assigned'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Not assigned</SelectItem>
                    {installers.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select
                  value={c.status}
                  disabled={busy}
                  onValueChange={(v) => guard(
                    () => warrantyClaimService.setStatus(c.id, v as ClaimStatus),
                    'Could not change the status',
                  )}
                >
                  <SelectTrigger className="h-8 w-40 text-xs" aria-label={`Status of ${c.description}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {c.status === 'assigned' && (
                      <SelectItem value="assigned" disabled>{CLAIM_STATUS_LABEL.assigned}</SelectItem>
                    )}
                    {SETTABLE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{CLAIM_STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {p && <p>{p.reason}</p>}
              {p && p.missing.length > 0 && (
                <p>Still needs: {p.missing.join(', ')}.</p>
              )}
            </div>
          );
        })}

        {!loading && !failed && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
            <div>
              <Label htmlFor="wc-desc" className="text-[11px]">What happened</Label>
              <Input id="wc-desc" className="mt-1 h-8 w-64 text-xs" value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="wc-urg" className="text-[11px]">Urgency</Label>
              <Select value={draft.urgency} onValueChange={(v) => setDraft((d) => ({ ...d, urgency: v as Urgency }))}>
                <SelectTrigger id="wc-urg" className="mt-1 h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {URGENCIES.map((u) => <SelectItem key={u} value={u}>{URGENCY_LABEL[u]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="wc-installed" className="text-[11px]">Installed on</Label>
              <Input id="wc-installed" type="date" className="mt-1 h-8 w-40 text-xs" value={draft.installedOn}
                onChange={(e) => setDraft((d) => ({ ...d, installedOn: e.target.value }))} />
            </div>
            <Button size="sm" onClick={create} disabled={busy || !draft.description.trim()}>
              <Plus className="mr-1 h-3 w-3" /> Raise a claim
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
