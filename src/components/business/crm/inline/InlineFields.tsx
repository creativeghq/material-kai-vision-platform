/**
 * View-first inline-edit primitives for the CRM detail pages (item 9). Each field
 * renders its value as TEXT with a hover pencil (click to edit) and a copy icon.
 * Committing calls `onSave(value)` which patches immediately (optimistic) — there
 * is no page-level Edit/Save mode for existing records. Esc cancels, Enter / blur
 * commits (Textarea commits on blur; Enter inserts a newline).
 *
 * Used by ContactDetailPage / CompanyDetailPage.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Copy, Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';

type SaveFn = (value: any) => Promise<void> | void;

/** Small copy-to-clipboard button shown next to copyable values. */
export const CopyButton: React.FC<{ value?: string | null; className?: string }> = ({ value, className }) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!value) return null;
  return (
    <button
      type="button"
      aria-label="Copy"
      className={`shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity ${className ?? ''}`}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(String(value));
          setCopied(true);
          timer.current = setTimeout(() => setCopied(false), 1200);
        } catch {
          toast({ title: 'Copy failed', variant: 'destructive' });
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

interface RowShellProps {
  label?: string;
  hint?: string;
  children: React.ReactNode;
}
const Field: React.FC<RowShellProps> = ({ label, hint, children }) => (
  <div className="space-y-1">
    {label && <div className="text-xs font-medium text-muted-foreground">{label}</div>}
    {children}
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

/** Read-only display row with a copy button (no editing) — for derived values. */
export const InlineReadonly: React.FC<{ label?: string; value?: React.ReactNode; copyValue?: string | null }> = ({ label, value, copyValue }) => (
  <Field label={label}>
    <div className="group flex items-center gap-2 min-h-[28px]">
      <span className="text-sm">{value === '' || value === null || value === undefined ? <span className="text-muted-foreground">—</span> : value}</span>
      {copyValue && <CopyButton value={copyValue} />}
    </div>
  </Field>
);

interface InlineTextProps {
  value: string | number | null | undefined;
  onSave: SaveFn;
  label?: string;
  placeholder?: string;
  hint?: string;
  type?: 'text' | 'email' | 'tel' | 'url' | 'number';
  multiline?: boolean;
  copy?: boolean;
  emptyText?: string;
  /** Render the saved value with custom formatting (display only). */
  display?: (v: string) => React.ReactNode;
  /** Always render the raw input (no view mode) — used for the create-new form. */
  alwaysEdit?: boolean;
}

const toSaveValue = (raw: string, type: string) =>
  type === 'number' ? (raw === '' ? null : Number(raw)) : (raw === '' ? null : raw);

/** Click-to-edit text / textarea / number field with copy. */
export const InlineText: React.FC<InlineTextProps> = ({
  value, onSave, label, placeholder, hint, type = 'text', multiline, copy = true, emptyText = 'Not set', display, alwaysEdit,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const str = value == null ? '' : String(value);

  const begin = () => { setDraft(str); setEditing(true); };
  const commit = async () => {
    if (draft === str) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(toSaveValue(draft, type));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  // Create-new form: a plain always-on field bound directly to parent state.
  if (alwaysEdit) {
    return (
      <Field label={label} hint={hint}>
        {multiline ? (
          <Textarea value={str} placeholder={placeholder} rows={3} onChange={(e) => onSave(toSaveValue(e.target.value, type))} />
        ) : (
          <Input type={type} value={str} placeholder={placeholder} onChange={(e) => onSave(toSaveValue(e.target.value, type))} />
        )}
      </Field>
    );
  }

  if (editing) {
    const commonProps = {
      autoFocus: true,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      placeholder,
    };
    return (
      <Field label={label} hint={hint}>
        {multiline ? (
          <Textarea {...commonProps} rows={3} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }} />
        ) : (
          <Input
            {...commonProps}
            type={type}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setEditing(false); }}
          />
        )}
      </Field>
    );
  }

  return (
    <Field label={label} hint={hint}>
      <div
        className="group flex items-center gap-2 min-h-[28px] cursor-text rounded px-1 -mx-1 hover:bg-muted/40"
        onClick={begin}
      >
        <span className="flex-1 text-sm break-words">
          {str ? (display ? display(str) : str) : <span className="text-muted-foreground">{emptyText}</span>}
        </span>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : (
          <>
            {copy && <CopyButton value={str} />}
            <Pencil className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-60" />
          </>
        )}
      </div>
    </Field>
  );
};

interface InlineSelectProps {
  value: string | null | undefined;
  onSave: SaveFn;
  options: Array<{ value: string; label: React.ReactNode; searchText?: string }>;
  label?: string;
  hint?: string;
  placeholder?: string;
  /** Display label for the current value (falls back to matching option). */
  displayValue?: React.ReactNode;
  /** Value treated as "unset" / cleared → saves null. */
  unsetValue?: string;
  copyValue?: string | null;
  /** Always render the dropdown (no view mode) — used for the create-new form. */
  alwaysEdit?: boolean;
}

/**
 * Inline select. Renders a single always-mounted Radix Select so there is no
 * view↔edit state to race with the dropdown's open/close (an earlier version used
 * `defaultOpen` + `onOpenChange→setEditing(false)` which collapsed before a pick
 * could register). In view mode the trigger is borderless and reads like text,
 * with the chevron fading in on hover; `alwaysEdit` (create form) shows a normal
 * bordered control.
 */
export const InlineSelect: React.FC<InlineSelectProps> = ({
  value, onSave, options, label, hint, placeholder = 'Not set', displayValue, unsetValue = '__unset', copyValue, alwaysEdit,
}) => {
  const [saving, setSaving] = useState(false);
  const triggerClass = alwaysEdit
    ? ''
    : 'border-0 shadow-none h-auto py-1 px-1 -mx-1 hover:bg-muted/40 focus:ring-0 focus:ring-offset-0 [&>svg]:opacity-0 group-hover:[&>svg]:opacity-50';
  return (
    <Field label={label} hint={hint}>
      <div className="group flex items-center gap-1">
        <Select
          value={value ?? unsetValue}
          onValueChange={async (v) => {
            setSaving(true);
            try { await onSave(v === unsetValue ? null : v); } finally { setSaving(false); }
          }}
        >
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder={placeholder}>{displayValue}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={unsetValue}>{placeholder}</SelectItem>
            {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
        {!alwaysEdit && copyValue && <CopyButton value={copyValue} />}
      </div>
    </Field>
  );
};
