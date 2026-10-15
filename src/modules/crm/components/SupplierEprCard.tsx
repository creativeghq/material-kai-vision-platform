/**
 * Is this supplier registered as a producer, and did anyone check? (#454)
 *
 * PPWR art. 19(2)(a) makes the check a PRECONDITION to making the packaging available, not an audit
 * item found afterwards. A number the supplier gave us is not a verification — the Greek register is
 * publicly queryable, so the difference between the two is one look.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, BadgeCheck, Save, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { WorkPanelError, WorkPanelForm, WorkPanelHeader, WorkPanelLoading } from './WorkPanelHeader';
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
  const [formOpen, setFormOpen] = useState(false);

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
      setFormOpen(false);
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

  const registrations = mine?.registrations ?? [];
  const openForm = () => setFormOpen(true);

  return (
    <Card>
      <WorkPanelHeader
        icon={BadgeCheck}
        title="Packaging producer registration"
        description="Their producer registration per Member State, checked against the public register before we sell their packaging on."
        action={!formOpen && !loading && !failed && registrations.length > 0 && (
          <Button size="sm" variant="outline" onClick={openForm}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Record registration
          </Button>
        )}
      />

      <CardContent className="p-0">
        {loading && <WorkPanelLoading />}

        {!loading && failed && (
          <WorkPanelError>
            The registrations could not be read just now. That is not a statement that this supplier
            is registered.
          </WorkPanelError>
        )}

        {!loading && !failed && formOpen && (
          <WorkPanelForm>
            <div>
              <Label htmlFor="epr-ms">Member State</Label>
              <Input
                id="epr-ms" className="mt-1 h-8 w-20 text-xs uppercase" maxLength={2}
                value={draft.memberState}
                onChange={(e) => setDraft((d) => ({ ...d, memberState: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <Label htmlFor="epr-num">Registration number</Label>
              <Input
                id="epr-num" className="mt-1 h-8 w-40 font-mono text-xs" value={draft.number}
                onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="epr-url">Register entry</Label>
              <Input
                id="epr-url" className="mt-1 h-8 w-56 text-xs" placeholder="the public register URL"
                value={draft.url}
                onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
              />
            </div>
            <Button size="sm" onClick={() => save(true)} disabled={busy || !draft.number.trim()}>
              <Save className="mr-1 h-3.5 w-3.5" /> Checked the register
            </Button>
            <Button size="sm" variant="outline" onClick={() => save(false)} disabled={busy || !draft.number.trim()}>
              Record unverified
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</Button>
          </WorkPanelForm>
        )}

        {!loading && !failed && registrations.length === 0 && !formOpen && (
          <HubEmptyState
            icon={BadgeCheck}
            title="No registration on file"
            description="If this supplier puts packaging on the market, record their producer number and check it against the public register — a number they gave us is not a verification."
            action={(
              <Button size="sm" onClick={openForm}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Record registration
              </Button>
            )}
          />
        )}

        {!loading && !failed && registrations.length > 0 && (
          <ul className="divide-y divide-hairline">
            {registrations.map((r) => (
              <li key={r.member_state} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <Badge variant={r.verified_at ? 'success' : 'warning'}>{r.member_state}</Badge>
                <span className="font-mono tabular-nums">{r.registration_number}</span>
                {r.verified_at
                  ? <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5" /> verified {r.verified_at.slice(0, 10)}
                    </span>
                  : <span className="text-xs text-amber-800 dark:text-amber-300">
                      not checked against the register
                    </span>}
              </li>
            ))}
          </ul>
        )}

        {!loading && !failed && mine && position && supplierEprBlocksSale(position) && (
          <p className="border-t border-hairline px-5 py-2.5 text-xs text-muted-foreground">{position.reason}</p>
        )}
      </CardContent>
    </Card>
  );
};
