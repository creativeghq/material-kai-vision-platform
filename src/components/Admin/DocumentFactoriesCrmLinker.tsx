/**
 * DocumentFactoriesCrmLinker — surfaces every distinct factory / brand name
 * extracted from a PDF document (via document_entities + products metadata)
 * and lets an admin one-click promote each one into the CRM as a Business
 * (crm_companies row, automatically flagged is_supplier=true).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Check, Plus, Loader2, ExternalLink, AlertCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { quoteOrValue } from '@/services/crmSearch';
import { useToast } from '@/hooks/use-toast';
import { companiesAPI } from '@/services/crm.service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { TablePagination, paginate } from '@/components/core/ui/table-pagination';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import { cn } from '@/lib/utils';
import {
  HubCellLink,
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

interface DocumentEntityLike {
  factory_name?: string | null;
  factory_group?: string | null;
  manufacturer?: string | null;
}

interface ProductLike {
  metadata?: Record<string, unknown> | null;
}

interface DocumentFactoriesCrmLinkerProps {
  entities: DocumentEntityLike[];
  products: ProductLike[];
}

interface FactoryAggregate {
  name: string;             // canonical (trimmed) display name
  lowerKey: string;         // case-insensitive lookup key
  entityCount: number;
  productCount: number;
  inferredGroup?: string | null;
}

interface CompanyMatch {
  id: string;
  name: string;
  is_supplier: boolean | null;
  is_customer: boolean | null;
  vat_number: string | null;
  website: string | null;
}

/** Inference helpers — read the maker name from a product's metadata using
    the same alias fallback as @/utils/productMetadata.getManufacturer(). */
