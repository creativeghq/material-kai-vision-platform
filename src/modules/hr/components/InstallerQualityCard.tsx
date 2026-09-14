/**
 * Rework rate per fitter, and the documents that expire (#437).
 *
 * A rework rate is only true if every claim is attached to the job it came from, so a workspace
 * with unattributed claims reports a rate that is LOWER than the real one and says so. And a
 * certificate with no expiry date is not valid forever — it is one nobody dated.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, ShieldCheck, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import {
  warrantyClaimService, reworkRateIsTrustworthy, certificationState, CERTIFICATION_STATE_LABEL,
  type ReworkRate, type WorkerCertification,
} from '@/modules/crm/services/warrantyClaimService';

export const InstallerQualityCard: React.FC<{ workspaceId: string; canManage?: boolean }> = ({
  workspaceId, canManage = true,
}) => {
  const { toast } = useToast();
  const [rate, setRate] = useState<ReworkRate | null>(null);
  const [certs, setCerts] = useState<WorkerCertification[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ kind: '', reference: '', expiresOn: '' });
  const today = todayLocalISO();

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        warrantyClaimService.reworkRate(workspaceId),
        warrantyClaimService.certifications(workspaceId),
      ]);
      setRate(r); setCerts(c); setFailed(false);
    } catch {
      setRate(null); setCerts([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft.kind.trim()) return;
    setBusy(true);
    try {
      await warrantyClaimService.saveCertification({
        workspaceId,
        kind: draft.kind.trim(),
        reference: draft.reference || null,
        expiresOn: draft.expiresOn || null,
      });
      setDraft({ kind: '', reference: '', expiresOn: '' });
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not record the certificate',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" /> Rework and certification
        </CardTitle>
        <CardDescription>
          What went back, who it went back to, and which documents are about to lapse. The two that
          stop a Greek site are the ασφαλιστική and the φορολογική ενημερότητα.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the numbers…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This could not be read just now. That is not a statement that nothing went back.
          </p>
        )}

        {!loading && !failed && rate && (
          <>
            <div
              className={`space-y-1 rounded-md border p-2 ${
                reworkRateIsTrustworthy(rate)
                  ? 'border-hairline bg-surface-sunken text-muted-foreground'
                  : 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {reworkRateIsTrustworthy(rate)
                  ? <CheckCircle2 className="h-3.5 w-3.5" />
                  : <AlertTriangle className="h-3.5 w-3.5" />}
                <span className="tabular-nums">{rate.from} → {rate.to}</span>
                {rate.unattributed_workmanship_claims > 0 && (
                  <Badge variant="warning">
                    {rate.unattributed_workmanship_claims} unattributed
                  </Badge>
                )}
              </div>
              <p>{rate.reason}</p>
            </div>

            {rate.rows.length > 0 && (
              <div className="table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fitter</TableHead>
                      <TableHead className="text-right">Claims</TableHead>
                      <TableHead className="text-right">Ours</TableHead>
                      <TableHead className="text-right">Rework hrs</TableHead>
                      <TableHead className="text-right">Supplier</TableHead>
                      <TableHead className="text-right">Chargeable</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rate.rows.map((r) => (
                      <TableRow key={r.installer_employee_id}>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.claims}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.workmanship_claims}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.rework_hours}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.supplier_claims}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.chargeable_claims}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {certs.length === 0 && (
              <HubEmptyState
                title="No certificate on file"
                description="Insurance, ασφαλιστική and φορολογική ενημερότητα all expire on a date somebody has to watch — and no field-service product tracks it."
              />
            )}

            {certs.map((c) => {
              const state = certificationState(c, today);
              return (
                <p key={c.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant={state === 'expired' ? 'error' : state === 'valid' ? 'success' : 'warning'}>
                    {CERTIFICATION_STATE_LABEL[state]}
                  </Badge>
                  <span className="font-medium">{c.kind}</span>
                  {c.reference && <span className="text-muted-foreground">{c.reference}</span>}
                  <span className="tabular-nums text-muted-foreground">
                    {c.expires_on ? `expires ${c.expires_on}` : 'no expiry recorded'}
                  </span>
                </p>
              );
            })}

            {canManage && (
              <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
                <div>
                  <Label htmlFor="cert-kind" className="text-[11px]">Document</Label>
                  <Input id="cert-kind" className="mt-1 h-8 w-52 text-xs" value={draft.kind}
                    placeholder="e.g. ασφαλιστική ενημερότητα"
                    onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="cert-ref" className="text-[11px]">Reference</Label>
                  <Input id="cert-ref" className="mt-1 h-8 w-40 text-xs" value={draft.reference}
                    onChange={(e) => setDraft((d) => ({ ...d, reference: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="cert-exp" className="text-[11px]">Expires</Label>
                  <Input id="cert-exp" type="date" className="mt-1 h-8 w-40 text-xs" value={draft.expiresOn}
                    onChange={(e) => setDraft((d) => ({ ...d, expiresOn: e.target.value }))} />
                </div>
                <Button size="sm" onClick={save} disabled={busy || !draft.kind.trim()}>
                  <Save className="mr-1 h-3 w-3" /> Record
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
