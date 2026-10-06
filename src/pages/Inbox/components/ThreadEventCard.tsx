import React from 'react';
import { AlertTriangle, Bot, CheckCircle2, Hand, RotateCcw, UserCheck } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { formatTime } from '@/utils/datetime';
import type { InboxMessage } from '@/services/inboxApi';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

interface ThreadEvent { icon: React.ElementType; tone: Tone; title: string; detail?: string | null; handoff?: boolean }

const TONE: Record<Tone, { box: string; icon: string }> = {
  neutral: { box: 'border-hairline bg-card', icon: 'bg-surface-sunken text-muted-foreground' },
  primary: { box: 'border-primary/25 bg-primary/[0.05]', icon: 'bg-primary/10 text-primary' },
  success: { box: 'border-hairline bg-card', icon: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  warning: { box: 'border-warning/30 bg-[hsl(var(--warning-bg))]', icon: 'bg-warning/15 text-warning' },
  error: { box: 'border-destructive/30 bg-destructive/[0.06]', icon: 'bg-destructive/10 text-destructive' },
};

/** The structured events the server writes as `system` rows. Anything else stays a plain pill. */
export function classifyThreadEvent(m: InboxMessage): ThreadEvent | null {
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  const body = m.body ?? '';
  const handoff = meta.agent_handoff as { reason?: string } | undefined;
  if (handoff) return { icon: Hand, tone: 'warning', title: 'The assistant handed this to the team', detail: handoff.reason ?? null, handoff: true };
  if (typeof meta.agent_reply_error === 'string') return { icon: AlertTriangle, tone: 'error', title: body || 'The assistant could not answer' };
  const event = meta.event as { kind?: string; status?: string; state?: string } | undefined;
  switch (event?.kind) {
    case 'assigned': return { icon: UserCheck, tone: 'neutral', title: body };
    case 'status': return event.status === 'closed'
      ? { icon: CheckCircle2, tone: 'success', title: body }
      : { icon: RotateCcw, tone: 'neutral', title: body };
    case 'agent_state': return { icon: Bot, tone: event.state === 'off' ? 'neutral' : 'primary', title: body };
    default: return null;
  }
}

export const ThreadEventCard: React.FC<{ m: InboxMessage; event: ThreadEvent; onTakeOver?: () => void }> = ({ m, event, onTakeOver }) => {
  const tone = TONE[event.tone];
  const Icon = event.icon;
  return (
    <div className="flex justify-center my-2">
      <div className={`w-full max-w-md rounded-sm border px-3 py-2 flex items-start gap-2.5 ${tone.box}`}>
        <span className={`mt-0.5 h-6 w-6 shrink-0 rounded-sm flex items-center justify-center ${tone.icon}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="flex-1 text-xs font-semibold text-foreground">{event.title}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{formatTime(m.created_at)}</span>
          </div>
          {event.detail && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{event.detail}</p>}
          {event.handoff && onTakeOver && (
            <Button size="sm" variant="outline" className="h-7 text-xs mt-2" onClick={onTakeOver}>
              <UserCheck className="w-3.5 h-3.5" /> Assign to me
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
