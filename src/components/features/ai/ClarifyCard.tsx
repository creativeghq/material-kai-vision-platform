/**
 * ClarifyCard — the agent's structured question, rendered on the canvas (issue #370, Class D).
 *
 * The agent had no way to ask for anything except prose. It would write a wall of markdown with
 * three numbered questions, the user would answer in a sentence, and the agent would ask again.
 * `request_input` emits the question as data; this renders it.
 *
 * TWO RULES BUILT INTO THE UI, not left to the prompt:
 *
 * 1. It is DISMISSIBLE. "Decide for me" is always present and always enabled, even when fields are
 *    marked required. A question the user cannot wave away is a gate, and gates are precisely the
 *    behaviour the operating doctrine exists to stop — the agent asked for a country the tool
 *    defaults for you, twice, and searched nothing. Dismissing hands the turn back with explicit
 *    permission to proceed.
 * 2. It is NOT a confirmation. Approving a spend, a send or a fiscal document is
 *    `ActionConfirmationCard` and invariant 9, which is unchanged. This collects scope, so it is
 *    styled as an offer rather than a warning and has no destructive variant.
 *
 * The inputs are `FieldInput` from ToolkitFormModal — the same renderers the quick-start forms use,
 * so a `country` field here shows the real sourcing markets from the vocabulary table rather than
 * a second list that can drift from it.
 */
import React, { useMemo, useState } from 'react';
import { MessageSquareQuote, Wand2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { FieldInput } from './ToolkitFormModal';
import type { ToolkitFormField } from './agentToolsCatalog';

export interface InputRequestData {
  request_id: string;
  title: string;
  prompt?: string;
  fields: ToolkitFormField[];
  submit_label?: string;
  status?: 'pending' | 'answered' | 'dismissed';
  /** What the user sent back, kept so a reloaded conversation shows the resolved card. */
  answers?: Record<string, string>;
}

interface Props {
  data: InputRequestData;
  /** Sends the composed answer as the user's next message. */
  onSubmit: (sentence: string, answers: Record<string, string>) => void;
  /** Hands the turn back telling the agent to choose. */
  onDismiss: (sentence: string) => void;
}

/** "segment: contract/hospitality; count: 20" — a sentence the agent reads as an ordinary reply. */
function composeAnswer(fields: ToolkitFormField[], values: Record<string, string>): string {
  const filled = fields
    .map((f) => ({ f, v: (values[f.key] ?? '').trim() }))
    .filter((x) => x.v);
  if (!filled.length) return '';
  return filled.map(({ f, v }) => `${f.label}: ${v}`).join('\n');
}

export const ClarifyCard: React.FC<Props> = ({ data, onSubmit, onDismiss }) => {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of data.fields) init[f.key] = data.answers?.[f.key] ?? f.default ?? '';
    return init;
  });

  const resolved = data.status === 'answered' || data.status === 'dismissed';
  const answer = useMemo(() => composeAnswer(data.fields, values), [data.fields, values]);

  if (resolved) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquareQuote className="h-4 w-4 shrink-0" />
          <span className="font-medium text-foreground">{data.title}</span>
          <span className="ml-auto text-xs">
            {data.status === 'dismissed' ? 'You asked it to decide' : 'Answered'}
          </span>
        </div>
        {data.status === 'answered' && data.answers && (
          <dl className="mt-3 space-y-1 text-[13px]">
            {data.fields.map((f) => {
              const v = data.answers?.[f.key];
              if (!v) return null;
              return (
                <div key={f.key} className="flex gap-2">
                  <dt className="text-muted-foreground">{f.label}:</dt>
                  <dd className="text-foreground">{v}</dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <MessageSquareQuote className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-tight">{data.title}</div>
          {data.prompt && (
            <p className="mt-1 text-[13px] text-muted-foreground whitespace-pre-line">{data.prompt}</p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {data.fields.map((f) => (
          <div key={f.key}>
            <Label className="text-xs">{f.label}</Label>
            <FieldInput
              field={f}
              value={values[f.key] ?? ''}
              onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))}
            />
            {f.help && <p className="mt-1 text-[11px] text-muted-foreground">{f.help}</p>}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {/*
          Always enabled, never hidden, and never disabled by a "required" field. This control is
          the difference between an offer and a gate, and the whole point of the change.
        */}
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5"
          onClick={() => onDismiss(
            'Skip the questions — use your best judgement and sensible defaults, and tell me what you assumed.',
          )}
        >
          <Wand2 className="h-3.5 w-3.5" /> Decide for me
        </Button>
        <Button
          size="sm"
          disabled={!answer}
          onClick={() => onSubmit(answer, values)}
        >
          {data.submit_label || 'Run it'}
        </Button>
      </div>
    </div>
  );
};

export default ClarifyCard;
