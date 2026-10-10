import React, { useMemo } from 'react';
import { Check, Gauge } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { scoreEmail } from '@/utils/emailScore';

const TONE = {
  good: 'text-emerald-800 dark:text-emerald-300',
  fair: 'text-amber-800 dark:text-amber-300',
  weak: 'text-red-800 dark:text-red-300',
} as const;

/** How likely this email is to get an answer: a score from length, questions, sentences, paragraphs and subject, with what to change. */
export const WritingScore: React.FC<{ body: string; subject?: string | null; className?: string }> = ({ body, subject, className }) => {
  const result = useMemo(() => scoreEmail({ body, subject }), [body, subject]);
  if (!result) return null;
  const tips = result.metrics.filter((m) => m.tip);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={`inline-flex items-center gap-1 text-[11px] tabular-nums ${TONE[result.verdict]} ${className ?? ''}`} title="Writing score: how likely this is to get a reply">
          <Gauge className="w-3.5 h-3.5" />{result.score}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 space-y-2 text-xs">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Writing score</span>
          <span className={`text-lg font-semibold tabular-nums ${TONE[result.verdict]}`}>{result.score}</span>
        </div>
        <ul className="space-y-1">
          {result.metrics.map((m) => (
            <li key={m.key} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">{m.label}</span>
              <span className="flex-1">{m.value}</span>
              {m.ok && <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />}
            </li>
          ))}
        </ul>
        {tips.length > 0 ? (
          <ul className="border-t border-hairline pt-2 space-y-1 list-disc pl-4">
            {tips.map((m) => <li key={m.key}>{m.tip}</li>)}
          </ul>
        ) : <p className="border-t border-hairline pt-2 text-muted-foreground">Nothing to change: this reads like an email people answer.</p>}
      </PopoverContent>
    </Popover>
  );
};