function pickMakerFromMetadata(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const candidate =
    metadata.factory_name ??
    metadata.manufacturer ??
    metadata.brand ??
    metadata.supplier ??
    null;
  if (candidate == null) return null;
  // Handle the {value, confidence} envelope Stage 0 sometimes writes.
  if (typeof candidate === 'object' && 'value' in (candidate as Record<string, unknown>)) {
    const inner = (candidate as Record<string, unknown>).value;
    return typeof inner === 'string' ? inner : null;
  }
  return typeof candidate === 'string' ? candidate : null;
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

export const DocumentFactoriesCrmLinker: React.FC<DocumentFactoriesCrmLinkerProps> = ({
  entities, products,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [matchesByKey, setMatchesByKey] = useState<Map<string, CompanyMatch | null>>(new Map());
  const [loading, setLoading] = useState(false);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    open: boolean;
    factoryKey: string;
    name: string;
    website: string;
    description: string;
    markAsSupplier: boolean;
  } | null>(null);

  // Aggregate distinct factory names from both entities and products
  const [page, setPage] = useState(1);
  const factories = useMemo<FactoryAggregate[]>(() => {
    const accum = new Map<string, FactoryAggregate>();

    const push = (rawName: string | null | undefined, source: 'entity' | 'product', inferredGroup?: string | null) => {
      if (!rawName) return;
      const name = String(rawName).trim();
      if (!name) return;
      const key = name.toLowerCase();
      const existing = accum.get(key);
      if (existing) {
        if (source === 'entity') existing.entityCount += 1;
        else existing.productCount += 1;
        if (inferredGroup && !existing.inferredGroup) existing.inferredGroup = inferredGroup;
      } else {
        accum.set(key, {
          name,
          lowerKey: key,
          entityCount: source === 'entity' ? 1 : 0,
          productCount: source === 'product' ? 1 : 0,
          inferredGroup: inferredGroup ?? null,
        });
      }
    };

    for (const e of entities ?? []) {
      push(e.factory_name, 'entity', e.factory_group ?? null);
      // Some entities only set the legacy `manufacturer` column.
      if (!e.factory_name && e.manufacturer) push(e.manufacturer, 'entity', e.factory_group ?? null);
    }
    for (const p of products ?? []) {
      push(pickMakerFromMetadata(p.metadata), 'product');
    }

    return Array.from(accum.values()).sort((a, b) =>
      (b.entityCount + b.productCount) - (a.entityCount + a.productCount),
    );
  }, [entities, products]);

  const loadMatches = useCallback(async () => {
    if (factories.length === 0) { setMatchesByKey(new Map()); return; }
    setLoading(true);
    try {
      // One round-trip: OR ilike across all candidates.
      // Deliberately an EXACT name match, not a `search_fold` substring — the result is keyed
      // back by lowercased name below, so a fuzzy hit would attach the wrong company.
      // Quoted because these names come out of PDF metadata: PostgREST's or() grammar is
      // comma-delimited, and one "Tiles, Inc" 400s the whole batch.
      const ors = factories.map((f) => {
        const safe = f.name.replace(/[%_]/g, '\\$&');
        return `name.ilike.${quoteOrValue(safe)}`;
      }).join(',');
      const { data, error } = await supabase
        .from('crm_companies')
        .select('id, name, is_supplier, is_customer, vat_number, website')
        .or(ors);
      if (error) throw error;

      const next = new Map<string, CompanyMatch | null>();
      for (const f of factories) next.set(f.lowerKey, null);
      for (const row of (data ?? []) as CompanyMatch[]) {
        const key = (row.name ?? '').trim().toLowerCase();
        if (next.has(key)) next.set(key, row);
      }
      setMatchesByKey(next);
    } catch (err: any) {
      toast({ title: 'Could not check CRM', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [factories, toast]);

  useEffect(() => { void loadMatches(); }, [loadMatches]);

  const openCreateDialog = (factory: FactoryAggregate) => {
    setDialog({
      open: true,
      factoryKey: factory.lowerKey,
      name: factory.name,
      website: '',
      description: factory.inferredGroup
        ? `Imported from PDF catalog. Part of brand group: ${factory.inferredGroup}.`
        : 'Imported from PDF catalog.',
      markAsSupplier: true,
    });
  };

  const handleCreate = async () => {
    if (!dialog) return;
    const name = dialog.name.trim();
    if (!name) return;
    setCreatingKey(dialog.factoryKey);
    try {
      const response = await companiesAPI.createCompany({
        // A factory promoted from a catalog belongs to the workspace being administered. crm-api
        // used to fall back to the caller's first workspace when this was omitted (#366 BU-10).
        workspace_id: activeWorkspaceId,
        name,
        website: dialog.website.trim() || undefined,
        description: dialog.description.trim() || undefined,
        is_supplier: dialog.markAsSupplier,
        // A factory read off a PDF catalog is someone we buy from, never someone we sell to.
        // is_customer DEFAULTS TO TRUE, so leaving it out filed every factory as a customer.
        is_customer: false,
      });
      const created = response?.data ?? response;
      const newMatch: CompanyMatch = {
        id: created.id,
        name: created.name ?? name,
        is_supplier: created.is_supplier ?? dialog.markAsSupplier,
        is_customer: created.is_customer ?? null,
        vat_number: created.vat_number ?? null,
        website: created.website ?? null,
      };
      const next = new Map(matchesByKey);
      next.set(dialog.factoryKey, newMatch);
      setMatchesByKey(next);
      toast({ title: 'Added to CRM', description: `${name} created as a supplier.` });
      setDialog(null);
    } catch (err: any) {
      toast({
        title: 'Could not create CRM company',
        description: err?.message ?? 'Try again',
        variant: 'destructive',
      });
    } finally {
      setCreatingKey(null);
    }
  };

  const factoryFields = useMemo<HubTableField<FactoryAggregate>[]>(() => [
    { id: 'brand', sortValue: (f) => f.name, searchText: (f) => `${f.name} ${f.inferredGroup ?? ''}` },
    { id: 'entities', sortValue: (f) => f.entityCount },
    { id: 'products', sortValue: (f) => f.productCount },
    {
      id: 'crm',
      sortValue: (f) => (matchesByKey.get(f.lowerKey) ? 1 : 0),
      filterValue: (f) => (matchesByKey.get(f.lowerKey) ? 'linked' : 'missing'),
      filterLabel: 'CRM status',
      filterOptionLabel: (v) => (v === 'linked' ? 'Linked' : 'Not in CRM'),
    },
  ], [matchesByKey]);
  const factoryTable = useHubTable(factories, factoryFields);
  const { search: factorySearch, filters: factoryFilters } = factoryTable;
  useEffect(() => { setPage(1); }, [factorySearch, factoryFilters]);

  if (factories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Businesses in This Document
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground space-y-2">
            <AlertCircle className="h-6 w-6 mx-auto opacity-50" />
            <p>No brand names found in the extracted entities or products.</p>
            <p className="text-xs">
              The extraction pipeline writes the maker into <code>products.metadata.factory_name</code> and{' '}
              <code>document_entities.factory_name</code>. If this catalog has a brand on the cover, it may not have been picked up yet.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Businesses in This Document
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {factories.length} distinct brand name{factories.length === 1 ? '' : 's'} found. One-click promotion to the CRM.
          </p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </CardHeader>
      <CardContent className="p-0">
        <div>
          {factories.length > 8 && (
            <HubToolbar
              search={factoryTable.search}
              onSearchChange={factoryTable.setSearch}
              searchPlaceholder="Search brands"
              filters={
                <>
                  <HubFilterSelect
                    label="CRM status"
                    value={factoryTable.filters.crm ?? HUB_FILTER_ALL}
                    options={factoryTable.filterOptions.crm}
                    onChange={(v) => factoryTable.setFilter('crm', v)}
                  />
                  <HubResetFilters count={factoryTable.activeFilterCount} onReset={factoryTable.reset} />
                </>
              }
            />
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead id="brand" sort={factoryTable.sort} onSort={factoryTable.toggleSort}>Brand</SortHead>
                <SortHead id="entities" sort={factoryTable.sort} onSort={factoryTable.toggleSort} align="right" className="hidden sm:table-cell">Entities</SortHead>
                <SortHead id="products" sort={factoryTable.sort} onSort={factoryTable.toggleSort} align="right" className="hidden sm:table-cell">Products</SortHead>
                <SortHead id="crm" sort={factoryTable.sort} onSort={factoryTable.toggleSort} className="hidden md:table-cell">CRM status</SortHead>
                <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {factoryTable.rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    <HubEmptyState
                      variant="filtered"
                      title="No brands match these filters"
                      action={<Button variant="outline" size="sm" onClick={factoryTable.reset}>Clear filters</Button>}
                    />
                  </TableCell>
                </TableRow>
              )}
              {paginate(factoryTable.rows, page).map((f) => {
                const match = matchesByKey.get(f.lowerKey) ?? null;
                const isCreating = creatingKey === f.lowerKey;
                return (
                  <TableRow key={f.lowerKey}>
                    <TableCell>
                      {match ? (
                        <HubCellLink to={`/crm/companies/${match.id}`} className="block max-w-[18rem] truncate">
                          {f.name}
                        </HubCellLink>
                      ) : (
                        <div className="max-w-[18rem] truncate font-medium" title={f.name}>{f.name}</div>
                      )}
                      {f.inferredGroup && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Group: {f.inferredGroup}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-xs sm:table-cell">{f.entityCount}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-xs sm:table-cell">{f.productCount}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {loading ? (
                        <span className="text-xs text-muted-foreground">Checking…</span>
                      ) : match ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] inline-flex items-center text-emerald-600 dark:text-emerald-400">
                            <Check className="h-3 w-3 mr-1" /> Linked
                          </span>
                          {match.is_supplier && (
                            <span className="text-[10px] text-muted-foreground">Supplier</span>
                          )}
                          {match.vat_number && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              VAT {match.vat_number}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Not in CRM</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {match ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/crm/companies/${match.id}`)}
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open in CRM
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => openCreateDialog(f)}
                          disabled={isCreating}
                        >
                          {isCreating ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Add as Supplier
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            total={factoryTable.rows.length}
            onPageChange={setPage}
            label="brands"
          />
        </div>
      </CardContent>

      <Dialog open={!!dialog?.open} onOpenChange={(o) => { if (!o && !creatingKey) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to CRM as a Business</DialogTitle>
            <DialogDescription>
              Creates a <code>crm_companies</code> row prefilled from the PDF's
              extracted maker name. You can finish filling in VAT, address and
              contacts after creation.
            </DialogDescription>
          </DialogHeader>
          {dialog && (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="biz-name">Business name *</Label>
                <Input
                  id="biz-name"
                  value={dialog.name}
                  onChange={(e) => setDialog({ ...dialog, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-website">Website</Label>
                <Input
                  id="biz-website"
                  type="url"
                  value={dialog.website}
                  onChange={(e) => setDialog({ ...dialog, website: e.target.value })}
                  placeholder="https://example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-desc">Description</Label>
                <Textarea
                  id="biz-desc"
                  value={dialog.description}
                  onChange={(e) => setDialog({ ...dialog, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="space-y-0.5">
                  <Label htmlFor="biz-supplier" className="cursor-pointer">Mark as supplier</Label>
                  <p className="text-xs text-muted-foreground">
                    Enables the Products tab on the company and surfaces it in supplier-billing flows.
                  </p>
                </div>
                <Switch
                  id="biz-supplier"
                  checked={dialog.markAsSupplier}
                  onCheckedChange={(v) => setDialog({ ...dialog, markAsSupplier: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={!!creatingKey}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!!creatingKey || !dialog?.name.trim()}>
              {creatingKey ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1.5" />
              )}
              Create CRM Business
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default DocumentFactoriesCrmLinker;
