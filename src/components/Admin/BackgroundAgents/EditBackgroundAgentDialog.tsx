import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Switch } from '@/components/core/ui/switch';
import { Textarea } from '@/components/core/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { updateAgent } from '@/services/backgroundAgents';
import type { AgentTypeCatalogEntry, BackgroundAgent } from '@/services/backgroundAgents';
import { useToast } from '@/hooks/use-toast';

import { cronError, describeCron } from './cronSchedule';

interface RunnerFacts {
  usesModel: boolean;
  usesPrompt: boolean;
  keys: Array<[string, string]>;
}

/** What each runner under `_shared/agents/` reads; keys not listed are ignored by it. */
const RUNNER_FACTS: Record<string, RunnerFacts> = {
  'kai-task': { usesModel: true, usesPrompt: true, keys: [['max_iterations', 'tool-loop iterations per task (default 20)']] },
  'product-enrichment': {
    usesModel: true, usesPrompt: true,
    keys: [['batch_size', 'products per run (default 10, max 50)'], ['category_filter', 'only this category'], ['force_rewrite', 'rewrite existing descriptions (default false)']],
  },
  'material-tagger': {
    usesModel: true, usesPrompt: true,
    keys: [['batch_size', 'products per run (default 10, max 20)'], ['recanonicalize', 're-tag already tagged products (default false)']],
  },
  'factory-enrichment': {
    usesModel: false, usesPrompt: false,
    keys: [['batch_size', 'default 20, max 50'], ['min_name_length', 'default 3'], ['product_ids', 'array of product ids'], ['scope_column', 'propagation scope column'], ['scope_value', 'value for scope_column']],
  },
  'model-health-check': {
    usesModel: false, usesPrompt: false,
    keys: [['providers', 'array; only replicate is probeable today'], ['models', 'array of model keys to probe'], ['max_models', 'default 6'], ['timeout_ms', 'default 20000'], ['min_interval_ms', 'default 11000'], ['deadline_ms', 'default 120000'], ['test_prompt', 'prompt sent to each model']],
  },
  'embedding-backfill': {
    usesModel: false, usesPrompt: false,
    keys: [['recent', '{max_products, max_chunks, max_images} for normal runs'], ['full', 'same limits for the nightly full pass'], ['nightly_hour_utc', 'the run in the first 15 min of this UTC hour is the full pass (default 3)'], ['batch_size', 'default 50'], ['window_hours', 'recent-pass lookback (default 48)']],
  },
  'social-analytics-sync': {
    usesModel: false, usesPrompt: false,
    keys: [['batch_size', 'default 20, max 50'], ['min_age_hours', 'default 1'], ['stale_after_hours', 'default 2']],
  },
  'social-insights-sync': { usesModel: false, usesPrompt: false, keys: [] },
  'field-registry-steward': { usesModel: true, usesPrompt: false, keys: [['max_iterations', 'tool-loop iterations per run (default 12)']] },
  'tech-radar': { usesModel: false, usesPrompt: false, keys: [['subject_id', 'tech_radar_subjects.id (required)'], ['force', 'review even if not due']] },
};

