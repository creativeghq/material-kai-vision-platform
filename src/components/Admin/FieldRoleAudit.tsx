/** Field-role audit (#347 phase 4.5). */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { cn } from '@/lib/utils';
import {
  HubEmptyState,
  HubFilterSelect,
  HubResetFilters,
  HubSegmented,
  HubSortButton,
  HubToolbar,
  HUB_FILTER_ALL,
  useHubTable,
  type HubSort,
  type HubTableField,
} from '@/components/core/hub';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { FieldMergeDialog, type MergeCandidate } from './fieldRoles/FieldMergeDialog';
import { MergeConflicts, type MergeConflict } from './fieldRoles/MergeConflicts';
import { RoleSuggestions, type RoleProposal } from './fieldRoles/RoleSuggestions';

interface FieldRow {
  field_name: string;
  display_name: string | null;
  role: string;
  role_by_category: Record<string, string> | null;
  destination: string;
  classified_signal: string | null;
  classified_confidence: number | null;
  classified_reason: string | null;
  applies_to_categories: string[] | null;
  is_global: boolean | null;
  aliases: string[] | null;
  products: number;
  distinct_values: number;
  sample_values: string[];
}

/** Strength order, mirroring the `classify_field_role` RPC; the RPC is what enforces it. */
const SIGNAL_RANK: Record<string, number> = {
  operator: 6, warehouse_feedback: 5, sku_correlation: 4, plurality: 3, llm: 2, seed: 1,
};

const SIGNAL_LABEL: Record<string, string> = {
  operator: 'set by a person',
  warehouse_feedback: 'two stocked rows differed',
  sku_correlation: 'the catalogue mapped variants to SKUs',
  plurality: 'the catalogue listed several values',
  llm: 'model verdict',
  seed: 'heuristic seed — never revisited',
};

const FIELD_FIELDS: HubTableField<FieldRow>[] = [
  {
    id: 'field',
    sortValue: (r) => r.display_name || r.field_name,
    searchText: (r) => `${r.field_name} ${r.display_name ?? ''} ${(r.aliases ?? []).join(' ')}`,
  },
  { id: 'role', sortValue: (r) => r.role, filterValue: (r) => r.role, filterLabel: 'Role' },
  {
    id: 'used',
    sortValue: (r) => r.products,
    filterValue: (r) => (r.products > 0 ? 'used' : 'unused'),
    filterLabel: 'Usage',
    filterOptionLabel: (v) => (v === 'used' ? 'On products' : 'On no product'),
  },
  {
    id: 'signal',
    sortValue: (r) => SIGNAL_RANK[r.classified_signal ?? 'seed'] ?? 0,
    filterValue: (r) => r.classified_signal ?? 'seed',
    filterLabel: 'Signal',
    filterOptionLabel: (v) => SIGNAL_LABEL[v] ?? v,
  },
];

/** The categories where the per-category role differs from the field's own. */
function roleExceptions(r: FieldRow): string | null {
  const over = Object.entries(r.role_by_category ?? {}).filter(([, role]) => role !== r.role).map(([c]) => c);
  if (over.length === 0) return null;
  const scope = r.applies_to_categories ?? [];
  const kept = scope.filter(c => !over.includes(c));
  const other = r.role === 'identity' ? 'descriptive' : 'identity';
  if (kept.length > 0 && kept.length < over.length) return `${r.role} only in ${kept.join(', ')}; ${other} elsewhere`;
  return `${other} in ${over.join(', ')}`;
}

const SortHead: React.FC<{
  id: string;
  sort?: HubSort;
  onSort: (id: string) => void;
  align?: 'left' | 'right';
  className?: string;
  children: React.ReactNode;
}> = ({ id, sort, onSort, align, className, children }) => {
  const active = sort?.columnId === id ? sort.direction : undefined;
  return (
    <TableHead
      className={cn(align === 'right' && 'text-right', className)}
      aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <HubSortButton active={active} align={align} onClick={() => onSort(id)}>
        {children}
      </HubSortButton>
    </TableHead>
  );
};

type View = 'fields' | 'suggestions' | 'conflicts';

