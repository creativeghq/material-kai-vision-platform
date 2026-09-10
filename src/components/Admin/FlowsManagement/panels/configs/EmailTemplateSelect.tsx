/** Picks the email template a `send_email` flow action renders. */
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { supabase } from '@/integrations/supabase/client';

/** Radix Select cannot carry an empty-string item value — this is "no template". */
const NONE = '__none__';

interface TemplateRow {
  slug: string;
  name: string;
  workspace_id: string | null;
}

export const EmailTemplateSelect: React.FC<{
  value: string;
  onChange: (slug: string) => void;
}> = ({ value, onChange }) => {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('email_templates')
        .select('slug, name, workspace_id')
        .eq('is_active', true)
        .order('name');
      if (cancelled) return;
      setRows((data ?? []) as TemplateRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const mine = rows.filter((r) => r.workspace_id !== null);
  const platform = rows.filter((r) => r.workspace_id === null);
  // A slug saved before this picker existed — or one whose template was since deleted or
  // deactivated — must stay visible and selected. Dropping it would silently rewrite a live
  // flow's config to "no template" the moment someone opened the panel to read it.
  const orphan = value && !rows.some((r) => r.slug === value) ? value : null;

  if (loading) {
    return (
      <div className="flex h-8 items-center gap-2 rounded-md border border-border/60 px-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading templates…
      </div>
    );
  }

  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None — use the Subject and Body above</SelectItem>
        {orphan && (
          <SelectItem value={orphan}>
            <span className="font-mono text-xs">{orphan}</span>
            <span className="text-muted-foreground"> — not found or inactive</span>
          </SelectItem>
        )}
        {mine.length > 0 && (
          <SelectGroup>
            <SelectLabel>Your templates</SelectLabel>
            {mine.map((t) => <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>)}
          </SelectGroup>
        )}
        {platform.length > 0 && (
          <SelectGroup>
            <SelectLabel>Platform templates</SelectLabel>
            {platform.map((t) => <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>)}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
};