export const EditBackgroundAgentDialog: React.FC<{
  agent: BackgroundAgent | null;
  catalog: AgentTypeCatalogEntry[] | null;
  models: string[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ agent, catalog, models, onClose, onSaved }) => {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [schedule, setSchedule] = useState('');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [configText, setConfigText] = useState('{}');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agent) return;
    setEnabled(agent.enabled);
    setSchedule(agent.schedule ?? '');
    setModel(agent.model ?? '');
    setPrompt(agent.system_prompt_override ?? '');
    setConfigText(JSON.stringify(agent.config ?? {}, null, 2));
    setErrors([]);
  }, [agent]);

  const facts = agent ? RUNNER_FACTS[agent.agent_type] : undefined;
  const registered = !catalog || !agent || catalog.some((c) => c.agentType === agent.agent_type);
  const isCron = agent?.trigger_type === 'cron';
  const scheduleProblem = isCron && schedule.trim() ? cronError(schedule) : null;
  const preview = isCron && !scheduleProblem ? describeCron(schedule) : null;
  const modelOptions = useMemo(() => (model && !models.includes(model) ? [model, ...models] : models), [model, models]);

  const save = async () => {
    if (!agent) return;
    const problems: string[] = [];
    let config: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(configText.trim() || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) problems.push('Config must be a JSON object.');
      else config = parsed as Record<string, unknown>;
    } catch (e) {
      problems.push(`Config is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    const trimmed = schedule.trim();
    if (isCron && enabled && !trimmed) problems.push('An enabled cron agent needs a schedule.');
    if (isCron && trimmed && scheduleProblem) problems.push(`Schedule: ${scheduleProblem}`);
    if (!model) problems.push('Model is required.');
    setErrors(problems);
    if (problems.length) return;

    setSaving(true);
    try {
      await updateAgent(agent.id, {
        enabled,
        schedule: isCron ? (trimmed || null) : agent.schedule,
        model,
        system_prompt_override: prompt.trim() || null,
        config,
      });
      toast({ title: `Saved ${agent.name}` });
      onSaved();
      onClose();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!agent} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{agent?.name ?? 'Background Agent'}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{agent?.agent_type}</span> · {agent?.trigger_type} trigger
            {agent?.workspace_id ? ' · workspace agent' : ' · platform agent'}
          </DialogDescription>
        </DialogHeader>

        {agent && (
          <div className="space-y-5">
            {!registered && (
              <div className="flex gap-2 rounded-sm border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning-bg))] px-3 py-2 text-xs text-[hsl(var(--warning))]">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  No runner is registered for <span className="font-mono">{agent.agent_type}</span>. If the scheduler dispatches
                  it, background-agent-runner refuses with &quot;No runner registered&quot; and the run fails.
                </span>
              </div>
            )}

            <FormSection title="Run">
              <FormGrid cols={2}>
                <FormField label="Enabled" hint="Disabled agents are skipped by the scheduler and refused by the runner.">
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </FormField>
                <FormField
                  label="Trigger"
                  hint={agent.trigger_type === 'event'
                    ? 'Not editable. No edge function emits agent events today, so an event agent never fires.'
                    : 'Not editable: a chain needs a parent agent and a manual agent needs a dispatcher, so switching breaks the runner.'}
                >
                  <Input value={agent.trigger_type} disabled className="capitalize" />
                </FormField>
              </FormGrid>
              {isCron && (
                <FormField
                  label="Schedule"
                  hint={scheduleProblem
                    ? <span className="text-[hsl(var(--error))]">{scheduleProblem}</span>
                    : preview
                      ? `${preview}. agent-scheduler-cron checks every minute in UTC; day-of-month and day-of-week must BOTH match.`
                      : 'minute hour day-of-month month day-of-week, in UTC.'}
                >
                  <Input value={schedule} className="font-mono" onChange={(e) => setSchedule(e.target.value)} />
                </FormField>
              )}
            </FormSection>

            <FormSection title="Model">
              <FormField
                label="Model"
                hint={facts && !facts.usesModel ? 'This runner makes no model call; the value is only recorded on its runs.' : 'Chosen from active LLM rows in AI model pricing.'}
              >
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger><SelectValue placeholder="Choose a model" /></SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                label="System Prompt Override"
                optional
                hint={facts && !facts.usesPrompt ? 'This runner ignores it.' : 'Replaces the runner\'s system prompt. Leave empty to use the registry prompt.'}
              >
                <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              </FormField>
            </FormSection>

            <FormSection
              title="Config"
              description="A JSON object merged under each run's input (run input wins on a clash)."
            >
              <FormField label="Config JSON">
                <Textarea rows={8} className="font-mono text-xs" value={configText} onChange={(e) => setConfigText(e.target.value)} />
              </FormField>
              {facts ? (
                facts.keys.length > 0 ? (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {facts.keys.map(([k, d]) => (
                      <li key={k}><span className="font-mono text-foreground">{k}</span> — {d}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">This runner reads no config keys.</p>
                )
              ) : (
                <p className="text-xs text-muted-foreground">No runner reads this config; keys here are consumed elsewhere, if at all.</p>
              )}
            </FormSection>

            {errors.length > 0 && (
              <ul className="space-y-1 rounded-sm border border-[hsl(var(--error)/0.3)] bg-[hsl(var(--error-bg))] px-3 py-2 text-xs text-[hsl(var(--error))]">
                {errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !agent}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
