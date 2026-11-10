import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Switch } from '@/components/core/ui/switch';
import { Textarea } from '@/components/core/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/core/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { TOOL_MANIFEST } from '@/components/features/ai/toolManifest.generated';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface EvalCaseRow {
  id: string;
  key: string;
  title: string;
  agent_id: string;
  question: string;
  factual: boolean;
  expect_tools_any: string[];
  expect_tools_none: string[];
  expect_reply_regex: string[];
  forbid_reply_regex: string[];
  expect_results: boolean;
  max_credits: number | null;
  max_seconds: number | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
}

interface Draft {
  id: string | null;
  key: string;
  title: string;
  agent_id: string;
  question: string;
  factual: boolean;
  expect_results: boolean;
  expect_tools_any: string[];
  expect_tools_none: string[];
  expect_reply_regex: string[];
  forbid_reply_regex: string[];
  max_credits: string;
  max_seconds: string;
  sort_order: string;
  notes: string;
  is_active: boolean;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const TOOL_NAMES = Array.from(new Set(TOOL_MANIFEST.map((t) => t.name))).sort();
const evalCases = () => (supabase as any).from('agent_eval_cases');

const emptyDraft = (nextSort: number): Draft => ({
  id: null, key: '', title: '', agent_id: 'kai', question: '',
  factual: true, expect_results: false,
  expect_tools_any: [], expect_tools_none: [], expect_reply_regex: [], forbid_reply_regex: [],
  max_credits: '', max_seconds: '', sort_order: String(nextSort), notes: '', is_active: true,
});

const toDraft = (c: EvalCaseRow): Draft => ({
  id: c.id, key: c.key, title: c.title, agent_id: c.agent_id, question: c.question,
  factual: c.factual, expect_results: c.expect_results,
  expect_tools_any: c.expect_tools_any ?? [], expect_tools_none: c.expect_tools_none ?? [],
  expect_reply_regex: c.expect_reply_regex ?? [], forbid_reply_regex: c.forbid_reply_regex ?? [],
  max_credits: c.max_credits == null ? '' : String(c.max_credits),
  max_seconds: c.max_seconds == null ? '' : String(c.max_seconds),
  sort_order: String(c.sort_order ?? 0), notes: c.notes ?? '', is_active: c.is_active,
});

function invalidRegexes(list: string[]): string[] {
  return list.filter((src) => {
    try { new RegExp(src, 'i'); return false; } catch { return true; }
  });
}

function validate(d: Draft): string[] {
  const errors: string[] = [];
  if (!KEY_PATTERN.test(d.key.trim())) errors.push('Key must be a slug: lowercase letters, digits, dots, dashes or underscores.');
  if (!d.title.trim()) errors.push('Title is required.');
  if (!d.agent_id.trim()) errors.push('Agent is required.');
  if (!d.question.trim()) errors.push('Question is required.');
  for (const bad of invalidRegexes(d.expect_reply_regex)) errors.push(`Invalid regex in "reply must match": ${bad}`);
  for (const bad of invalidRegexes(d.forbid_reply_regex)) errors.push(`Invalid regex in "reply must not match": ${bad}`);
  const both = d.expect_tools_any.filter((t) => d.expect_tools_none.includes(t));
  if (both.length) errors.push(`A tool cannot be both expected and forbidden: ${both.join(', ')}`);
  if (d.max_credits.trim() && !(Number(d.max_credits) >= 0)) errors.push('Max credits must be a number of 0 or more.');
  if (d.max_seconds.trim() && !(Number.isInteger(Number(d.max_seconds)) && Number(d.max_seconds) > 0)) errors.push('Max seconds must be a whole number above 0.');
  if (!Number.isInteger(Number(d.sort_order))) errors.push('Sort order must be a whole number.');
  return errors;
}

const TagListInput: React.FC<{
  values: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  mono?: boolean;
  invalid?: (v: string) => boolean;
  placeholder?: string;
}> = ({ values, onChange, suggestions, mono, invalid, placeholder }) => {
  const [text, setText] = useState('');
  const listId = useId();
  const add = () => {
    const v = text.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setText('');
  };
  return (
    <div className="space-y-1.5">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <Badge key={v} variant={invalid?.(v) ? 'error' : 'outline'} className={`gap-1 ${mono ? 'font-mono' : ''}`}>
              <span className="break-all">{v}</span>
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={text}
          list={suggestions ? listId : undefined}
          placeholder={placeholder}
          className={mono ? 'font-mono text-xs' : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!text.trim()}>Add</Button>
      </div>
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </div>
  );
};

export const EvalCasesSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}> = ({ open, onOpenChange, onChanged }) => {
  const { toast } = useToast();
  const [cases, setCases] = useState<EvalCaseRow[]>([]);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<EvalCaseRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [{ data, error }, { data: usage }] = await Promise.all([
      evalCases().select('*').order('sort_order').order('key'),
      supabase.from('agent_usage_logs').select('agent_type').order('created_at', { ascending: false }).limit(5000),
    ]);
    setLoading(false);
    if (error) { setLoadError(error.message); return; }
    const rows = (data ?? []) as EvalCaseRow[];
    setCases(rows);
    const ids = new Set<string>(rows.map((r) => r.agent_id));
    for (const u of usage ?? []) {
      const base = String(u.agent_type ?? '').split(':')[0].trim();
      if (base) ids.add(base);
    }
    setAgentIds(Array.from(ids).sort());
  }, []);

  useEffect(() => {
    if (open) void load();
    else { setDraft(null); setErrors([]); }
  }, [open, load]);

  const nextSort = useMemo(() => (cases.length ? Math.max(...cases.map((c) => c.sort_order ?? 0)) + 10 : 10), [cases]);
  const agentOptions = useMemo(
    () => (draft && draft.agent_id && !agentIds.includes(draft.agent_id) ? [...agentIds, draft.agent_id].sort() : agentIds),
    [agentIds, draft],
  );

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    if (!draft) return;
    const problems = validate(draft);
    setErrors(problems);
    if (problems.length) return;
    const payload = {
      key: draft.key.trim(),
      title: draft.title.trim(),
      agent_id: draft.agent_id.trim(),
      question: draft.question.trim(),
      factual: draft.factual,
      expect_results: draft.expect_results,
      expect_tools_any: draft.expect_tools_any,
      expect_tools_none: draft.expect_tools_none,
      expect_reply_regex: draft.expect_reply_regex,
      forbid_reply_regex: draft.forbid_reply_regex,
      max_credits: draft.max_credits.trim() ? Number(draft.max_credits) : null,
      max_seconds: draft.max_seconds.trim() ? Number(draft.max_seconds) : null,
      sort_order: Number(draft.sort_order),
      notes: draft.notes.trim() || null,
      is_active: draft.is_active,
    };
    setSaving(true);
    const { error } = draft.id
      ? await evalCases().update({ ...payload, updated_at: new Date().toISOString() }).eq('id', draft.id)
      : await evalCases().insert(payload);
    setSaving(false);
    if (error) {
      const msg = error.code === '23505' ? `A case with the key "${payload.key}" already exists.` : error.message;
      setErrors([msg]);
      return;
    }
    toast({ title: draft.id ? 'Case saved' : 'Case created' });
    setDraft(null);
    await load();
    onChanged();
  };

  const toggleActive = async (c: EvalCaseRow) => {
    setBusyId(c.id);
    const { error } = await evalCases().update({ is_active: !c.is_active, updated_at: new Date().toISOString() }).eq('id', c.id);
    setBusyId(null);
    if (error) { toast({ title: 'Could not update the case', description: error.message, variant: 'destructive' }); return; }
    await load();
    onChanged();
  };

  const confirmDelete = async () => {
    const c = toDelete;
    setToDelete(null);
    if (!c) return;
    setBusyId(c.id);
    const { error } = await evalCases().delete().eq('id', c.id);
    setBusyId(null);
    if (error) { toast({ title: 'Could not delete the case', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `Deleted ${c.key}` });
    await load();
    onChanged();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full space-y-4 sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{draft ? (draft.id ? 'Edit Eval Case' : 'New Eval Case') : 'Golden Eval Cases'}</SheetTitle>
          <SheetDescription>
            {draft
              ? 'Each expectation is checked deterministically by agent-eval against one real agent turn.'
              : 'Active cases are what Run all executes. Deactivate a case to keep its history without running it.'}
          </SheetDescription>
        </SheetHeader>

        {draft ? (
          <div className="space-y-5">
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { setDraft(null); setErrors([]); }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to cases
            </Button>

            <FormSection title="Identity">
              <FormGrid cols={2}>
                <FormField label="Key" hint="Unique slug, e.g. crm.forecast. Runs are matched to a case by key, so renaming it detaches its run history.">
                  <Input value={draft.key} className="font-mono" onChange={(e) => set('key', e.target.value)} />
                </FormField>
                <FormField label="Agent" hint="The agent id the question is sent to; the router may hand it on.">
                  <Select value={draft.agent_id} onValueChange={(v) => set('agent_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Choose an agent" /></SelectTrigger>
                    <SelectContent>
                      {agentOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
              </FormGrid>
              <FormField label="Title">
                <Input value={draft.title} onChange={(e) => set('title', e.target.value)} />
              </FormField>
              <FormField label="Question" hint="Sent verbatim as the user's message, as you, in the workspace selected on the dashboard.">
                <Textarea rows={3} value={draft.question} onChange={(e) => set('question', e.target.value)} />
              </FormField>
            </FormSection>

            <FormSection title="Expectations" description="Regexes are matched case-insensitively against the final reply. A case with no expectations passes on any non-empty, unhedged reply.">
              <FormGrid cols={2}>
                <FormField label="Factual Question" hint="Fails the case if the reply carries the analysis framework (MODE: / Confidence:).">
                  <Switch checked={draft.factual} onCheckedChange={(v) => set('factual', v)} />
                </FormField>
                <FormField label="Expect Results" hint="When on, an expected tool that returns nothing fails the case. Off: an empty result is a valid answer.">
                  <Switch checked={draft.expect_results} onCheckedChange={(v) => set('expect_results', v)} />
                </FormField>
              </FormGrid>
              <FormField label="Tools That Must Be Called" optional hint="Passes when ANY one of these is called; each one called must not fail.">
                <TagListInput values={draft.expect_tools_any} onChange={(v) => set('expect_tools_any', v)} suggestions={TOOL_NAMES} mono placeholder="Tool name" />
              </FormField>
              <FormField label="Tools That Must Not Be Called" optional hint="Calling any of these fails the case.">
                <TagListInput values={draft.expect_tools_none} onChange={(v) => set('expect_tools_none', v)} suggestions={TOOL_NAMES} mono placeholder="Tool name" />
              </FormField>
              <FormField label="Reply Must Match" optional hint="Every regex must match the reply.">
                <TagListInput values={draft.expect_reply_regex} onChange={(v) => set('expect_reply_regex', v)} mono invalid={(v) => invalidRegexes([v]).length > 0} placeholder="Regular expression" />
              </FormField>
              <FormField label="Reply Must Not Match" optional hint="Any regex that matches fails the case.">
                <TagListInput values={draft.forbid_reply_regex} onChange={(v) => set('forbid_reply_regex', v)} mono invalid={(v) => invalidRegexes([v]).length > 0} placeholder="Regular expression" />
              </FormField>
            </FormSection>

            <FormSection title="Budget">
              <FormGrid cols={2}>
                <FormField label="Max Credits" optional hint="Fails when the turn's agent_usage_logs debit exceeds it. Unknown cost never fails.">
                  <Input type="number" min={0} step="any" value={draft.max_credits} onChange={(e) => set('max_credits', e.target.value)} />
                </FormField>
                <FormField label="Max Seconds" optional hint="Fails when the turn takes longer. The harness stops any turn at 140 s.">
                  <Input type="number" min={1} step={1} value={draft.max_seconds} onChange={(e) => set('max_seconds', e.target.value)} />
                </FormField>
              </FormGrid>
            </FormSection>

            <FormSection title="Other">
              <FormGrid cols={2}>
                <FormField label="Sort Order" hint="Run all goes in ascending order.">
                  <Input type="number" step={1} value={draft.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
                </FormField>
                <FormField label="Active" hint="Inactive cases are kept but never run.">
                  <Switch checked={draft.is_active} onCheckedChange={(v) => set('is_active', v)} />
                </FormField>
              </FormGrid>
              <FormField label="Notes" optional>
                <Textarea rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
              </FormField>
            </FormSection>

            {errors.length > 0 && (
              <ul className="space-y-1 rounded-sm border border-[hsl(var(--error)/0.3)] bg-[hsl(var(--error-bg))] px-3 py-2 text-xs text-[hsl(var(--error))]">
                {errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => { setDraft(null); setErrors([]); }} disabled={saving}>Cancel</Button>
              <Button onClick={() => void save()} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {draft.id ? 'Save case' : 'Create case'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" className="gap-1.5" onClick={() => { setErrors([]); setDraft(emptyDraft(nextSort)); }}>
                <Plus className="h-3.5 w-3.5" /> New case
              </Button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading cases…
              </div>
            ) : loadError ? (
              <HubEmptyState title="Could not load eval cases" description={loadError} action={<Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>} />
            ) : cases.length === 0 ? (
              <HubEmptyState
                title="No eval cases yet"
                description="A case is one question plus what a correct answer must and must not do."
                action={<Button size="sm" onClick={() => setDraft(emptyDraft(10))}>New case</Button>}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Checks</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Order</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => {
                    const checks = (c.expect_tools_any?.length ?? 0) + (c.expect_tools_none?.length ?? 0)
                      + (c.expect_reply_regex?.length ?? 0) + (c.forbid_reply_regex?.length ?? 0);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{c.title}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">{c.key}</p>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{c.agent_id}</TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">{checks}</TableCell>
                        <TableCell>
                          {c.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="neutral">Inactive</Badge>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.sort_order}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setErrors([]); setDraft(toDraft(c)); }}>Edit</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busyId === c.id} onClick={() => void toggleActive(c)}>
                              {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : c.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" disabled={busyId === c.id} onClick={() => setToDelete(c)}>Delete</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete eval case {toDelete?.key}?</AlertDialogTitle>
              <AlertDialogDescription>
                The case is removed for good. Its past runs stay in the history under the same key. Deactivate it instead
                if you only want it out of Run all.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
};
