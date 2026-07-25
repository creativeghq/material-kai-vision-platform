/**
 * Relevancy Management Component
 *
 * Comprehensive admin interface for viewing and managing entity relationships
 * (Chunk→Product, Product→Image, Chunk→Image) with relevance scoring details.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Trash2,
  Link2,
  Image as ImageIcon,
  FileText,
  BarChart3,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  FilterBar,
  applyFilters,
  type FilterGroupDef,
  type FilterValues,
} from '@/components/core/filters';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/core/ui/dialog';
import { Label } from '@/components/core/ui/label';
import { Progress } from '@/components/core/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { applyFiltersToQuery } from '@/components/core/filters';
import { supabase } from '@/integrations/supabase/client';

type RelevancyTab = 'chunk-product' | 'product-image' | 'chunk-image';

/**
 * The three tabs read three different tables with different score columns, so the group def
 * is rebuilt per active tab. The tabs themselves stay tabs — they are navigation, not a
 * filter: switching one changes which table is queried.
 */
function buildRelevancyFilters(tab: RelevancyTab): FilterGroupDef[] {
  const scoreColumn = tab === 'product-image' ? 'overall_score' : 'relevance_score';

  const relTypeOptions = tab === 'chunk-product'
    ? [
        { value: 'source', label: 'Source' },
        { value: 'related', label: 'Related' },
        { value: 'component', label: 'Component' },
        { value: 'alternative', label: 'Alternative' },
      ]
    : [
        { value: 'illustrates', label: 'Illustrates' },
        { value: 'depicts', label: 'Depicts' },
        { value: 'related', label: 'Related' },
        { value: 'example', label: 'Example' },
      ];

  return [
    {
      key: 'general', label: 'Relationship', icon: Link2,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search content, product, or reasoning…',
          // Client-side: chunk content / product name are joined in, not columns on the row.
          accessor: (r: any) => [r.chunk_content, r.product_name, r.relationship_type, r.reasoning],
        },
        // image_product_associations has no relationship_type column.
        ...(tab === 'product-image' ? [] : [{
          key: 'relationship_type' as const, type: 'multi' as const, label: 'Relationship type',
          column: 'relationship_type', options: relTypeOptions,
        }]),
      ],
    },
    {
      key: 'scores', label: 'Scores', icon: BarChart3,
      fields: [
        {
          key: 'score', type: 'range',
          label: tab === 'product-image' ? 'Overall score' : 'Relevance score',
          description: 'Fraction, not percent.',
          column: scoreColumn, min: 0, max: 1, step: 0.05,
        },
        // Only image_product_associations stores a separate confidence.
        ...(tab === 'product-image' ? [{
          key: 'confidence' as const, type: 'range' as const, label: 'Confidence',
          column: 'confidence', min: 0, max: 1, step: 0.05,
        }] : []),
      ],
    },
  ];
}

interface ChunkProductRelationship {
  id: string;
  chunk_id: string;
  product_id: string;
  chunk_content: string;
  product_name: string;
  relationship_type: string;
  relevance_score: number;
  created_at: string;
}

// image_product_associations has real per-component scores — no relationship_type column
interface ProductImageRelationship {
  id: string;
  product_id: string;
  image_id: string;
  product_name: string;
  image_url: string;
  overall_score: number;
  confidence: number;
  spatial_score: number;
  caption_score: number;
  clip_score: number;
  reasoning: string;
  created_at: string;
}

interface ChunkImageRelationship {
  id: string;
  chunk_id: string;
  image_id: string;
  chunk_content: string;
  image_url: string;
  relationship_type: string;
  relevance_score: number;
  created_at: string;
}

