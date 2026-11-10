import React, { useMemo, useState } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { humanizeLabel } from '@/utils/humanize';
import { formatNumber } from '@/utils/decimal';

/** The loader for these types reads `system_prompt` and nothing else. */
export const SYSTEM_PROMPT_TYPES = new Set(['agent', 'system']);

export interface PromptRow {
  id: string;
  prompt_type: string;
  category: string;
  subcategory: string | null;
  name: string;
  description: string | null;
  prompt_text: string;
  system_prompt: string | null;
  stage: string | null;
  industry: string | null;
  configuration: Record<string, unknown> | null;
  used_in: string[] | null;
  version: number;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const NONE = '__none';
const NEW_TYPE = '__new';
const TUNED_KEYS = ['model', 'temperature', 'max_tokens', 'maxTokens'];

const splitConfig = (config: Record<string, unknown> | null) => {
  const c = config ?? {};
  const maxKey = 'maxTokens' in c && !('max_tokens' in c) ? 'maxTokens' : 'max_tokens';
  const rest = Object.fromEntries(Object.entries(c).filter(([k]) => !TUNED_KEYS.includes(k)));
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    maxKey,
    model: str(c.model),
    temperature: str(c.temperature),
    maxTokens: str(c[maxKey]),
    rest: Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '',
  };
};

interface Props {
  prompt: PromptRow | null;
  typeOptions: string[];
  categoryOptions: string[];
  stageOptions: string[];
  modelOptions: string[];
  onClose: () => void;
  onSaved: () => void;
}

