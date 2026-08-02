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
import { Pencil, Copy, Check, Loader2, ChevronsUpDown, Plus, X } from 'lucide-react';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Textarea } from '@/components/core/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/core/ui/command';
import { useToast } from '@/hooks/use-toast';

import { onEnterOrSpace } from '@/utils/a11y';

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
  type?: 'text' | 'email' | 'tel' | 'url' | 'number' | 'date';
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

// Inline multiline editing should read like "typing into the line" — not a big
// bordered box. Strip the card chrome (border/rounding/min-height/bg) and leave a
// single bottom rule that highlights on focus.
const INLINE_TEXTAREA_CLASS =
  'min-h-0 rounded-none border-0 border-b border-input bg-transparent px-0 py-1 shadow-none resize-none ' +
  'hover:border-input focus-visible:ring-0 focus-visible:border-primary';

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
          <Textarea className={INLINE_TEXTAREA_CLASS} value={str} placeholder={placeholder} rows={2} onChange={(e) => onSave(toSaveValue(e.target.value, type))} />
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
          <Textarea {...commonProps} className={INLINE_TEXTAREA_CLASS} rows={2} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }} />
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
        role="button"
        tabIndex={0}
        onKeyDown={onEnterOrSpace(() => begin)}
        className="group flex items-center gap-2 min-h-[28px] cursor-text rounded px-2 hover:bg-muted/40"
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

interface InlineMultiSelectProps {
  /** Currently-selected option values. */
  values: string[];
  options: Array<{ value: string; label: string; searchText?: string }>;
  /** Toggle one option. The parent owns persistence (and optimistic state). */
  onToggle: (value: string) => void | Promise<void>;
  label?: string;
  hint?: string;
  /** Shown when nothing is selected. */
  placeholder?: string;
  /** Parent-driven spinner (a save is in flight). */
  saving?: boolean;
  readOnly?: boolean;
  searchThreshold?: number;
  /** When provided, the popover grows a "create a new option" footer. */
  onCreate?: (name: string) => void | Promise<void>;
  createPlaceholder?: string;
  emptyListText?: string;
}

/**
 * Multi-select sibling of InlineSelect: the selected chips ARE the trigger, so the field
 * reads like the text rows around it instead of parking a permanent dropdown button under
 * the value. Click anywhere on the chip row to open the searchable list; the chevron fades
 * in on hover exactly like InlineSelect. The popover stays open while toggling (unlike the
 * single-select, where picking is terminal), and each chip keeps an × for one-click removal.
 *
 * The trigger is a div, not a button: the chips carry their own × buttons and a button
 * cannot nest a button. role/tabIndex/Enter-Space restore the keyboard behaviour.
 */
