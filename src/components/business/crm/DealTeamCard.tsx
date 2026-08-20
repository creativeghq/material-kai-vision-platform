/**
 * Deal team (#311 Phase 3) — who is working this deal, as a LABEL.
 *
 * Deliberately not a workspace role: being on a deal grants nothing. Functional roles live in
 * `workspace_members.role` and are the access boundary; this is "who to chase", and the RLS on
 * `crm_deal_members` inherits the deal's own visibility rather than restating it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { UserSearchDropdown } from '@/components/business/crm/UserSearchDropdown';
import { dealTeam, DEAL_TEAM_ROLES, type DealMember } from '@/services/dealsService';

const roleLabel = (v: string) => DEAL_TEAM_ROLES.find((r) => r.value === v)?.label ?? v;

export const DealTeamCard: React.FC<{ dealId: string; workspaceId: string | null }> = ({ dealId }) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<DealMember[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setMembers(await dealTeam.list(dealId).catch(() => []));
  }, [dealId]);
  useEffect(() => { void load(); }, [load]);

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/60 px-5 py-3">
        <CardTitle className="text-base">Deal team</CardTitle>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setAdding((v) => !v)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 p-4">
        {adding && (
          <UserSearchDropdown
            onSelect={(userId) => { setAdding(false); void guard(() => dealTeam.add(dealId, userId)); }}
            placeholder="Add a workspace member…"
            excludeUserIds={(members ?? []).map((m) => m.user_id)}
          />
        )}

        {members === null ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          : members.length === 0 ? <p className="text-xs text-muted-foreground">Nobody assigned yet.</p>
          : members.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{m.full_name || m.email || 'Member'}</span>
              <Select value={m.role} onValueChange={(v) => guard(() => dealTeam.setRole(m.id, v))}>
                <SelectTrigger className="h-7 w-[150px] text-[11px]" aria-label={`Role for ${m.full_name || m.email || 'member'}`}>
                  <SelectValue>{roleLabel(m.role)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DEAL_TEAM_ROLES.map((r) => <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <button
                type="button" disabled={busy} onClick={() => guard(() => dealTeam.remove(m.id))}
                aria-label={`Remove ${m.full_name || m.email || 'member'} from the deal`}
                className="text-muted-foreground hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
      </CardContent>
    </Card>
  );
};
