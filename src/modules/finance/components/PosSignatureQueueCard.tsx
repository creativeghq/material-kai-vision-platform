/**
 * Provider signatures still waiting for their payment to match (#448).
 *
 * An unmatched signature auto-rejects after 60 hours — 2 for εστίαση — and a simultaneous
 * transaction that is still unmatched must be transmitted flagged «Υπό Έκδοση». This shows where
 * each one stands and closes NOTHING: marking a signature lost is a decision about whether a real
 * payment happened, and it is not ours to take.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Timer } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import {
  HubToolbar, HubFilterSelect, HubResetFilters, HubSortButton, HubCellEmpty, useHubTable, HUB_FILTER_ALL,
  type HubTableField,
} from '@/components/core/hub';
import {
  posInterconnectionService, SIGNATURE_VERDICT_LABEL, signatureQueueNeedsAttention,
  needsUnderIssuanceFlag, MATCHING_WINDOW_HOURS,
  type SignatureQueue,
} from '@/modules/finance/services/posInterconnectionService';
import type { SignatureRow, SignatureVerdict } from '@/modules/finance/posInterconnectionRules';

const kindLabel = (deferred: boolean) => (deferred ? 'Deferred' : 'Simultaneous');

const FIELDS: HubTableField<SignatureRow>[] = [
  { id: 'terminal', sortValue: (r) => r.terminal_id, searchText: (r) => r.terminal_id },
  { id: 'amount', sortValue: (r) => r.amount },
  {
    id: 'kind', sortValue: (r) => r.is_deferred, filterLabel: 'Kind',
    filterValue: (r) => (r.is_deferred ? 'deferred' : 'simultaneous'),
    filterOptionLabel: (v) => kindLabel(v === 'deferred'),
  },
  { id: 'hours', sortValue: (r) => r.hours_remaining },
  {
    id: 'state', sortValue: (r) => r.verdict, filterValue: (r) => r.verdict, filterLabel: 'State',
    filterOptionLabel: (v) => SIGNATURE_VERDICT_LABEL[v as SignatureVerdict] ?? v,
  },
];

const EMPTY_ROWS: SignatureRow[] = [];

export const PosSignatureQueueCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const [queue, setQueue] = useState<SignatureQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const t = useHubTable(queue?.rows ?? EMPTY_ROWS, FIELDS);
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

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setQueue(await posInterconnectionService.signatureQueue(workspaceId));
      setFailed(false);
    } catch {
      setQueue(null); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="h-4 w-4 text-primary" /> Signatures awaiting a match
        </CardTitle>
        <CardDescription>
          The matching window is {MATCHING_WINDOW_HOURS.standard} hours, and{' '}
          {MATCHING_WINDOW_HOURS.food_service} for εστίαση. After it, AADE rejects the signature —
          nothing here expires one, because a payment that did happen is not repaired by writing it off.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2 text-xs">
        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the queue…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The signature queue could not be read just now. That is not a statement that nothing is
            waiting.
          </p>
        )}

        {!loading && !failed && queue && (
          <>
            <div
              className={`space-y-1 rounded-md border p-2 ${
                queue.status === 'expired_unmatched' || queue.status === 'unflagged'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : signatureQueueNeedsAttention(queue)
                    ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                    : 'border-hairline bg-surface-sunken text-muted-foreground'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {signatureQueueNeedsAttention(queue)
                  ? <AlertTriangle className="h-3.5 w-3.5" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                <span className="tabular-nums">
                  {queue.awaiting} awaiting · {queue.expiring_soon} near the edge ·{' '}
                  {queue.expired_unmatched} past the window · {queue.unflagged_under_issuance} unflagged
                </span>
              </div>
              <p>{queue.reason}</p>
            </div>

            {queue.rows.length === 0 && (
              <HubEmptyState
                title="Nothing waiting"
                description="Every provider signature taken so far has matched a payment inside its window."
              />
            )}

            {queue.rows.length > 0 && (
              <div className="overflow-hidden rounded-md border border-hairline">
                {queue.rows.length > 8 && (
                  <HubToolbar
                    search={t.search}
                    onSearchChange={t.setSearch}
                    searchPlaceholder="Search terminals"
                    filters={<>
                      <HubFilterSelect label="State" value={t.filters.state ?? HUB_FILTER_ALL} options={t.filterOptions.state} onChange={(v) => t.setFilter('state', v)} />
                      <HubFilterSelect label="Kind" value={t.filters.kind ?? HUB_FILTER_ALL} options={t.filterOptions.kind} onChange={(v) => t.setFilter('kind', v)} />
                      <HubResetFilters count={t.activeFilterCount} onReset={t.reset} />
                    </>}
                  />
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      {sortHead('terminal', 'Terminal')}
                      {sortHead('amount', 'Amount', 'right')}
                      <TableHead className="hidden sm:table-cell">Kind</TableHead>
                      {sortHead('hours', 'Hours left', 'right')}
                      {sortHead('state', 'State')}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {t.rows.length === 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={5}>
                          <HubEmptyState
                            variant="filtered"
                            title="No signatures match"
                            action={<HubResetFilters count={t.activeFilterCount} onReset={t.reset} />}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                    {t.rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{r.terminal_id ?? <HubCellEmpty />}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.amount ?? <HubCellEmpty />}</TableCell>
                        <TableCell className="hidden sm:table-cell">{kindLabel(r.is_deferred)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.hours_remaining <= 0 ? <HubCellEmpty /> : r.hours_remaining}
                        </TableCell>
                        <TableCell className="space-x-1">
                          <Badge variant={r.verdict === 'expired_unmatched' ? 'error' : r.verdict === 'expiring_soon' ? 'warning' : 'neutral'}>
                            {SIGNATURE_VERDICT_LABEL[r.verdict]}
                          </Badge>
                          {needsUnderIssuanceFlag(r) && (
                            <span className="text-amber-800 dark:text-amber-300">
                              must be transmitted «Υπό Έκδοση»
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
