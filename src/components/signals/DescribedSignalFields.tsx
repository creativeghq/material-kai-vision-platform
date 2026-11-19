import React, { useState } from 'react';
import { ExternalLink, FlaskConical, Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { FormField, FormSection } from '@/components/core/ui/form-layout';
import { useToast } from '@/hooks/use-toast';
import { safeHref } from '@/utils/safeUrl';
import {
  signalsService, DESCRIBED_SOURCE_LABEL,
  type DescribedBacktest, type DescribedSpec,
} from '@/services/signalsService';

interface Props {
  description: string;
  onDescriptionChange: (v: string) => void;
  spec: DescribedSpec | null;
  onSpecChange: (s: DescribedSpec | null) => void;
  crmOnly: boolean;
  onNameSuggested: (name: string) => void;
  onTestedChange: (tested: boolean) => void;
}

function ListInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [raw, setRaw] = useState(value.join(', '));
  if (value.join('\u0000') !== splitList(raw).join('\u0000')) setRaw(value.join(', '));
  return <Input value={raw} onChange={(e) => { setRaw(e.target.value); onChange(splitList(e.target.value)); }} />;
}

const splitList = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

const VERDICT_BADGE: Record<string, { label: string; variant: 'success' | 'neutral' | 'error' }> = {
  match: { label: 'Match', variant: 'success' },
  no_match: { label: 'No Match', variant: 'neutral' },
  failed: { label: 'Check Failed', variant: 'error' },
};

export function DescribedSignalFields({ description, onDescriptionChange, spec, onSpecChange, crmOnly, onNameSuggested, onTestedChange }: Props) {
  const { toast } = useToast();
  const [drafting, setDrafting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTestState] = useState<DescribedBacktest | null>(null);
  const setTest = (t: DescribedBacktest | null) => { setTestState(t); onTestedChange(t !== null); };

  const draft = async () => {
    setDrafting(true);
    setTest(null);
    try {
      const res = await signalsService.draftDescribed(description.trim());
      onSpecChange(res.spec);
      if (res.name) onNameSuggested(res.name);
    } catch (e) {
      toast({ title: 'Could not draft the rules', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setDrafting(false);
    }
  };

  const runTest = async () => {
    if (!spec) return;
    setTesting(true);
    try {
      setTest(await signalsService.testDescribed(description.trim(), spec, crmOnly));
    } catch (e) {
      toast({ title: 'Could not test the rules', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const patch = (p: Partial<DescribedSpec>) => {
    if (!spec) return;
    onSpecChange({ ...spec, ...p });
    setTest(null);
  };

  return (
    <>
      <FormSection title="Describe It">
        <FormField label="What to Watch For" hint="Plain language. Be specific about who and what counts.">
          <Textarea
            value={description}
            onChange={(e) => { onDescriptionChange(e.target.value); onSpecChange(null); setTest(null); }}
            rows={3}
            maxLength={1000}
            placeholder="Tile or sanitaryware companies in Greece opening a new showroom or expanding retail"
          />
        </FormField>
        <Button type="button" variant="secondary" onClick={() => void draft()} disabled={drafting || description.trim().length < 10}>
          {drafting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {spec ? 'Draft Again' : 'Draft Rules'}
        </Button>
      </FormSection>

      {spec ? (
        <FormSection title="Rules" description="Drafted by AI from your description. Adjust them, then test before saving.">
          <div className="flex flex-wrap gap-1.5">
            {spec.sources.map((s) => <Badge key={s} variant="info">{DESCRIBED_SOURCE_LABEL[s] ?? s}</Badge>)}
          </div>
          <FormField label="Question the AI Answers for Each Item">
            <Textarea value={spec.judge_question} rows={2} maxLength={600}
              onChange={(e) => patch({ judge_question: e.target.value })} />
          </FormField>
          <FormField label="Keywords" hint="Comma-separated. A free first filter; items matching none can still pass on meaning.">
            <ListInput value={spec.keywords} onChange={(v) => patch({ keywords: v })} />
          </FormField>
          <FormField label="Exclude Items Containing" optional>
            <ListInput value={spec.must_not} onChange={(v) => patch({ must_not: v })} />
          </FormField>
          <Button type="button" variant="outline" onClick={() => void runTest()} disabled={testing || !spec.judge_question.trim()}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
            Test on Last 30 Days
          </Button>
        </FormSection>
      ) : null}

      {test ? (
        <FormSection title="Test Result">
          <p className="text-sm">
            {test.candidates_30d}{test.candidates_capped ? '+' : ''} item{test.candidates_30d === 1 ? '' : 's'} in the last 30 days passed the free filter;
            the AI checked {test.judged.length} and matched {test.matches_in_sample}
            {test.failed_in_sample ? `, ${test.failed_in_sample} check${test.failed_in_sample === 1 ? '' : 's'} failed` : ''}.
          </p>
          <p className="text-xs text-muted-foreground">
            Estimated cost: about {test.estimate.first_run_credits} credit{test.estimate.first_run_credits === 1 ? '' : 's'} on
            the first runs (items from the last {test.estimate.first_run_days} days), then about {test.estimate.credits_per_week} credit{test.estimate.credits_per_week === 1 ? '' : 's'} a week
            ({test.estimate.credit_per_item} per AI check).{test.embedding_used ? '' : ' Meaning-based matching was unavailable for this test, so it used keywords only.'}
          </p>
          {test.judged.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing in the last 30 days passed the filter. Widen the keywords or the description, then test again.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {test.judged.map((j, i) => {
                const badge = VERDICT_BADGE[j.status] ?? VERDICT_BADGE.no_match;
                const href = safeHref(j.url, '');
                return (
                  <li key={`${j.title}-${i}`} className="rounded-sm border border-hairline p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{j.title}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    {j.reason || j.error ? <p className="mt-1 text-xs text-muted-foreground">{j.reason ?? j.error}</p> : null}
                    {j.evidence_quote ? <p className="mt-1 text-xs">“{j.evidence_quote}”</p> : null}
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Source <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </FormSection>
      ) : null}
    </>
  );
}
