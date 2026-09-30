/**
 * Product safety recalls (#450) — GPSR art. 35, 36.
 *
 * The notice is a fixed template with a banned-phrase rule, not a letter somebody writes: art.
 * 36(2) mandates seven elements and forbids the softeners that make a reader think the hazard is
 * optional. Both are enforced at the write; this shows them before the write refuses.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertTriangle, Megaphone, Users, Link as LinkIcon, Plus, Save,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import {
  HubToolbar, HubFilterSelect, HubResetFilters, HubSortButton, HubCellLink, HubCellEmpty, useHubTable,
  HUB_FILTER_ALL, type HubTableField, type HubSort,
} from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import {
  productComplianceService, bannedPhrasesIn, missingRecallElements,
  RECALL_HEADLINE, RECALL_REQUIRED_FIELDS,
  type ProductRecall, type BannedPhrase, type RecallAffectedCustomer,
} from '@/modules/finance/services/productComplianceService';

const RECALL_FIELDS: HubTableField<ProductRecall>[] = [
  { id: 'notice', sortValue: (r) => r.product_description, searchText: (r) => r.product_description },
  { id: 'status', sortValue: (r) => r.status, filterValue: (r) => r.status, filterLabel: 'Status' },
  { id: 'published', sortValue: (r) => r.published_at },
  { id: 'gateway', sortValue: (r) => r.gateway_reference, searchText: (r) => r.gateway_reference },
];

const AFFECTED_FIELDS: HubTableField<RecallAffectedCustomer>[] = [
  { id: 'customer', sortValue: (a) => a.customer_name, searchText: (a) => a.customer_name },
  { id: 'email', sortValue: (a) => a.email, searchText: (a) => a.email },
  { id: 'orders', sortValue: (a) => a.orders },
  { id: 'quantity', sortValue: (a) => a.quantity },
];

const SortHead: React.FC<{
  id: string; label: string; sort?: HubSort; onSort: (id: string) => void; className?: string; align?: 'right';
}> = ({ id, label, sort, onSort, className, align }) => (
  <TableHead
    className={[className, align === 'right' ? 'text-right' : ''].filter(Boolean).join(' ') || undefined}
    aria-sort={sort?.columnId === id ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
  >
    <HubSortButton active={sort?.columnId === id ? sort.direction : undefined} align={align} onClick={() => onSort(id)}>
      {label}
    </HubSortButton>
  </TableHead>
);

const affectedLink = (a: RecallAffectedCustomer) =>
  a.company_id ? `/crm/companies/${a.company_id}` : a.contact_id ? `/crm/contacts/${a.contact_id}` : undefined;

const NO_AFFECTED: RecallAffectedCustomer[] = [];

export const RecallsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [recalls, setRecalls] = useState<ProductRecall[]>([]);
  const [phrases, setPhrases] = useState<BannedPhrase[]>([]);
  const [editing, setEditing] = useState<Partial<ProductRecall> | null>(null);
  const [affected, setAffected] = useState<RecallAffectedCustomer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const rt = useHubTable(recalls, RECALL_FIELDS);
  const at = useHubTable(affected ?? NO_AFFECTED, AFFECTED_FIELDS);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rs, ps] = await Promise.all([
        productComplianceService.listRecalls(workspaceId),
        productComplianceService.bannedPhrases(),
      ]);
      setRecalls(rs); setPhrases(ps); setFailed(false);
    } catch {
      setRecalls([]); setPhrases([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const body = useMemo(() => {
    if (!editing) return '';
    return [
      editing.product_description, editing.hazard_description, editing.consumer_action,
      editing.remedies, editing.share_encouragement,
    ].filter(Boolean).join(' ');
  }, [editing]);

  const banned = useMemo(
    () => bannedPhrasesIn(body, phrases, editing?.language_code ?? 'el'),
    [body, phrases, editing?.language_code],
  );
  const missing = useMemo(() => (editing ? missingRecallElements(editing) : []), [editing]);

  const save = async (status: 'draft' | 'published') => {
    if (!editing) return;
    setSaving(true);
    try {
      const saved = await productComplianceService.saveRecall({
        ...editing, workspace_id: workspaceId, status, headline: RECALL_HEADLINE,
      });
      setEditing(saved);
      await load();
      toast({ title: status === 'published' ? 'Notice published' : 'Draft saved' });
    } catch (err: unknown) {
      toast({
        title: 'Could not save the notice',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setSaving(false); }
  };

  const loadAffected = async (id: string) => {
    try { setAffected(await productComplianceService.affectedCustomers(id)); }
    catch (err: unknown) {
      toast({
        title: 'Could not derive the affected customers',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-primary" /> Product safety recalls
          </CardTitle>
          <CardDescription>
            The headline and the seven elements are fixed by GPSR art. 36(2), and wording that
            lowers a reader&rsquo;s sense of the risk is banned by the same paragraph.
          </CardDescription>
        </div>
        <Button
          size="sm" variant="outline"
          onClick={() => { setEditing({ language_code: 'el', headline: RECALL_HEADLINE, batch_codes: [] }); setAffected(null); }}
        >
          <Plus className="mr-2 h-3.5 w-3.5" /> New notice
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading notices…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The recall register could not be read just now. That is not a statement that there are
            none.
          </p>
        )}

        {!loading && !failed && recalls.length === 0 && !editing && (
          <HubEmptyState
            title="No recall notices"
            description="A notice is drafted here, checked against art. 36(2), and published to a public page customers can be sent to."
            action={(
              <Button
                size="sm"
                onClick={() => setEditing({ language_code: 'el', headline: RECALL_HEADLINE, batch_codes: [] })}
              >
                <Plus className="mr-2 h-3.5 w-3.5" /> New notice
              </Button>
            )}
          />
        )}

        {recalls.length > 0 && (
          <div className="overflow-hidden rounded-md border border-hairline">
            {recalls.length > 8 && (
              <HubToolbar
                search={rt.search}
                onSearchChange={rt.setSearch}
                searchPlaceholder="Search notices"
                filters={<>
                  <HubFilterSelect label="Status" value={rt.filters.status ?? HUB_FILTER_ALL} options={rt.filterOptions.status} onChange={(v) => rt.setFilter('status', v)} />
                  <HubResetFilters count={rt.activeFilterCount} onReset={rt.reset} />
                </>}
              />
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead id="notice" label="Notice" sort={rt.sort} onSort={rt.toggleSort} />
                  <SortHead id="status" label="Status" sort={rt.sort} onSort={rt.toggleSort} />
                  <SortHead id="published" label="Published" sort={rt.sort} onSort={rt.toggleSort} className="hidden sm:table-cell" />
                  <SortHead id="gateway" label="Gateway" sort={rt.sort} onSort={rt.toggleSort} className="hidden md:table-cell" />
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rt.rows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5}>
                      <HubEmptyState
                        variant="filtered"
                        title="No notices match"
                        action={<HubResetFilters count={rt.activeFilterCount} onReset={rt.reset} />}
                      />
                    </TableCell>
                  </TableRow>
                )}
                {rt.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="block max-w-[20rem] truncate text-left font-semibold text-primary hover:underline"
                        title={r.product_description ?? undefined}
                        onClick={() => { setEditing(r); setAffected(null); }}
                      >
                        {r.product_description ?? 'Untitled notice'}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'published' ? 'error' : r.status === 'closed' ? 'neutral' : 'warning'}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap tabular-nums sm:table-cell">
                      {r.published_at ? r.published_at.slice(0, 10) : <HubCellEmpty />}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {r.gateway_reference
                        ? r.gateway_reference
                        : <span className="text-destructive">not submitted</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setAffected(null); }}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {editing && (
          <div className="space-y-3 rounded-md border border-hairline p-3">
            <p className="text-sm font-medium">{RECALL_HEADLINE}</p>
            <p className="text-[11px] text-muted-foreground">
              The headline is literal and is not ours to phrase (art. 36(2)(a)).
            </p>

            {RECALL_REQUIRED_FIELDS.map((f) => (
              <div key={String(f.key)}>
                <Label className="text-[11px]">{f.label}</Label>
                <Textarea
                  className="mt-1 text-xs" rows={2}
                  value={String(editing[f.key] ?? '')}
                  onChange={(e) => setEditing((r) => ({ ...r, [f.key]: e.target.value }))}
                />
              </div>
            ))}

            <div>
              <Label className="text-[11px]">Safety Business Gateway reference (art. 20)</Label>
              <Input
                className="mt-1 h-8 text-xs" value={editing.gateway_reference ?? ''}
                onChange={(e) => setEditing((r) => ({ ...r, gateway_reference: e.target.value || null }))}
                placeholder="recorded so “we notified” is a fact, not a memory"
              />
            </div>

            {missing.length > 0 && (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px]">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Missing art. 36(2) elements: {missing.join(', ')}</span>
              </p>
            )}

            {banned.length > 0 && (
              <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Art 36(2) bans wording that lowers a reader&rsquo;s perception of the risk. Found:{' '}
                  {banned.map((b) => b.phrase).join(', ')}.
                </span>
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => save('draft')} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                Save draft
              </Button>
              <Button
                size="sm" onClick={() => save('published')}
                disabled={saving || missing.length > 0 || banned.length > 0}
              >
                Publish notice
              </Button>
              {editing.id && (
                <Button size="sm" variant="outline" onClick={() => loadAffected(editing.id as string)}>
                  <Users className="mr-2 h-3.5 w-3.5" /> Who bought it
                </Button>
              )}
              {editing.public_token && editing.status === 'published' && (
                <a
                  className="inline-flex items-center gap-1 text-xs text-primary underline"
                  href={`/recall/${editing.public_token}`} target="_blank" rel="noreferrer"
                >
                  <LinkIcon className="h-3 w-3" /> Public notice
                </a>
              )}
            </div>

            {affected && (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  Derived from the order lines. Nothing has been sent — this is who to send to.
                </p>
                {affected.length === 0
                  ? <p className="text-[11px] text-muted-foreground">No sales order carries this product.</p>
                  : (
                    <div className="overflow-hidden rounded-md border border-hairline">
                      {affected.length > 8 && (
                        <HubToolbar
                          search={at.search}
                          onSearchChange={at.setSearch}
                          searchPlaceholder="Search customers"
                          filters={<HubResetFilters count={at.activeFilterCount} onReset={at.reset} />}
                        />
                      )}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortHead id="customer" label="Customer" sort={at.sort} onSort={at.toggleSort} />
                            <SortHead id="email" label="Email" sort={at.sort} onSort={at.toggleSort} className="hidden sm:table-cell" />
                            <SortHead id="orders" label="Orders" sort={at.sort} onSort={at.toggleSort} align="right" />
                            <SortHead id="quantity" label="Quantity" sort={at.sort} onSort={at.toggleSort} align="right" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {at.rows.length === 0 && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={4}>
                                <HubEmptyState
                                  variant="filtered"
                                  title="No customers match"
                                  action={<HubResetFilters count={at.activeFilterCount} onReset={at.reset} />}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                          {at.rows.map((a, i) => (
                            <TableRow key={`${a.company_id ?? a.contact_id ?? 'x'}:${i}`}>
                              <TableCell>
                                {a.customer_name ? (
                                  <HubCellLink to={affectedLink(a)} className="block max-w-[16rem] truncate">
                                    <span title={a.customer_name}>{a.customer_name}</span>
                                  </HubCellLink>
                                ) : <HubCellEmpty />}
                              </TableCell>
                              <TableCell className="hidden break-all sm:table-cell">{a.email ?? <span className="text-destructive">no address</span>}</TableCell>
                              <TableCell className="text-right tabular-nums">{a.orders}</TableCell>
                              <TableCell className="text-right tabular-nums">{a.quantity ?? <HubCellEmpty />}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
