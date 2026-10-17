/**
 * The customer's own account, and the people they may let into it (#441).
 *
 * The piece bespoke apps miss is the delegated admin: the builder's office manager adds and caps
 * her own site foremen without phoning us. We open the account and set the policy; who may buy what
 * is then theirs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Users, Link2, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { WorkPanelError, WorkPanelForm, WorkPanelHeader, WorkPanelLoading } from './WorkPanelHeader';
import {
  tradePortalService, ROLE_LABEL, VISIBILITY_LABEL, isUncapped,
  PASSWORDLESS_IS_THE_POINT, DRAFT_UNTIL_WE_CONFIRM, bandsAreEnough,
  type PortalAccount, type PortalUserRow, type PortalRole, type StockVisibility,
} from '@/modules/crm/services/tradePortalService';

const ROLES: PortalRole[] = ['admin', 'buyer', 'viewer'];
const VISIBILITIES: StockVisibility[] = ['hidden', 'bands', 'exact'];

export const TradePortalCard: React.FC<{ workspaceId: string; companyId: string }> = ({
  workspaceId, companyId,
}) => {
  const { toast } = useToast();
  const [account, setAccount] = useState<PortalAccount | null>(null);
  const [users, setUsers] = useState<PortalUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState({ email: '', name: '', role: 'buyer' as PortalRole, cap: '' });

  const load = useCallback(async () => {
    if (!workspaceId || !companyId) return;
    setLoading(true);
    try {
      const a = await tradePortalService.account(workspaceId, companyId);
      setAccount(a);
      setUsers(a ? await tradePortalService.users(a.id) : []);
      setFailed(false);
    } catch {
      setAccount(null); setUsers([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId, companyId]);

  useEffect(() => { void load(); }, [load]);

  const guard = async (fn: () => Promise<unknown>, title: string) => {
    setBusy(true);
    try { await fn(); await load(); } catch (err: unknown) {
      toast({
        title, description: err instanceof Error ? err.message : String(err), variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const mint = async (portalUserId: string) => {
    setBusy(true);
    try {
      const res = await tradePortalService.mintLink(portalUserId);
      const url = `${window.location.origin}/trade/${res.token}`;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast({
        title: 'Link copied',
        description: `Valid until ${res.expires_at.slice(0, 10)}. ${PASSWORDLESS_IS_THE_POINT}`,
      });
    } catch (err: unknown) {
      toast({
        title: 'Could not mint the link',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const openForm = () => setFormOpen(true);

  return (
    <Card>
      <WorkPanelHeader
        icon={Users}
        title="Trade portal"
        description="Their statement, prices and stock. We set the policy; their administrator decides who may buy and up to how much."
        action={!loading && !failed && account && users.length > 0 && !formOpen && (
          <Button size="sm" variant="outline" onClick={openForm}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add person
          </Button>
        )}
      />

      <CardContent className="p-0">
        {loading && <WorkPanelLoading />}

        {!loading && failed && (
          <WorkPanelError>
            The portal account could not be read just now. That is not a statement that they have
            none.
          </WorkPanelError>
        )}

        {!loading && !failed && !account && (
          <HubEmptyState
            icon={Users}
            title="No portal account"
            description="A trade customer cannot see their own account until one exists. Opening it costs them nothing and saves the phone call about an invoice."
            action={(
              <Button
                size="sm" disabled={busy}
                onClick={() => guard(
                  () => tradePortalService.openAccount(workspaceId, companyId),
                  'Could not open the account',
                )}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Open the account
              </Button>
            )}
          />
        )}

        {!loading && !failed && account && (
          <>
            {formOpen && (
              <WorkPanelForm>
                <div>
                  <Label htmlFor="tp-email">Email</Label>
                  <Input id="tp-email" className="mt-1 h-8 w-52 text-xs" value={draft.email}
                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="tp-name">Name</Label>
                  <Input id="tp-name" className="mt-1 h-8 w-40 text-xs" value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="tp-role">Role</Label>
                  <Select value={draft.role} onValueChange={(v) => setDraft((d) => ({ ...d, role: v as PortalRole }))}>
                    <SelectTrigger id="tp-role" className="mt-1 h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tp-cap">Cap per order</Label>
                  <Input id="tp-cap" type="number" min="0" className="mt-1 h-8 w-28 text-xs"
                    placeholder="uncapped" value={draft.cap}
                    onChange={(e) => setDraft((d) => ({ ...d, cap: e.target.value }))} />
                </div>
                <Button
                  size="sm" disabled={busy || !draft.email.trim()}
                  onClick={() => guard(async () => {
                    await tradePortalService.addUser({
                      accountId: account.id,
                      email: draft.email.trim(),
                      displayName: draft.name || null,
                      role: draft.role,
                      spendLimit: draft.cap === '' ? null : Number(draft.cap),
                    });
                    setDraft({ email: '', name: '', role: 'buyer', cap: '' });
                    setFormOpen(false);
                  }, 'Could not add the person')}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</Button>
              </WorkPanelForm>
            )}

            <div className="flex flex-wrap items-end gap-3 border-b border-hairline px-5 py-3">
              <div>
                <Label htmlFor="tp-vis" className="text-xs">Stock they see</Label>
                <Select
                  value={account.stock_visibility}
                  disabled={busy}
                  onValueChange={(v) => guard(
                    () => tradePortalService.setPolicy(account.id, { stock_visibility: v as StockVisibility }),
                    'Could not change the policy',
                  )}
                >
                  <SelectTrigger id="tp-vis" className="mt-1 h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VISIBILITIES.map((v) => (
                      <SelectItem key={v} value={v}>{VISIBILITY_LABEL[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="tp-thr" className="text-xs">Approval above</Label>
                <Input
                  id="tp-thr" type="number" min="0" className="mt-1 h-8 w-28 text-xs"
                  defaultValue={account.approval_threshold ?? ''}
                  onBlur={(e) => guard(
                    () => tradePortalService.setPolicy(account.id, {
                      approval_threshold: e.target.value === '' ? null : Number(e.target.value),
                    }),
                    'Could not change the threshold',
                  )}
                />
              </div>
              <Badge variant={account.is_enabled ? 'success' : 'neutral'}>
                {account.is_enabled ? 'Open' : 'Closed'}
              </Badge>
              <div className="basis-full space-y-0.5 text-[11px] text-muted-foreground">
                <p>{bandsAreEnough}</p>
                <p>{DRAFT_UNTIL_WE_CONFIRM}</p>
              </div>
            </div>

            {users.length === 0 && !formOpen && (
              <HubEmptyState
                icon={Users}
                title="No one invited yet"
                description="Add their administrator first — they can then add and cap their own buyers."
                action={(
                  <Button size="sm" onClick={openForm}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add person
                  </Button>
                )}
              />
            )}

            {users.length > 0 && (
              <ul className="divide-y divide-hairline">
                {users.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{u.display_name || u.email}</div>
                      {u.display_name && <div className="truncate text-xs text-muted-foreground">{u.email}</div>}
                    </div>
                    <Select
                      value={u.role}
                      disabled={busy}
                      onValueChange={(v) => guard(
                        () => tradePortalService.setUserCap(u.id, v as PortalRole, u.spend_limit_per_order),
                        'Could not change the role',
                      )}
                    >
                      <SelectTrigger className="h-8 w-44 text-xs" aria-label={`Role of ${u.email}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">
                      {isUncapped(u) ? 'uncapped' : `cap ${u.spend_limit_per_order}`}
                    </span>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => mint(u.id)}>
                      <Link2 className="mr-1 h-3.5 w-3.5" /> Copy link
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