export const InlineMultiSelect: React.FC<InlineMultiSelectProps> = ({
  values, options, onToggle, label, hint, placeholder = 'Not set', saving, readOnly,
  searchThreshold = 6, onCreate, createPlaceholder = 'Add new…', emptyListText = 'Nothing to choose from yet.',
}) => {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const selected = options.filter((o) => values.includes(o.value));
  const showSearch = options.length >= searchThreshold;

  const create = async () => {
    const name = newName.trim();
    if (!name || !onCreate) return;
    setCreating(true);
    try { await onCreate(name); setNewName(''); } finally { setCreating(false); }
  };

  const chips = (
    <div className="flex flex-1 flex-wrap items-center gap-1.5">
      {selected.length === 0
        ? <span className="text-sm text-muted-foreground">{placeholder}</span>
        : selected.map((o) => (
          <Badge key={o.value} variant="secondary" className="gap-1">
            {o.label}
            {!readOnly && (
              <button
                type="button"
                aria-label={`Remove ${o.label}`}
                // Removing must not also open the popover.
                onClick={(e) => { e.stopPropagation(); void onToggle(o.value); }}
                className="ml-0.5 opacity-70 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
    </div>
  );

  if (readOnly) {
    return <Field label={label} hint={hint}><div className="flex min-h-[28px] items-center px-2">{chips}</div></Field>;
  }

  return (
    <Field label={label} hint={hint}>
      <div className="group flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
              className="group/trigger flex min-h-[28px] w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/40 focus:outline-none"
            >
              {chips}
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[240px] p-0" align="start">
            <Command>
              {showSearch && <CommandInput placeholder="Search…" />}
              <CommandList>
                <CommandEmpty>No match.</CommandEmpty>
                <CommandGroup>
                  {options.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">{emptyListText}</p>
                  )}
                  {options.map((o) => (
                    <CommandItem
                      key={o.value}
                      // Filter on the LABEL, not the id: these options are UUID-keyed, and
                      // folding the uuid into cmdk's search value makes almost every keystroke
                      // match every row. Selection uses the closure, so the value is free.
                      value={o.searchText ?? o.label}
                      onSelect={() => onToggle(o.value)}
                    >
                      <Check className={`mr-2 h-3.5 w-3.5 shrink-0 ${values.includes(o.value) ? 'opacity-100' : 'opacity-0'}`} />
                      <span className="flex-1">{o.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
            {onCreate && (
              <div className="flex items-center gap-1.5 border-t p-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void create(); } }}
                  placeholder={createPlaceholder}
                  className="h-8 text-sm"
                />
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input hover:bg-muted disabled:opacity-50"
                  onClick={() => void create()}
                  disabled={creating || !newName.trim()}
                  aria-label="Add"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
      </div>
    </Field>
  );
};

interface InlineSelectProps {
  value: string | null | undefined;
  onSave: SaveFn;
  /** `searchText` drives the type-to-filter box; falls back to `value` when omitted. */
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
  /** Show the search box once the list reaches this many options (default 6). */
  searchThreshold?: number;
}

/**
 * Inline select rendered as a searchable combobox (Popover + cmdk Command) so any
 * long list (VAT-exemption reasons, countries, …) is type-to-filter. The search
 * box appears automatically once the list reaches `searchThreshold` options; short
 * lists stay a plain click-list. In view mode the trigger is borderless and reads
 * like text, with the chevron fading in on hover; `alwaysEdit` (create form) shows
 * a normal bordered control. Picking is a single closure (no reliance on cmdk's
 * lowercased value) so labels can be rich ReactNodes.
 */
export const InlineSelect: React.FC<InlineSelectProps> = ({
  value, onSave, options, label, hint, placeholder = 'Not set', displayValue, copyValue, alwaysEdit, searchThreshold = 6,
}) => {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const selected = value != null ? options.find((o) => o.value === value) : undefined;
  const current = displayValue ?? selected?.label;
  const showSearch = options.length >= searchThreshold;

  const pick = async (v: string | null) => {
    setOpen(false);
    if (v === (value ?? null)) return;
    setSaving(true);
    try { await onSave(v); } finally { setSaving(false); }
  };

  const triggerClass = alwaysEdit
    ? 'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
    : 'group/trigger flex min-h-[28px] w-full items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-muted/40 focus:outline-none';

  return (
    <Field label={label} hint={hint}>
      <div className="group flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={triggerClass}>
              <span className={`flex-1 truncate text-left ${current ? '' : 'text-muted-foreground'}`}>{current ?? placeholder}</span>
              <ChevronsUpDown className={`h-3.5 w-3.5 shrink-0 opacity-50 ${alwaysEdit ? '' : 'opacity-0 group-hover:opacity-50'}`} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[220px] p-0" align="start">
            <Command>
              {showSearch && <CommandInput placeholder="Search…" />}
              <CommandList>
                <CommandEmpty>No match.</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="__unset__ none clear" onSelect={() => pick(null)}>
                    <Check className={`mr-2 h-3.5 w-3.5 shrink-0 ${value == null ? 'opacity-100' : 'opacity-0'}`} />
                    <span className="text-muted-foreground">{placeholder}</span>
                  </CommandItem>
                  {options.map((o) => (
                    <CommandItem key={o.value} value={`${o.value} ${o.searchText ?? ''}`} onSelect={() => pick(o.value)}>
                      <Check className={`mr-2 h-3.5 w-3.5 shrink-0 ${value === o.value ? 'opacity-100' : 'opacity-0'}`} />
                      <span className="flex-1">{o.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
        {!alwaysEdit && copyValue && <CopyButton value={copyValue} />}
      </div>
    </Field>
  );
};
