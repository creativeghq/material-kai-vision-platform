import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { formatDate, formatTime } from '@/utils/datetime';
import { inboxApi, type InboxWhatsAppTemplate } from '@/services/inboxApi';
import { daysFromNow, toLocalInputValue } from '../inboxFormat';
import { chainDates, describeBestTime, type BestTime } from '../followUpTiming';
import { WritingScore } from './WritingScore';
import { MAX_OUTREACH_STEPS } from '../outreachLimits';

export interface OutreachStepInput { body: string; at: Date }
export interface OutreachTemplateChoice { template_id: string; variables: Record<string, string> }

const FIRST_OPTIONS = [1, 3, 7, 14];
const GAP_OPTIONS = [2, 3, 5, 7, 14];
const NEXT_GAP = [3, 5, 7, 14, 14];
const BUSINESS_HOURS_KEY = 'inbox.followup.businessHours';

function readBusinessHours(): boolean {
  try { return localStorage.getItem(BUSINESS_HOURS_KEY) !== 'off'; } catch { return true; }
}

/** Write a follow-up chain: what each step says and when it goes, unless they reply first. */
export const OutreachComposer: React.FC<{
  idPrefix: string;
  submitLabel?: string;
  loadBestTime?: () => Promise<BestTime | null>;
  draft?: () => Promise<string>;
  whatsappThreadId?: string | null;
  hint?: React.ReactNode;
  onSubmit: (steps: OutreachStepInput[], template: OutreachTemplateChoice | null) => Promise<void>;
}> = ({ idPrefix, submitLabel = 'Schedule', loadBestTime, draft, whatsappThreadId, hint, onSubmit }) => {
  const [steps, setSteps] = useState<Array<{ body: string; gap: number }>>([{ body: '', gap: 3 }]);
  const [firstDays, setFirstDays] = useState<number | null>(3);
  const [custom, setCustom] = useState('');
  const [businessHours, setBusinessHoursState] = useState(readBusinessHours);
  const [best, setBest] = useState<BestTime | null>(null);
  const [useBest, setUseBest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState<number | null>(null);
  const [templates, setTemplates] = useState<InboxWhatsAppTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [vars, setVars] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loadBestTime) return;
    let live = true;
    loadBestTime().then((b) => { if (live) setBest(b); }).catch(() => { if (live) setBest(null); });
    return () => { live = false; };
  }, [loadBestTime]);

  useEffect(() => {
    if (!whatsappThreadId) return;
    inboxApi.listWhatsAppTemplates(whatsappThreadId).then((r) => setTemplates(r.templates)).catch(() => setTemplates([]));
  }, [whatsappThreadId]);

  const setBusinessHours = (on: boolean) => {
    setBusinessHoursState(on);
    try { localStorage.setItem(BUSINESS_HOURS_KEY, on ? 'on' : 'off'); } catch { return; }
  };

  const bestLine = describeBestTime(best);
  const first = firstDays != null ? daysFromNow(firstDays) : custom ? new Date(custom) : null;
  const dates = first
    ? chainDates(first, steps.slice(1).map((s) => s.gap), { businessHours, hour: useBest && bestLine && best ? best.best_hour : (firstDays != null ? 9 : null) })
    : [];

  const template = templates?.find((t) => t.id === templateId) ?? null;
  const templateVars = Array.isArray(template?.variables) ? template.variables : [];
  const templateReady = !template || templateVars.every((v) => (vars[v] ?? '').trim());
  const ready = !!first && steps.every((s) => s.body.trim()) && templateReady && !busy;

  const write = async (i: number) => {
    if (!draft) return;
    setDrafting(i);
    try {
      const text = await draft();
      setSteps((cur) => cur.map((s, j) => (j === i ? { ...s, body: text } : s)));
    } catch { /* the caller reported it */ } finally { setDrafting(null); }
  };

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await onSubmit(steps.map((s, i) => ({ body: s.body.trim(), at: dates[i] })), template ? { template_id: template.id, variables: vars } : null);
      setSteps([{ body: '', gap: 3 }]);
    } catch { /* the caller reported it */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={i} className="space-y-1.5 rounded-sm border border-hairline p-2">
          <div className="flex items-center gap-2">
            <Label htmlFor={`${idPrefix}-step-${i}`} className="text-xs flex-1">{steps.length > 1 ? `Follow-up ${i + 1}` : 'The message to send'}</Label>
            <WritingScore body={s.body} />
            {draft && (
              <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={drafting !== null} onClick={() => { void write(i); }} title="Write this follow-up from the conversation">
                {drafting === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}Write it for me
              </button>
            )}
            {i > 0 && (
              <button type="button" title="Remove this follow-up" onClick={() => setSteps((cur) => cur.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
          <Textarea id={`${idPrefix}-step-${i}`} value={s.body} onChange={(e) => setSteps((cur) => cur.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
            placeholder={i === 0 ? 'Hi — just checking in on this. Did you have a chance to look?' : 'Following up once more…'} className="min-h-[64px] text-xs resize-y" />
          {i === 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">If no reply in</span>
              {FIRST_OPTIONS.map((d) => (
                <Button key={d} type="button" size="sm" variant={firstDays === d ? 'secondary' : 'outline'} className="h-6 px-2 text-xs" onClick={() => setFirstDays(d)}>
                  {d === 1 ? '1 day' : d === 7 ? 'a week' : d === 14 ? '2 weeks' : `${d} days`}
                </Button>
              ))}
              <Input type="datetime-local" aria-label="Or pick a date and time" className="h-6 text-xs w-44" value={custom} min={toLocalInputValue(new Date())}
                onChange={(e) => { setCustom(e.target.value); setFirstDays(e.target.value ? null : 3); }} />
            </div>
          ) : (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Sends
              <select value={s.gap} onChange={(e) => setSteps((cur) => cur.map((x, j) => (j === i ? { ...x, gap: Number(e.target.value) } : x)))}
                className="h-6 rounded-sm border border-hairline bg-card px-1 text-xs text-foreground">
                {GAP_OPTIONS.map((g) => <option key={g} value={g}>{g} days</option>)}
              </select>
              after the one before, if they still have not replied
            </label>
          )}
          {dates[i] && <div className="text-[11px] text-muted-foreground">Goes out {formatDate(dates[i].toISOString())} {formatTime(dates[i].toISOString())}</div>}
        </div>
      ))}
      {steps.length < MAX_OUTREACH_STEPS && (
        <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setSteps((cur) => [...cur, { body: '', gap: NEXT_GAP[Math.min(cur.length, NEXT_GAP.length - 1)] }])}>
          <Plus className="w-3.5 h-3.5" />Add another follow-up if they still do not reply
        </button>
      )}

      <div className="space-y-1.5 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={businessHours} onCheckedChange={(v) => setBusinessHours(v === true)} />
          Only on working days, 09:00–18:00
        </label>
        {bestLine && (
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={useBest} onCheckedChange={(v) => setUseBest(v === true)} className="mt-0.5" />
            <span>Send at their best time<span className="block text-muted-foreground">{bestLine}</span></span>
          </label>
        )}
      </div>

      {templates && templates.length > 0 && (
        <div className="space-y-1.5 text-xs border-t border-hairline pt-2">
          <Label htmlFor={`${idPrefix}-tpl`} className="text-xs">If WhatsApp's 24-hour window has closed, send this approved template instead</Label>
          <select id={`${idPrefix}-tpl`} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setVars({}); }} className="h-7 w-full rounded-sm border border-hairline bg-card px-1 text-xs">
            <option value="">No template: just remind me</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {templateVars.map((v) => (
            <Input key={v} aria-label={v} placeholder={v} className="h-7 text-xs" value={vars[v] ?? ''} onChange={(e) => setVars((cur) => ({ ...cur, [v]: e.target.value }))} />
          ))}
        </div>
      )}
      {hint}
      <Button size="sm" className="w-full" disabled={!ready} onClick={() => { void submit(); }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `${submitLabel}${steps.length > 1 ? ` ${steps.length} follow-ups` : ''}`}
      </Button>
    </div>
  );
};
