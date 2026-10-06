import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, Loader2, UserCheck, UserMinus, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchDisplayProfiles } from '@/services/displayProfilesService';
import { UserAvatar } from '@/components/core/ui/UserAvatar';
import { Button } from '@/components/core/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { inboxApi } from '@/services/inboxApi';

export interface Teammate { user_id: string; label: string; avatarUrl: string | null }

/** Active members who can own a conversation. `client` is a portal role, never an assignee (the server refuses it too). */
export function useTeammates(workspaceId: string | null | undefined): Teammate[] {
  const [rows, setRows] = useState<Teammate[]>([]);
  useEffect(() => {
    if (!workspaceId) { setRows([]); return; }
    let live = true;
    void (async () => {
      const { data, error } = await supabase.from('workspace_members')
        .select('user_id, role, status').eq('workspace_id', workspaceId).eq('status', 'active');
      if (error || !live) return;
      const ids = ((data ?? []) as Array<{ user_id: string; role: string | null }>)
        .filter((m) => m.role !== 'client').map((m) => m.user_id);
      const profs = ids.length ? await fetchDisplayProfiles(ids) : [];
      const byId = new Map(profs.map((p) => [p.userId, p]));
      if (!live) return;
      setRows(ids
        .map((id) => ({ user_id: id, label: byId.get(id)?.fullName || byId.get(id)?.email || id.slice(0, 8), avatarUrl: byId.get(id)?.avatarUrl ?? null }))
        .sort((a, b) => a.label.localeCompare(b.label)));
    })();
    return () => { live = false; };
  }, [workspaceId]);
  return rows;
}

export async function assignThread(
  threadId: string,
  userId: string | null,
  toast: ReturnType<typeof useToast>['toast'],
): Promise<boolean> {
  try {
    await inboxApi.setAssignee(threadId, userId);
    return true;
  } catch (e) {
    toast({ title: 'Could not assign', description: (e as Error).message, variant: 'destructive' });
    return false;
  }
}

export const AssigneePicker: React.FC<{
  threadId: string;
  workspaceId: string;
  assignedUserId: string | null | undefined;
  myUserId: string | null;
  onAssigned: (userId: string | null) => void;
}> = ({ threadId, workspaceId, assignedUserId, myUserId, onAssigned }) => {
  const { toast } = useToast();
  const teammates = useTeammates(workspaceId);
  const [busy, setBusy] = useState(false);
  const current = teammates.find((t) => t.user_id === assignedUserId) ?? null;

  const pick = async (userId: string | null) => {
    if (userId === (assignedUserId ?? null)) return;
    setBusy(true);
    const ok = await assignThread(threadId, userId, toast);
    setBusy(false);
    if (ok) onAssigned(userId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 px-2.5 max-w-[11rem]" title={current ? `Assigned to ${current.label}` : 'Nobody owns this conversation yet'}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" />
            : assignedUserId ? <UserAvatar userId={assignedUserId} name={current?.label} avatarUrl={current?.avatarUrl} className="h-5 w-5" />
              : <UserRound className="w-4 h-4 text-muted-foreground" />}
          <span className="truncate text-xs">{assignedUserId ? (current?.label ?? 'Assigned') : 'Assign'}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {myUserId && assignedUserId !== myUserId && (
          <DropdownMenuItem onSelect={() => { void pick(myUserId); }}>
            <UserCheck className="w-4 h-4 mr-2" /> Assign to me
          </DropdownMenuItem>
        )}
        {assignedUserId && (
          <DropdownMenuItem onSelect={() => { void pick(null); }}>
            <UserMinus className="w-4 h-4 mr-2" /> Unassign
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground">Team</DropdownMenuLabel>
        <div className="max-h-64 overflow-y-auto">
          {teammates.map((t) => (
            <DropdownMenuItem key={t.user_id} onSelect={() => { void pick(t.user_id); }}>
              <UserAvatar userId={t.user_id} name={t.label} avatarUrl={t.avatarUrl} className="h-5 w-5 mr-2" />
              <span className="flex-1 truncate">{t.label}{t.user_id === myUserId ? ' (you)' : ''}</span>
              {t.user_id === assignedUserId && <Check className="w-3.5 h-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
          {teammates.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading the team…</div>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
