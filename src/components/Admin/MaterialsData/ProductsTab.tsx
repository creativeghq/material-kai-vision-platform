import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Eye, Loader2, Trash2, FileText, Code, Globe, Package, RefreshCw } from 'lucide-react';
import { FilterBar, applyFiltersToQuery, type FilterValues } from '@/components/core/filters';
import { buildMaterialsDataFilters } from './materialsDataFilters';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ProductDetailModal } from './ProductDetailModal';
import { SmartPagination } from '@/components/core/ui/smart-pagination';
import { MIVAA_API_URL } from '@/config/mivaa';
import { formatDate } from '@/utils/datetime';
import {
  readinessFor,
  readinessSummary,
  type ProductEmbedReadiness,
} from '@/services/productEmbedReadinessService';
import {
  getManufacturer,
  getMaterialCategory,
  getProductName,
} from '@/utils/productMetadata';

interface Product {
  id: string;
  name: string;
  // Carried through to the detail modal, which gates its own-workspace surfaces (3D upload,
  // configurator, embed readiness) on `product.workspace_id === activeWorkspaceId`. The admin
  // wrapper used to drop it, so from THIS list — the catalogue management surface — none of those
  // rendered and nobody was ever asked for a model (#341).
  workspace_id?: string | null;
  metadata: any;
  created_at: string;
  source_document_id: string;
  source_type?: 'pdf_processing' | 'xml_import' | 'web_scraping' | null;
  source_job_id?: string | null;
  // Halfvec comes back as a string via select('*'); null = never embedded
  // (invisible to product-level vector search until backfilled).
  text_embedding_1024?: string | null;
}

interface ProductsTabProps {
  workspaceId: string;
  jobIdFilter?: string;
  /** `?productId=` deep link — narrows to a single product. See MaterialsDataPage. */
  productIdFilter?: string;
  onStatsUpdate: () => void;
}

