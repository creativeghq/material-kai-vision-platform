/**
 * WorkflowInlineForm — renders a small form for a single step that needs
 * user input. Schema-driven so every step's form looks the same; specialised
 * field types (pdf_picker, category_picker, ...) call out to the right
 * Supabase tables to populate options.
 *
 * On submit, calls onSubmit(values). The parent (AgentHub) is responsible for
 * either: (a) sending those values into the chat as a message the agent
 * picks up, or (b) calling the relevant tool directly.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, ArrowDownToLine, X } from 'lucide-react';
import { getErrorMessage } from '@/core/errors/utils';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Badge } from '@/components/core/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { WorkflowFieldSchema } from './types';

interface Props {
  prompt?: string;
  schema: WorkflowFieldSchema[];
  initialValues?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
  loading?: boolean;
}

interface PickerOption {
  value: string;
  label: string;
  description?: string;
}

export const WorkflowInlineForm: React.FC<Props> = ({
  prompt, schema, initialValues, onSubmit, onCancel, submitLabel = 'Continue', loading,
}) => {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = { ...(initialValues || {}) };
    for (const f of schema) {
      if (init[f.name] === undefined && f.defaultValue !== undefined) {
        init[f.name] = f.defaultValue;
      }
    }
    return init;
  });

  const [submitting, setSubmitting] = useState(false);

  const update = (name: string, value: any) => setValues((prev) => ({ ...prev, [name]: value }));

  const isValid = useMemo(() => {
    for (const f of schema) {
      if (!f.required) continue;
      const v = values[f.name];
      if (v === undefined || v === null || v === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
    }
    return true;
  }, [schema, values]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting || loading) return;
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 space-y-3 bg-card/50">
      {prompt && (
        <p className="text-xs text-muted-foreground">{prompt}</p>
      )}

      <div className="space-y-2.5">
        {schema.map((f) => (
          <FieldRow key={f.name} field={f} value={values[f.name]} onChange={(v) => update(f.name, v)} />
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={submitting || loading}>
            <X className="h-3 w-3 mr-1" /> Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!isValid || submitting || loading}>
          {(submitting || loading) ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};

const FieldRow: React.FC<{
  field: WorkflowFieldSchema;
  value: any;
  onChange: (v: any) => void;
}> = ({ field, value, onChange }) => {
  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1">
        {field.label}
        {field.required && <span className="text-destructive">*</span>}
      </Label>
      <FieldInput field={field} value={value} onChange={onChange} />
      {field.hint && <p className="text-[10px] text-muted-foreground">{field.hint}</p>}
    </div>
  );
};

const FieldInput: React.FC<{
  field: WorkflowFieldSchema;
  value: any;
  onChange: (v: any) => void;
}> = ({ field, value, onChange }) => {
  switch (field.type) {
    case 'textarea':
      return <Textarea value={value || ''} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.placeholder} />;
    case 'number':
      return <Input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} placeholder={field.placeholder} />;
    case 'email':
      return <Input type="email" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />;
    case 'url':
      return <Input type="url" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || 'https://'} />;
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={!!value} onCheckedChange={(v) => onChange(v === true)} />
          <span className="text-xs">{field.placeholder}</span>
        </label>
      );
    case 'select':
      return (
        <Select value={String(value ?? '')} onValueChange={onChange}>
          <SelectTrigger className="text-sm h-8"><SelectValue placeholder={field.placeholder} /></SelectTrigger>
          <SelectContent>
            {(field.options || []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}{o.description ? <span className="text-muted-foreground text-xs ml-1">— {o.description}</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'multiselect':
      return <MultiSelect field={field} value={value} onChange={onChange} />;
    case 'pdf_picker':
      return <RemoteOptionsPicker field={field} value={value} onChange={onChange} multi={field.multi ?? true} loader={loadCatalogSourcePdfs} />;
    case 'category_picker':
      return <RemoteOptionsPicker field={field} value={value} onChange={onChange} multi={field.multi ?? true} loader={loadCrmCategories} />;
    case 'product_picker':
      return <RemoteOptionsPicker field={field} value={value} onChange={onChange} multi={field.multi ?? false} loader={loadProducts} />;
    case 'catalog_picker':
      return <RemoteOptionsPicker field={field} value={value} onChange={onChange} multi={field.multi ?? false} loader={() => loadCatalogs(field.status_filter)} />;
    case 'text':
    default:
      return <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />;
  }
};

const MultiSelect: React.FC<{
  field: WorkflowFieldSchema;
  value: string[] | undefined;
  onChange: (v: string[]) => void;
}> = ({ field, value, onChange }) => {
  const set = new Set(value || []);
  return (
    <div className="flex flex-wrap gap-1">
      {(field.options || []).map((o) => {
        const active = set.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(active ? [...set].filter((v) => v !== o.value) : [...set, o.value])}
            className={`px-2.5 py-1 rounded-full text-xs border ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
};

const RemoteOptionsPicker: React.FC<{
  field: WorkflowFieldSchema;
  value: string | string[] | undefined;
  onChange: (v: any) => void;
  multi: boolean;
  loader: () => Promise<PickerOption[]>;
}> = ({ field, value, onChange, multi, loader }) => {
  const { toast } = useToast();
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((opts) => { if (!cancelled) setOptions(opts); })
      .catch((err) => toast({ title: 'Load failed', description: getErrorMessage(err), variant: 'destructive' }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loader, toast]);

  if (loading) {
    return <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>;
  }

  if (options.length === 0) {
    return <div className="text-xs text-muted-foreground italic">No options available.</div>;
  }

  if (!multi) {
    return (
      <Select value={String(value ?? '')} onValueChange={onChange}>
        <SelectTrigger className="text-sm h-8"><SelectValue placeholder={field.placeholder || 'Pick one'} /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}{o.description ? <span className="text-muted-foreground text-xs ml-1">— {o.description}</span> : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const set = new Set((value as string[]) || []);
  return (
    <div className="space-y-1.5 max-h-40 overflow-y-auto">
      {options.map((o) => {
        const active = set.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(active ? [...set].filter((v) => v !== o.value) : [...set, o.value])}
            className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex items-center gap-2 border transition ${
              active ? 'bg-primary/10 border-primary text-foreground' : 'border-border hover:border-primary/40'
            }`}
          >
            <span className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${active ? 'bg-primary border-primary' : 'border-border'}`}>
              {active && <ArrowDownToLine className="h-2 w-2 text-primary-foreground" />}
            </span>
            <span className="flex-1 truncate">{o.label}</span>
            {o.description && <Badge variant="outline" className="text-[10px] py-0 shrink-0">{o.description}</Badge>}
          </button>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Loaders for remote pickers
// ─────────────────────────────────────────────────────────────────────────────

async function loadCatalogSourcePdfs(): Promise<PickerOption[]> {
  const { data, error } = await supabase
    .from('catalog_source_pdfs')
    .select('id, original_filename, manufacturer_name, page_count')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    value: r.id,
    label: r.original_filename,
    description: [r.manufacturer_name, r.page_count ? `${r.page_count}p` : null].filter(Boolean).join(' · '),
  }));
}

async function loadCrmCategories(): Promise<PickerOption[]> {
  const { data, error } = await supabase
    .from('crm_categories_summary')
    .select('id, name, slug, total_count')
    .eq('is_active', true)
    .order('total_count', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    value: r.id,
    label: r.name,
    description: `${r.total_count} member${r.total_count === 1 ? '' : 's'}`,
  }));
}

async function loadProducts(): Promise<PickerOption[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    value: r.id,
    label: r.name,
    description: r.sku || undefined,
  }));
}

async function loadCatalogs(statusFilter?: Array<string>): Promise<PickerOption[]> {
  let q = supabase
    .from('presentation_catalogs')
    .select('id, title, slug, status, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (statusFilter && statusFilter.length > 0) q = q.in('status', statusFilter);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r: any) => ({
    value: r.id,
    label: r.title,
    description: [r.status, r.slug ? `/c/${r.slug}` : null].filter(Boolean).join(' · '),
  }));
}
