import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchDisplayProfiles } from '@/services/displayProfilesService';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Switch } from '@/components/core/ui/switch';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { gmailApi, type MailAccount } from '@/services/gmailApi';

export const GmailShareDialog: React.FC<{ account: MailAccount; onClose: () => void; onSaved: () => void }> = ({ account, onClose, onSaved }) => {
  const { toast } = useToast();
  const [shared, setShared] = useState(account.is_shared);
  const [selected, setSelected] = useState<string[]>([]);
  const [people, setPeople] = useState<Array<{ user_id: string; label: string }> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [{ member_ids }, me] = await Promise.all([gmailApi.members(account.id), supabase.auth.getUser()]);
        setSelected(member_ids);
        const { data, error } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', account.workspace_id).eq('status', 'active');
        if (error) throw error;
        const ids = (data ?? []).map((r: { user_id: string }) => r.user_id).filter((id) => id !== me.data.user?.id);
        const profs = await fetchDisplayProfiles(ids);
        const byId = new Map(profs.map((p) => [p.userId, p.fullName || p.email || p.userId]));
        setPeople(ids.map((id) => ({ user_id: id, label: String(byId.get(id) ?? id) })));
      } catch (e) {
        setPeople([]);
        toast({ title: 'Could not load your team', description: (e as Error).message, variant: 'destructive' });
      }
    })();
  }, [account.id, account.workspace_id, toast]);

  const save = async () => {
    setBusy(true);
    try {
      await gmailApi.share(account.id, shared, shared ? selected : []);
      toast({ title: shared ? 'Mailbox shared' : 'Mailbox is personal again' });
      onSaved();
    } catch (e) {
      toast({ title: 'Could not save', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share {account.email}</DialogTitle>
          <DialogDescription>
            For a team address like info@. Everyone you pick can read, answer and assign its mail. A personal mailbox stays yours alone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Switch id="gmail-shared" checked={shared} onCheckedChange={setShared} />
          <Label htmlFor="gmail-shared">Shared mailbox</Label>
        </div>
        {shared && (
          people === null ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : (
            <div className="max-h-56 overflow-y-auto space-y-1 rounded-sm border border-hairline p-1.5">
              {people.map((p) => (
                <label key={p.user_id} className="flex items-center gap-2.5 text-sm px-2 py-1.5 rounded-sm hover:bg-surface-hover cursor-pointer">
                  <Checkbox checked={selected.includes(p.user_id)}
                    onCheckedChange={(v) => setSelected((cur) => (v === true ? [...cur, p.user_id] : cur.filter((x) => x !== p.user_id)))} />
                  {p.label}
                </label>
              ))}
              {people.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">Nobody else is in this workspace yet.</div>}
            </div>
          )
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