export const PromptFormDialog: React.FC<Props> = ({
  prompt, typeOptions, categoryOptions, stageOptions, modelOptions, onClose, onSaved,
}) => {
  const isNew = !prompt;
  const { toast } = useToast();
  const initialConfig = useMemo(() => splitConfig(prompt?.configuration ?? null), [prompt]);
  const [typeChoice, setTypeChoice] = useState(prompt?.prompt_type ?? typeOptions[0] ?? NEW_TYPE);
  const [newType, setNewType] = useState('');
  const [category, setCategory] = useState(prompt?.category ?? '');
  const [subcategory, setSubcategory] = useState(prompt?.subcategory ?? '');
  const [stage, setStage] = useState(prompt?.stage ?? '');
  const [name, setName] = useState(prompt?.name ?? '');
  const [description, setDescription] = useState(prompt?.description ?? '');
  const [promptText, setPromptText] = useState(prompt?.prompt_text ?? '');
  const [systemPrompt, setSystemPrompt] = useState(prompt?.system_prompt ?? '');
  const [model, setModel] = useState(initialConfig.model);
  const [temperature, setTemperature] = useState(initialConfig.temperature);
  const [maxTokens, setMaxTokens] = useState(initialConfig.maxTokens);
  const [restJson, setRestJson] = useState(initialConfig.rest);
  const [addSystem, setAddSystem] = useState(false);
  const [isActive, setIsActive] = useState(prompt?.is_active ?? true);
  const [changeReason, setChangeReason] = useState('');
  const [saving, setSaving] = useState(false);

  const promptType = typeChoice === NEW_TYPE ? newType.trim().toLowerCase() : typeChoice;
  const systemOnly = SYSTEM_PROMPT_TYPES.has(promptType);
  const showSystem = systemOnly || addSystem || !!prompt?.system_prompt?.trim();
  const showText = !systemOnly || !isNew;
  const models = useMemo(
    () => (model && !modelOptions.includes(model) ? [model, ...modelOptions] : modelOptions),
    [model, modelOptions],
  );

  const buildConfiguration = (): Record<string, unknown> | string => {
    let rest: unknown = {};
    if (restJson.trim()) {
      try {
        rest = JSON.parse(restJson);
      } catch (e) {
        return `Other Configuration is not valid JSON: ${(e as Error).message}`;
      }
      if (!rest || typeof rest !== 'object' || Array.isArray(rest)) return 'Other Configuration must be a JSON object';
    }
    const original = prompt?.configuration ?? {};
    const out: Record<string, unknown> = { ...(rest as Record<string, unknown>) };
    const put = (key: string, value: unknown) => {
      if (value !== null) out[key] = value;
      else if (key in original) out[key] = null;
    };
    put('model', model || null);
    if (temperature.trim()) {
      const t = Number(temperature);
      if (!Number.isFinite(t) || t < 0 || t > 2) return 'Temperature must be a number between 0 and 2';
      put('temperature', t);
    } else put('temperature', null);
    if (maxTokens.trim()) {
      const n = Number(maxTokens);
      if (!Number.isInteger(n) || n <= 0) return 'Max Tokens must be a positive whole number';
      put(initialConfig.maxKey, n);
    } else put(initialConfig.maxKey, null);
    return out;
  };

  const handleSave = async () => {
    const configuration = buildConfiguration();
    if (typeof configuration === 'string') {
      toast({ title: 'Check the configuration', description: configuration, variant: 'destructive' });
      return;
    }
    if (isNew && (!promptType || !category.trim() || !name.trim())) {
      toast({ title: 'Type, category and name are required', variant: 'destructive' });
      return;
    }
    if (systemOnly ? !systemPrompt.trim() : !promptText.trim()) {
      toast({ title: systemOnly ? 'A system prompt is required' : 'Prompt text is required', variant: 'destructive' });
      return;
    }
    if (!isNew && !changeReason.trim()) {
      toast({ title: 'Please provide a reason for this change', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const { error } = await supabase.rpc('create_prompt_with_history', {
          p_prompt_type: promptType,
          p_category: category.trim(),
          p_name: name.trim(),
          p_prompt_text: systemOnly ? '' : promptText,
          p_change_reason: changeReason.trim() || undefined,
          p_subcategory: subcategory.trim() || undefined,
          p_stage: stage.trim() || undefined,
          p_description: description.trim() || undefined,
          p_system_prompt: showSystem ? systemPrompt : undefined,
          p_configuration: configuration as Json,
          p_is_active: isActive,
        });
        if (error) throw error;
        toast({
          title: 'Prompt created',
          description: isActive ? `${name.trim()} is live.` : `${name.trim()} was saved inactive; set Status to Inactive to find it.`,
        });
      } else {
        const { error } = await supabase.rpc('update_prompt_with_history', {
          p_prompt_id: prompt.id,
          p_new_text: promptText,
          p_new_description: description,
          p_change_reason: changeReason,
          p_new_system_prompt: systemPrompt,
          p_new_configuration: configuration as Json,
          p_new_is_active: isActive !== prompt.is_active ? isActive : undefined,
        });
        if (error) throw error;
        toast({ title: 'Prompt updated', description: `${prompt.name} saved.` });
      }
      onSaved();
    } catch (error) {
      toast({ title: 'Save failed', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New prompt' : prompt.name}</DialogTitle>
          <DialogDescription>
            {isNew
              ? 'Creates a global prompt and records it as the first entry in its change history.'
              : [
                  humanizeLabel(prompt.prompt_type),
                  humanizeLabel(prompt.category),
                  prompt.stage ? humanizeLabel(prompt.stage) : null,
                  prompt.industry ? humanizeLabel(prompt.industry) : null,
                  `Version ${prompt.version}`,
                ].filter(Boolean).join(' · ')}
          </DialogDescription>
        </DialogHeader>

        <datalist id="prompt-category-options">
          {categoryOptions.map((c) => <option key={c} value={c} />)}
        </datalist>
        <datalist id="prompt-stage-options">
          {stageOptions.map((s) => <option key={s} value={s} />)}
        </datalist>

        <div className="space-y-5 py-2">
          <FormSection title="Identity">
            <FormGrid>
              {isNew && (
                <>
                  <FormField label="Type">
                    <Select value={typeChoice} onValueChange={setTypeChoice}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {typeOptions.map((t) => <SelectItem key={t} value={t}>{humanizeLabel(t)}</SelectItem>)}
                        <SelectItem value={NEW_TYPE}>New Type</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  {typeChoice === NEW_TYPE && (
                    <FormField label="New Type" hint="Lowercase snake_case, e.g. summarization.">
                      <Input value={newType} onChange={(e) => setNewType(e.target.value)} />
                    </FormField>
                  )}
                  <FormField label="Name">
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </FormField>
                  <FormField label="Category" hint="The key loaders look the prompt up by.">
                    <Input list="prompt-category-options" value={category} onChange={(e) => setCategory(e.target.value)} />
                  </FormField>
                  <FormField label="Subcategory" optional>
                    <Input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
                  </FormField>
                  <FormField label="Stage" optional>
                    <Input list="prompt-stage-options" value={stage} onChange={(e) => setStage(e.target.value)} />
                  </FormField>
                </>
              )}
              <FormField label="Description" optional className="sm:col-span-2">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of what this prompt does"
                />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Prompt">
            <FormGrid cols={1}>
              {showSystem && (
                <FormField
                  label="System Prompt"
                  hint={systemOnly
                    ? `The only column this type's loader reads. ${formatNumber(systemPrompt.length)} characters.`
                    : `${formatNumber(systemPrompt.length)} characters.`}
                >
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="min-h-[240px] font-mono text-sm"
                  />
                </FormField>
              )}
              {showText && (
                <FormField
                  label="Prompt Text"
                  hint={systemOnly
                    ? 'Not read at runtime for this type; kept as stored.'
                    : `${formatNumber(promptText.length)} characters.`}
                >
                  <Textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    className="min-h-[240px] font-mono text-sm"
                    readOnly={systemOnly}
                  />
                </FormField>
              )}
              {!showSystem && (
                <div>
                  <Button type="button" size="sm" variant="outline" onClick={() => setAddSystem(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add system prompt
                  </Button>
                </div>
              )}
            </FormGrid>
          </FormSection>

          <FormSection title="Configuration" description="Stored in the prompt's configuration; blank fields are left unset.">
            <FormGrid cols={3}>
              <FormField label="Model" optional>
                <Select value={model || NONE} onValueChange={(v) => setModel(v === NONE ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not Set</SelectItem>
                    {models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Temperature" optional>
                <Input type="number" step="0.1" min="0" max="2" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
              </FormField>
              <FormField label="Max Tokens" optional>
                <Input type="number" step="1" min="1" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
              </FormField>
              <FormField label="Other Configuration" optional hint="A JSON object; checked before saving." className="sm:col-span-3">
                <Textarea
                  value={restJson}
                  onChange={(e) => setRestJson(e.target.value)}
                  className="min-h-[120px] font-mono text-xs"
                  placeholder="{}"
                />
              </FormField>
            </FormGrid>
          </FormSection>

          {!isNew && prompt.used_in?.length ? (
            <FormSection title="Used In">
              <ul className="space-y-0.5 font-mono text-xs text-muted-foreground">
                {prompt.used_in.map((loc) => <li key={loc}>{loc}</li>)}
              </ul>
            </FormSection>
          ) : null}

          <FormSection title="Record">
            <FormGrid>
              <FormField
                label="Change Reason"
                optional={isNew}
                hint="Recorded in the prompt's change history."
                className="sm:col-span-2"
              >
                <Input
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="e.g. Improved extraction accuracy for product dimensions"
                />
              </FormField>
              <div className="flex items-center gap-2">
                <Switch id="prompt-is-active" checked={isActive} onCheckedChange={setIsActive} />
                <Label htmlFor="prompt-is-active" className="text-sm">Active</Label>
              </div>
            </FormGrid>
          </FormSection>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || (!isNew && !changeReason.trim())}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : isNew ? 'Create prompt' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
