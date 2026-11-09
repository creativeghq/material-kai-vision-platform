/** The weekly post mix the planner works from — platform defaults, with this workspace's changes laid over them. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, Loader2, Plus, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Switch } from '@/components/core/ui/switch';
import { FormField, FormGrid } from '@/components/core/ui/form-layout';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';

interface KindRow {
  id: string;
  workspace_id: string | null;
  key: string;
  label: string;
  purpose: string;
  per_week: number;
  formats: string[];
  sort_order: number;
  is_active: boolean;
}

interface Effective {
  key: string;
  base: KindRow | null;
  own: KindRow | null;
  row: KindRow;
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const kindsTable = () => supabase.from('social_post_kinds' as never) as any;

export const SocialPostMixPanel: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [rows, setRows] = useState<KindRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: '', purpose: '', per_week: '1' });

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const { data, error } = await kindsTable()
      .select('id, workspace_id, key, label, purpose, per_week, formats, sort_order, is_active')
      .or(`workspace_id.is.null,workspace_id.eq.${activeWorkspaceId}`)
      .order('sort_order');
    if (error) {
      toast({ title: 'Could not load the post mix', description: error.message, variant: 'destructive' });
      setRows([]);
      return;
    }
    setRows((data ?? []) as KindRow[]);
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const effective = useMemo<Effective[]>(() => {
    const byKey = new Map<string, Effective>();
    for (const r of rows ?? []) {
      const e = byKey.get(r.key) ?? { key: r.key, base: null, own: null, row: r };
      if (r.workspace_id) e.own = r; else e.base = r;
      e.row = e.own ?? e.base ?? r;
      byKey.set(r.key, e);
    }
    return [...byKey.values()].sort((a, b) => a.row.sort_order - b.row.sort_order);
  }, [rows]);

  const total = effective.filter((e) => e.row.is_active).reduce((n, e) => n + Number(e.row.per_week), 0);

  const change = async (e: Effective, patch: Partial<Pick<KindRow, 'per_week' | 'is_active'>>) => {
    if (!activeWorkspaceId) return;
    setBusy(e.key);
    const { error } = e.own
      ? await kindsTable().update({ ...patch, updated_at: new Date().toISOString() }).eq('id', e.own.id)
      : await kindsTable().insert({
        workspace_id: activeWorkspaceId,
        key: e.row.key,
        label: e.row.label,
        purpose: e.row.purpose,
        per_week: patch.per_week ?? e.row.per_week,
        formats: e.row.formats,
        sort_order: e.row.sort_order,
        is_active: patch.is_active ?? e.row.is_active,
      });
    setBusy(null);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    void load();
  };

  const reset = async (e: Effective) => {
    if (!e.own) return;
    setBusy(e.key);
    const { error } = await kindsTable().delete().eq('id', e.own.id);
    setBusy(null);
    if (error) {
      toast({ title: 'Could not reset', description: error.message, variant: 'destructive' });
      return;
    }
    void load();
  };

  const add = async () => {
    if (!activeWorkspaceId) return;
    const key = slug(draft.label);
    const perWeek = Number(draft.per_week);
    if (!key || !draft.purpose.trim() || !(perWeek >= 0)) {
      toast({ title: 'Name, purpose and a number per week are required', variant: 'destructive' });
      return;
    }
    if (effective.some((e) => e.key === key)) {
      toast({ title: 'That kind already exists', description: 'Change its number per week in the table instead.', variant: 'destructive' });
      return;
    }
    setBusy('new');
    const { error } = await kindsTable().insert({
      workspace_id: activeWorkspaceId,
      key,
      label: draft.label.trim(),
      purpose: draft.purpose.trim(),
      per_week: perWeek,
      sort_order: (effective.at(-1)?.row.sort_order ?? 0) + 10,
    });
    setBusy(null);
    if (error) {
      toast({ title: 'Could not add it', description: error.message, variant: 'destructive' });
      return;
    }
    setDraft({ label: '', purpose: '', per_week: '1' });
    void load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarRange className="h-4 w-4" /> Post Mix</CardTitle>
        <CardDescription>
          What a week of posts is made of. “Plan my week” in the Social toolkit drafts against this mix
          {rows ? ` — ${total} post${total === 1 ? '' : 's'} a week right now` : ''}. It never schedules on its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {rows === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : effective.length === 0 ? (
          <HubEmptyState icon={CalendarRange} title="No post kinds yet" description="Add the first kind of post below." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Formats</TableHead>
                <TableHead className="text-right">Per Week</TableHead>
                <TableHead>Active</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {effective.map((e) => (
                <TableRow key={e.key}>
                  <TableCell className="font-medium">
                    {e.row.label}
                    {e.own && <Badge variant="info" className="ml-2">{e.base ? 'Changed' : 'Yours'}</Badge>}
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-muted-foreground">{e.row.purpose}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {e.row.formats.length ? e.row.formats.map((f) => <Badge key={f} variant="neutral">{f}</Badge>) : '—'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min={0} step={0.5} className="ml-auto h-8 w-20 text-right tabular-nums"
                      defaultValue={e.row.per_week}
                      disabled={busy === e.key}
                      aria-label={`${e.row.label} per week`}
                      onBlur={(ev) => {
                        const v = Number(ev.target.value);
                        if (v >= 0 && v !== Number(e.row.per_week)) void change(e, { per_week: v });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={e.row.is_active}
                      disabled={busy === e.key}
                      onCheckedChange={(v) => void change(e, { is_active: v })}
                      aria-label={`${e.row.label} active`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {e.own && (
                      <Button variant="ghost" size="sm" disabled={busy === e.key} onClick={() => void reset(e)}>
                        <RotateCcw className="h-3.5 w-3.5" /><span className="ml-1">{e.base ? 'Use default' : 'Remove'}</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <FormGrid cols={3}>
          <FormField label="New Kind" htmlFor="mix-label">
            <Input id="mix-label" value={draft.label} onChange={(ev) => setDraft({ ...draft, label: ev.target.value })} placeholder="Project of the week" />
          </FormField>
          <FormField label="Purpose" htmlFor="mix-purpose">
            <Input id="mix-purpose" value={draft.purpose} onChange={(ev) => setDraft({ ...draft, purpose: ev.target.value })} placeholder="Show a finished job with one number from it" />
          </FormField>
          <FormField label="Per Week" htmlFor="mix-per-week">
            <div className="flex gap-2">
              <Input id="mix-per-week" type="number" min={0} step={0.5} value={draft.per_week} onChange={(ev) => setDraft({ ...draft, per_week: ev.target.value })} className="tabular-nums" />
              <Button variant="outline" onClick={() => void add()} disabled={busy === 'new'}>
                <Plus className="h-4 w-4" /><span className="ml-1">Add</span>
              </Button>
            </div>
          </FormField>
        </FormGrid>
      </CardContent>
    </Card>
  );
};

export default SocialPostMixPanel;
