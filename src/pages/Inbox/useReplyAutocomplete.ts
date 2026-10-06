import { useCallback, useEffect, useRef, useState } from 'react';
import { inboxApi } from '@/services/inboxApi';
import { useToast } from '@/hooks/use-toast';

const PAUSE_MS = 900;
const MIN_CHARS = 12;

/**
 * Paid ghost-text completion. One request per typing pause, only with the caret at the end,
 * never twice for the same text; a refusal (credits, switched off) pauses it for the session.
 */
export function useReplyAutocomplete(opts: {
  /** The person's opt-in. Only turning it back on clears a refusal pause. */
  optedIn: boolean;
  /** The composer is in a state where a suggestion makes sense right now. */
  enabled: boolean;
  threadId: string | null;
  draft: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const { optedIn, enabled, threadId, draft, textareaRef } = opts;
  const { toast } = useToast();
  const [suggestion, setSuggestion] = useState('');
  const [paused, setPaused] = useState(false);
  const lastAsked = useRef('');
  const seq = useRef(0);

  useEffect(() => { setSuggestion(''); lastAsked.current = ''; }, [threadId]);

  useEffect(() => {
    setSuggestion('');
    if (!optedIn || !enabled || paused || !threadId) return;
    if (draft.trim().length < MIN_CHARS || draft === lastAsked.current) return;
    const timer = setTimeout(() => {
      const el = textareaRef.current;
      if (!el || document.activeElement !== el || el.selectionStart !== draft.length || el.selectionEnd !== draft.length) return;
      lastAsked.current = draft;
      const mine = ++seq.current;
      inboxApi.completeReply(threadId, draft).then(({ completion }) => {
        if (mine !== seq.current || !completion) return;
        if (textareaRef.current?.value === draft) setSuggestion(completion);
      }).catch((e: Error & { status?: number }) => {
        if (e.status === 402 || e.status === 403) {
          setPaused(true);
          toast({ title: 'Autocomplete paused', description: e.message, variant: 'destructive' });
        } else console.warn('[inbox] autocomplete failed', e.message);
      });
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [optedIn, enabled, paused, threadId, draft, textareaRef, toast]);

  useEffect(() => { if (optedIn) setPaused(false); }, [optedIn]);

  const dismiss = useCallback(() => { seq.current++; setSuggestion(''); }, []);
  return { suggestion, dismiss };
}
