/**
 * Is this supplier registered as a producer, and did anyone check? (#454)
 *
 * PPWR art. 19(2)(a) makes the check a PRECONDITION to making the packaging available, not an audit
 * item found afterwards. A number the supplier gave us is not a verification — the Greek register is
 * publicly queryable, so the difference between the two is one look.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, BadgeCheck, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  packagingEprService, supplierEprBlocksSale,
  type SupplierEprPosition, type SupplierEprRow,
} from '@/modules/finance/services/packagingEprService';

interface Props {
  workspaceId: string;
  companyId: string;
}

export const SupplierEprCard: React.FC<Props> = ({ workspaceId, companyId }) => {
  const { toast } = useToast();
  const [position, setPosition] = useState<SupplierEprPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ memberState: 'GR', number: '', url: '' });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setPosition(await packagingEprService.supplierPosition(workspaceId));
      setFailed(false);
    } catch {
      setPosition(null); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const mine: SupplierEprRow | undefined = position?.rows.find((r) => r.company_id === companyId);

  const save = async (verified: boolean) => {
    if (!draft.number.trim()) return;
    setBusy(true);
    try {
      await packagingEprService.recordSupplierRegistration({
        workspaceId, companyId,
        memberState: draft.memberState,
        registrationNumber: draft.number.trim(),
        registerUrl: draft.url || null,
        verified,
      });
      setDraft((d) => ({ ...d, number: '', url: '' }));
      await load();
      toast({
        title: verified ? 'Recorded as verified' : 'Recorded, not verified',
        description: verified
          ? 'The public register was checked.'
          : 'This is the number the supplier gave us. Art. 19(2)(a) asks for the register check.',
      });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the registration',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  if (!mine && !loading && !failed) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BadgeCheck className="h-4 w-4 text-primary" /> Packaging producer registration
        </CardTitle>
        <CardDescription>
          Before making their packaging available we must verify the producer is registered, per
          Member State. The register is public, so this is a look rather than a request.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2 text-xs">
        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the registrations…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The registrations could not be read just now. That is not a statement that this supplier
            is registered.
          </p>
        )}

        {!loading && !failed && mine && (
          <>
            {mine.registrations.length === 0 && (
              <p className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                No registration on file for {mine.name}.
              </p>
            )}
            {mine.registrations.map((r) => (
              <p key={r.member_state} className="flex flex-wrap items-center gap-2">
                <Badge variant={r.verified_at ? 'success' : 'warning'}>{r.member_state}</Badge>
                <span className="tabular-nums font-mono">{r.registration_number}</span>
                {r.verified_at
                  ? <span className="flex items-center gap-1 text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3" /> verified {r.verified_at.slice(0, 10)}
                    </span>
                  : <span className="text-amber-800 dark:text-amber-300">
                      not checked against the register
                    </span>}
              </p>
            ))}

            {position && supplierEprBlocksSale(position) && (
              <p className="text-[11px] text-muted-foreground">{position.reason}</p>
            )}

            <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
              <div>
                <Label htmlFor="epr-ms" className="text-[11px]">Member State</Label>
                <Input
                  id="epr-ms" className="mt-1 h-8 w-20 text-xs uppercase" maxLength={2}
                  value={draft.memberState}
                  onChange={(e) => setDraft((d) => ({ ...d, memberState: e.target.value.toUpperCase() }))}
                />
              </div>
              <div>
                <Label htmlFor="epr-num" className="text-[11px]">Registration number</Label>
                <Input
                  id="epr-num" className="mt-1 h-8 w-40 font-mono text-xs" value={draft.number}
                  onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="epr-url" className="text-[11px]">Register entry</Label>
                <Input
                  id="epr-url" className="mt-1 h-8 w-56 text-xs" placeholder="the public register URL"
                  value={draft.url}
                  onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                />
              </div>
              <Button size="sm" onClick={() => save(true)} disabled={busy || !draft.number.trim()}>
                <Save className="mr-1 h-3 w-3" /> Checked the register
              </Button>
              <Button size="sm" variant="outline" onClick={() => save(false)} disabled={busy || !draft.number.trim()}>
                Record unverified
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
