import React, { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { FIELD_SOURCE_LABEL, MATCH_LABEL, SUPPLIER_TYPES, type SupplierType } from '@/modules/crm/supplierTypes';

export interface FieldProvenance { src?: string; by?: string; at?: string }

export interface SupplierProfile {
  supplier_type?: string | null;
  own_brands?: string[] | null;
  brands_carried?: string[] | null;
  field_sources?: Record<string, FieldProvenance> | null;
  seve_slug?: string | null;
}

interface SeveEntry { name: string; url: string; industries: string[]; website: string | null; intrastat: { code: string; description: string }[] }

function SeveMembership({ slug }: { slug: string }) {
  const [entry, setEntry] = useState<SeveEntry | null>(null);
  useEffect(() => {
    let live = true;
    void supabase.from('seve_members').select('name, url, industries, website, intrastat').eq('slug', slug).maybeSingle()
      .then(({ data }) => { if (live) setEntry((data as unknown as SeveEntry) ?? null); });
    return () => { live = false; };
  }, [slug]);
  if (!entry) return null;
  return (
    <div className="space-y-1.5 border-t border-hairline pt-4">
      <p className="text-xs font-semibold text-muted-foreground">ΣΕΒΕ exporter directory</p>
      <p className="text-sm">
        <a href={entry.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
          {entry.name} <ExternalLink className="h-3 w-3" />
        </a>
      </p>
      {entry.industries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{entry.industries.map((i) => <Badge key={i} variant="neutral">{i}</Badge>)}</div>
      )}
      {entry.intrastat.length > 0 && (
        <p className="text-xs text-muted-foreground">Exports: {entry.intrastat.slice(0, 4).map((c) => c.description).filter(Boolean).join(' · ')}</p>
      )}
    </div>
  );
}

const NONE = '__none__';
const SOURCED: { key: string; label: string }[] = [
  { key: 'website', label: 'Website' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
  { key: 'industry', label: 'Industry' }, { key: 'description', label: 'Description' },
];

function TagEditor({ id, label, values, onChange }: { id: string; label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const next = draft.split(',').map((s) => s.trim()).filter((s) => s && !values.includes(s));
    if (next.length) onChange([...values, ...next]);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        id={id}
        value={draft}
        placeholder="Type a name and press Enter"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}

function sourceText(p: FieldProvenance | undefined): string {
  if (!p?.src) return 'source not recorded';
  const base = FIELD_SOURCE_LABEL[p.src] ?? p.src;
  const how = p.src === 'web_verified' && p.by && MATCH_LABEL[p.by] ? ` by ${MATCH_LABEL[p.by]}` : '';
  const when = p.at ? ` · ${new Date(p.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
  return `${base}${how}${when}`;
}

export const SupplierProfileCard: React.FC<{
  value: SupplierProfile;
  filled: Record<string, unknown>;
  onSave: (patch: Partial<SupplierProfile>) => void;
}> = ({ value, filled, onSave }) => {
  const type = (value.supplier_type ?? '') as SupplierType | '';
  const hint = SUPPLIER_TYPES.find((t) => t.value === type)?.hint;
  const sources = value.field_sources ?? {};
  const shown = SOURCED.filter((f) => filled[f.key]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplier profile</CardTitle>
        <CardDescription>What this supplier is, the brands it sells as its own, and the brands or factories it carries.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="supplier-type">Type</Label>
          <Select
            value={type || NONE}
            onValueChange={(v) => {
              const next = v === NONE ? null : v;
              onSave({ supplier_type: next });
            }}
          >
            <SelectTrigger id="supplier-type" className="max-w-sm"><SelectValue placeholder="Not set" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {SUPPLIER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <TagEditor id="own-brands" label="Own brands" values={value.own_brands ?? []} onChange={(v) => onSave({ own_brands: v })} />
        <TagEditor
          id="brands-carried"
          label={type === 'agent' ? 'Factories represented' : 'Brands carried'}
          values={value.brands_carried ?? []}
          onChange={(v) => onSave({ brands_carried: v })}
        />
        {value.seve_slug && <SeveMembership slug={value.seve_slug} />}
        {shown.length > 0 && (
          <div className="space-y-1.5 border-t border-hairline pt-4">
            <p className="text-xs font-semibold text-muted-foreground">Where the details came from</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {shown.map((f) => (
                <React.Fragment key={f.key}>
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className={sources[f.key]?.src === 'web' ? 'text-[hsl(var(--warning))]' : ''}>{sourceText(sources[f.key])}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