export const ProductsTab: React.FC<ProductsTabProps> = ({ workspaceId, jobIdFilter, productIdFilter, onStatsUpdate }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [reembeddingId, setReembeddingId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<Map<string, ProductEmbedReadiness>>(new Map());
  const { toast } = useToast();

  const ITEMS_PER_PAGE = 20;

  const groups = useMemo(() => buildMaterialsDataFilters('products', { jobIdFilter }), [jobIdFilter]);
  const [filterValues, setFilterValues] = useState<FilterValues>(
    () => (jobIdFilter?.trim() ? { source_job_id: jobIdFilter.trim() } : {}),
  );

  // The `?jobId=` deep link lives on the page above; mirror it into the values bag so it
  // shows up as a removable chip instead of an invisible predicate.
  useEffect(() => {
    setFilterValues((v) => ({ ...v, source_job_id: jobIdFilter?.trim() || undefined }));
  }, [jobIdFilter]);

  const buildQuery = useCallback((values: FilterValues, head: boolean) => {
    let query: any = supabase
      .from('products')
      .select(head ? 'id' : '*', { count: 'exact', head })
      .eq('workspace_id', workspaceId);

    query = applyFiltersToQuery(query, groups, values);

    // `has_embedding` has no `column` — a halfvec presence test isn't expressible through
    // the generic bool mapping, so it is composed here.
    if (values.has_embedding === true) query = query.not('text_embedding_1024', 'is', null);
    else if (values.has_embedding === false) query = query.is('text_embedding_1024', null);

    // `?productId=` deep link. Composed here for the same reason as has_embedding: it is a
    // direct identity predicate, not one of the declared filter groups. Callers
    // (AsyncJobQueueMonitor's "open this product", the mention dashboard's "Open") used to
    // pass this param to a page that never read it, so it silently showed ALL products.
    if (productIdFilter?.trim()) query = query.eq('id', productIdFilter.trim());

    return query;
  }, [workspaceId, groups, productIdFilter]);

  const loadProducts = useCallback(async (page: number) => {
    try {
      setIsLoading(true);

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await buildQuery(filterValues, false)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      const rows = (data as Product[]) || [];
      setProducts(rows);
      setTotalCount(count || 0);
      // One batched call for the whole page — the same shape get_order_settlements uses, so the
      // column costs one query rather than one per row. A failure leaves the column showing "—"
      // and nothing else on the page notices.
      readinessFor(rows.map((p) => p.id))
        .then(setReadiness)
        .catch(() => setReadiness(new Map()));
    } catch (error) {
      console.error('Failed to load products:', error);
      toast({
        title: 'Error',
        description: 'Failed to load products',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery, filterValues, toast]);

  useEffect(() => { setCurrentPage(1); }, [filterValues]);

  // Debounced so typing in the search box doesn't fire a query per keystroke; the cleanup
  // also collapses the extra render caused by the page reset above into one fetch.
  useEffect(() => {
    if (!workspaceId) return;
    const timer = setTimeout(() => { void loadProducts(currentPage); }, 250);
    return () => clearTimeout(timer);
  }, [workspaceId, currentPage, loadProducts]);

  const previewCount = useCallback(async (values: FilterValues) => {
    const { count } = await buildQuery(values, true);
    return count ?? 0;
  }, [buildQuery]);

  const handleDelete = async (productId: string) => {
    if (!confirm('Delete this product? This will also delete related data.')) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Product deleted successfully',
      });
      loadProducts(currentPage);
      onStatsUpdate();
    } catch (error) {
      console.error('Failed to delete product:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete product',
        variant: 'destructive',
      });
    }
  };

  const handleReembed = async (productId: string) => {
    setReembeddingId(productId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch(`${MIVAA_API_URL}/api/admin/text-embeddings/backfill`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ product_ids: [productId], include_chunks: false }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail?.error || detail?.detail || `HTTP ${res.status}`);
      }
      const result = await res.json();
      const embedded = result?.products?.embedded ?? 0;
      toast({
        title: embedded > 0 ? 'Embedding generated' : 'Embedding failed',
        description: embedded > 0
          ? 'Product is now visible to vector search.'
          : 'The embedding provider did not return a vector — check MIVAA logs and retry.',
        variant: embedded > 0 ? 'default' : 'destructive',
      });
      await loadProducts(currentPage);
    } catch (error) {
      console.error('Re-embed failed:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Re-embed request failed',
        variant: 'destructive',
      });
    } finally {
      setReembeddingId(null);
    }
  };

  const getSourceBadge = (sourceType: string | null | undefined) => {
    if (!sourceType) return <span className="text-xs text-muted-foreground">Unknown</span>;

    const badges = {
      pdf_processing: { label: 'PDF', icon: FileText, color: 'text-blue-600 dark:text-blue-400' },
      xml_import: { label: 'XML', icon: Code, color: 'text-emerald-600 dark:text-emerald-400' },
      web_scraping: { label: 'Web', icon: Globe, color: 'text-purple-600 dark:text-purple-400' },
    };

    const badge = badges[sourceType as keyof typeof badges];
    if (!badge) return <span className="text-xs text-muted-foreground capitalize">{sourceType}</span>;

    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 text-xs ${badge.color}`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                All Products
              </CardTitle>
              <CardDescription>
                View and manage all products from PDF, XML, and Web Scraping sources
              </CardDescription>
            </div>
            <FilterBar
              groups={groups}
              values={filterValues}
              onChange={setFilterValues}
              previewCount={previewCount}
              title="Filter products"
              searchPlaceholder="Search name / SKU…"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No products found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Embedding</TableHead>
                  <TableHead>Sellable online</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  // Helper to check if value is a "not found" placeholder
                  const isNotFound = (val: string | null | undefined): boolean => {
                    if (!val) return true;
                    const normalized = val.toLowerCase().trim();
                    return normalized === 'not found' ||
                           normalized === 'not explicitly mentioned' ||
                           normalized === 'not mentioned' ||
                           normalized === 'n/a' ||
                           normalized === 'unknown';
                  };

                  // Normalize category - use consistent casing
                  const rawCategory = getMaterialCategory(product.metadata);
                  const category = !rawCategory || isNotFound(rawCategory) ? 'N/A' : rawCategory;

                  // Get manufacturer via the shared accessor (checks every known key)
                  const rawMfg = getManufacturer(product.metadata);
                  const manufacturer = !rawMfg || isNotFound(rawMfg) ? 'N/A' : rawMfg;

                  return (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{getProductName(product)}</TableCell>
                    <TableCell>{getSourceBadge(product.source_type)}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground capitalize">
                        {category}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{manufacturer}</span>
                    </TableCell>
                    <TableCell>
                      {product.text_embedding_1024 ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">Embedded</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-500 dark:text-red-400">Missing</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Generate text embedding now"
                            disabled={reembeddingId === product.id}
                            onClick={() => handleReembed(product.id)}
                          >
                            {reembeddingId === product.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    {/* #341 join 5 — the same derived answer the product panel shows, so a catalogue
                        can be scanned for what is missing instead of opened one product at a time.
                        Plain coloured words, never a filled pill (design system). */}
                    <TableCell>
                      {(() => {
                        const r = readiness.get(product.id);
                        if (!r) return <span className="text-xs text-muted-foreground">—</span>;
                        const { met, total, blocked } = readinessSummary(r);
                        return (
                          <span
                            className={`text-xs ${blocked ? 'text-red-500 dark:text-red-400' : met === total ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}
                            title={blocked ? 'No published price — the embed cannot serve this product at all' : `${met} of ${total} ready`}
                          >
                            {blocked ? 'Not published' : `${met}/${total}`}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {formatDate(product.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedProduct(product)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(product.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalCount > ITEMS_PER_PAGE && (
            <div className="mt-6">
              <SmartPagination
                currentPage={currentPage}
                totalPages={Math.ceil(totalCount / ITEMS_PER_PAGE)}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
};