export const RelevancyManagement: React.FC = () => {
  const { toast } = useToast();

  // State
  const [activeTab, setActiveTab] = useState<RelevancyTab>('chunk-product');
  const [chunkProductRels, setChunkProductRels] = useState<ChunkProductRelationship[]>([]);
  const [productImageRels, setProductImageRels] = useState<ProductImageRelationship[]>([]);
  const [chunkImageRels, setChunkImageRels] = useState<ChunkImageRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRel, setSelectedRel] = useState<any>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const groups = useMemo(() => buildRelevancyFilters(activeTab), [activeTab]);
  const [filterValues, setFilterValues] = useState<FilterValues>({});

  // Pagination. One shared page state is correct here because only one tab's table is
  // ever mounted and the tab switch below resets it.
  const [currentPage, setCurrentPage] = useState(1);

  // Statistics
  const [stats, setStats] = useState({
    chunkProduct: { total: 0, avgScore: 0 },
    productImage: { total: 0, avgScore: 0 },
    chunkImage: { total: 0, avgScore: 0 },
  });

  // On mount: load all three unfiltered in parallel to populate the stats cards.
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([
        loadChunkProductRelationships({}, []),
        loadProductImageRelationships({}, []),
        loadChunkImageRelationships({}, []),
      ]).catch(err => {
        console.error('Error during initial load:', err);
        toast({ title: 'Error', description: 'Failed to load relationships', variant: 'destructive' });
      });
      setLoading(false);
    };
    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On filter/tab change: reload only the active tab and reset pagination
  useEffect(() => {
    loadRelationships();
    setCurrentPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filterValues]);

  const loadRelationships = async () => {
    try {
      setLoading(true);
      if (activeTab === 'chunk-product') {
        await loadChunkProductRelationships(filterValues, groups);
      } else if (activeTab === 'product-image') {
        await loadProductImageRelationships(filterValues, groups);
      } else {
        await loadChunkImageRelationships(filterValues, groups);
      }
    } catch (error) {
      console.error('Error loading relationships:', error);
      toast({ title: 'Error', description: 'Failed to load relationships', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadChunkProductRelationships = async (values: FilterValues, defs: FilterGroupDef[]) => {
    let query: any = supabase
      .from('chunk_product_relationships')
      .select(`
        id,
        chunk_id,
        product_id,
        relationship_type,
        relevance_score,
        created_at,
        document_chunks!inner(content),
        products!inner(name)
      `)
      .order('relevance_score', { ascending: false })
      .limit(1000);

    query = applyFiltersToQuery(query, defs, values);

    const { data, error } = await query;
    if (error) throw error;

    const formatted: ChunkProductRelationship[] = (data || []).map((item: any) => ({
      id: item.id,
      chunk_id: item.chunk_id,
      product_id: item.product_id,
      chunk_content: item.document_chunks?.content || '',
      product_name: item.products?.name || '',
      relationship_type: item.relationship_type,
      relevance_score: item.relevance_score ?? 0,
      created_at: item.created_at,
    }));

    setChunkProductRels(formatted);

    const avgScore = formatted.reduce((sum, r) => sum + r.relevance_score, 0) / (formatted.length || 1);
    setStats(prev => ({ ...prev, chunkProduct: { total: formatted.length, avgScore } }));
  };

  const loadProductImageRelationships = async (values: FilterValues, defs: FilterGroupDef[]) => {
    // image_product_associations columns: overall_score, spatial_score, caption_score,
    // clip_score, confidence, reasoning — there is NO relevance_score or relationship_type
    let query: any = supabase
      .from('image_product_associations')
      .select(`
        id,
        product_id,
        image_id,
        overall_score,
        confidence,
        spatial_score,
        caption_score,
        clip_score,
        reasoning,
        created_at,
        products!inner(name),
        document_images!inner(image_url)
      `)
      .order('overall_score', { ascending: false })
      .limit(1000);

    query = applyFiltersToQuery(query, defs, values);

    const { data, error } = await query;
    if (error) throw error;

    const formatted: ProductImageRelationship[] = (data || []).map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      image_id: item.image_id,
      product_name: item.products?.name || '',
      image_url: item.document_images?.image_url || '',
      overall_score: item.overall_score ?? 0,
      confidence: item.confidence ?? 0,
      spatial_score: item.spatial_score ?? 0,
      caption_score: item.caption_score ?? 0,
      clip_score: item.clip_score ?? 0,
      reasoning: item.reasoning || '',
      created_at: item.created_at,
    }));

    setProductImageRels(formatted);

    const avgScore = formatted.reduce((sum, r) => sum + r.overall_score, 0) / (formatted.length || 1);
    setStats(prev => ({ ...prev, productImage: { total: formatted.length, avgScore } }));
  };

  const loadChunkImageRelationships = async (values: FilterValues, defs: FilterGroupDef[]) => {
    let query: any = supabase
      .from('chunk_image_relationships')
      .select(`
        id,
        chunk_id,
        image_id,
        relationship_type,
        relevance_score,
        created_at,
        document_chunks!inner(content),
        document_images!inner(image_url)
      `)
      .order('relevance_score', { ascending: false })
      .limit(1000);

    query = applyFiltersToQuery(query, defs, values);

    const { data, error } = await query;
    if (error) throw error;

    const formatted: ChunkImageRelationship[] = (data || []).map((item: any) => ({
      id: item.id,
      chunk_id: item.chunk_id,
      image_id: item.image_id,
      chunk_content: item.document_chunks?.content || '',
      image_url: item.document_images?.image_url || '',
      relationship_type: item.relationship_type,
      relevance_score: item.relevance_score ?? 0,
      created_at: item.created_at,
    }));

    setChunkImageRels(formatted);

    const avgScore = formatted.reduce((sum, r) => sum + r.relevance_score, 0) / (formatted.length || 1);
    setStats(prev => ({ ...prev, chunkImage: { total: formatted.length, avgScore } }));
  };

  const getRelevanceBadge = (score: number) => {
    if (score >= 0.8) {
      return <span className="text-xs text-emerald-600 dark:text-emerald-400">High ({(score * 100).toFixed(0)}%)</span>;
    } else if (score >= 0.6) {
      return <span className="text-xs text-amber-600 dark:text-amber-400">Medium ({(score * 100).toFixed(0)}%)</span>;
    } else {
      return <span className="text-xs text-red-500 dark:text-red-400">Low ({(score * 100).toFixed(0)}%)</span>;
    }
  };

  const getRelTypeBadge = (type: string | null | undefined) => {
    if (!type) return <span className="text-xs text-muted-foreground">Unknown</span>;
    const tones: Record<string, string> = {
      source: 'text-blue-500 dark:text-blue-400',
      depicts: 'text-purple-600 dark:text-purple-400',
      illustrates: 'text-indigo-600 dark:text-indigo-400',
      related: 'text-muted-foreground',
      component: 'text-orange-600 dark:text-orange-400',
      alternative: 'text-pink-600 dark:text-pink-400',
      variant: 'text-teal-600 dark:text-teal-400',
      example: 'text-cyan-600 dark:text-cyan-400',
    };

    return (
      <span className={`text-xs ${tones[type] || 'text-muted-foreground'}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const handleViewDetails = (rel: any) => {
    setSelectedRel(rel);
    setIsDetailDialogOpen(true);
  };

  const handleDelete = async (id: string, table: string) => {
    if (!confirm('Are you sure you want to delete this relationship?')) return;

    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;

      toast({ title: 'Success', description: 'Relationship deleted successfully' });
      loadRelationships();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete relationship', variant: 'destructive' });
    }
  };

  // Only the `q` field carries an accessor, so this applies the search and passes the
  // server-side score / type constraints straight through.
  const currentData = useMemo(() => {
    const rows = activeTab === 'chunk-product' ? chunkProductRels
      : activeTab === 'product-image' ? productImageRels
      : chunkImageRels;
    return applyFilters<any>(rows, groups, filterValues);
  }, [activeTab, chunkProductRels, productImageRels, chunkImageRels, groups, filterValues]);

  const paginatedData = paginate(currentData, currentPage);
  // No previewCount: the score / type fields are server-side here, so a client-side count of
  // the already-loaded page would understate the result and mislead more than it helps.

  // Deleting a relationship reloads the tab — clamp rather than strand the user
  // on a page that no longer exists.
  useEffect(() => {
    setCurrentPage((p) => clampPage(p, currentData.length));
  }, [currentData.length]);

  return (
    <div className="space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Chunk → Product
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.chunkProduct.total}</div>
              <p className="text-xs text-gray-500 mt-1">
                Avg Score: {(stats.chunkProduct.avgScore * 100).toFixed(1)}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Product → Image
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats.productImage.total}</div>
              <p className="text-xs text-gray-500 mt-1">
                Avg Score: {(stats.productImage.avgScore * 100).toFixed(1)}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Chunk → Image
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.chunkImage.total}</div>
              <p className="text-xs text-gray-500 mt-1">
                Avg Score: {(stats.chunkImage.avgScore * 100).toFixed(1)}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Relationship Tabs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle>Entity Relationships</CardTitle>
              <FilterBar
                groups={groups}
                values={filterValues}
                onChange={setFilterValues}
                title="Filter relationships"
                searchPlaceholder="Search content, product, or reasoning…"
              />
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
              <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                <TabsTrigger value="chunk-product">
                  <FileText className="h-4 w-4 mr-2" />
                  Chunk → Product
                </TabsTrigger>
                <TabsTrigger value="product-image">
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Product → Image
                </TabsTrigger>
                <TabsTrigger value="chunk-image">
                  <Link2 className="h-4 w-4 mr-2" />
                  Chunk → Image
                </TabsTrigger>
              </TabsList>

              {/* Chunk → Product Tab */}
              <TabsContent value="chunk-product" className="space-y-4">
                {loading ? (
                  <div className="text-center py-8 text-gray-500">Loading relationships...</div>
                ) : currentData.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No relationships found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chunk Content</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Relevance</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(paginatedData as ChunkProductRelationship[]).map((rel) => (
                        <TableRow key={rel.id}>
                          <TableCell className="max-w-md">
                            <div className="truncate text-sm">{rel.chunk_content}</div>
                          </TableCell>
                          <TableCell className="font-medium">{rel.product_name}</TableCell>
                          <TableCell>{getRelTypeBadge(rel.relationship_type)}</TableCell>
                          <TableCell>{getRelevanceBadge(rel.relevance_score)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleViewDetails(rel)}>
                                <BarChart3 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(rel.id, 'chunk_product_relationships')}>
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              {/* Product → Image Tab */}
              <TabsContent value="product-image" className="space-y-4">
                {loading ? (
                  <div className="text-center py-8 text-gray-500">Loading relationships...</div>
                ) : currentData.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No relationships found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Image</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Overall Score</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(paginatedData as ProductImageRelationship[]).map((rel) => (
                        <TableRow key={rel.id}>
                          <TableCell className="font-medium">{rel.product_name}</TableCell>
                          <TableCell>
                            <img
                              src={rel.image_url}
                              alt="Product"
                              className="h-12 w-12 object-cover rounded"
                            />
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium">
                              {(rel.confidence * 100).toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell>{getRelevanceBadge(rel.overall_score)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleViewDetails(rel)}>
                                <BarChart3 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(rel.id, 'image_product_associations')}>
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              {/* Chunk → Image Tab */}
              <TabsContent value="chunk-image" className="space-y-4">
                {loading ? (
                  <div className="text-center py-8 text-gray-500">Loading relationships...</div>
                ) : currentData.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No relationships found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chunk Content</TableHead>
                        <TableHead>Image</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Relevance</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(paginatedData as ChunkImageRelationship[]).map((rel) => (
                        <TableRow key={rel.id}>
                          <TableCell className="max-w-md">
                            <div className="truncate text-sm">{rel.chunk_content}</div>
                          </TableCell>
                          <TableCell>
                            <img
                              src={rel.image_url}
                              alt="Chunk"
                              className="h-12 w-12 object-cover rounded"
                            />
                          </TableCell>
                          <TableCell>{getRelTypeBadge(rel.relationship_type)}</TableCell>
                          <TableCell>{getRelevanceBadge(rel.relevance_score)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleViewDetails(rel)}>
                                <BarChart3 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(rel.id, 'chunk_image_relationships')}>
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>

            {!loading && (
              <TablePagination
                page={currentPage}
                total={currentData.length}
                onPageChange={setCurrentPage}
                label="relationships"
                className="-mx-6 mt-4 px-6"
              />
            )}
          </CardContent>
        </Card>

      {/* Details Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Relevance Score Breakdown</DialogTitle>
          </DialogHeader>
          {selectedRel && (
            <div className="space-y-4">
              {/* Overall score — uses overall_score for product-image, relevance_score for others */}
              <div>
                <Label>Overall Score</Label>
                <div className="flex items-center gap-4 mt-2">
                  <Progress
                    value={(selectedRel.overall_score ?? selectedRel.relevance_score ?? 0) * 100}
                    className="flex-1"
                  />
                  <span className="text-lg font-bold">
                    {((selectedRel.overall_score ?? selectedRel.relevance_score ?? 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {'relationship_type' in selectedRel && selectedRel.relationship_type && (
                  <div>
                    <Label>Relationship Type</Label>
                    <div className="mt-2">{getRelTypeBadge(selectedRel.relationship_type)}</div>
                  </div>
                )}
                <div>
                  <Label>Created</Label>
                  <div className="mt-2 text-sm text-gray-600">
                    {new Date(selectedRel.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Product → Image: real per-component scores are stored in the DB */}
              {activeTab === 'product-image' && (
                <div className="space-y-2">
                  <Label>Score Components</Label>
                  <div className="bg-gray-50 p-4 rounded-lg space-y-3 text-sm">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>Spatial Score</span>
                        <span className="font-medium">{(selectedRel.spatial_score * 100).toFixed(1)}%</span>
                      </div>
                      <Progress value={selectedRel.spatial_score * 100} />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>Caption Score</span>
                        <span className="font-medium">{(selectedRel.caption_score * 100).toFixed(1)}%</span>
                      </div>
                      <Progress value={selectedRel.caption_score * 100} />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>SLIG (SigLIP2) Score</span>
                        <span className="font-medium">{(selectedRel.clip_score * 100).toFixed(1)}%</span>
                      </div>
                      <Progress value={selectedRel.clip_score * 100} />
                    </div>
                    <div className="border-t pt-2 flex justify-between">
                      <span>Confidence</span>
                      <span className="font-medium">{(selectedRel.confidence * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                  {selectedRel.reasoning && (
                    <div>
                      <Label>Reasoning</Label>
                      <p className="text-sm text-gray-600 mt-1 bg-gray-50 p-3 rounded leading-relaxed">
                        {selectedRel.reasoning}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Chunk → Product / Chunk → Image: no component scores stored in DB */}
              {activeTab !== 'product-image' && (
                <div className="space-y-2">
                  <Label>Score Components</Label>
                  <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded">
                    Per-component scores are not stored for this relationship type.
                    Only the overall relevance score is available.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
