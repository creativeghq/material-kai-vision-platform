import React, { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { inboxApi, type InboxThread } from '@/services/inboxApi';
import { FollowUpPopover, type PendingOutreach } from './FollowUpPopover';

export { FOLLOW_UP_PRESETS } from './FollowUpPopover';

const LEGACY = 'legacy-follow-up';

/** Boomerang (the thread's follow-up slot) and Automatic outreach (a chain of scheduled replies) for a platform conversation. */
export const FollowUpButton: React.FC<{
  thread: InboxThread;
  onChanged: () => void;
}> = ({ thread, onChanged }) => {
  const { toast } = useToast();
  const pending = !!thread.follow_up_at && !thread.follow_up_fired_at;
  const legacyOutreach = pending && !!thread.follow_up_message;
  const outreach: PendingOutreach[] = [
    ...(legacyOutreach ? [{ id: LEGACY, send_at: thread.follow_up_at!, preview: thread.follow_up_message }] : []),
    ...(thread.outreach ?? []),
  ];

  const fail = (title: string) => (e: unknown) => {
    toast({ title, description: (e as Error).message, variant: 'destructive' });
    throw e;
  };

  const boomerang = async (at: Date, note: string) => {
    const res = await inboxApi.setFollowUp({ thread_id: thread.id, at: at.toISOString(), note: note || undefined }).catch(fail('Could not set the Boomerang'));
    toast(res.warning ? { title: 'Boomerang set', description: res.warning } : { title: 'Boomerang set — it comes back to the top on the day' });
    onChanged();
  };
  const clear = async () => {
    await inboxApi.clearFollowUp(thread.id).catch(fail('Failed'));
    onChanged();
  };

  const loadBestTime = useCallback(() => inboxApi.bestSendTime(thread.id), [thread.id]);
  const draft = useCallback(async () => {
    try { return (await inboxApi.assist(thread.id, 'followup')).text; } catch (e) {
      toast({ title: 'Could not write the follow-up', description: (e as Error).message, variant: 'destructive' });
      throw e;
    }
  }, [thread.id, toast]);

  return (
    <FollowUpPopover
      idPrefix={`inbox-followup-${thread.id}`}
      boomerangAt={pending && !legacyOutreach ? thread.follow_up_at! : null}
      outreach={outreach}
      showNote
      onBoomerang={boomerang}
      onClearBoomerang={clear}
      loadBestTime={loadBestTime}
      draft={draft}
      whatsappThreadId={thread.channel === 'whatsapp' ? thread.id : null}
      onOutreach={async (steps, template) => {
        const res = await inboxApi.outreachSchedule({
          thread_id: thread.id,
          steps: steps.map((s) => ({ body: s.body, send_at: s.at.toISOString() })),
          ...(template ? { wa_template: template } : {}),
        }).catch(fail('Could not schedule the follow-up'));
        toast(res.warning
          ? { title: 'Follow-up scheduled — but it may not send', description: res.warning }
          : { title: steps.length > 1 ? `${steps.length} follow-ups scheduled — they stop as soon as they reply` : 'Follow-up scheduled — it sends unless they reply first' });
        onChanged();
      }}
      onCancelOutreach={async (o, whole) => {
        if (o.id === LEGACY) await clear();
        else await inboxApi.outreachCancel(whole && o.sequence_id ? { sequence_id: o.sequence_id } : { id: o.id }).catch(fail('Could not cancel'));
        toast({ title: whole ? 'Follow-ups cancelled' : 'Follow-up cancelled' });
        onChanged();
      }}
      outreachHint={thread.channel === 'whatsapp' ? (
        <p className="text-xs text-muted-foreground">
          WhatsApp accepts a typed message only within 24 hours of their last one. Pick an approved template above for that case — otherwise you will just be reminded.
        </p>
      ) : null}
    />
  );
};
