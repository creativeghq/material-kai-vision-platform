import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { moodStyle, urgencyLabel, urgencyIsLoud } from '@/utils/conversationMood';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { formatDate, formatTime } from '@/utils/datetime';
import { inboxApi, type InboxThread, type ConversationSentiment } from '@/services/inboxApi';

/** What the CHANNEL knows about the person, as opposed to what our CRM knows. */
/** What the conversation reads like right now, and what to say back. */
export const ConversationMoodPanel: React.FC<{ thread: InboxThread; isMember: boolean }> = ({ thread, isMember }) => {
  const { toast } = useToast();
  const cached = ((thread.metadata as Record<string, unknown> | undefined)?.sentiment ?? null) as
    ConversationSentiment | null;
  const [sentiment, setSentiment] = useState<ConversationSentiment | null>(cached);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState<string | null>(null);

  // A different thread is a different conversation — without this the panel keeps showing the
  // previous customer's mood, which is the most confidently wrong a screen can be.
  useEffect(() => { setSentiment(cached); setEmpty(null); }, [thread.id, cached]);

  /**
   * Whether the reading on screen still describes this conversation.
   *
   * The SERVER invalidates on `last_message_id`, but it is only asked when somebody presses a
   * button, and this panel seeds straight from `thread.metadata` — so one verdict re-rendered
   * as current forever, which reads as a hardcoded answer rather than a stale one. Compared on
   * TIME because the thread row the list hands us carries `last_message_at`, not the id.
   */
  const stale = !!sentiment?.analysed_at && !!thread.last_message_at
    && new Date(thread.last_message_at).getTime() > new Date(sentiment.analysed_at).getTime();

  const run = async (force: boolean) => {
    setBusy(true);
    try {
      const r = await inboxApi.analyzeSentiment(thread.id, force);
      if (!r.analysed) { setEmpty(r.message || 'There is not enough here to read yet.'); setSentiment(null); }
      else { setSentiment(r.sentiment ?? null); setEmpty(null); }
    } catch (e) {
      toast({ title: 'Could not read the conversation', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  /*
   * Refresh a stale reading by itself, ONCE per new message. `force` stays false, so the server
   * still answers from its own cache when nothing has moved and this costs nothing.
   *
   * Only when a reading already exists: a thread nobody has asked about keeps its button, so
   * clicking down a list of conversations never quietly starts spending on all of them.
   */
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isMember || !stale || busy) return;
    const key = `${thread.id}:${thread.last_message_at}`;
    if (refreshedFor.current === key) return;
    refreshedFor.current = key;
    void run(false);
    // `run` is re-created every render; the ref is what makes this fire once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, thread.last_message_at, stale, isMember, busy]);

  if (!isMember) {
    return (
      <div className="flex-1 overflow-y-auto p-4 text-sm text-muted-foreground">
        Only people on this conversation can analyse it.
      </div>
    );
  }

  const style = sentiment ? moodStyle(sentiment.mood) : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-4">
        {!sentiment && !empty && (
          <div className="text-center py-6 space-y-3">
            <Sparkles className="w-7 h-7 mx-auto text-muted-foreground" />
            <div className="text-sm font-medium">Read this conversation</div>
            <p className="text-xs text-muted-foreground max-w-[34ch] mx-auto">
              Looks at the last 20 messages and reports how the customer feels, what they are
              waiting for, and how to answer. The assistant uses the same reading.
            </p>
            <Button size="sm" onClick={() => run(false)} disabled={busy}>
              {busy ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Reading…</> : 'Analyse conversation'}
            </Button>
          </div>
        )}

        {empty && (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">{empty}</p>
          </div>
        )}

        {sentiment && style && (
          <>
            {/* Only ever seen when the automatic re-read is in flight or has failed. A reading
                the conversation has moved past must say so, not sit there looking current. */}
            {stale && (
              <div className="flex items-center gap-2">
                <Badge variant="warning">Out of date</Badge>
                <span className="text-xs text-muted-foreground">
                  {busy ? 'Re-reading…' : 'Messages have arrived since this was read.'}
                </span>
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className="text-3xl leading-none" aria-hidden>{style.face}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-xs ${style.chip}`}>
                    {style.label}
                  </span>
                  {/* Only the loud ones get a second badge. A flag on every conversation is a
                      flag nobody reads. */}
                  {urgencyIsLoud(sentiment.urgency) && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-xs bg-red-500/15 text-red-800 dark:text-red-300">
                      {urgencyLabel(sentiment.urgency)}
                    </span>
                  )}
                </div>
                <p className="text-sm mt-1.5">{sentiment.summary}</p>
              </div>
            </div>

            {sentiment.open_question && (
              <div className="border-l-2 border-amber pl-3 py-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                  Still unanswered
                </div>
                <p className="text-sm italic">“{sentiment.open_question}”</p>
              </div>
            )}

            {sentiment.reply_guidance?.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  How to reply
                </div>
                <ul className="space-y-1.5">
                  {sentiment.reply_guidance.map((g, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-muted-foreground shrink-0">·</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sentiment.suggested_tone && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Tone:</span> {sentiment.suggested_tone}
              </div>
            )}

            <div className="pt-2 border-t border-hairline flex items-center justify-between gap-2">
              {/* Says WHEN and over how much. A stale reading presented as current is how someone
                  replies warmly to a customer who has since walked. */}
              <span className="text-[11px] text-muted-foreground">
                {/* The platform's formatters, not `toLocaleString()`: that renders through the
                    BROWSER's locale, so the same instant reads differently per machine and the
                    two halves of a date disagree across the app (#329). */}
                Read {sentiment.message_count} message(s) · {formatDate(sentiment.analysed_at)} {formatTime(sentiment.analysed_at)}
              </span>
              <Button size="sm" variant="outline" onClick={() => run(true)} disabled={busy}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Re-read'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
