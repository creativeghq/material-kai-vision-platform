/**
 * ToolkitFormModal — generic "collect-then-send" form for toolkit quick-starts.
 *
 * Why this exists: most toolkit quick-starts used to fire a vague prompt and
 * then have the agent ask "which keyword? / which domain? / which country?" in
 * chat — multiple round trips for one result. When a quick-start declares a
 * `form` (see ToolkitQuickStart in agentToolsCatalog), clicking it instead
 * opens this modal, COLLECTS every required field up front, renders the
 * quick-start's `promptTemplate` with the values, and auto-sends ONE complete
 * message. Same shape as JobSitesFormModal, but driven entirely by data so a
 * single component powers every toolkit.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  renderPromptTemplate,
  type ToolkitQuickStart, type ToolkitDefinition, type ToolkitFormField,
} from './agentToolsCatalog';

export type ToolkitFormModalState = {
  quickStart: ToolkitQuickStart;
  toolkit: ToolkitDefinition;
} | null;

interface Props {
  state: ToolkitFormModalState;
  onClose: () => void;
  /** Called with the fully-rendered prompt. The parent injects + auto-sends it. */
  onSubmit: (renderedPrompt: string) => void;
}

// Readable market names for the `country` field kind. Values are the readable
// strings so the rendered prompt flows naturally ("...in the United Kingdom").
const COMMON_MARKETS = [
  'the United States', 'the United Kingdom', 'Greece', 'Germany', 'France',
  'Italy', 'Spain', 'the Netherlands', 'Cyprus', 'Portugal', 'Belgium',
  'Australia', 'Canada', 'globally',
];

export function ToolkitFormModal({ state, onClose, onSubmit }: Props) {
  const open = !!state;
  const [values, setValues] = useState<Record<string, string>>({});

  const fields = state?.quickStart.form ?? [];

  // Reset to per-field defaults whenever a new quick-start opens.
  useEffect(() => {
    if (!state) return;
    const init: Record<string, string> = {};
    for (const f of state.quickStart.form ?? []) init[f.key] = f.default ?? '';
    setValues(init);
  }, [state]);

  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  const missingRequired = useMemo(
    () => fields
      .filter((f) => f.required && !(values[f.key] ?? '').trim())
      .map((f) => f.label),
    [fields, values],
  );

  if (!state) return null;

  const handleSubmit = () => {
    if (missingRequired.length > 0) return;
    const template = state.quickStart.promptTemplate || state.quickStart.prompt;
    onSubmit(renderPromptTemplate(template, values));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{state.quickStart.label}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">{state.quickStart.description}</p>

        <div className="space-y-3 mt-1">
          {fields.map((f) => (
            <div key={f.key}>
              <Label className="text-xs">
                {f.label}{f.required ? ' *' : ''}
              </Label>
              <FieldInput field={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
              {f.help && <p className="text-[11px] text-muted-foreground mt-1">{f.help}</p>}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={missingRequired.length > 0}>
            Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FieldInput: React.FC<{
  field: ToolkitFormField;
  value: string;
  onChange: (v: string) => void;
}> = ({ field, value, onChange }) => {
  switch (field.kind) {
    case 'textarea':
    case 'tags':
      return (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={field.kind === 'tags' ? 'font-mono text-xs' : undefined}
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
    case 'select':
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder={field.placeholder || 'Select…'} /></SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'country':
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder={field.placeholder || 'Select a market…'} /></SelectTrigger>
          <SelectContent>
            {COMMON_MARKETS.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'text':
    default:
      return (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
  }
};

export default ToolkitFormModal;
