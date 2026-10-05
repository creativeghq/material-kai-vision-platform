import React, { useEffect, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchDisplayProfiles } from '@/services/displayProfilesService';
import { UserAvatar } from '@/components/core/ui/UserAvatar';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { inboxApi, type InboxThread } from '@/services/inboxApi';
import { avatarTint } from '../inboxFormat';
import { WorkspaceMemberOption } from './InboxPrimitives';

export const AddParticipantDialog: React.FC<{ thread: InboxThread; onClose: () => void; onAdded: () => void }> = ({ thread, onClose, onAdded }) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: mem } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', thread.workspace_id);
      const ids = (mem || []).map((r: { user_id: string }) => r.user_id);
      if (ids.length === 0) return;
      const profs = await fetchDisplayProfiles(ids);
      const byId = new Map(profs.map((p) => [p.userId, p]));
      setMembers(ids.map((id) => ({
        user_id: id,
        label: byId.get(id)?.fullName || byId.get(id)?.email || id.slice(0, 8),
      })));
    })();
  }, [thread.workspace_id]);

  const add = async (user_id: string) => {
    setBusy(user_id);
    try {
      await inboxApi.addParticipant({ thread_id: thread.id, type: 'member', user_id });
      onAdded();
    } catch (e) {
      toast({ title: 'Could not add', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Teammate</DialogTitle>
          <DialogDescription>They'll be able to read this conversation and reply to the customer.</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {members.map((m) => (
            <button key={m.user_id} onClick={() => add(m.user_id)} disabled={!!busy}
              className="w-full flex items-center gap-2.5 text-sm px-2 py-2 rounded-sm hover:bg-surface-hover transition-colors">
              <UserAvatar userId={m.user_id} name={m.label} className="h-7 w-7" fallbackClassName={`text-[10px] ${avatarTint(m.label)}`} />
              <span className="flex-1 text-left">{m.label}</span>
              {busy === m.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          ))}
          {members.length === 0 && <div className="text-xs text-muted-foreground px-2">No members found.</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
};
