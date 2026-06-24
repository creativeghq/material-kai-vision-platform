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
import { ImagePlus, X } from 'lucide-react';
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
  renderPromptTemplate, buildToolInput,
  type ToolkitQuickStart, type ToolkitDefinition, type ToolkitFormField,
} from './agentToolsCatalog';

export type ToolkitFormModalState = {
  quickStart: ToolkitQuickStart;
  toolkit: ToolkitDefinition;
  /**
   * Per-field seed values applied over the field defaults when the modal opens.
   * Used to pre-fill an `image` field with a photo the user already attached, so
   * an interior quick-start launched from the composer doesn't ask for it twice.
   */
  prefill?: Record<string, string>;
} | null;

interface Props {
  state: ToolkitFormModalState;
  onClose: () => void;
  /** Called with the fully-rendered prompt. The parent injects + auto-sends it. */
  onSubmit: (renderedPrompt: string) => void;
  /**
   * Called for quick-starts that carry a `run` descriptor — the parent fires a
   * deterministic tool run (mode:'direct_tool') instead of sending a prompt.
   * When omitted, run-enabled quick-starts gracefully fall back to onSubmit.
   */
  onRunTool?: (args: {
    toolName: string;
    toolInput: Record<string, unknown>;
    toolkit: ToolkitDefinition;
    quickStart: ToolkitQuickStart;
  }) => void;
  /**
   * Called for quick-starts that carry a `generation` descriptor (interior image
   * flows). The parent attaches the captured photo(s), forces the generation
   * pipeline (`mode`) or opens a guided builder (`opensModal`), and auto-sends
   * the rendered prompt. Falls back to onSubmit when the parent doesn't provide it.
   */
  onGenerate?: (args: {
    images: string[];
    mode?: string;
    opensModal?: 'virtual-staging' | 'gemini-edit';
    renderedPrompt: string;
    toolkit: ToolkitDefinition;
    quickStart: ToolkitQuickStart;
  }) => void;
}

// Readable market name → ISO-3166 alpha-2 code for the `country_code` field
// kind. Codes are what the SEO tools expect (z.string().length(2)).
const COUNTRY_CODES: Array<{ code: string; label: string }> = [
  { code: 'US', label: 'United States' }, { code: 'GB', label: 'United Kingdom' },
  { code: 'GR', label: 'Greece' }, { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' }, { code: 'IT', label: 'Italy' },
  { code: 'ES', label: 'Spain' }, { code: 'NL', label: 'Netherlands' },
  { code: 'CY', label: 'Cyprus' }, { code: 'PT', label: 'Portugal' },
  { code: 'BE', label: 'Belgium' }, { code: 'AT', label: 'Austria' },
  { code: 'CH', label: 'Switzerland' }, { code: 'IE', label: 'Ireland' },
  { code: 'CA', label: 'Canada' }, { code: 'AU', label: 'Australia' },
];

// Readable market names for the `country` field kind. Values are the readable
// strings so the rendered prompt flows naturally ("...in the United Kingdom").
const COMMON_MARKETS = [
  'the United States', 'the United Kingdom', 'Greece', 'Germany', 'France',
  'Italy', 'Spain', 'the Netherlands', 'Cyprus', 'Portugal', 'Belgium',
  'Australia', 'Canada', 'globally',
];

export function ToolkitFormModal({ state, onClose, onSubmit, onRunTool, onGenerate }: Props) {
  const open = !!state;
  const [values, setValues] = useState<Record<string, string>>({});

  const fields = state?.quickStart.form ?? [];
  const imageFieldKeys = useMemo(() => fields.filter((f) => f.kind === 'image').map((f) => f.key), [fields]);

  // Reset to per-field defaults whenever a new quick-start opens.
  useEffect(() => {
    if (!state) return;
    const init: Record<string, string> = {};
    for (const f of state.quickStart.form ?? []) init[f.key] = state.prefill?.[f.key] ?? f.default ?? '';
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
    // Image-generation handoff (interior flows): split the captured photo(s) from
    // the text fields, render the prompt from text only (image data URLs must
    // never leak into the prompt), and let the parent attach + send / open the
    // guided builder.
    if (state.quickStart.generation && onGenerate) {
      const gen = state.quickStart.generation;
      const images = (gen.imageKeys ?? imageFieldKeys)
        .map((k) => (values[k] ?? '').trim())
        .filter(Boolean);
      const textValues: Record<string, string> = { ...values };
      for (const k of imageFieldKeys) delete textValues[k];
      const template = state.quickStart.promptTemplate || state.quickStart.prompt;
      onGenerate({
        images,
        mode: gen.mode,
        opensModal: gen.opensModal,
        renderedPrompt: renderPromptTemplate(template, textValues),
        toolkit: state.toolkit,
        quickStart: state.quickStart,
      });
      onClose();
      return;
    }
    // Deterministic run: map collected values → structured tool args and fire a
    // direct tool invocation (no LLM). Falls back to prompt-injection if the
    // parent didn't provide onRunTool.
    if (state.quickStart.run && onRunTool) {
      onRunTool({
        toolName: state.quickStart.run.tool,
        toolInput: buildToolInput(state.quickStart.run, values),
        toolkit: state.toolkit,
        quickStart: state.quickStart,
      });
      onClose();
      return;
    }
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
            {state.quickStart.generation ? 'Generate' : 'Run'}
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
    case 'image':
      return (
        <div className="mt-1">
          {value ? (
            <div className="relative inline-block">
              <img src={value} alt={field.label} className="max-h-40 rounded-md border border-border object-contain" />
              <button
                type="button"
                onClick={() => onChange('')}
                className="absolute -right-2 -top-2 rounded-full bg-background border border-border p-1 text-muted-foreground shadow hover:text-destructive"
                aria-label="Remove image"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground transition-colors hover:bg-muted/50">
              <ImagePlus className="h-5 w-5" />
              <span>{field.placeholder || 'Click to upload a photo'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => onChange(typeof reader.result === 'string' ? reader.result : '');
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          )}
        </div>
      );
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
    case 'country_code':
      // Shows readable market names, emits the ISO alpha-2 code the tools want.
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder={field.placeholder || 'Select a market…'} /></SelectTrigger>
          <SelectContent>
            {COUNTRY_CODES.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
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
