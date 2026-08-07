import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { useToast } from '@/hooks/use-toast';
import { realEstateService, KYC_TYPE_LABELS, type KycStatus, type KycCheck } from '../services/realEstateService';
import { statusTone } from '@/utils/statusTone';

/**
 * The AML/KYC verdicts held against one buyer, and what is still missing before their offer can be
 * accepted.
 *
 * Accepting an offer is the module's point of no return — it rejects every competing offer, moves
 * the listing to under_offer and cancels its future viewings. `accept-offer` refuses with a 422 and
 * a list of the missing checks when the workspace has the gate on, so this panel exists to make that
 * list actionable rather than a surprise at the worst moment.
 *
 * Recording a verdict is broker-only: an agent signing off their own buyer is the conflict of
 * interest the check exists to manage. The API enforces it; this hides the buttons.
 */
export const KycPanel: React.FC<{ ws: string | null; contactId: string | null; canManage: boolean }> = ({ ws, contactId, canManage }) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [checks, setChecks] = useState<KycCheck[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ws) return;
    try { const r = await realEstateService.kycStatus(ws, contactId); setStatus(r.status); setChecks(r.checks); }
    catch { setStatus(null); }
  }, [ws, contactId]);
  useEffect(() => { void load(); }, [load]);

  const record = async (checkType: string, verdict: 'passed' | 'failed' | 'waived') => {
    if (!ws || !contactId) return;
    setBusy(checkType);
    try { await realEstateService.upsertKycCheck(ws, { contact_id: contactId, check_type: checkType, status: verdict }); await load(); }
    catch (e) { toast({ title: 'Could not record', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  // The gate being off is the default, and a panel that shouts about compliance nobody enabled is
  // noise — stay silent unless there is something recorded to show.
  if (!status || (!status.required && checks.length === 0)) return null;

  const byType = new Map<string, KycCheck>(checks.map((c) => [c.check_type as string, c]));
  const types = Array.from(new Set([...Object.keys(KYC_TYPE_LABELS).filter((t) => status.missing.includes(t)), ...checks.map((c) => c.check_type)]));

  return (
    <Card>
      <CardHeader className="space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {status.satisfied
            ? <><ShieldCheck className="h-4 w-4 text-emerald-500" /> AML checks complete</>
            : <><ShieldAlert className="h-4 w-4 text-amber-500" /> AML checks outstanding</>}
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          {status.required
            ? status.satisfied
              ? 'This buyer can proceed to an accepted offer.'
              : `An offer cannot be accepted until: ${status.missing.map((m) => KYC_TYPE_LABELS[m] ?? m).join(', ')}.`
            : 'Recorded for the file — the offer gate is off for this workspace.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {!contactId && <p className="text-sm text-muted-foreground">Link a buyer contact to this offer — AML checks are recorded against the contact.</p>}
        {types.map((t) => {
          const c = byType.get(t);
          const expired = !!c?.expires_at && new Date(c.expires_at) < new Date();
          return (
            <div key={t} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <span className="font-medium">{KYC_TYPE_LABELS[t] ?? t}</span>
              <span className={`text-xs capitalize ${statusTone(expired ? 'expired' : (c?.status ?? 'pending'))}`}>
                {expired ? 'expired' : (c?.status ?? 'not recorded')}
              </span>
              {c?.expires_at && <span className="text-xs text-muted-foreground">expires {new Date(c.expires_at).toLocaleDateString()}</span>}
              {canManage && contactId && (
                <div className="ml-auto flex items-center gap-1">
                  {busy === t
                    ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    : <>
                        <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs" onClick={() => record(t, 'passed')}>Pass</Button>
                        <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs text-destructive" onClick={() => record(t, 'failed')}>Fail</Button>
                        <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs text-muted-foreground" onClick={() => record(t, 'waived')}>Waive</Button>
                      </>}
                </div>
              )}
            </div>
          );
        })}
        {canManage && <p className="text-[11px] text-muted-foreground">A waiver is recorded as a decision with your name on it — an audit needs to see who made it.</p>}
      </CardContent>
    </Card>
  );
};
