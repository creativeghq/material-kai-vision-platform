import React, { useState } from 'react';
import { AlarmClock, Check, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { inboxApi } from '@/services/inboxApi';
import { gmailApi } from '@/services/gmailApi';
import { daysFromNow } from '../inboxFormat';
import { withinBusinessHours } from '../followUpTiming';
import { OutreachComposer, type OutreachStepInput, type OutreachTemplateChoice } from './OutreachComposer';

/** What to do after this message goes out, if they do not answer. */
export type SendFollowUpPlan =
  | { kind: 'remind'; days: number }
  | { kind: 'outreach'; steps: OutreachStepInput[]; template: OutreachTemplateChoice | null };

const REMIND_DAYS = [3, 7];
const dayWord = (d: number) => (d === 7 ? 'a week' : `${d} days`);

export function remindAt(days: number): Date {
  const d = daysFromNow(days);
  d.setHours(9, 0, 0, 0);
  return withinBusinessHours(d);
}

export function describePlan(plan: SendFollowUpPlan): string {
  return plan.kind === 'remind'
    ? `Back on top if no reply in ${dayWord(plan.days)}`
    : `${plan.steps.length} follow-up${plan.steps.length > 1 ? 's' : ''} if no reply`;
}

/** Set up after a platform message was sent: Boomerang if no reply, or a chain of follow-ups. */
export async function applyPlatformPlan(threadId: string, plan: SendFollowUpPlan): Promise<string | null> {
  if (plan.kind === 'remind') {
    await inboxApi.setFollowUp({ thread_id: threadId, at: remindAt(plan.days).toISOString() });
    return null;
  }
  const res = await inboxApi.outreachSchedule({
    thread_id: threadId,
    steps: plan.steps.map((s) => ({ body: s.body, send_at: s.at.toISOString() })),
    ...(plan.template ? { wa_template: plan.template } : {}),
  });
  return res.warning;
}

/** Set up after a Gmail message was sent: a reminder that brings it back on top if no reply, or a chain of follow-ups. */
export async function applyGmailPlan(accountId: string, threadId: string, plan: SendFollowUpPlan, subject?: string): Promise<void> {
  if (plan.kind === 'remind') {
    await gmailApi.remind({ account_id: accountId, thread_id: threadId, at: remindAt(plan.days).toISOString(), if_no_reply: true, subject });
    return;
  }
  await gmailApi.outreachSchedule({ account_id: accountId, thread_id: threadId, steps: plan.steps.map((s) => ({ body: s.body, send_at: s.at.toISOString() })) });
}

/** The "if they do not reply" control that sits beside Send. */
export const FollowUpOnSend: React.FC<{
  value: SendFollowUpPlan | null;
  onChange: (plan: SendFollowUpPlan | null) => void;
  whatsappThreadId?: string | null;
  disabled?: boolean;
}> = ({ value, onChange, whatsappThreadId, disabled }) => {
  const [composing, setComposing] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant={value ? 'secondary' : 'ghost'} className="h-8 text-xs" disabled={disabled} title="If they do not reply">
            <AlarmClock className="w-4 h-4" />
            <span className="hidden sm:inline ml-1.5 max-w-[11rem] truncate">{value ? describePlan(value) : 'Follow up'}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {REMIND_DAYS.map((d) => (
            <DropdownMenuItem key={d} onSelect={() => onChange({ kind: 'remind', days: d })}>
              <span className="flex-1">Back on top if no reply in {dayWord(d)}</span>
              {value?.kind === 'remind' && value.days === d && <Check className="w-3.5 h-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => setComposing(true)}>
            <span className="flex-1">Send follow-ups if no reply…</span>
            {value?.kind === 'outreach' && <Check className="w-3.5 h-3.5" />}
          </DropdownMenuItem>
          {value && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onChange(null)}><X className="w-3.5 h-3.5 mr-1.5" />No follow-up</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {composing && (
        <Dialog open onOpenChange={(o) => !o && setComposing(false)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Follow Up If No Reply</DialogTitle>
              <DialogDescription>Set up now, sent after this message goes out. The moment they reply, the rest is cancelled.</DialogDescription>
            </DialogHeader>
            <OutreachComposer
              idPrefix="send-followup"
              submitLabel="Use"
              whatsappThreadId={whatsappThreadId}
              onSubmit={async (steps, template) => { onChange({ kind: 'outreach', steps, template }); setComposing(false); }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
