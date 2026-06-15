/**
 * Relevancy Management Component
 *
 * Comprehensive admin interface for viewing and managing entity relationships
 * (Chunk→Product, Product→Image, Chunk→Image) with relevance scoring details.
 */

import React, { useState, useEffect } from 'react';
import {
  Filter,
  Search,
  Trash2,
  Link2,
  Image as ImageIcon,
  FileText,
  BarChart3,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
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
import { supabase } from '@/integrations/supabase/client';

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
  const [activeTab, setActiveTab] = useState<'chunk-product' | 'product-image' | 'chunk-image'>('chunk-product');
  const [chunkProductRels, setChunkProductRels] = useState<ChunkProductRelationship[]>([]);
  const [productImageRels, setProductImageRels] = useState<ProductImageRelationship[]>([]);
  const [chunkImageRels, setChunkImageRels] = useState<ChunkImageRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRel, setSelectedRel] = useState<any>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Filters
  const [minScore, setMinScore] = useState<string>('0.0');
  const [relationshipType, setRelationshipType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Statistics
  const [stats, setStats] = useState({
    chunkProduct: { total: 0, avgScore: 0 },
    productImage: { total: 0, avgScore: 0 },
    chunkImage: { total: 0, avgScore: 0 },
  });

  // On mount: load all three in parallel to populate stats cards and tab counts
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([
        loadChunkProductRelationships('0.0', 'all'),
        loadProductImageRelationships('0.0'),
        loadChunkImageRelationships('0.0', 'all'),
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
  }, [activeTab, minScore, relationshipType]);

  // Reset page on search change too
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const loadRelationships = async () => {
    try {
      setLoading(true);
      if (activeTab === 'chunk-product') {
        await loadChunkProductRelationships(minScore, relationshipType);
      } else if (activeTab === 'product-image') {
        await loadProductImageRelationships(minScore);
      } else {
        await loadChunkImageRelationships(minScore, relationshipType);
      }
    } catch (error) {
      console.error('Error loading relationships:', error);
      toast({ title: 'Error', description: 'Failed to load relationships', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadChunkProductRelationships = async (score: string, relType: string) => {
    let query = supabase
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
      .gte('relevance_score', parseFloat(score))
      .order('relevance_score', { ascending: false })
      .limit(1000);

    if (relType !== 'all') {
      query = query.eq('relationship_type', relType);
    }

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

  const loadProductImageRelationships = async (score: string) => {
    // image_product_associations columns: overall_score, spatial_score, caption_score,
    // clip_score, confidence, reasoning — there is NO relevance_score or relationship_type
    const { data, error } = await supabase
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
      .gte('overall_score', parseFloat(score))
      .order('overall_score', { ascending: false })
      .limit(1000);

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

  const loadChunkImageRelationships = async (score: string, relType: string) => {
    let query = supabase
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
      .gte('relevance_score', parseFloat(score))
      .order('relevance_score', { ascending: false })
      .limit(1000);

    if (relType !== 'all') {
      query = query.eq('relationship_type', relType);
    }

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
      return <Badge className="bg-green-100 text-green-800 border-green-300">High ({(score * 100).toFixed(0)}%)</Badge>;
    } else if (score >= 0.6) {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Medium ({(score * 100).toFixed(0)}%)</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800 border-red-300">Low ({(score * 100).toFixed(0)}%)</Badge>;
    }
  };

  const getRelTypeBadge = (type: string | null | undefined) => {
    if (!type) return <Badge className="bg-gray-50 text-gray-500 border-gray-200">Unknown</Badge>;
    const colors: Record<string, string> = {
      source: 'bg-blue-50 text-blue-700 border-blue-200',
      depicts: 'bg-purple-50 text-purple-700 border-purple-200',
      illustrates: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      related: 'bg-gray-50 text-gray-700 border-gray-200',
      component: 'bg-orange-50 text-orange-700 border-orange-200',
      alternative: 'bg-pink-50 text-pink-700 border-pink-200',
      variant: 'bg-teal-50 text-teal-700 border-teal-200',
      example: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    };

    return (
      <Badge className={colors[type] || colors.related}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
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

  const filterBySearch = (items: any[]) => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();

    return items.filter((item) => {
      if ('chunk_content' in item && item.chunk_content.toLowerCase().includes(q)) return true;
      if ('product_name' in item && item.product_name.toLowerCase().includes(q)) return true;
      if ('relationship_type' in item && item.relationship_type?.toLowerCase().includes(q)) return true;
      if ('reasoning' in item && item.reasoning?.toLowerCase().includes(q)) return true;
      return false;
    });
  };

  const getCurrentData = () => {
    switch (activeTab) {
      case 'chunk-product': return filterBySearch(chunkProductRels);
      case 'product-image': return filterBySearch(productImageRels);
      case 'chunk-image':   return filterBySearch(chunkImageRels);
      default:              return [];
    }
  };

  const currentData = getCurrentData();
  const totalPages = Math.ceil(currentData.length / itemsPerPage);
  const paginatedData = currentData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // image_product_associations has no relationship_type column — hide filter for that tab
  const showRelTypeFilter = activeTab !== 'product-image';

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

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Min Relevance Score</Label>
                <Select value={minScore} onValueChange={setMinScore}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.0">All (≥0%)</SelectItem>
                    <SelectItem value="0.5">Medium (≥50%)</SelectItem>
                    <SelectItem value="0.7">High (≥70%)</SelectItem>
                    <SelectItem value="0.9">Very High (≥90%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Relationship type filter — not applicable to product-image tab */}
              {showRelTypeFilter ? (
                <div>
                  <Label>Relationship Type</Label>
                  <Select value={relationshipType} onValueChange={setRelationshipType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {activeTab === 'chunk-product' && (
                        <>
                          <SelectItem value="source">Source</SelectItem>
                          <SelectItem value="related">Related</SelectItem>
                          <SelectItem value="component">Component</SelectItem>
                          <SelectItem value="alternative">Alternative</SelectItem>
                        </>
                      )}
                      {activeTab === 'chunk-image' && (
                        <>
                          <SelectItem value="illustrates">Illustrates</SelectItem>
                          <SelectItem value="depicts">Depicts</SelectItem>
                          <SelectItem value="related">Related</SelectItem>
                          <SelectItem value="example">Example</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div /> /* spacer — keeps search in third column */
              )}

              <div>
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search content, product, or reasoning..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Relationship Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Entity Relationships</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
              <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                <TabsTrigger value="chunk-product" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <FileText className="h-4 w-4 mr-2" />
                  Chunk → Product
                </TabsTrigger>
                <TabsTrigger value="product-image" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Product → Image
                </TabsTrigger>
                <TabsTrigger value="chunk-image" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Link2 className="h-4 w-4 mr-2" />
                  Chunk → Image
                </TabsTrigger>
              </TabsList>

              {/* Chunk → Product Tab */}
              <TabsContent value="chunk-product" className="space-y-4">
                {loading ? (
                  <div className="text-center py-8 text-gray-500">Loading relationships...</div>
                ) : paginatedData.length === 0 ? (
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
                ) : paginatedData.length === 0 ? (
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
                ) : paginatedData.length === 0 ? (
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages} ({currentData.length} total)
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
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
