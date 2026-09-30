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
  HubSortButton,
  HubToolbar,
  HUB_FILTER_ALL,
  useHubTable,
  type HubSort,
  type HubTableField,
} from '@/components/core/hub';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FieldRow {
  field_name: string;
  display_name: string | null;
  role: string;
  classified_signal: string | null;
  classified_confidence: number | null;
  classified_reason: string | null;
  classified_at: string | null;
  applies_to_categories: string[] | null;
  is_global: boolean | null;
}

/**
 * Strength order, mirroring the `classify_field_role` RPC. Shown so an operator can see at a
 * glance whether a verdict rests on evidence or on a guess — and the RPC, not this list, is what
 * enforces it.
 */
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
    searchText: (r) => `${r.field_name} ${r.display_name ?? ''}`,
  },
  { id: 'role', sortValue: (r) => r.role, filterValue: (r) => r.role, filterLabel: 'Role' },
  {
    id: 'signal',
    sortValue: (r) => SIGNAL_RANK[r.classified_signal ?? 'seed'] ?? 0,
    filterValue: (r) => r.classified_signal ?? 'seed',
    filterLabel: 'Signal',
    filterOptionLabel: (v) => SIGNAL_LABEL[v] ?? v,
  },
];

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

export const FieldRoleAudit: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('material_metadata_fields')
      .select('field_name, display_name, role, classified_signal, classified_confidence, classified_reason, classified_at, applies_to_categories, is_global')
      .eq('status', 'active')
      .order('field_name');
    if (error) {
      toast({ title: 'Could not load the registry', description: error.message, variant: 'destructive' });
    }
    setRows((data ?? []) as FieldRow[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const override = async (field: FieldRow, role: string) => {
    setSaving(field.field_name);
    try {
      // Through the SAME RPC every automatic signal uses. An operator outranks all of them and
      // is the only signal that may push past the demotion veto — deliberately, since the point
      // of an override is to disagree with the evidence on purpose.
      const { data, error } = await supabase.rpc('classify_field_role', {
        p_field_name: field.field_name,
        p_role: role,
        p_signal: 'operator',
        p_confidence: 1,
        p_reason: 'Set from the field-role audit screen.',
      });
      if (error) throw error;
      const res = data as { applied?: boolean; reason?: string } | null;
      if (res && res.applied === false) {
        toast({ title: 'Not applied', description: res.reason ?? 'refused', variant: 'destructive' });
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

  const t = useHubTable(rows, FIELD_FIELDS);
  const shown = t.rows;

  const counts = useMemo(() => {
    const identity = rows.filter((r) => r.role === 'identity').length;
    // A verdict still resting on the heuristic seed is the one worth chasing: nothing has
    // looked at it since the registry was rebuilt.
    const unrevisited = rows.filter((r) => (r.classified_signal ?? 'seed') === 'seed').length;
    return { identity, descriptive: rows.length - identity, unrevisited };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Field roles
        </CardTitle>
        <CardDescription>
          What each field was classified as, which signal decided it, and why. Overriding takes
          effect immediately — this screen never holds ingest up.
        </CardDescription>
        <div className="flex flex-wrap gap-4 pt-2 text-sm">
          <span><span className="font-medium">{counts.identity}</span> identity</span>
          <span><span className="font-medium">{counts.descriptive}</span> descriptive</span>
          {counts.unrevisited > 0 && (
            <span className="text-warning flex items-center gap-1">
              <TriangleAlert className="h-3.5 w-3.5" />
              {counts.unrevisited} still on the heuristic seed
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <HubToolbar
          search={t.search}
          onSearchChange={t.setSearch}
          searchPlaceholder="Filter by field name…"
          filters={
            <>
              <HubFilterSelect
                label="Role"
                value={t.filters.role ?? HUB_FILTER_ALL}
                options={t.filterOptions.role}
                onChange={(v) => t.setFilter('role', v)}
              />
              <HubFilterSelect
                label="Signal"
                value={t.filters.signal ?? HUB_FILTER_ALL}
                options={t.filterOptions.signal}
                onChange={(v) => t.setFilter('signal', v)}
              />
              <HubResetFilters count={t.activeFilterCount} onReset={t.reset} />
            </>
          }
        />

        {loading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the registry…
          </div>
        ) : shown.length === 0 ? (
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
                <SortHead id="signal" sort={t.sort} onSort={t.toggleSort} className="hidden sm:table-cell">Decided by</SortHead>
                <TableHead className="hidden md:table-cell">Why</TableHead>
                <TableHead>Override</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => {
                const signal = r.classified_signal ?? 'seed';
                return (
                  <TableRow key={r.field_name} className="align-top">
                    <TableCell>
                      <div className="break-words">{r.display_name || r.field_name}</div>
                      <div className="text-xs text-muted-foreground break-all">{r.field_name}</div>
                    </TableCell>
                    {/* Status as a plain coloured word — never a filled badge (design system). */}
                    <TableCell className={r.role === 'identity' ? 'text-primary' : 'text-muted-foreground'}>
                      {r.role}
                    </TableCell>
                    <TableCell className="hidden text-xs sm:table-cell">
                      <div className={signal === 'seed' ? 'text-warning' : ''}>{SIGNAL_LABEL[signal] ?? signal}</div>
                      {r.classified_confidence != null && (
                        <div className="text-muted-foreground">
                          confidence {Math.round(Number(r.classified_confidence) * 100)}%
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground max-w-md break-words md:table-cell">
                      {r.classified_reason || '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        disabled={saving === r.field_name}
                        onClick={() => override(r, r.role === 'identity' ? 'descriptive' : 'identity')}
                      >
                        {saving === r.field_name
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : `make ${r.role === 'identity' ? 'descriptive' : 'identity'}`}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
