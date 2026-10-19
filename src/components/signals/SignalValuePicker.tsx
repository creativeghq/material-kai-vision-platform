import React, { useMemo, useState } from 'react';
import { Input } from '@/components/core/ui/input';
import { cn } from '@/lib/utils';
import type { SignalKind, SignalsDictionary } from '@/services/signalsService';

interface Props {
  kind: SignalKind;
  dictionary: SignalsDictionary | null;
  value: string[];
  onChange: (next: string[]) => void;
  id?: string;
}

/** Hiring takes free keywords; technology and intent pick from the dictionary the server validates. */
export function SignalValuePicker({ kind, dictionary, value, onChange, id }: Props) {
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    if (!dictionary) return [];
    const rows = kind === 'technology'
      ? dictionary.technologies.map((t) => ({ key: t.slug, label: t.name, group: t.category.replace('_', ' / ') }))
      : dictionary.intents.map((i) => ({ key: i.key, label: i.label, group: '' }));
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.label.toLowerCase().includes(q) || r.key.includes(q)) : rows;
  }, [dictionary, kind, query]);

  if (kind === 'hiring') {
    return (
      <Input
        id={id}
        value={value.join(', ')}
        onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        placeholder="export manager, showroom, BIM"
      />
    );
  }

  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key].slice(0, 20));

  return (
    <div className="space-y-2">
      {kind === 'technology' ? (
        <Input id={id} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter technologies…" />
      ) : null}
      <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-sm border border-hairline p-2">
        {options.length === 0 ? (
          <span className="text-xs text-muted-foreground">{dictionary ? 'Nothing matches that filter.' : 'Loading…'}</span>
        ) : options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => toggle(o.key)}
            aria-pressed={value.includes(o.key)}
            title={o.group || undefined}
            className={cn(
              'rounded-sm border px-2 py-1 text-xs transition-colors',
              value.includes(o.key)
                ? 'border-primary bg-primary/[0.08] text-foreground'
                : 'border-hairline text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{value.length} selected</p>
    </div>
  );
}
