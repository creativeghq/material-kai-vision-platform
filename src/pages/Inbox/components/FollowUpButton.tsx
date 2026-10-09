import React from 'react';
import { useToast } from '@/hooks/use-toast';
import { inboxApi, type InboxThread } from '@/services/inboxApi';
import { FollowUpPopover } from './FollowUpPopover';

export { FOLLOW_UP_PRESETS } from './FollowUpPopover';

/** Boomerang and Automatic outreach for a platform conversation; both live in its one follow-up slot. */
export const FollowUpButton: React.FC<{
  thread: InboxThread;
  onChanged: () => void;
}> = ({ thread, onChanged }) => {
  const { toast } = useToast();
  const pending = !!thread.follow_up_at && !thread.follow_up_fired_at;
  const withMessage = pending && !!thread.follow_up_message;

  const submit = async (at: Date, note: string, message?: string) => {
    try {
      const res = await inboxApi.setFollowUp({ thread_id: thread.id, at: at.toISOString(), note: note || undefined, message });
      toast(res.warning
        ? { title: 'Follow-up set — but the message will not send', description: res.warning }
        : { title: message ? 'Follow-up scheduled — it sends unless they reply first' : 'Boomerang set — it comes back to the top on the day' });
      onChanged();
    } catch (e) {
      toast({ title: 'Could not set the follow-up', description: (e as Error).message, variant: 'destructive' });
      throw e;
    }
  };
  const clear = async () => {
    try {
      await inboxApi.clearFollowUp(thread.id);
      onChanged();
    } catch (e) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
      throw e;
    }
  };

  return (
    <FollowUpPopover
      idPrefix={`inbox-followup-${thread.id}`}
      boomerangAt={pending && !withMessage ? thread.follow_up_at! : null}
      outreach={withMessage ? [{ id: thread.id, send_at: thread.follow_up_at!, preview: thread.follow_up_message }] : []}
      showNote
      onBoomerang={(at, note) => submit(at, note)}
      onClearBoomerang={clear}
      onOutreach={(at, message) => submit(at, '', message)}
      onCancelOutreach={clear}
      outreachHint={(
        <p className="text-xs text-muted-foreground">
          A conversation holds one follow-up, so this replaces any Boomerang on it.
          {thread.channel === 'whatsapp' && ' On WhatsApp this only works if they have written to you within 24 hours of that time — otherwise you will just be reminded.'}
        </p>
      )}
    />
  );
};