export const FieldRoleAudit: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [proposals, setProposals] = useState<RoleProposal[]>([]);
  const [conflicts, setConflicts] = useState<MergeConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [view, setView] = useState<View>('fields');
  const [merging, setMerging] = useState<MergeCandidate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [fieldsRes, usageRes, proposalsRes, conflictsRes] = await Promise.all([
      supabase
        .from('material_metadata_fields')
        .select('field_name, display_name, role, role_by_category, destination, classified_signal, classified_confidence, classified_reason, applies_to_categories, is_global, aliases')
        .eq('status', 'active')
        .order('field_name'),
      supabase.rpc('field_registry_usage'),
      supabase.from('field_role_proposals').select('*').eq('status', 'pending').order('last_seen_at', { ascending: false }),
      supabase.from('field_merge_conflicts').select('*').eq('status', 'open').order('created_at'),
    ]);
    const failed = [fieldsRes, usageRes, proposalsRes, conflictsRes].find(r => r.error);
    if (failed?.error) {
      toast({ title: 'Could not load the registry', description: failed.error.message, variant: 'destructive' });
    }
    const usage = new Map<string, { products: number; distinct_values: number; sample_values: string[] }>(
      ((usageRes.data ?? []) as Array<{ field_name: string; products: number; distinct_values: number; sample_values: string[] | null }>)
        .map(u => [u.field_name, { products: Number(u.products), distinct_values: Number(u.distinct_values), sample_values: u.sample_values ?? [] }]),
    );
    setRows(((fieldsRes.data ?? []) as Omit<FieldRow, 'products' | 'distinct_values' | 'sample_values'>[]).map(f => ({
      ...f,
      ...(usage.get(f.field_name) ?? { products: 0, distinct_values: 0, sample_values: [] }),
    })));
    setProposals((proposalsRes.data ?? []) as RoleProposal[]);

    const open = (conflictsRes.data ?? []) as Omit<MergeConflict, 'product_name'>[];
    const ids = [...new Set(open.map(c => c.product_id))];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data } = await supabase.from('products').select('id, name').in('id', ids);
      for (const p of (data ?? []) as Array<{ id: string; name: string }>) names.set(p.id, p.name);
    }
    setConflicts(open.map(c => ({ ...c, product_name: names.get(c.product_id) ?? null })));
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const override = async (field: FieldRow, role: string) => {
    setSaving(field.field_name);
    try {
      // Same RPC as every automatic signal; only an operator may push past the demotion veto.
      const { data, error } = await supabase.rpc('classify_field_role', {
        p_field_name: field.field_name,
        p_role: role,
        p_signal: 'operator',
        p_confidence: 1,
        p_reason: role === field.role ? 'Confirmed from the field-role audit screen.' : 'Set from the field-role audit screen.',
      });
      if (error) throw error;
      const res = data as { applied?: boolean; confirmed?: boolean; reason?: string } | null;
      if (res && res.applied === false) {
        toast({ title: 'Not applied', description: res.reason ?? 'refused', variant: 'destructive' });
      } else if (res?.confirmed) {
        toast({ title: `${field.field_name} confirmed as ${role}` });
      } else {
        toast({ title: `${field.field_name} is now ${role}` });
      }
      await load();
    } catch (err: any) {
      toast({ title: 'Override failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const t = useHubTable(rows, FIELD_FIELDS, { columnId: 'used', direction: 'desc' });
  const shown = t.rows;

  const counts = useMemo(() => {
    const identity = rows.filter((r) => r.role === 'identity').length;
    const seed = rows.filter((r) => (r.classified_signal ?? 'seed') === 'seed');
    return {
      identity,
      descriptive: rows.length - identity,
      unrevisited: seed.length,
      unrevisitedUsed: seed.filter(r => r.products > 0).length,
      unused: rows.filter(r => r.products === 0).length,
    };
  }, [rows]);

  const roleOf = useCallback((f: string) => rows.find(r => r.field_name === f)?.role, [rows]);
  const candidates = useMemo<MergeCandidate[]>(
    () => rows.map(r => ({ field_name: r.field_name, display_name: r.display_name, destination: r.destination, products: r.products }))
      .sort((a, b) => b.products - a.products),
    [rows],
  );

  return (
    <Card>
      <CardHeader className="border-b border-hairline">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Field Roles
        </CardTitle>
        <CardDescription>
          Identity fields are the choices a quote or order line offers (size, colour, finish).
          Confirm a verdict that is right, flip one that is wrong, or merge a field that duplicates another.
        </CardDescription>
        <div className="flex flex-wrap gap-4 pt-2 text-sm">
          <span><span className="font-medium tabular-nums">{counts.identity}</span> identity</span>
          <span><span className="font-medium tabular-nums">{counts.descriptive}</span> descriptive</span>
          <span><span className="font-medium tabular-nums">{counts.unused}</span> on no product</span>
          {counts.unrevisitedUsed > 0 && (
            <span className="text-warning flex items-center gap-1">
              <TriangleAlert className="h-3.5 w-3.5" />
              {counts.unrevisitedUsed} in use and still on the heuristic seed
            </span>
          )}
        </div>
        <div className="pt-3">
          <HubSegmented<View>
            aria-label="Field roles view"
            value={view}
            onChange={setView}
            options={[
              { value: 'fields', label: `Fields (${rows.length})` },
              { value: 'suggestions', label: `Suggestions (${proposals.length})` },
              { value: 'conflicts', label: `Conflicts (${conflicts.length})` },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the registry…
          </div>
        ) : view === 'suggestions' ? (
          <RoleSuggestions proposals={proposals} currentRole={roleOf} onDecided={load} onShowFields={() => setView('fields')} />
        ) : view === 'conflicts' ? (
          <MergeConflicts conflicts={conflicts} onResolved={load} onShowFields={() => setView('fields')} />
        ) : (
          <>
            <HubToolbar
              search={t.search}
              onSearchChange={t.setSearch}
              searchPlaceholder="Filter by field name or alias…"
              filters={
                <>
                  <HubFilterSelect label="Role" value={t.filters.role ?? HUB_FILTER_ALL} options={t.filterOptions.role} onChange={(v) => t.setFilter('role', v)} />
                  <HubFilterSelect label="Usage" value={t.filters.used ?? HUB_FILTER_ALL} options={t.filterOptions.used} onChange={(v) => t.setFilter('used', v)} />
                  <HubFilterSelect label="Signal" value={t.filters.signal ?? HUB_FILTER_ALL} options={t.filterOptions.signal} onChange={(v) => t.setFilter('signal', v)} />
                  <HubResetFilters count={t.activeFilterCount} onReset={t.reset} />
                </>
              }
            />
            {shown.length === 0 ? (
              <HubEmptyState
                variant="filtered"
                title="No field matches that filter"
                action={<Button variant="outline" size="sm" onClick={t.reset}>Clear filters</Button>}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead id="field" sort={t.sort} onSort={t.toggleSort}>Field</SortHead>
                    <SortHead id="role" sort={t.sort} onSort={t.toggleSort}>Role</SortHead>
                    <SortHead id="used" sort={t.sort} onSort={t.toggleSort} align="right">Used By</SortHead>
                    <SortHead id="signal" sort={t.sort} onSort={t.toggleSort} className="hidden sm:table-cell">Decided By</SortHead>
                    <TableHead className="hidden lg:table-cell">Why</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r) => {
                    const signal = r.classified_signal ?? 'seed';
                    const exceptions = roleExceptions(r);
                    return (
                      <TableRow key={r.field_name} className="align-top">
                        <TableCell>
                          <div className="break-words">{r.display_name || r.field_name}</div>
                          <div className="text-xs text-muted-foreground break-all">{r.field_name}</div>
                          {(r.aliases?.length ?? 0) > 0 && (
                            <div className="text-xs text-muted-foreground break-words">also: {r.aliases!.join(', ')}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className={r.role === 'identity' ? 'text-primary' : 'text-muted-foreground'}>{r.role}</div>
                          {exceptions && <div className="text-xs text-muted-foreground max-w-[12rem] break-words">{exceptions}</div>}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {r.products === 0 ? <span className="text-muted-foreground">—</span> : (
                            <>
                              <div>{r.products} products</div>
                              <div className="text-muted-foreground">{r.distinct_values} values</div>
                              {r.sample_values.length > 0 && (
                                <div className="text-muted-foreground max-w-[12rem] ml-auto truncate" title={r.sample_values.join(' · ')}>
                                  {r.sample_values.join(' · ')}
                                </div>
                              )}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-xs sm:table-cell">
                          <div className={signal === 'seed' ? 'text-warning' : ''}>{SIGNAL_LABEL[signal] ?? signal}</div>
                          {r.classified_confidence != null && (
                            <div className="text-muted-foreground">confidence {Math.round(Number(r.classified_confidence) * 100)}%</div>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground max-w-md break-words lg:table-cell">
                          {r.classified_reason || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {signal !== 'operator' && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving === r.field_name} onClick={() => override(r, r.role)}>
                                Confirm {r.role}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              disabled={saving === r.field_name}
                              onClick={() => override(r, r.role === 'identity' ? 'descriptive' : 'identity')}
                            >
                              {saving === r.field_name
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : `Make ${r.role === 'identity' ? 'descriptive' : 'identity'}`}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => setMerging({ field_name: r.field_name, display_name: r.display_name, destination: r.destination, products: r.products })}
                            >
                              Merge into…
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
      <FieldMergeDialog
        loser={merging}
        fields={candidates}
        onClose={() => setMerging(null)}
        onMerged={() => { void load(); }}
      />
    </Card>
  );
};
