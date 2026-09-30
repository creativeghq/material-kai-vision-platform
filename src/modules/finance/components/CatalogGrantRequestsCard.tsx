/**
 * Pending catalog-access requests, for the operator to approve or decline.
 *
 * A dealer hitting "Request access to KEROS" on the duplicate warning inserts a row with
 * status='requested' — RLS lets them do no more than ask. This is the other half: without
 * it a request lands in a table nobody looks at.
 *
 * Approving grants visibility of that ONE factory's operator products. The dealer still
 * never gets a copy — they price the operator's row through product_prices.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Check, X, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import {
  HubEmptyState, HubFilterSelect, HubResetFilters, HubSortButton, HubToolbar,
  HUB_FILTER_ALL, useHubTable, type HubTableField,
} from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { catalogGrantsService } from '@/services/catalogGrantsService';
import { formatDate } from '@/utils/datetime';

interface RequestRow {
  id: string;
  workspaceId: string;
  workspaceName: string;
  factoryName: string | null;
  status: 'requested' | 'active' | 'revoked';
  requestedAt: string;
}

const STATUS_LABEL: Record<string, string> = { requested: 'Awaiting you', active: 'Granted', revoked: 'Revoked' };

const FIELDS: HubTableField<RequestRow>[] = [
  { id: 'workspace', sortValue: (r) => r.workspaceName, searchText: (r) => r.workspaceName,
    filterValue: (r) => r.workspaceName, filterLabel: 'Workspace' },
  { id: 'factory', sortValue: (r) => r.factoryName ?? '', searchText: (r) => r.factoryName },
  { id: 'requested', sortValue: (r) => r.requestedAt },
  { id: 'status', sortValue: (r) => STATUS_LABEL[r.status], filterValue: (r) => r.status,
    filterLabel: 'Status', filterOptionLabel: (v) => STATUS_LABEL[v] ?? v },
];

export const CatalogGrantRequestsCard: React.FC<{ workspaceIds: string[] }> = ({ workspaceIds }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (workspaceIds.length === 0) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('workspace_catalog_grants')
        .select('id, workspace_id, factory_name, status, requested_at, workspace:workspaces(name)')
        .in('workspace_id', workspaceIds)
        .order('requested_at', { ascending: false });
      setRows(((data ?? []) as any[]).map((r) => ({
        id: r.id,
        workspaceId: r.workspace_id,
        workspaceName: r.workspace?.name ?? '—',
        factoryName: r.factory_name ?? null,
        status: r.status,
        requestedAt: r.requested_at,
      })));
    } catch {
      setRows([]);
    } finally { setLoading(false); }
  }, [workspaceIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, status: 'active' | 'revoked') => {
    setBusy(id);
    try {
      await catalogGrantsService.setStatus(id, status);
      toast({ title: status === 'active' ? 'Access granted' : 'Access revoked' });
      await load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const listed = useMemo(
    () => [...rows.filter((r) => r.status === 'requested'), ...rows.filter((r) => r.status === 'active')],
    [rows],
  );
  const t = useHubTable(listed, FIELDS);
  const sortHead = (id: string, label: string, align?: 'right') => (
    <TableHead
      className={align === 'right' ? 'text-right' : undefined}
      aria-sort={t.sort?.columnId === id ? (t.sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <HubSortButton
        active={t.sort?.columnId === id ? t.sort.direction : undefined}
        align={align}
        onClick={() => t.toggleSort(id)}
      >
        {label}
      </HubSortButton>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader className="border-b border-hairline px-5 py-3">
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> Catalog access
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Which of your factories each sub-workspace may sell. They price your product — they never get a copy of it.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : listed.length === 0 ? (
          <HubEmptyState
            title="No requests yet"
            description="A dealer asks from the product form when they try to add something you already carry."
          />
        ) : (
          <>
            {listed.length > 8 && (
              <HubToolbar
                search={t.search}
                onSearchChange={t.setSearch}
                searchPlaceholder="Search workspaces or factories"
                filters={(
                  <>
                    <HubFilterSelect
                      label="Status"
                      value={t.filters.status ?? HUB_FILTER_ALL}
                      options={t.filterOptions.status}
                      onChange={(v) => t.setFilter('status', v)}
                    />
                    <HubFilterSelect
                      label="Workspace"
                      value={t.filters.workspace ?? HUB_FILTER_ALL}
                      options={t.filterOptions.workspace}
                      onChange={(v) => t.setFilter('workspace', v)}
                    />
                    <HubResetFilters count={t.activeFilterCount} onReset={t.reset} />
                  </>
                )}
              />
            )}
            {t.rows.length === 0 ? (
              <HubEmptyState
                variant="filtered"
                title="No requests match"
                action={<Button size="sm" variant="outline" onClick={t.reset}>Clear filters</Button>}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {sortHead('workspace', 'Workspace')}
                    {sortHead('factory', 'Factory')}
                    {sortHead('requested', 'Requested')}
                    {sortHead('status', 'Status')}
                    <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <span className="block max-w-[16rem] truncate" title={r.workspaceName}>{r.workspaceName}</span>
                      </TableCell>
                      <TableCell>
                        {r.factoryName
                          ? <span className="block max-w-[16rem] truncate" title={r.factoryName}>{r.factoryName}</span>
                          : <span className="text-muted-foreground">All factories</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(r.requestedAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'active' ? 'success' : 'warning'}>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {r.status === 'requested' && (
                            <Button size="sm" variant="outline" className="h-7"
                              disabled={busy === r.id} onClick={() => decide(r.id, 'active')}>
                              {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              <span className="ml-1 text-xs">Grant</span>
                            </Button>
                          )}
                          {r.status === 'active' && (
                            <Button size="sm" variant="ghost" className="h-7"
                              disabled={busy === r.id} onClick={() => decide(r.id, 'revoked')}>
                              <X className="h-3.5 w-3.5" />
                              <span className="ml-1 text-xs">Revoke</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
